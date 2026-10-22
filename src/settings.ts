import { App, DropdownComponent, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type GridDiaryPlugin from "./main";
import { DiaryTemplate, GridDiarySettings, LayoutPreset } from "./types";

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
  listLineStyle: "vertical",
  skipPermanentConfirm: false,
  fontDataUrl: "",
  fontFileName: "",
  fontDirFile: "",
  autoCreateToday: true,
  dailyTemplatePath: "",
  // —— 左侧目录面板 ——
  leftWidth: 190,
  showRecentFiles: false,
  showTreeLines: true,
  iconFile: "",
  iconFolder: "",
  iconFolderOpen: "",
  treeSort: "folders",
  treeDefaultOpen: true,
  hoverGlow: true,
  showLeftPanel: true,
  // —— 布局与字号（不与 Obsidian 官方全局设置冲突）——
  pluginFontSize: 15,
  contentPad: 18,
  gridGap: 14,
  rightDockWidth: 0,
  activePreset: "紧凑",
  layoutPresets: [
    { name: "紧凑", leftWidth: 190, contentPad: 18, gridGap: 14, columns: 2, cellHeight: 200, rightDockWidth: 0, pluginFontSize: 15 },
    { name: "宽松", leftWidth: 280, contentPad: 44, gridGap: 26, columns: 2, cellHeight: 240, rightDockWidth: 380, pluginFontSize: 17 },
  ],
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
    containerEl.createEl("h2", { text: "格间日记设置" });

    // —— Tab 头 ——
    const tabs = containerEl.createDiv({ cls: "gd-set-tabs" });
    const defs: Array<[TabKey, string]> = [
      ["general", "常规设置"],
      ["style", "样式设置"],
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
      .setName("日记目录")
      .setDesc("一天一个 md 文件，文件名按 YYYY-MM-DD。默认读你现有的「日记」目录。")
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
      .setName("一格 = 一个二级标题")
      .setDesc("插件按 md 里的 「## 标题」切分格子，内容和原本的文件完全共用，不改格式。")
      .setDisabled(true)
      .addText((t) => t.setValue("## 标题").setDisabled(true));

    new Setting(panel)
      .setName("打开时自动补当天文件")
      .setDesc("打开视图或点「今天」时，当天文件不存在就静默创建。")
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
      .setName("新建日记时自动应用的模板")
      .setDesc(
        "留空 = 新建完全空白的文件（不写属性、标题、格子）。填路径就用你的模板，例如 05template模板/我的日记模板.md。新建时只做三类纯文本替换：{{date}} / {{date:YYYY-MM-DD}} → 当天日期，{{time}} / {{time:HH:mm}} → 当前时间，{{title}} → 文件名（YYYY-MM-DD）。其余内容原样写入，不做任何解析。"
      )
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
      d.addOption("", "（空白文件）");
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
      .setName("列数")
      .setDesc("格子墙每行显示几个格子。")
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
      .setName("格子内容高度")
      .setDesc("每个格子正文区固定高度（px），超出就在格子内滚动。")
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

    new Setting(panel).setName("布局").setHeading();
    new Setting(panel)
      .setName("插件正文字号")
      .setDesc("只影响格间日记界面（格子、时间流、目录、日历），不改 Obsidian 官方字号。")
      .addSlider((s) =>
        s
          .setLimits(10, 24, 1)
          .setValue(this.plugin.settings.pluginFontSize ?? 15)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.pluginFontSize = v;
            await this.plugin.saveSettings();
            this.plugin.applyLayout();
            this.plugin.refreshViews();
          })
      );

    new Setting(panel)
      .setName("内容区左右边距")
      .setDesc("九宫格区域的留白（px），像阅读工具那样调。")
      .addSlider((s) =>
        s
          .setLimits(0, 60, 2)
          .setValue(this.plugin.settings.contentPad ?? 18)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.contentPad = v;
            await this.plugin.saveSettings();
            this.plugin.applyLayout();
          })
      );

    new Setting(panel)
      .setName("格子间距")
      .setDesc("格子之间的空隙（px）。")
      .addSlider((s) =>
        s
          .setLimits(4, 40, 2)
          .setValue(this.plugin.settings.gridGap ?? 14)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.gridGap = v;
            await this.plugin.saveSettings();
            this.plugin.applyLayout();
          })
      );

    new Setting(panel)
      .setName("右侧栏宽度")
      .setDesc("接管 Obsidian 右侧 dock 的宽度；0 = 不接管（自己拖）。设为非 0 后写入布局模板可一键恢复，但主题升级可能让它失效。")
      .addSlider((s) =>
        s
          .setLimits(0, 640, 20)
          .setValue(this.plugin.settings.rightDockWidth ?? 0)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.rightDockWidth = v;
            await this.plugin.saveSettings();
            this.plugin.applyLayout();
          })
      );

    new Setting(panel).setName("布局模板").setHeading();
    let presetNameInput: HTMLInputElement | null = null;
    new Setting(panel)
      .setName("保存当前布局")
      .setDesc("把左栏宽、边距、间距、列数、格子高、字号、右栏宽存成一个模板。")
      .addText((t) => {
        t.setPlaceholder("模板名，如：阅读模式");
        presetNameInput = t.inputEl;
      })
      .addButton((b) =>
        b.setButtonText("保存").onClick(async () => {
          const name = (presetNameInput?.value || "").trim();
          if (!name) {
            new Notice("先给模板起个名字");
            return;
          }
          const s = this.plugin.settings;
          const idx = s.layoutPresets.findIndex((p) => p.name === name);
          const preset: LayoutPreset = {
            name,
            leftWidth: s.leftWidth,
            contentPad: s.contentPad ?? 18,
            gridGap: s.gridGap ?? 14,
            columns: s.columns,
            cellHeight: s.cellHeight,
            rightDockWidth: s.rightDockWidth ?? 0,
            pluginFontSize: s.pluginFontSize ?? 15,
          };
          if (idx >= 0) s.layoutPresets[idx] = preset;
          else s.layoutPresets.push(preset);
          s.activePreset = name;
          await this.plugin.saveSettings();
          new Notice(`布局模板「${name}」已保存`);
          this.display();
        })
      );

    for (const preset of [...(this.plugin.settings.layoutPresets ?? [])]) {
      new Setting(panel)
        .setName(preset.name)
        .setDesc(
          `左栏 ${preset.leftWidth}px · 边距 ${preset.contentPad} · 间距 ${preset.gridGap} · ${preset.columns} 列 · 格高 ${preset.cellHeight}${
            preset.rightDockWidth ? ` · 右栏 ${preset.rightDockWidth}px` : ""
          } · 字号 ${preset.pluginFontSize}`
        )
        .addButton((b) =>
          b.setButtonText("应用").onClick(async () => {
            const s = this.plugin.settings;
            s.leftWidth = preset.leftWidth;
            s.contentPad = preset.contentPad;
            s.gridGap = preset.gridGap;
            s.columns = preset.columns;
            s.cellHeight = preset.cellHeight;
            s.rightDockWidth = preset.rightDockWidth;
            s.pluginFontSize = preset.pluginFontSize;
            s.activePreset = preset.name;
            await this.plugin.saveSettings();
            this.plugin.applyLayout();
            this.plugin.refreshViews();
            new Notice(`已应用布局模板「${preset.name}」`);
          })
        )
        .addButton((b) =>
          b.setButtonText("改名").onClick(() => {
            const input = document.createElement("input");
            input.type = "text";
            input.value = preset.name;
            const modal = new Modal(this.app);
            modal.titleEl.setText("改名");
            modal.contentEl.appendChild(input);
            input.focus();
            modal.contentEl.createEl("div", { cls: "setting-item-description", text: "回车确认" });
            input.addEventListener("keydown", async (e) => {
              if (e.key === "Enter") {
                const newName = input.value.trim();
                if (newName) {
                  preset.name = newName;
                  await this.plugin.saveSettings();
                  modal.close();
                  this.display();
                }
              }
            });
            modal.open();
          })
        )
        .addButton((b) =>
          b.setButtonText("删除").setWarning().onClick(async () => {
            const s = this.plugin.settings;
            s.layoutPresets = (s.layoutPresets ?? []).filter((p) => p.name !== preset.name);
            if (s.activePreset === preset.name) s.activePreset = undefined;
            await this.plugin.saveSettings();
            this.display();
          })
        );
    }

    new Setting(panel)
      .setName("目录连线样式")
      .setDesc("右侧日记列表的连线风格。折线星图 = 节点 + 横向折线连接到右侧日期，鼠标悬停时该行连线变亮。")
      .addDropdown((d) => {
        d.addOption("vertical", "标准垂直（普通模式）");
        d.addOption("polyline", "折线星图（Polyline）");
        d.setValue(this.plugin.settings.listLineStyle ?? "vertical");
        d.onChange(async (v) => {
          this.plugin.settings.listLineStyle = v === "polyline" ? "polyline" : "vertical";
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        });
      });

    new Setting(panel)
      .setName("显示左侧目录面板")
      .setDesc("左侧＝「最近文件 + 文件夹树」，右侧＝九宫格与时间流；中间分隔条可拖动改宽度。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showLeftPanel).onChange(async (v) => {
          this.plugin.settings.showLeftPanel = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(panel)
      .setName("显示「最近文件」")
      .setDesc("左侧上半区：按修改时间排序列出最近 12 篇 md。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showRecentFiles).onChange(async (v) => {
          this.plugin.settings.showRecentFiles = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(panel)
      .setName("文件夹树显示折线连接线")
      .setDesc("下半区文件夹层级左侧的竖线 + 横线，用来标示层级。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showTreeLines).onChange(async (v) => {
          this.plugin.settings.showTreeLines = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(panel)
      .setName("文件夹默认展开")
      .setDesc("打开时文件夹树是否默认全部展开（你手动折叠过的会记住）。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.treeDefaultOpen).onChange(async (v) => {
          this.plugin.settings.treeDefaultOpen = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(panel)
      .setName("目录排序方式")
      .setDesc("文件夹树里同级条目的排列顺序。")
      .addDropdown((d) =>
        d
          .addOption("folders", "文件夹优先（按名称）")
          .addOption("name", "纯名称")
          .addOption("mtime", "修改时间（新在上）")
          .setValue(this.plugin.settings.treeSort)
          .onChange(async (raw) => {
            const v = raw as "folders" | "name" | "mtime";
            this.plugin.settings.treeSort = v;
            await this.plugin.saveSettings();
            this.plugin.refreshViews();
          })
      );

    new Setting(panel)
      .setName("悬停高亮 / 流星滑过")
      .setDesc("鼠标划过左侧条目时的高亮与斜向流光动效。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.hoverGlow).onChange(async (v) => {
          this.plugin.settings.hoverGlow = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(panel)
      .setName("文件图标")
      .setDesc("可填 emoji 或留空用 CSS 变量 --gd-icon-file 控制。")
      .addText((x) =>
        x.setValue(this.plugin.settings.iconFile).onChange(async (v) => {
          this.plugin.settings.iconFile = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(panel)
      .setName("文件夹图标（收起 / 展开）")
      .setDesc("两个输入框：收起时、展开时。想用自定义 SVG 就留空，改 CSS 变量 --gd-icon-folder / --gd-icon-folder-open。")
      .addText((x) =>
        x.setPlaceholder("留空 = 内置线条图标").setValue(this.plugin.settings.iconFolder).onChange(async (v) => {
          this.plugin.settings.iconFolder = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      )
      .addText((x) =>
        x.setPlaceholder("留空 = 内置线条图标").setValue(this.plugin.settings.iconFolderOpen).onChange(async (v) => {
          this.plugin.settings.iconFolderOpen = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(panel)
      .setName("当前模板")
      .setDesc("新建当天文件、自动补齐时用哪个模板。随时可换。")
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
      .setName("永久删除时不再确认")
      .setDesc("开启后，「永久删除」直接执行不弹窗（移入回收站始终秒删、始终可恢复）。随时可在这里关回来。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.skipPermanentConfirm).onChange(async (v) => {
          this.plugin.settings.skipPermanentConfirm = v;
          await this.plugin.saveSettings();
        })
      );

    const tplSetting = new Setting(panel)
      .setName("模板库")
      .setDesc(
        "点「+ 新增模板」添加；也可直接在下面按「模板名 | 格子1 ; 格子2」逐行编辑。新增后立刻出现在「当前模板」里。"
      )
      .addButton((b) =>
        b
          .setButtonText("+ 新增模板")
          .setCta()
          .onClick(() => {
            new TemplateModal(this.app, async (name, titles) => {
              if (this.plugin.settings.templates.some((t) => t.name === name)) {
                new Notice("已有同名模板，换个名字");
                return false;
              }
              this.plugin.settings.templates.push({ name, titles });
              await this.plugin.saveSettings();
              this.plugin.refreshViews();
              this.display();
              new Notice(`已添加模板：${name}`);
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
        .setDesc(`${tpl.titles.length} 格：${tpl.titles.join(" / ")}`)
        .addExtraButton((b) =>
          b
            .setIcon("trash")
            .setTooltip("删除这个模板")
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
              new Notice(`已删除模板：${tpl.name}`);
            })
        );
    }
  }

  // ---------- 样式 ----------
  private renderStyle(panel: HTMLElement): void {
    new Setting(panel)
      .setName("背景图")
      .setDesc("留空则无背景。可填 vault 内图片路径（如 附件/bg.jpg）或 http 链接。")
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
      .setName("格子透明度")
      .setDesc("0.3 ~ 1，越小越通透。")
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
      .setName("字体")
      .setDesc("CSS font-family，默认楷体，装了霞鹜文楷会更像手写。")
      .addText((t) =>
        t.setValue(this.plugin.settings.fontFamily).onChange(async (v) => {
          this.plugin.settings.fontFamily = v;
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        })
      );

    new Setting(panel)
      .setName("导入本地字体")
      .setDesc(
        `支持 .ttf / .otf，导入后立刻应用到格子和日历；建议小于 4MB。${
          this.plugin.settings.fontFileName
            ? `当前已导入：${this.plugin.settings.fontFileName}`
            : "当前未导入字体文件。"
        }`
      )
      .addButton((b) =>
        b.setButtonText("上传字体文件").onClick(() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".ttf,.otf,font/ttf,font/otf,application/x-font-ttf";
          input.onchange = () => {
            const f = input.files?.[0];
            if (!f) return;
            if (f.size > 4 * 1024 * 1024) {
              new Notice("字体文件超过 4MB，建议改用 CSS 字体名方式，或换更小的子集字体");
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
              new Notice(`已应用字体：${f.name}`);
            };
            reader.onerror = () => new Notice("读取字体文件失败");
            reader.readAsDataURL(f);
          };
          input.click();
        })
      )
      .addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("移除已导入的字体")
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
      .setName("从 .obsidian/fonts 读取（大字体备选）")
      .setDesc(
        "把 .ttf/.otf 放进 vault 的 .obsidian/fonts 目录，点「扫描目录」，再在下拉里选。适合超过 4MB 的字体。"
      )
      .addDropdown((d) => {
        d.addOption("", "（未选择）");
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
          new Notice(v ? `已应用目录字体：${v}` : "已取消目录字体");
        });
        this.dirDropdown = d;
      })
      .addButton((b) =>
        b.setButtonText("扫描目录").onClick(async () => {
          const files = await this.scanFontDir();
          if (!files.length) {
            new Notice("没找到 .ttf/.otf。请先在 vault 的 .obsidian/fonts 里放字体文件");
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
          new Notice(`找到 ${files.length} 个字体，已应用：${files[0]}`);
        })
      );

    new Setting(panel)
      .setName("字重")
      .setDesc("数字越小越细。300 细体、400 常规、500 稍粗。")
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
      .setName("自定义 CSS")
      .setDesc("写在这里的样式会注入到整个库，保存后立即生效（不用重启）。")
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
    contentEl.createEl("h3", { text: "新增模板" });
    let name = "";
    let titles = "";

    new Setting(contentEl).setName("模板名称").addText((t) => {
      t.setPlaceholder("五行日记");
      t.onChange((v) => (name = v));
      window.setTimeout(() => t.inputEl.focus(), 40);
    });

    new Setting(contentEl)
      .setName("格子名称")
      .setDesc("用逗号或分号隔开，例如：事件、书账、新知、碎记、待办")
      .addText((t) => {
        t.setPlaceholder("事件、书账、新知、碎记、待办");
        t.inputEl.style.width = "100%";
        t.onChange((v) => (titles = v));
      });

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("取消").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("保存")
          .setCta()
          .onClick(async () => {
            const n = name.trim();
            const list = titles
              .split(/[,，;；]/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (!n) {
              new Notice("请填模板名称");
              return;
            }
            if (!list.length) {
              new Notice("请填至少一个格子名称");
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
