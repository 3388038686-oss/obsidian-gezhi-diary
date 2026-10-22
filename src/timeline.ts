import { ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type GridDiaryPlugin from "./main";
import { isTimelineTitle, mirrorSections, parseDay, stripEmptyHeadings } from "./sections";
import { TemplatePickModal } from "./modals";
import { elIcon } from "./icons";

export const VIEW_TYPE_TIMELINE = "grid-diary-timeline";

/** 软删除标记（规格书：严禁物理删除，标记后 UI 折叠隐藏） */
const DELETED_TAG = "[DELETED]";
const SNAPSHOT_DIR = ".grid-diary-snapshots";
const SNAPSHOT_KEEP = 10;

interface Entry {
  title: string;
  time: string;
  body: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function catOf(title: string): string {
  return title.replace(/^\d{1,2}[:：]\d{2}\s*/, "").replace(new RegExp(escapeRegExp(DELETED_TAG)), "").trim();
}

/** 规格书模块五：右侧时间流面板（只显示当前激活日，细时间轴 + 软删除 + 快照） */
export class TimelineView extends ItemView {
  private off: (() => void) | null = null;
  private date: string;
  private bodyEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: GridDiaryPlugin) {
    super(leaf);
    this.date = plugin.activeDate;
  }

  getViewType(): string {
    return VIEW_TYPE_TIMELINE;
  }
  getDisplayText(): string {
    return "时间流";
  }
  getIcon(): string {
    return "list-tree";
  }

  async onOpen(): Promise<void> {
    this.off = this.plugin.onDateChange((d: string) => {
      this.date = d;
      void this.renderBody();
    });
    await this.render();
  }

  async onClose(): Promise<void> {
    this.off?.();
    this.off = null;
  }

  /** 供 refreshAll 调用 */
  refresh(): void {
    void this.renderBody();
  }

  async render(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("gd-tl-side");

    const bar = root.createDiv({ cls: "gd-tl-side-bar" });
    bar.createDiv({ cls: "gd-tl-side-title", text: "时间流" });
    const dateTag = bar.createDiv({ cls: "gd-tl-side-date" });
    dateTag.setText(this.date);
    const add = bar.createEl("button", { cls: "gd-tl-side-btn" });
    elIcon(add, "plus");
    add.setAttribute("aria-label", "按模板追加一条记录");
    add.addEventListener("click", () => {
      new TemplatePickModal(this.app, this.plugin.settings.templates, (tpl) => {
        void this.plugin.store
          .appendTimelineNote(this.date, tpl.name, "")
          .then(() => this.refresh())
          .catch((err) => console.error("[grid-diary] 追加失败", err));
      }).open();
    });
    const undo = bar.createEl("button", { cls: "gd-tl-side-btn" });
    elIcon(undo, "undo");
    undo.setAttribute("aria-label", "恢复最近删除的一条");
    undo.addEventListener("click", () => void this.restoreLast());

    this.bodyEl = root.createDiv({ cls: "gd-tl-side-body" });
    await this.renderBody();
  }

  private async renderBody(): Promise<void> {
    const host = this.bodyEl;
    if (!host) return;
    host.empty();
    const dateTag = this.contentEl.querySelector(".gd-tl-side-date") as HTMLElement | null;
    if (dateTag) dateTag.setText(this.date);

    const file = this.plugin.store.fileFor(this.date);
    if (!file) {
      host.createDiv({ cls: "gd-tl-side-empty", text: `${this.date} 还没有文件` });
      return;
    }
    let text = "";
    try {
      text = await this.app.vault.read(file);
    } catch (err) {
      console.error("[grid-diary] 时间流读取失败", err);
      host.createDiv({ cls: "gd-tl-side-empty", text: "读取失败" });
      return;
    }
    const parsed = parseDay(text);
    const cellMap: Record<string, string> = {};
    for (const s of parsed.sections) cellMap[s.title] = s.body;

    const live: Entry[] = [];
    const deleted: Entry[] = [];
    for (const s of parsed.sections) {
      if (!isTimelineTitle(s.title)) continue;
      const entry: Entry = { title: s.title, time: (s.title.match(/^\d{1,2}[:：]\d{2}/) ?? [""])[0].replace("：", ":"), body: s.body };
      (s.title.includes(DELETED_TAG) ? deleted : live).push(entry);
    }

    const list = host.createDiv({ cls: "gd-tl-side-list" });
    if (live.length === 0 && deleted.length === 0) {
      list.createDiv({ cls: "gd-tl-side-empty", text: "这一天还没有记录" });
    }
    for (let i = 0; i < live.length; i++) {
      const it = live[i];
      const row = list.createDiv({ cls: "gd-tl-side-row" });

      const axis = row.createDiv({ cls: "gd-tl-side-axis" });
      axis.createDiv({ cls: "gd-tl-side-dot" });
      if (i < live.length - 1) axis.createDiv({ cls: "gd-tl-side-line" });
      axis.createDiv({ cls: "gd-tl-side-meta", text: `${it.time}\n${catOf(it.title)}` });

      const card = row.createDiv({ cls: "gd-tl-side-card" });
      const cardBar = card.createDiv({ cls: "gd-tl-side-card-bar" });
      cardBar.createSpan({ cls: "gd-tl-side-card-title", text: catOf(it.title) || "记录" });
      const del = cardBar.createEl("button", { cls: "gd-tl-side-mini" });
      elIcon(del, "trash");
      del.setAttribute("aria-label", "软删除（可恢复）");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.softDelete(it.title);
      });

      const preview = card.createDiv({ cls: "gd-tl-side-preview gd-cell-text markdown-rendered" });
      const raw = stripEmptyHeadings(mirrorSections(it.body, cellMap) ?? it.body);
      if (!raw.trim()) {
        preview.createDiv({ cls: "gd-cell-placeholder", text: "（空）" });
      } else {
        void MarkdownRenderer.render(this.app, raw, preview, file.path, this.plugin);
      }
    }

    if (deleted.length > 0) {
      const det = host.createEl("details", { cls: "gd-tl-side-deleted" });
      det.createEl("summary", { text: `已删除 ${deleted.length} 条（点开恢复）` });
      for (const it of deleted) {
        const drow = det.createDiv({ cls: "gd-tl-side-drow" });
        drow.createSpan({ cls: "gd-tl-side-dtitle", text: catOf(it.title) || it.title });
        const res = drow.createEl("button", { cls: "gd-tl-side-mini", text: "恢复" });
        res.addEventListener("click", (e) => {
          e.stopPropagation();
          void this.restoreTitle(it.title);
        });
      }
    }
  }

  /** 删除前落一份快照（隐藏目录，每篇保留最近 10 份） */
  private async snapshot(file: TFile): Promise<void> {
    try {
      if (!this.app.vault.getAbstractFileByPath(SNAPSHOT_DIR)) {
        await this.app.vault.createFolder(SNAPSHOT_DIR);
      }
      const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      const content = await this.app.vault.read(file);
      await this.app.vault.create(`${SNAPSHOT_DIR}/${file.basename}-${stamp}.md`, content);
      const all = this.app.vault
        .getFiles()
        .filter((f) => f.parent?.path === SNAPSHOT_DIR && f.basename.startsWith(file.basename + "-"));
      all.sort((a, b) => a.name.localeCompare(b.name));
      for (let i = 0; i < all.length - SNAPSHOT_KEEP; i++) await this.app.vault.trash(all[i], true);
    } catch (err) {
      console.error("[grid-diary] 快照失败", err);
    }
  }

  private async softDelete(title: string): Promise<void> {
    const file = this.plugin.store.fileFor(this.date);
    if (!file) return;
    await this.snapshot(file);
    await this.app.vault.process(file, (data) => {
      const re = new RegExp(`^## ${escapeRegExp(title)}\\s*$`, "m");
      if (!re.test(data)) return data;
      return data.replace(re, `## ${title} ${DELETED_TAG}`);
    });
    await this.renderBody();
  }

  private async restoreTitle(title: string): Promise<void> {
    const file = this.plugin.store.fileFor(this.date);
    if (!file) return;
    await this.app.vault.process(file, (data) => data.split(`## ${title}`).join(`## ${title.replace(` ${DELETED_TAG}`, "")}`));
    await this.renderBody();
  }

  /** 恢复文件里最后一条带 [DELETED] 标记的记录 */
  private async restoreLast(): Promise<void> {
    const file = this.plugin.store.fileFor(this.date);
    if (!file) {
      new Notice("这天没有文件");
      return;
    }
    let last: string | null = null;
    const text = await this.app.vault.read(file);
    for (const line of text.split("\n")) {
      if (line.startsWith("## ") && line.includes(DELETED_TAG)) last = line.slice(3).trim();
    }
    if (!last) {
      new Notice("没有可恢复的删除记录");
      return;
    }
    await this.restoreTitle(last);
    new Notice(`已恢复：${catOf(last) || last}`);
  }
}
