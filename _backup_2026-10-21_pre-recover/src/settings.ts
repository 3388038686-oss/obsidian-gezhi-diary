import { App, DropdownComponent, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type GridDiaryPlugin from "./main";
import { DiaryTemplate, GridDiarySettings } from "./types";

export const DEFAULT_SETTINGS: GridDiarySettings = {
  rootFolder: "日记",
  background: "",
  cardOpacity: 0.85,
  fontFamily: '"LXGW WenKai", "Kaiti SC", "STKaiti", "楷体", serif',
  fontWeight: 300,
  customCss: "",
  showEmptyHint: true,
  columns: 2,
  cellHeight: 200,
  splitRatio: 0.6,
  skipPermanentConfirm: false,
  fontDataUrl: "",
  fontFileName: "",
  fontDirFile: "",
  autoCreateToday: true,
  dailyTemplatePath: "",
  defaultTemplate: "格间六格",
  templates: [
    {
      name: "格间六格",
      titles: ["今日事件", "今日书账", "今日新知", "今日碎记", "今日美食", "今日反思"],
    },
    {
      name: "九宫格晨间",
      titles: [
        "今天的天气",
        "昨天最难忘的事",
        "今天最重要的一件事",
        "想感谢的人",
        "今天的情绪",
        "身体状态",
        "今天的期待",
        "今日反思",
        "明日计划",
      ],
    },
    {
      name: "复盘",
      titles: ["做成了什么", "哪里卡住", "学到了什么", "下次怎么做"],
    },
  ],
};

type TabKey = "general" | "style";

export class GridDiarySettingTab extends PluginSettingTab {
  plugin: GridDiaryPlugin;
  private tab: TabKey = "general";
  private panelEl: HTMLElement | null = null;
  private tabBtns = new Map<TabKey, HTMLElement>();
  private dirDropdown: DropdownComponent | null = null;

  constructor(app: App, plugin: GridDiaryPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private async scanFontDir(): Promise<string[]> {
    try {
      const listed = await this.app.vault.adapter.list(".obsidian/fonts");
      return (listed.files || [])
        .filter((p) => /\.(ttf|otf)$/i.test(p))
        .map((p) => p.split("/").pop() || "")
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("gd-settings");
    containerEl.createEl("h2", { text: "Grid Diary settings" });

    // —— Tab 头 ——
    const tabs = containerEl.createDiv({ cls: "gd-set-tabs" });
    const defs: Array<[TabKey, string]> = [
      ["general", "General"],
      ["style", "Style"],
    ];
    this.tabBtns.clear();
    for (const [key, label] of defs) {
      const b = tabs.createEl("button", {
        text: label,
        cls: "gd-set-tab" + (this.tab === key ? " is-on" : ""),
      });
      b.addEventListener("click", () => {
        this.tab = key;
        for (const [k, el] of this.tabBtns) el.toggleClass("is-on", k === key);
        this.renderPanel();
      });
      this.tabBtns.set(key, b);
    }

    this.panelEl = containerEl.createDiv({ cls: "gd-set-panel" });
    this.renderPanel();
  }

  private renderPanel(): void {
    const panel = this.panelEl;
    if (!panel) return;
    panel.empty();
    if (this.tab === "general") this.renderGeneral(panel);
    else this.renderStyle(panel);
  }

  // ---------- 常规 ----------
  private renderGeneral(panel: HTMLElement): void {
    new Setting(panel)
      .setName("Diary folder")
      .setDesc("One Markdown file per day, named YYYY-MM-DD. Defaults to your existing diary folder.")
      .addText((t) =>
        t
          .setPlaceholder("日记")
          .setValue(this.plugin.settings.rootFolder)
          .onChange(async (v) => {
            this.plugin.settings.rootFolder = v.trim() || "日记";
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(panel)
      .setName("One cell = one H2 heading")
      .setDesc("Cells are split by H2 headings in the Markdown file. Content is shared with the original file; formatting is not changed.")
      .setDisabled(true)
      .addText((t) => t.setValue("## 标题").setDisabled(true));

    new Setting(panel)
      .setName("Auto-create today's file on open")
      .setDesc("Creates the day's file silently if it does not exist when the view is opened or Today is clicked.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoCreateToday).onChange(async (v) => {
          this.plugin.settings.autoCreateToday = v;
          await this.plugin.saveSettings();
        })
      );

    // —— 模板文件（Templater / 核心模板通用）——
    const tplFiles = this.app.vault
      .getMarkdownFiles()
      .map((f) => f.path)
      .sort();
    const tplFileSetting = new Setting(panel)
      .setName("Template file used when creating a new diary")
      .setDesc("Empty = use the built-in cell template. Pick a Markdown file to inject its content into new files, automatically replacing  <% tp.date.now(\"YYYY-MM-DD\") %>、{{date}} variables, etc.")
      .addText((t) =>
        t
          .setPlaceholder("05template模板/日记模板.md")
          .setValue(this.plugin.settings.dailyTemplatePath)
          .onChange(async (v) => {
            this.plugin.settings.dailyTemplatePath = v.trim();
            await this.plugin.saveSettings();
          })
      );
    tplFileSetting.addDropdown((d) => {
      d.addOption("", "(built-in template)");
      for (const p of tplFiles) d.addOption(p, p);
      const cur = this.plugin.settings.dailyTemplatePath;
      d.setValue(tplFiles.includes(cur) ? cur : "");
      d.onChange(async (v) => {
        this.plugin.settings.dailyTemplatePath = v;
        await this.plugin.saveSettings();
        const input = tplFileSetting.controlEl.querySelector("input");
        if (input) input.value = v;
      });
    });

    new Setting(panel)
      .setName("Columns")
      .setDesc("Number of cells per row.")
      .addSlider((s) =>
        s
          .setLimits(1, 4, 1)
          .setValue(this.plugin.settings.columns)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.columns = v;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(panel)
      .setName("Cell content height")
      .setDesc("Fixed height of the cell body area (px). Content scrolls inside the cell when it exceeds this.")
      .addSlider((s) =>
        s
          .setLimits(80, 400, 10)
          .setValue(this.plugin.settings.cellHeight)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.cellHeight = v;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(panel)
      .setName("Current template")
      .setDesc("Which template to use when creating a new day's file or auto-filling. Can be changed at any time.")
      .addDropdown((d) => {
        for (const tpl of this.plugin.settings.templates) d.addOption(tpl.name, tpl.name);
        d.setValue(this.plugin.settings.defaultTemplate);
        d.onChange(async (v) => {
          this.plugin.settings.defaultTemplate = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        });
      });

    new Setting(panel)
      .setName("Skip permanent-delete confirmation")
      .setDesc("When on, Permanent delete runs without a dialog (moving to the system trash is always instant and always recoverable). Turn this back off here at any time.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.skipPermanentConfirm).onChange(async (v) => {
          this.plugin.settings.skipPermanentConfirm = v;
          await this.plugin.saveSettings();
        })
      );

    const tplSetting = new Setting(panel)
      .setName("Template library")
      .setDesc(
        "Click + Add template to add one, or edit the list below using name | cell1 ; cell2 per line. New templates appear in Current template immediately."
      )
      .addButton((b) =>
        b
          .setButtonText("+ Add template")
          .setCta()
          .onClick(() => {
            new TemplateModal(this.app, async (name, titles) => {
              if (this.plugin.settings.templates.some((t) => t.name === name)) {
                new Notice("A template with this name already exists. Please use another name.");
                return false;
              }
              this.plugin.settings.templates.push({ name, titles });
              await this.plugin.saveSettings();
              this.plugin.refreshViews();
              this.display();
              new Notice(`Added template: ${name}`);
              return true;
            }).open();
          })
      );

    tplSetting.addTextArea((a) => {
      a.inputEl.rows = 7;
      a.inputEl.style.width = "100%";
      a.setValue(
        this.plugin.settings.templates
          .map((tpl) => `${tpl.name} | ${tpl.titles.join(" ; ")}`)
          .join("\n")
      ).onChange(async (v) => {
        const parsed: DiaryTemplate[] = [];
        for (const line of v.split("\n")) {
          const raw = line.trim();
          if (!raw) continue;
          const [name, rest] = raw.split("|");
          if (!rest) continue;
          const titles = rest
            .split(";")
            .map((q) => q.trim())
            .filter(Boolean);
          if (titles.length) parsed.push({ name: name.trim(), titles });
        }
        if (parsed.length) {
          this.plugin.settings.templates = parsed;
          if (!parsed.find((p) => p.name === this.plugin.settings.defaultTemplate)) {
            this.plugin.settings.defaultTemplate = parsed[0].name;
          }
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        }
      });
    });

    // 每个模板一行，带删除按钮
    for (const tpl of [...this.plugin.settings.templates]) {
      new Setting(panel)
        .setName(tpl.name)
        .setDesc(`${tpl.titles.length} cells: ${tpl.titles.join(" / ")}`)
        .addExtraButton((b) =>
          b
            .setIcon("trash")
            .setTooltip("Delete this template")
            .onClick(async () => {
              this.plugin.settings.templates = this.plugin.settings.templates.filter(
                (t) => t.name !== tpl.name
              );
              if (this.plugin.settings.defaultTemplate === tpl.name) {
                this.plugin.settings.defaultTemplate =
                  this.plugin.settings.templates[0]?.name ?? "";
              }
              await this.plugin.saveSettings();
              this.plugin.refreshViews();
              this.display();
              new Notice(`Deleted template: ${tpl.name}`);
            })
        );
    }
  }

  // ---------- 样式 ----------
  private renderStyle(panel: HTMLElement): void {
    new Setting(panel)
      .setName("Background image")
      .setDesc("Leave empty for no background. Accepts a vault image path (e.g. 附件/bg.jpg) or an http URL.")
      .addText((t) =>
        t
          .setPlaceholder("附件/bg.jpg")
          .setValue(this.plugin.settings.background)
          .onChange(async (v) => {
            this.plugin.settings.background = v.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(panel)
      .setName("Cell opacity")
      .setDesc("0.3 to 1. Lower = more translucent.")
      .addSlider((s) =>
        s
          .setLimits(0.3, 1, 0.02)
          .setValue(this.plugin.settings.cardOpacity)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.cardOpacity = v;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(panel)
      .setName("Font")
      .setDesc("CSS font-family. Defaults to Kaiti; install LXGW WenKai for a more handwritten look.")
      .addText((t) =>
        t.setValue(this.plugin.settings.fontFamily).onChange(async (v) => {
          this.plugin.settings.fontFamily = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(panel)
      .setName("Import local font")
      .setDesc(
        `Supports .ttf / .otf. Applied to cells and calendar immediately; keep it under 4MB.${
          this.plugin.settings.fontFileName
            ? `Currently imported: ${this.plugin.settings.fontFileName}`
            : "No font file imported."
        }`
      )
      .addButton((b) =>
        b.setButtonText("Upload font file").onClick(() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".ttf,.otf,font/ttf,font/otf,application/x-font-ttf";
          input.onchange = () => {
            const f = input.files?.[0];
            if (!f) return;
            if (f.size > 4 * 1024 * 1024) {
              new Notice("Font file exceeds 4MB. Use a CSS font-family name instead, or switch to a smaller subset font.");
              return;
            }
            const reader = new FileReader();
            reader.onload = async () => {
              this.plugin.settings.fontDataUrl = String(reader.result || "");
              this.plugin.settings.fontFileName = f.name;
              await this.plugin.saveSettings();
              this.plugin.applyCustomCss();
              this.plugin.refreshViews();
              this.display();
              new Notice(`Applied font: ${f.name}`);
            };
            reader.onerror = () => new Notice("Failed to read the font file");
            reader.readAsDataURL(f);
          };
          input.click();
        })
      )
      .addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("Remove the imported font")
          .onClick(async () => {
            this.plugin.settings.fontDataUrl = "";
            this.plugin.settings.fontFileName = "";
            await this.plugin.saveSettings();
            this.plugin.applyCustomCss();
            this.plugin.refreshViews();
            this.display();
          })
      );

    new Setting(panel)
      .setName("Load from .obsidian/fonts (fallback for large fonts)")
      .setDesc(
        "Place .ttf/.otf files in the vault's .obsidian/fonts folder, click Scan, then pick one from the dropdown. Useful for fonts over 4MB."
      )
      .addDropdown((d) => {
        d.addOption("", "(not selected)");
        if (this.plugin.settings.fontDirFile) {
          d.addOption(this.plugin.settings.fontDirFile, this.plugin.settings.fontDirFile);
        }
        d.setValue(this.plugin.settings.fontDirFile || "");
        d.onChange(async (v) => {
          this.plugin.settings.fontDirFile = v;
          if (v) {
            this.plugin.settings.fontDataUrl = "";
            this.plugin.settings.fontFileName = "";
          }
          await this.plugin.saveSettings();
          this.plugin.applyCustomCss();
          this.plugin.refreshViews();
          new Notice(v ? `Applied font from folder: ${v}` : "Font from folder removed");
        });
        this.dirDropdown = d;
      })
      .addButton((b) =>
        b.setButtonText("Scan").onClick(async () => {
          const files = await this.scanFontDir();
          if (!files.length) {
            new Notice("No .ttf/.otf found. Please put font files in the vault's .obsidian/fonts folder first.");
            return;
          }
          const dd = this.dirDropdown;
          if (dd) {
            const have = new Set(Array.from(dd.selectEl.options).map((o) => o.value));
            for (const f of files) if (!have.has(f)) dd.addOption(f, f);
            dd.setValue(files[0]);
          }
          this.plugin.settings.fontDirFile = files[0];
          this.plugin.settings.fontDataUrl = "";
          this.plugin.settings.fontFileName = "";
          await this.plugin.saveSettings();
          this.plugin.applyCustomCss();
          this.plugin.refreshViews();
          new Notice(`Found ${files.length} font(s). Applied: ${files[0]}`);
        })
      );

    new Setting(panel)
      .setName("Font weight")
      .setDesc("Lower = thinner. 300 = light, 400 = normal, 500 = slightly bold.")
      .addSlider((s) =>
        s
          .setLimits(200, 600, 100)
          .setValue(this.plugin.settings.fontWeight)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.fontWeight = v;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    const wrap = new Setting(panel)
      .setName("Custom CSS")
      .setDesc("Styles written here are injected into the vault and applied immediately (no restart needed).")
      .setClass("gd-set-css");
    wrap.addTextArea((a) => {
      a.inputEl.rows = 14;
      a.inputEl.style.width = "100%";
      a.inputEl.spellcheck = false;
      a.setPlaceholder(".grid-diary-view .gd-cell { border: none; }");
      a.setValue(this.plugin.settings.customCss).onChange(async (v) => {
        this.plugin.settings.customCss = v;
        await this.plugin.saveSettings();
        this.plugin.applyCustomCss();
      });
    });
  }
}

/** 新增模板的小弹窗（Obsidian 原生 Modal） */
class TemplateModal extends Modal {
  private onSubmit: (name: string, titles: string[]) => boolean | Promise<boolean>;

  constructor(app: App, onSubmit: (name: string, titles: string[]) => boolean | Promise<boolean>) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "New template" });
    let name = "";
    let titles = "";

    new Setting(contentEl).setName("Template name").addText((t) => {
      t.setPlaceholder("My diary");
      t.onChange((v) => (name = v));
      window.setTimeout(() => t.inputEl.focus(), 40);
    });

    new Setting(contentEl)
      .setName("Cell names")
      .setDesc("Separate with commas or semicolons, e.g. Events, Reading, Notes, Jotting, Tasks")
      .addText((t) => {
        t.setPlaceholder("Events, Reading, Notes, Jotting, Tasks");
        t.inputEl.style.width = "100%";
        t.onChange((v) => (titles = v));
      });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("Save")
          .setCta()
          .onClick(async () => {
            const n = name.trim();
            const list = titles
              .split(/[,，;；]/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (!n) {
              new Notice("Please enter a template name");
              return;
            }
            if (!list.length) {
              new Notice("Please enter at least one cell name");
              return;
            }
            const ok = await this.onSubmit(n, list);
            if (ok) this.close();
          })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
