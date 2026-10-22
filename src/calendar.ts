import { DropdownComponent, ItemView, Menu, Notice, TAbstractFile, WorkspaceLeaf } from "obsidian";
import type GridDiaryPlugin from "./main";
import { appendColoredDate, appendColoredMonth } from "./datecolor";
import { todayStr, weekdayCn } from "./store";
import { ConfirmModal } from "./modals";
import { elIcon } from "./icons";

export const VIEW_TYPE_CAL = "grid-diary-calendar";

type CalMode = "day" | "month";

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 去掉 frontmatter 与各级标题，压成一行纯文本 */
function bodyText(raw: string): string {
  let t = raw.replace(/^\uFEFF/, "");
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(t);
  if (fm) t = t.slice(fm[0].length);
  return t
    .split(/\r?\n/)
    .filter((l) => !/^#{1,6}\s/.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 摘要：正文前 n 字 */
function summarize(raw: string, n = 50): string {
  const s = bodyText(raw);
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** 右侧边栏日历：随右栏折叠；与主视图日期双向联动 */
export class CalendarSidebarView extends ItemView {
  private calY = 0;
  private calM = 0;
  private calDay = 1;
  private calMode: CalMode = "month";
  private bodyEl: HTMLElement | null = null;
  private dayLimit = 200;
  private listEl: HTMLElement | null = null;
  private calEl: HTMLElement | null = null;
  private splitTopEl: HTMLElement | null = null;
  private splitRatio = 0.6;
  private refreshTimer: number | null = null;
  /** 折叠面板展开状态（key = 分组标题） */
  private openState = new Map<string, boolean>();

  constructor(leaf: WorkspaceLeaf, private plugin: GridDiaryPlugin) {
    super(leaf);
    const [y, m, d] = (this.plugin.activeDate || todayStr()).split("-").map(Number);
    this.calY = y;
    this.calM = m;
    this.calDay = d || 1;
  }

  getViewType(): string {
    return VIEW_TYPE_CAL;
  }

  getDisplayText(): string {
    return "日记日历";
  }

  getIcon(): string {
    return "calendar";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("gd-cal-side");
    // 主视图改日期 → 本日历高亮/锚点同步
    this.register(
      this.plugin.onDateChange((date, from) => {
        if (from === this) return;
        this.refreshHighlight(date);
      })
    );
    // 文件变动统一由插件广播（refreshCal）
    this.renderCal();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
  }

  /** 插件级刷新入口（vault 变动 / 设置变更） */
  refreshCal(): void {
    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.renderCal();
    }, 120);
  }

  /** 主视图切日期 → 高亮与锚点同步过来 */
  refreshHighlight(date: string): void {
    const [y, m, d] = date.split("-").map(Number);
    this.calY = y;
    this.calM = m;
    this.calDay = d || 1;
    this.renderCal();
  }

  private shiftCalDays(delta: number): void {
    const d = new Date(this.calY, this.calM - 1, this.calDay);
    d.setDate(d.getDate() + delta);
    this.calY = d.getFullYear();
    this.calM = d.getMonth() + 1;
    this.calDay = d.getDate();
    this.renderCal();
  }

  private shiftMonth(delta: number): void {
    const dt = new Date(this.calY, this.calM - 1 + delta, 1);
    this.calY = dt.getFullYear();
    this.calM = dt.getMonth() + 1;
    const max = new Date(this.calY, this.calM, 0).getDate();
    if (this.calDay > max) this.calDay = max;
    this.renderCal();
  }

  /** 点日期 → 通知插件：主视图跳转 + 各处高亮刷新 */
  private pick(date: string, broadcast = true): void {
    const [y, m, d] = date.split("-").map(Number);
    this.calY = y;
    this.calM = m;
    this.calDay = d || 1;
    this.renderCal();
    if (broadcast) this.plugin.setActiveDate(date, this);
  }

  private renderCal(): void {
    const el = this.contentEl;
    if (!el) return;
    el.empty();
    el.addClass("gd-cal-side");
    el.style.setProperty("--gd-weight", String(this.plugin.settings.fontWeight));
    el.style.setProperty("--gd-font", this.plugin.fontStack());

    // 粒度切换（按日 = 全量列表 / 按月 = 折叠月历）
    const bar = el.createDiv({ cls: "gd-cal-bar" });
    const seg = bar.createDiv({ cls: "gd-cal-seg" });
    const modes: Array<[CalMode, string]> = [
      ["day", "按日"],
      ["month", "按月"],
    ];
    for (const [key, label] of modes) {
      const b = seg.createEl("button", {
        text: label,
        cls: "gd-cal-seg-btn" + (this.calMode === key ? " is-on" : ""),
      });
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.calMode === key) return;
        this.calMode = key;
        this.renderCal();
      });
    }
    // 按日视图不要任何选择器
    if (this.calMode === "month") this.buildPicker(bar);

    // 恢复默认 60/40 比例
    const resetBtn = seg.createEl("button", { text: "⇕", cls: "gd-cal-reset" });
    resetBtn.setAttribute("aria-label", "恢复默认比例 60/40");
    resetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.splitRatio = 0.6;
      this.applySplit();
      this.plugin.settings.splitRatio = 0.6;
      void this.plugin.saveSettings();
      new Notice("已恢复默认比例 60/40");
    });

    // 关闭日历侧栏（把本标签页移除）
    const closeCal = bar.createEl("button", { cls: "gd-cal-close" });
    elIcon(closeCal, "x");
    closeCal.setAttribute("aria-label", "关闭日历侧栏");
    closeCal.setAttribute("title", "关闭日历侧栏");
    closeCal.addEventListener("click", (e) => {
      e.stopPropagation();
      this.leaf.detach();
    });

    // —— 上下分屏：上=文件列表，下=日历 —— 
    this.splitRatio = this.plugin.settings.splitRatio ?? 0.6;
    const split = el.createDiv({ cls: "gd-split" });
    this.splitTopEl = split.createDiv({ cls: "gd-split-top" });
    this.listEl = this.splitTopEl.createDiv({ cls: "gd-cal-list-pane" });
    const grip = split.createDiv({ cls: "gd-split-grip" });
    const bottom = split.createDiv({ cls: "gd-split-bottom" });
    this.calEl = bottom.createDiv({ cls: "gd-cal-cal-pane" });
    this.applySplit();

    grip.addEventListener("mousedown", (e) => {
      e.preventDefault();
      document.body.classList.add("gd-split-resizing");
      const move = (ev: MouseEvent) => {
        const rect = split.getBoundingClientRect();
        if (!rect.height) return;
        const r = (ev.clientY - rect.top) / rect.height;
        this.splitRatio = Math.min(0.85, Math.max(0.15, r));
        this.applySplit();
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.body.classList.remove("gd-split-resizing");
        this.plugin.settings.splitRatio = this.splitRatio;
        void this.plugin.saveSettings();
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      this.register(() => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      });
    });

    this.renderBody();
  }

  private applySplit(): void {
    if (this.splitTopEl) this.splitTopEl.style.flex = `0 0 ${(this.splitRatio * 100).toFixed(1)}%`;
  }

  // ---------- 下拉选择框（仅按月） ----------

  private monthValue(y: number, m: number): string {
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  private buildPicker(bar: HTMLElement): void {
    const wrap = bar.createDiv({ cls: "gd-cal-dd" });
    const dd = new DropdownComponent(wrap);
    const now = new Date(this.calY, this.calM - 1, 1);
    for (let i = -12; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      dd.addOption(
        this.monthValue(d.getFullYear(), d.getMonth() + 1),
        `${d.getFullYear()}年${d.getMonth() + 1}月`
      );
    }
    dd.setValue(this.monthValue(this.calY, this.calM));
    dd.onChange((v) => {
      if (!v) return;
      const [y, m] = v.split("-").map(Number);
      this.calY = y;
      this.calM = m;
      const max = new Date(y, m, 0).getDate();
      if (this.calDay > max) this.calDay = max;
      this.renderCal();
    });
  }

  // ---------- 主体 ----------

  private renderBody(): void {
    const list = this.listEl;
    const cal = this.calEl;
    if (!list || !cal) return;
    list.empty();
    cal.empty();
    this.renderCalMonth(cal);
    void this.renderList(list);
  }

  /** 按月：完整月历 */
  private renderCalMonth(el: HTMLElement): void {
    const head = el.createDiv({ cls: "gd-cal-head" });
    const prevM = head.createEl("button", { text: "‹", cls: "gd-cal-nav" });
    prevM.addEventListener("click", (e) => {
      e.stopPropagation();
      this.shiftMonth(-1);
    });
    const title = head.createEl("span", { cls: "gd-cal-title" });
    appendColoredMonth(title, this.calY, this.calM);
    const nextM = head.createEl("button", { text: "›", cls: "gd-cal-nav" });
    nextM.addEventListener("click", (e) => {
      e.stopPropagation();
      this.shiftMonth(1);
    });

    const week = el.createDiv({ cls: "gd-cal-week" });
    for (const w of ["日", "一", "二", "三", "四", "五", "六"]) week.createEl("div", { text: w });

    const grid = el.createDiv({ cls: "gd-cal-grid" });
    const lead = new Date(this.calY, this.calM - 1, 1).getDay();
    const days = new Date(this.calY, this.calM, 0).getDate();
    for (let i = 0; i < lead; i++) grid.createDiv({ cls: "gd-cal-day empty" });
    const mm = String(this.calM).padStart(2, "0");
    const active = this.plugin.activeDate;
    for (let d = 1; d <= days; d++) {
      const ds = `${this.calY}-${mm}-${String(d).padStart(2, "0")}`;
      const cell = grid.createDiv({ cls: "gd-cal-day" });
      cell.setText(String(d));
      if (this.plugin.store.fileFor(ds)) cell.addClass("has");
      if (ds === todayStr()) cell.addClass("today");
      if (ds === active) cell.addClass("active");
      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showDayMenu(ds, e);
      });
    }
  }

  // ---------- 底部：摘要列表 ----------

  private allDiaryDates(): string[] {
    const root = this.plugin.store.root() + "/";
    const out: string[] = [];
    for (const f of this.app.vault.getFiles()) {
      if (!f.path.startsWith(root)) continue;
      const m = /^(\d{4})-(\d{2})-(\d{2})\.md$/.exec(f.name);
      if (m) out.push(`${m[1]}-${m[2]}-${m[3]}`);
    }
    out.sort();
    return out;
  }

  private datesInMonth(y: number, m: number): string[] {
    const days = new Date(y, m, 0).getDate();
    const out: string[] = [];
    for (let d = 1; d <= days; d++)
      out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    return out;
  }

  private countFiles(dates: string[]): number {
    return dates.filter((ds) => this.plugin.store.fileFor(ds)).length;
  }

  private isOpen(title: string, fallback: boolean): boolean {
    const v = this.openState.get(title);
    return v === undefined ? fallback : v;
  }

  private async renderList(el: HTMLElement): Promise<void> {
    const wrap = el.createDiv({ cls: "gd-cal-list" });
    if ((this.plugin.settings.listLineStyle ?? "vertical") === "polyline") {
      wrap.addClass("is-polyline");
    }

    // 按日：全量日记，时间顺序（最新在前），卡片标题「10月20日 周二」
    if (this.calMode === "day") {
      const all = this.allDiaryDates().reverse();
      if (!all.length) {
        wrap.createDiv({ cls: "gd-cal-item-sum is-empty", text: "还没有写过日记" });
        return;
      }
      const shown = all.slice(0, this.dayLimit);
      await this.fillEntries(wrap, shown, true);
      const rest = all.length - shown.length;
      if (rest > 0) {
        const btn = wrap.createEl("button", {
          text: `加载更多（还有 ${rest} 篇）`,
          cls: "gd-cal-more",
        });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.dayLimit += 200;
          this.renderBody();
        });
      }
      return;
    }

    // 按月：当前月 ±6 个月，有日记的月份折叠列出
    let any = false;
    for (let i = -6; i <= 6; i++) {
      const d = new Date(this.calY, this.calM - 1 + i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const dates = this.datesInMonth(y, m);
      const cnt = this.countFiles(dates);
      const isCur = y === this.calY && m === this.calM;
      if (!isCur && cnt === 0) continue;
      any = true;
      const title = `${y}年${String(m).padStart(2, "0")}月`;
      const g = this.groupEl(wrap, title, cnt, this.isOpen(title, isCur), y, m);
      await this.fillEntries(g, dates.filter((ds) => this.plugin.store.fileFor(ds)));
    }
    if (!any) wrap.createDiv({ cls: "gd-cal-item-sum is-empty", text: "这附近还没有日记" });
  }

  private groupEl(
    parent: HTMLElement,
    title: string,
    count: number,
    expand: boolean,
    y: number,
    m: number
  ): HTMLElement {
    const d = parent.createEl("details", { cls: "gd-cal-group" }) as HTMLDetailsElement;
    d.open = expand;
    d.addEventListener("toggle", () => this.openState.set(title, d.open));
    const s = d.createEl("summary", { cls: "gd-cal-summary" });
    appendColoredMonth(s, y, m);
    s.createEl("span", { text: `${count} 篇`, cls: "gd-cal-count" });
    return d;
  }

  /** 折线星图：左侧节点 + 横向折线，纯 SVG 绘制，随行高自适应 */
  private addPolylineNode(item: HTMLElement): void {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "gd-node-svg");
    svg.setAttribute("viewBox", "0 0 44 36");
    svg.setAttribute("width", "44");
    svg.setAttribute("height", "36");
    svg.setAttribute("aria-hidden", "true");
    const line = document.createElementNS(NS, "polyline");
    line.setAttribute("points", "5,12 15,12 26,24 42,24");
    line.setAttribute("class", "gd-node-line");
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", "5");
    dot.setAttribute("cy", "12");
    dot.setAttribute("r", "2.6");
    dot.setAttribute("class", "gd-node-dot");
    svg.appendChild(line);
    svg.appendChild(dot);
    item.appendChild(svg);
  }

  /** 逐条：彩色日期标题 + 两行摘要 */
  private async fillEntries(box: HTMLElement, dates: string[], showYear = false): Promise<void> {
    const active = this.plugin.activeDate;
    const polyline = (this.plugin.settings.listLineStyle ?? "vertical") === "polyline";
    for (const ds of dates) {
      const file = this.plugin.store.fileFor(ds);
      const item = box.createDiv({ cls: "gd-cal-item" });
      if (ds === active) item.addClass("active");
      if (polyline) this.addPolylineNode(item);

      const headEl = item.createDiv({ cls: "gd-cal-item-head" });
      appendColoredDate(headEl, ds, {
        year: showYear,
        weekday: true,
        cls: "gd-cal-item-date",
      });
      // 列表条目：直接静默打开当天的格间日记，不弹菜单
      item.addClass("is-clickable");
      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 静默切换：日历焦点不丢，不用来回重开
        this.plugin.setActiveDate(ds, this);
        void this.renderBody();
      });
      if (file) {
        const del = headEl.createEl("button", { cls: "gd-cal-del" });
        del.type = "button";
        elIcon(del, "x");
        del.setAttribute("aria-label", "删除这篇日记");
        del.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const menu = new Menu();
          menu.addItem((i) =>
            i
              .setTitle("移入回收站（秒删，可恢复）")
              .setIcon("trash")
              .onClick(() => void this.trashFile(file, false))
          );
          menu.addItem((i) =>
            i
              .setTitle("永久删除…")
              .setIcon("x-circle")
              .onClick(() => void this.trashFile(file, true))
          );
          menu.showAtMouseEvent(e);
        });
      }
      if (!file) {
        headEl.createEl("span", { text: "空", cls: "gd-cal-item-badge" });
        item.createDiv({ cls: "gd-cal-item-sum is-empty", text: "这天还没有日记，点这里去写" });
        continue;
      }
      let raw = "";
      try {
        raw = await this.app.vault.cachedRead(file);
      } catch {
        raw = "";
      }
      // 有图片嵌入就显示缩略图，而不是只显示文字
      const thumb = this.firstImageThumb(raw, file.path);
      if (thumb) {
        const box = item.createDiv({ cls: "gd-cal-item-thumb" });
        const img = box.createEl("img");
        img.src = thumb;
        img.loading = "lazy";
        img.alt = "";
      }
      item.createDiv({ cls: "gd-cal-item-sum", text: summarize(raw, 50) || "（这天没有正文）" });
    }
  }

  /** 删除一篇日记：false = 移入回收站（秒删，可恢复）；true = 永久删除（需确认） */
  private async trashFile(file: TAbstractFile, permanent: boolean): Promise<void> {
    const toTrash = async () => {
      try {
        await this.app.vault.trash(file, true);
        new Notice(`已移入系统回收站：${file.name}`);
      } catch (err) {
        console.error("[grid-diary] 系统回收站失败，改用 .trash", err);
        try {
          await this.app.vault.trash(file, false);
          new Notice(`已移入 .trash：${file.name}`);
        } catch (err2) {
          console.error("[grid-diary] 移入回收站失败", err2);
          new Notice("移入回收站失败，文件未改动");
          return;
        }
      }
      this.plugin.refreshAll();
    };

    if (!permanent) {
      await toTrash();
      return;
    }

    const show = () =>
      new ConfirmModal(this.app, {
        title: "永久删除这篇日记？",
        desc: `${file.path}\n不会进入回收站，删除后无法通过 Obsidian 找回。`,
        okText: "永久删除",
        danger: true,
        checkboxLabel: "以后不再提示永久删除",
        onOk: async (checked) => {
          if (checked) {
            this.plugin.settings.skipPermanentConfirm = true;
            await this.plugin.saveSettings();
          }
          try {
            await this.app.vault.delete(file);
            new Notice(`已永久删除：${file.name}`);
          } catch (err) {
            console.error("[grid-diary] 永久删除失败", err);
            new Notice("删除失败，文件未改动");
            return;
          }
          this.plugin.refreshAll();
        },
      }).open();

    if (this.plugin.settings.skipPermanentConfirm) {
      try {
        await this.app.vault.delete(file);
        new Notice(`已永久删除：${file.name}`);
      } catch (err) {
        console.error("[grid-diary] 永久删除失败", err);
        new Notice("删除失败，文件未改动");
        return;
      }
      this.plugin.refreshAll();
      return;
    }
    show();
  }

  /** 日期快捷菜单：打开 / 快速笔记 / 插入图片 */
  private showDayMenu(date: string, evt: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((i) =>
      i
        .setTitle("打开这天的格间日记")
        .setIcon("layout-grid")
        .onClick(() => void this.plugin.activateView(date))
    );
    menu.addItem((i) =>
      i
        .setTitle("插入模板笔记")
        .setIcon("layout-template")
        .onClick(() => this.plugin.pickTemplateNote(date, evt))
    );
    menu.addItem((i) =>
      i
        .setTitle("插入图片")
        .setIcon("image")
        .onClick(() => void this.plugin.insertImage(date))
    );
    menu.showAtMouseEvent(evt);
  }

  /** 找出正文里第一张图片，返回可用的资源 URL */
  private firstImageThumb(raw: string, sourcePath: string): string | null {
    const wiki = /!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/.exec(raw);
    const md = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/.exec(raw);
    const target = wiki?.[1]?.trim() || md?.[1]?.trim();
    if (!target) return null;
    if (/^(https?:)?\/\//.test(target)) return target;
    if (!/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(target)) return null;
    const file = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
    if (file) return this.app.vault.getResourcePath(file);
    return null;
  }
}
