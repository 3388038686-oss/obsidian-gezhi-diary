import { Menu, Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, GridDiarySettingTab } from "./settings";
import { DayStore, todayStr } from "./store";
import { DiaryTemplate, GridDiarySettings } from "./types";
import { GridDiaryView, VIEW_TYPE_GRID_DIARY } from "./view";
import { CalendarSidebarView, VIEW_TYPE_CAL } from "./calendar";
import { QuickNoteModal } from "./modals";

export default class GridDiaryPlugin extends Plugin {
  settings!: GridDiarySettings;
  store!: DayStore;
  /** 当前选中的日期，主视图与右侧日历共用 */
  activeDate: string = todayStr();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.applyCustomCss();
    this.applyLayout();
    this.store = new DayStore(this.app, () => this.settings.rootFolder);
    this.store.getDefaultTitles = () => this.getDefaultTemplate()?.titles ?? [];
    this.store.ensureDayFile = (date: string) => this.createDayFileFor(date);

    this.registerView(VIEW_TYPE_GRID_DIARY, (leaf: WorkspaceLeaf) => new GridDiaryView(leaf, this));
    this.registerView(VIEW_TYPE_CAL, (leaf: WorkspaceLeaf) => new CalendarSidebarView(leaf, this));

    this.addCommand({
      id: "open-calendar-sidebar",
      name: "打开日记日历侧栏",
      callback: () => void this.activateCalendar(),
    });

    this.addCommand({
      id: "toggle-calendar-sidebar",
      name: "打开 / 关闭日记日历侧栏",
      callback: async () => {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CAL);
        if (leaves.length) {
          for (const leaf of leaves) leaf.detach();
          new Notice("已关闭日记日历侧栏");
        } else {
          await this.activateCalendar();
          new Notice("已打开日记日历侧栏");
        }
      },
    });

    this.addCommand({
      id: "toggle-left-panel",
      name: "显示 / 隐藏左侧目录面板",
      callback: async () => {
        this.settings.showLeftPanel = !this.settings.showLeftPanel;
        await this.saveSettings();
        this.refreshViews();
        new Notice(this.settings.showLeftPanel ? "已显示左侧目录面板" : "已隐藏左侧目录面板");
      },
    });

    this.addRibbonIcon("layout-grid", "打开格间日记", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-grid-diary",
      name: "打开格间日记",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "open-today-grid",
      name: "打开今天的格子",
      callback: () => void this.activateView(todayStr()),
    });

    this.addCommand({
      id: "fill-today-with-template",
      name: "用默认模板补齐今天的格子",
      callback: async () => {
        const tpl = this.getDefaultTemplate();
        if (!tpl) {
          new Notice("还没有配置模板");
          return;
        }
        const added = await this.store.fillWithTemplate(todayStr(), tpl.titles);
        new Notice(added.length ? `已补齐 ${added.length} 个格子` : "今天的格子已经齐了");
        await this.activateView(todayStr());
      },
    });

    this.addCommand({
      id: "create-today-file",
      name: "新建今天的日记文件",
      callback: async () => {
        if (this.store.fileFor(todayStr())) {
          new Notice("今天已经有文件了");
          return;
        }
        const tpl = this.getDefaultTemplate();
        await this.createDayFileFor(todayStr());
        void tpl;
        new Notice("已创建今天的日记");
        await this.activateView(todayStr());
      },
    });

    this.addCommand({
      id: "images-to-html",
      name: "把当前文件的图片转成通用 <img>（导出用）",
      checkCallback: () => {
        const f = this.app.workspace.getActiveFile();
        if (!f) return false;
        void (async () => {
          const n = await this.convertImagesToHtml(f);
          new Notice(n ? `已转换 ${n} 张图片` : "没有需要转换的图片");
        })();
        return true;
      },
    });

    this.addCommand({
      id: "images-to-wiki",
      name: "把当前文件的 <img> 还原成 Obsidian 内链",
      checkCallback: () => {
        const f = this.app.workspace.getActiveFile();
        if (!f) return false;
        void (async () => {
          const n = await this.convertImagesToWiki(f);
          new Notice(n ? `已还原 ${n} 张图片` : "没有需要还原的图片");
        })();
        return true;
      },
    });

    this.registerTemplateCommands();

    this.addSettingTab(new GridDiarySettingTab(this.app, this));

    // —— 动态监听：文件新增/修改/删除/改名 → 全视图自动刷新，无需重启 ——
    const onVaultChange = () => this.scheduleGlobalRefresh();
    this.registerEvent(this.app.vault.on("modify", onVaultChange));
    this.registerEvent(this.app.vault.on("create", onVaultChange));
    this.registerEvent(this.app.vault.on("delete", onVaultChange));
    this.registerEvent(this.app.vault.on("rename", onVaultChange));
  }

  // ---------- 模板命令 / 兼容导出 ----------
  private templateCommandIds: string[] = [];
  private templateSig = "";

  /** 为每个模板注册一条命令：命令面板搜索「插入模板：xxx」直接插到当天文件末尾 */
  registerTemplateCommands(): void {
    const sig = this.settings.templates.map((t) => `${t.name}:${t.titles.join(",")}`).join("|");
    if (sig === this.templateSig) return;
    this.templateSig = sig;
    for (const id of this.templateCommandIds) {
      try {
        (this as unknown as { removeCommand?: (id: string) => void }).removeCommand?.(id);
      } catch {
        /* 旧版本没有 removeCommand，忽略 */
      }
    }
    this.templateCommandIds = [];
    for (const tpl of this.settings.templates) {
      const id = `insert-template-${tpl.name.replace(/[^\w\u4e00-\u9fa5]+/g, "-")}`;
      this.addCommand({
        id,
        name: `插入模板：${tpl.name}`,
        callback: async () => {
          const date = todayStr();
          if (!this.store.fileFor(date)) await this.createDayFileFor(date);
          await this.insertTemplateNote(date, tpl);
          new Notice(`已插入模板「${tpl.name}」`);
          this.setActiveDate(date);
          this.refreshAll();
        },
      });
      this.templateCommandIds.push(id);
    }
  }

  /** 把当前文件的 ![[图|宽]] 转成 <img src width>，方便导出到别的 Markdown 软件 */
  async convertImagesToHtml(file: TFile): Promise<number> {
    let count = 0;
    await this.app.vault.process(file, (data) => {
      const out = data.replace(/!\[\[([^\]|#]+?)(?:\|(\d+))?\]\]/g, (_m, name: string, w?: string) => {
        const src = normalizePath(`${this.settings.rootFolder || "日记"}/attachments/${name.trim()}`);
        count++;
        return `<img src="${src}"${w ? ` width="${w}"` : ""}>`;
      });
      return out;
    });
    return count;
  }

  /** 反向：把 <img src width> 还原成 ![[图|宽]] */
  async convertImagesToWiki(file: TFile): Promise<number> {
    let count = 0;
    await this.app.vault.process(file, (data) => {
      const out = data.replace(/<img\s+[^>]*src="([^"]+)"[^>]*?(?:width="(\d+)")?[^>]*>/g, (_m, src: string, w?: string) => {
        const base = src.split("/").pop() || src;
        count++;
        return `![[${base}${w ? `|${w}` : ""}]]`;
      });
      return out;
    });
    return count;
  }

  // ---------- 自定义 CSS ----------
  private cssEl: HTMLStyleElement | null = null;

  /** 把设置里的自定义 CSS 注入到文档，改完立即生效 */
  applyCustomCss(): void {
    if (!this.cssEl) {
      this.cssEl = document.createElement("style");
      this.cssEl.id = "grid-diary-custom-css";
      document.head.appendChild(this.cssEl);
      this.register(() => this.cssEl?.remove());
    }
    let src = "";
    if (this.settings.fontDataUrl) {
      src = `url("${this.settings.fontDataUrl}")`;
    } else if (this.settings.fontDirFile) {
      try {
        const p = this.app.vault.adapter.getResourcePath(
          `.obsidian/fonts/${this.settings.fontDirFile}`
        );
        src = `url("${p}")`;
      } catch (e) {
        src = "";
      }
    }
    const face = src
      ? `@font-face{font-family:"GD-Custom";src:${src};font-display:swap;}`
      : "";
    this.cssEl.textContent = face + "\n" + (this.settings.customCss || "");
  }

  /** 字体栈：导入过字体时优先用它 */
  fontStack(): string {
    const custom = this.settings.fontDataUrl || this.settings.fontDirFile;
    return custom ? `"GD-Custom", ${this.settings.fontFamily}` : this.settings.fontFamily;
  }

  // ---------- 全局刷新 ----------
  private refreshTimer: number | null = null;

  private scheduleGlobalRefresh(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refreshAll();
    }, 350);
  }

  /** 所有开着的格间日记视图 + 侧栏日历一起刷新 */
  refreshAll(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GRID_DIARY)) {
      const view = leaf.view;
      if (view instanceof GridDiaryView) view.scheduleRender();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CAL)) {
      const view = leaf.view;
      if (view instanceof CalendarSidebarView) view.refreshCal();
    }
  }

  onunload(): void {
    // 视图由 Obsidian 管理
  }

  getDefaultTemplate(): DiaryTemplate | undefined {
    return (
      this.settings.templates.find((t) => t.name === this.settings.defaultTemplate) ??
      this.settings.templates[0]
    );
  }

  /** 日期变化订阅者（主视图 / 侧栏日历都挂在这里，避免依赖 leaf 遍历） */
  private dateListeners = new Set<(date: string, from?: unknown) => void>();

  onDateChange(fn: (date: string, from?: unknown) => void): () => void {
    this.dateListeners.add(fn);
    return () => {
      this.dateListeners.delete(fn);
    };
  }

  /** 任一视图选了日期：广播给所有订阅者（主视图跳转 + 侧栏高亮） */
  setActiveDate(date: string, from?: unknown): void {
    this.activeDate = date;
    for (const fn of Array.from(this.dateListeners)) {
      try {
        fn(date, from);
      } catch (err) {
        console.error("[grid-diary] date listener failed", err);
      }
    }
  }

  /** 在右侧边栏打开日历（随右栏一起折叠） */
  async activateCalendar(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CAL)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_CAL, active: true });
    }
    await workspace.revealLeaf(leaf);
  }

  /** 选择模板插入：列出设置里的所有模板，选一个追加为时间流笔记 */
  pickTemplateNote(date: string, evt?: MouseEvent): void {
    const templates = this.settings.templates ?? [];
    const menu = new Menu();
    if (!templates.length) {
      menu.addItem((i) => i.setTitle("还没有模板，请到设置里添加").setDisabled(true));
    }
    for (const tpl of templates) {
      menu.addItem((i) =>
        i
          .setTitle(`${tpl.name}（${tpl.titles.length} 格）`)
          .setIcon("layout-template")
          .onClick(() => void this.insertTemplateNote(date, tpl))
      );
    }
    // 菜单跟随鼠标
    if (evt) menu.showAtMouseEvent(evt);
    else menu.showAtPosition({ x: window.innerWidth - 240, y: 160 });
  }

  /** 把模板的格子标题作为内容，追加到当天末尾的时间戳小节下 */
  async insertTemplateNote(date: string, tpl: DiaryTemplate): Promise<void> {
    const body = tpl.titles.map((t) => `### ${t}\n`).join("\n").replace(/\s*$/, "");
    try {
      await this.store.appendTimelineNote(date, body || "（空模板）", tpl.name);
      new Notice(`已插入模板：${tpl.name}`);
      this.setActiveDate(date);
      this.refreshAll();
    } catch (e) {
      console.error("[grid-diary] 插入模板失败", e);
      new Notice("插入模板失败，请看控制台");
    }
  }

  /** 快速笔记：追加一条带时间戳的笔记，不碰九宫格 */
  quickNote(date: string): void {
    new QuickNoteModal(this.app, date, async (text) => {
      try {
        await this.store.appendTimelineNote(date, text);
        new Notice("已添加一条笔记");
        this.setActiveDate(date);
        this.refreshAll();
      } catch (e) {
        console.error("[grid-diary] 追加笔记失败", e);
        new Notice("添加失败，请看控制台");
      }
    }).open();
  }

  /** 把任意文件写进 attachments 目录，返回文件名（不含目录） */
  async saveAttachment(date: string, data: ArrayBuffer | Blob, ext: string, prefix = ""): Promise<string> {
    const dir = normalizePath(`${this.settings.rootFolder || "日记"}/attachments`);
    if (!this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir).catch(() => undefined);
    }
    const clean = (ext || "bin").replace(/^\./, "").toLowerCase();
    const name = `${date}-${prefix}${Date.now().toString(36)}.${clean}`;
    const buf = data instanceof Blob ? await data.arrayBuffer() : data;
    await this.app.vault.createBinary(normalizePath(`${dir}/${name}`), buf);
    return name;
  }

  /** 插入图片：写入 attachments，并在当天文件追加 ![[文件名]] */
  async insertImage(date: string): Promise<void> {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const f = input.files?.[0];
      if (!f) return;
      void (async () => {
        try {
          const ext = (f.name.split(".").pop() || "png").toLowerCase();
          const name = await this.saveAttachment(date, f, ext);
          await this.store.appendTimelineNote(date, `![[${name}|400]]`, "图片");
          new Notice("已插入图片");
          this.setActiveDate(date);
          this.refreshAll();
        } catch (e) {
          console.error("[grid-diary] 插入图片失败", e);
          new Notice("插入图片失败");
        }
      })();
    });
    input.click();
  }

  /** 极简变量替换：{{date}} {{date:格式}} {{time}} {{time:格式}} {{title}} */
  applyVars(text: string, date: string): string {
    const m = window.moment;
    return text.replace(
      /\{\{\s*(date|time|title)\s*(?::([^}]*))?\}\}/g,
      (_all: string, key: string, fmt?: string) => {
        if (key === "title") return date;
        const format = (fmt != null ? fmt : "").trim() || (key === "time" ? "HH:mm" : "YYYY-MM-DD");
        return key === "date" ? m(date, "YYYY-MM-DD").format(format) : m().format(format);
      }
    );
  }

  /**
   * 新建当天文件：路径固定为 <日记目录>/YYYY-MM-DD.md
   * 已存在就直接用，不新建；有模板就读纯文本做 {{ }} 替换后写入。
   */
  async createDayFileFor(date: string): Promise<void> {
    const dir = (this.settings.rootFolder || "").trim().replace(/^\/+|\/+$/g, "") || "日记";
    const path = normalizePath(`${dir}/${date}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return;
    await this.store.ensureFolder();
    let text = "";
    const tplPath = (this.settings.dailyTemplatePath || "").trim();
    if (tplPath) {
      const tpl = this.app.vault.getAbstractFileByPath(normalizePath(tplPath));
      if (tpl instanceof TFile) {
        try {
          text = this.applyVars(await this.app.vault.read(tpl), date);
        } catch (e) {
          console.error("[grid-diary] 读取模板失败", e);
        }
      } else {
        new Notice(`模板文件不存在：${tplPath}`);
      }
    }
    const body = text ? text.replace(/\s*$/, "") + "\n" : "";
    const file = await this.app.vault.create(path, body);
    await this.store.syncAttrs(file);
  }

  async activateView(date?: string): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_GRID_DIARY)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_GRID_DIARY, active: true });
    }
    await workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof GridDiaryView) {
      if (date) {
        view.jumpTo(date);
        this.setActiveDate(date, view);
      }
      await view.render();
    }
  }

  refreshViews(): void {
    this.refreshAll();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // 旧配置一次性迁移：左侧栏默认收窄、最近文件默认关闭
    if (!this.settings.leftPanelMigrated) {
      this.settings.showRecentFiles = false;
      this.settings.leftPanelMigrated = true;
      await this.saveSettings();
    }
    // 旧版默认 150，统一迁移到 200（用户可再自行调整）
    if (this.settings.cellHeight === 150) this.settings.cellHeight = 200;
    // 兼容旧配置：模板若用 questions 字段，转成 titles
    for (const tpl of this.settings.templates as unknown as {
      name: string;
      titles?: string[];
      questions?: string[];
    }[]) {
      if (!tpl.titles && tpl.questions) tpl.titles = tpl.questions;
    }
    this.settings.templates = this.settings.templates.filter(
      (t) => Array.isArray(t.titles) && t.titles.length
    );
    if (!this.settings.templates.length) this.settings.templates = DEFAULT_SETTINGS.templates;
    if (typeof this.settings.showLeftPanel !== "boolean") this.settings.showLeftPanel = true;
    if (typeof this.settings.showRecentFiles !== "boolean") this.settings.showRecentFiles = true;
    if (typeof this.settings.showTreeLines !== "boolean") this.settings.showTreeLines = true;
    if (typeof this.settings.treeDefaultOpen !== "boolean") this.settings.treeDefaultOpen = true;
    if (typeof this.settings.hoverGlow !== "boolean") this.settings.hoverGlow = true;
    if (!this.settings.iconFile) this.settings.iconFile = DEFAULT_SETTINGS.iconFile;
    if (!this.settings.iconFolder) this.settings.iconFolder = DEFAULT_SETTINGS.iconFolder;
    if (!this.settings.iconFolderOpen) this.settings.iconFolderOpen = DEFAULT_SETTINGS.iconFolderOpen;
    if (!this.settings.leftWidth || this.settings.leftWidth < 120) this.settings.leftWidth = 190;
    if (!this.settings.layoutMigrated) {
      if (this.settings.leftWidth === 240) this.settings.leftWidth = 190;
      this.settings.layoutMigrated = true;
      await this.saveSettings();
    }
    if (!Array.isArray(this.settings.layoutPresets)) this.settings.layoutPresets = DEFAULT_SETTINGS.layoutPresets;
    if (typeof this.settings.pluginFontSize !== "number") this.settings.pluginFontSize = 15;
    if (typeof this.settings.contentPad !== "number") this.settings.contentPad = 18;
    if (typeof this.settings.gridGap !== "number") this.settings.gridGap = 14;
    if (typeof this.settings.rightDockWidth !== "number") this.settings.rightDockWidth = 0;
  }

  /** 应用布局：字号/边距/间距 CSS 变量 + 右栏宽度接管（全部只作用于本插件界面） */
  applyLayout(): void {
    const s = this.settings;
    const root = document.documentElement;
    root.style.setProperty("--gd-font-size", `${s.pluginFontSize ?? 15}px`);
    root.style.setProperty("--gd-pad", `${s.contentPad ?? 18}px`);
    root.style.setProperty("--gd-gap", `${s.gridGap ?? 14}px`);
    const w = s.rightDockWidth ?? 0;
    let tag = document.getElementById("gd-right-dock-style");
    if (w > 0) {
      if (!tag) {
        tag = document.createElement("style");
        tag.id = "gd-right-dock-style";
        document.head.appendChild(tag);
      }
      tag.textContent = `.workspace-split.mod-right-split{width:${w}px !important;}`;
    } else if (tag) {
      tag.remove();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.registerTemplateCommands();
  }
}
