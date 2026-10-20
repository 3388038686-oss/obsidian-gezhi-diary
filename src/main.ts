import { Menu, Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, GridDiarySettingTab } from "./settings";
import { DayStore, todayStr } from "./store";
import { DiaryTemplate, GridDiarySettings } from "./types";
import { GridDiaryView, VIEW_TYPE_GRID_DIARY } from "./view";
import { CalendarSidebarView, VIEW_TYPE_CAL } from "./calendar";
import { renderTemplate } from "./template";
import { QuickNoteModal } from "./modals";

export default class GridDiaryPlugin extends Plugin {
  settings!: GridDiarySettings;
  store!: DayStore;
  /** 当前选中的日期，主视图与右侧日历共用 */
  activeDate: string = todayStr();

  async onload(): Promise<void> {
    await this.loadSettings();
    this.applyCustomCss();
    this.store = new DayStore(this.app, () => this.settings.rootFolder);
    this.store.getDefaultTitles = () => this.getDefaultTemplate()?.titles ?? [];

    this.registerView(VIEW_TYPE_GRID_DIARY, (leaf: WorkspaceLeaf) => new GridDiaryView(leaf, this));
    this.registerView(VIEW_TYPE_CAL, (leaf: WorkspaceLeaf) => new CalendarSidebarView(leaf, this));

    this.addCommand({
      id: "open-calendar-sidebar",
      name: "打开日记日历侧栏",
      callback: () => void this.activateCalendar(),
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

    this.addSettingTab(new GridDiarySettingTab(this.app, this));

    // —— 动态监听：文件新增/修改/删除/改名 → 全视图自动刷新，无需重启 ——
    const onVaultChange = () => this.scheduleGlobalRefresh();
    this.registerEvent(this.app.vault.on("modify", onVaultChange));
    this.registerEvent(this.app.vault.on("create", onVaultChange));
    this.registerEvent(this.app.vault.on("delete", onVaultChange));
    this.registerEvent(this.app.vault.on("rename", onVaultChange));
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

  /** 按设置里的模板文件建当天文件；无模板则用内置格子模板 */
  async createDayFileFor(date: string): Promise<void> {
    if (this.store.fileFor(date)) return;
    const titles = this.getDefaultTemplate()?.titles ?? [];
    let text = "";
    const tplPath = this.settings.dailyTemplatePath?.trim();
    if (tplPath) {
      const f = this.app.vault.getAbstractFileByPath(normalizePath(tplPath));
      if (f instanceof TFile) {
        try {
          text = renderTemplate(await this.app.vault.cachedRead(f), date);
        } catch (e) {
          console.error("[grid-diary] 读取模板失败", e);
        }
      }
    }
    await this.store.createDayFile(date, titles, text);
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
        view.currentDate = date;
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
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
