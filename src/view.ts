import { ItemView, MarkdownRenderer, Menu, Notice, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import type GridDiaryPlugin from "./main";
import { PromptModal, TemplatePickModal, ConfirmModal } from "./modals";
import { DayCell, DaySnapshot, shiftDate, todayStr, weekdayCn } from "./store";
import { appendColoredMonth } from "./datecolor";
import { mirrorSections, paragraphsFromSoftBreaks, parseDay, stripEmptyHeadings } from "./sections";
import { renderTemplate } from "./template";

export const VIEW_TYPE_GRID_DIARY = "grid-diary-view";

export class GridDiaryView extends ItemView {
  plugin: GridDiaryPlugin;
  currentDate: string;
  private renderTimer: number | null = null;
  private snapshot: DaySnapshot | null = null;
  private rawCache = new Map<string, string>();
  /** 自动保存期间抑制自身触发的重渲染，避免光标丢失 */
  private suppressRenderUntil = 0;
  /** 自己写文件的窗口期：期间忽略 vault modify，避免自激重建 */
  private selfWriteUntil = 0;
  /** 已在监听的图片框（避免重复绑定 / 反复 disconnect） */
  private imgBound = new WeakSet<HTMLElement>();
  /** 正在拖拽的格子标题 */
  private draggingTitle: string | null = null;
  /** 页面滚动位置（切日期后保持不跳） */
  private lastScrollTop = 0;
  /** 时间流容器（只重绘它，避免整页重建） */
  private timelineSlot: HTMLElement | null = null;
  private tlTimer: number | null = null;
  private imgRos: Array<{ ro: ResizeObserver; box: HTMLElement }> = [];

  constructor(leaf: WorkspaceLeaf, plugin: GridDiaryPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.currentDate = this.plugin.activeDate || todayStr();
  }

  getViewType(): string {
    return VIEW_TYPE_GRID_DIARY;
  }

  getDisplayText(): string {
    return "格间日记";
  }

  getIcon(): string {
    return "layout-grid";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("grid-diary-view");
    // 外部（侧栏日历）改了日期 → 本视图跟着跳
    this.register(this.plugin.onDateChange((date) => this.jumpTo(date)));
    this.currentDate = this.plugin.activeDate || this.currentDate;
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        const file = this.plugin.store.fileFor(this.currentDate);
        if (file && f.path === file.path) this.scheduleRender();
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (f) => {
        if (f.path === this.plugin.store.pathFor(this.currentDate)) this.scheduleRender();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (f) => {
        if (f.path === this.plugin.store.pathFor(this.currentDate)) this.scheduleRender();
      })
    );
    // 兜底：每 1.5 秒把所有未落盘内容静默写回，防止刷新丢字
    this.registerInterval(
      window.setInterval(() => {
        if (!this.pendingSaves.size) return;
        for (const fn of Array.from(this.pendingSaves.values())) void fn();
      }, 1500)
    );
    await this.ensureDayFile(this.currentDate, true);
    await this.render();
  }

  async onClose(): Promise<void> {
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
    // 关闭前把还没落盘的改动全部刷写
    for (const fn of Array.from(this.pendingSaves.values())) void fn();
    this.pendingSaves.clear();
    this.contentEl.empty();
  }

  /** 未保存的格子内容提交函数（title → commit），用于定时兜底与关闭前刷写 */
  private pendingSaves = new Map<string, () => Promise<void>>();

  /** 正在格子里打字时不重建 DOM */
  private isTyping(): boolean {
    const active = document.activeElement;
    return !!active && this.contentEl.contains(active);
  }

  scheduleRender(): void {
    // 自己刚写过文件：忽略这次 modify，避免"写完 → 重建 → 回弹"
    if (Date.now() < this.selfWriteUntil) return;
    if (Date.now() < this.suppressRenderUntil) return;
    if (this.isTyping()) return;
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      if (this.isTyping()) return;
      void this.render();
    }, 400);
  }

  private backgroundUrl(): string | null {
    const bg = this.plugin.settings.background.trim();
    if (!bg) return null;
    if (/^https?:\/\//i.test(bg)) return bg;
    const f = this.app.vault.getAbstractFileByPath(bg);
    if (f) {
      try {
        return this.app.vault.adapter.getResourcePath(f.path);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  async refreshRawCache(): Promise<void> {
    this.rawCache.clear();
    const file = this.plugin.store.fileFor(this.currentDate);
    if (!file) return;
    const text = await this.app.vault.cachedRead(file);
    for (const s of parseDay(text, 2).sections) this.rawCache.set(s.title, s.body);
  }

  async render(): Promise<void> {
    const root = this.contentEl;
    const prevSc = root.querySelector(".gd-scroll") as HTMLElement | null;
    const savedTop = prevSc ? prevSc.scrollTop : this.lastScrollTop;
    this.timelineSlot = null;
    root.empty();
    root.style.setProperty("--gd-op", String(this.plugin.settings.cardOpacity));
    root.style.setProperty("--gd-cols", String(this.plugin.settings.columns));
    root.style.setProperty("--gd-font", this.plugin.fontStack());
    root.style.setProperty("--gd-weight", String(this.plugin.settings.fontWeight));
    root.style.setProperty("--gd-cell-h", `${this.plugin.settings.cellHeight}px`);

    const bg = this.backgroundUrl();
    if (bg) root.createDiv({ cls: "gd-bg", attr: { style: `background-image:url("${bg}")` } });

    const snap = await this.plugin.store.readDay(this.currentDate);
    this.snapshot = snap;
    await this.refreshRawCache();

    const scroll = root.createDiv({ cls: "gd-scroll" });
    // 关键：内容全部插入后再恢复滚动，否则 scrollTop 会被重置为 0（页面"嗖"地跳回顶部）
    const restoreScroll = () => {
      requestAnimationFrame(() => {
        if (!scroll.isConnected) return;
        scroll.scrollTop = savedTop;
        this.lastScrollTop = scroll.scrollTop;
      });
    };
    scroll.addEventListener(
      "scroll",
      () => {
        this.lastScrollTop = scroll.scrollTop;
      },
      { passive: true }
    );

    const header = scroll.createDiv({ cls: "gd-header" });

    const dateBlock = header.createDiv({ cls: "gd-date" });
    let [y, m, d] = this.currentDate.split("-").map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      const now = new Date();
      y = now.getFullYear();
      m = now.getMonth() + 1;
      d = now.getDate();
    }
    const dayNum = dateBlock.createEl("span", { cls: "gd-daynum" });
    dayNum.createEl("span", { text: String(d).padStart(2, "0"), cls: "gd-cd" });
    const meta = dateBlock.createDiv({ cls: "gd-datemeta" });
    const ymLine = meta.createEl("span", { cls: "gd-datemeta-line" });
    appendColoredMonth(ymLine, y, m);
    meta.createEl("span", {
      text: weekdayCn(this.currentDate) + (this.currentDate === todayStr() ? " · 今天" : ""),
      cls: "gd-datemeta-line",
    });
    if (snap.quote) meta.createEl("span", { text: snap.quote, cls: "gd-datemeta-line gd-quote" });

    const actions = header.createDiv({ cls: "gd-actions" });
    const mkBtn = (label: string, cb: () => void) => {
      const b = actions.createEl("button", { text: label, cls: "gd-btn" });
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        cb();
      });
      return b;
    };
    mkBtn("+", () => this.addCell());    const more = actions.createEl("button", { text: "···", cls: "gd-btn" });
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openHeaderMenu(e);
    });
    mkBtn("×", () => this.leaf.detach());

    const nav = scroll.createDiv({ cls: "gd-nav" });
    const prev = nav.createEl("button", { text: "‹ 前一天", cls: "gd-nav-btn" });
    prev.addEventListener("click", () => this.goDate(shiftDate(this.currentDate, -1)));
    const today = nav.createEl("button", { text: "今天", cls: "gd-nav-btn" });
    today.addEventListener("click", () => this.goDate(todayStr()));
    const next = nav.createEl("button", { text: "后一天 ›", cls: "gd-nav-btn" });
    next.addEventListener("click", () => this.goDate(shiftDate(this.currentDate, 1)));
    if (snap.file) {
      const open = nav.createEl("button", { text: "打开整篇", cls: "gd-nav-btn gd-nav-right" });
      open.addEventListener("click", () => void this.openWholeFile());
    }
    const saved = nav.createEl("span", { text: "自动保存", cls: "gd-save-hint" });
    void saved;

    const grid = scroll.createDiv({ cls: "gd-grid" });
    if (!snap.file) {
      this.renderEmpty(grid, "这一天还没有文件。", "用模板生成");
      restoreScroll();
      return;
    }
    if (!snap.cells.length) {
      this.renderEmpty(grid, "文件里还没有 ## 小节。", "用模板生成");
      this.timelineSlot = scroll.createDiv({ cls: "gd-timeline-slot" });
      this.renderTimeline(this.timelineSlot, snap);
      restoreScroll();
      return;
    }
    for (const cell of snap.cells) grid.appendChild(this.renderCell(cell));
    this.timelineSlot = scroll.createDiv({ cls: "gd-timeline-slot" });
    this.renderTimeline(this.timelineSlot, snap);
    restoreScroll();
  }

  /** 把正在输入的内容同步进快照（供时间流镜像使用） */
  private syncCellToSnapshot(title: string, value: string): void {
    const cell = this.snapshot?.cells.find((c) => c.title === title);
    if (cell) cell.body = value;
    this.scheduleTimelineRefresh();
  }

  private scheduleTimelineRefresh(): void {
    if (this.tlTimer) window.clearTimeout(this.tlTimer);
    this.tlTimer = window.setTimeout(() => this.refreshTimeline(), 120);
  }

  /** 时间流数据：格子镜像 + 时间戳笔记，签名未变就不重绘（避免打字时闪烁） */
  private tlSig = "";

  private buildCards(snap: DaySnapshot): Array<{ title: string; body: string; raw: string; time: string; kind: "cell" | "note" }> {
    const cellMap: Record<string, string> = {};
    for (const c of snap.cells) cellMap[c.title] = c.body ?? "";
    const cards: Array<{ title: string; body: string; raw: string; time: string; kind: "cell" | "note" }> = [];
    for (const c of snap.cells) {
      if (!(c.body ?? "").trim()) continue;
      cards.push({ title: c.title, body: c.body ?? "", raw: c.body ?? "", time: "", kind: "cell" });
    }
    for (const it of snap.timeline) {
      const body = stripEmptyHeadings(mirrorSections(it.body || "", cellMap));
      if (!body.trim()) continue;
      // raw = 文件里的原文，编辑时用它，避免把镜像内容写回文件
      cards.push({ title: it.title, body, raw: it.body || "", time: it.time ?? "", kind: "note" });
    }
    return cards;
  }

  /** 只重绘时间流区域，不动格子墙，避免光标丢失 */
  private refreshTimeline(): void {
    if (!this.timelineSlot || !this.snapshot) return;
    if (!this.timelineSlot.isConnected) return;
    // 时间流里正在编辑时不重绘，免得丢输入
    const active = document.activeElement;
    if (active && this.timelineSlot.contains(active)) return;
    const sig = this.buildCards(this.snapshot)
      .map((c) => `${c.title}\u0001${c.body}`)
      .join("\u0002");
    if (sig === this.tlSig) return;
    const sc = this.contentEl.querySelector(".gd-scroll") as HTMLElement | null;
    const top = sc ? sc.scrollTop : 0;
    this.timelineSlot.empty();
    this.renderTimeline(this.timelineSlot, this.snapshot);
    if (sc) sc.scrollTop = top;
  }

  /** 时间流：格子内容镜像 + 带时间戳的追加笔记，两者都可就地改、可删 */
  private renderTimeline(parent: HTMLElement, snap: DaySnapshot): void {
    parent.empty();
    const cards = this.buildCards(snap);
    this.tlSig = cards.map((c) => `${c.title}\u0001${c.body}`).join("\u0002");

    if (!cards.length) {
      const empty = parent.createDiv({ cls: "gd-tl-empty", text: "今天还没有内容，在上方格子里写点什么试试" });
      void empty;
      return;
    }

    const wrap = parent.createDiv({ cls: "gd-timeline" });
    const head = wrap.createDiv({ cls: "gd-tl-head" });
    head.createEl("span", { text: "时间流", cls: "gd-tl-title" });
    head.createEl("span", { text: `${cards.length} 条`, cls: "gd-tl-count" });

    const src = this.plugin.store.pathFor(this.currentDate);
    for (const card of cards) {
      const row = wrap.createDiv({ cls: "gd-tl-item" });
      if (card.kind === "cell") row.addClass("is-cell");

      const bar = row.createDiv({ cls: "gd-tl-bar gd-tl-toggle" });
      bar.setAttribute("aria-label", "点击折叠/展开");
      bar.createEl("span", {
        text: card.time || card.title,
        cls: "gd-tl-time",
      });
      if (card.time) bar.createEl("span", { text: card.title.replace(/^\s*\d{1,2}\s*[:：]\s*\d{2}\s*/, ""), cls: "gd-tl-label" });
      bar.createEl("span", { text: "▾", cls: "gd-tl-caret" });
      bar.addEventListener("click", (e) => {
        e.stopPropagation();
        row.toggleClass("is-collapsed", !row.hasClass("is-collapsed"));
      });

      const bubble = row.createDiv({ cls: "gd-tl-bubble" });
      const body = bubble.createDiv({ cls: "gd-tl-body markdown-rendered gd-cell-text" });
      body.setAttribute("title", "双击修改");
      void MarkdownRenderer.render(this.app, card.body, body, src, this)
        .then(() => this.bindImages(body))
        .catch(() => body.setText(card.body));

      // —— 双击就地改成纯文本编辑，保存回源文件 ——
      body.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (bubble.querySelector(".gd-tl-editor")) return;
        const ta = bubble.createEl("textarea", { cls: "gd-tl-editor gd-cell-text" });
        ta.value = (card.kind === "note" ? card.raw : card.body).replace(/^\s*\n+/, "").replace(/\s+$/, "");
        body.addClass("is-hidden");
        ta.style.height = `${Math.max(80, Math.min(360, (ta.value.split("\n").length + 2) * 26))}px`;
        ta.focus();
        let saved = false;
        const save = async () => {
          if (saved) return;
          saved = true;
          const next = ta.value;
          this.selfWriteUntil = Date.now() + 1200;
          const ok = await this.plugin.store.writeSection(this.currentDate, card.title, next);
          if (ok) {
            if (card.kind === "cell") this.rawCache.set(card.title, paragraphsFromSoftBreaks(next));
            const c = this.snapshot?.cells.find((x) => x.title === card.title);
            if (c) c.body = paragraphsFromSoftBreaks(next);
            const t = this.snapshot?.timeline.find((x) => x.title === card.title);
            if (t) t.body = next;
            new Notice(`已保存「${card.title}」`);
          } else {
            new Notice("保存失败");
          }
          ta.remove();
          body.removeClass("is-hidden");
          await this.refreshRawFromDisk();
          this.refreshTimeline();
        };
        ta.addEventListener("blur", () => void save());
        ta.addEventListener("keydown", (ev) => {
          ev.stopPropagation();
          if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
            ev.preventDefault();
            ta.blur();
          }
        });
      });

      // —— 删除这一条 ——
      const del = row.createEl("button", { text: "×", cls: "gd-tl-del" });
      del.setAttribute("aria-label", "删除这一条");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        new ConfirmModal(this.app, {
          title: "删除这一条？",
          desc: `只会删除文件里的「## ${card.title}」这一节，其他内容不动。删除后还有 5 秒可撤销。`,
          okText: "删除这一节",
          danger: true,
          onOk: async () => {
            this.selfWriteUntil = Date.now() + 1200;
            const removed = await this.plugin.store.deleteSection(this.currentDate, card.title);
            if (!removed) {
              new Notice("删除失败");
              return;
            }
            const notice = new Notice(`已删除「${card.title}」`, 5000);
            let done = false;
            const btn = notice.noticeEl.createEl("button", { text: "撤销", cls: "gd-undo-btn" });
            btn.addEventListener("click", async () => {
              if (done) return;
              done = true;
              this.selfWriteUntil = Date.now() + 1200;
              await this.plugin.store.restoreSection(this.currentDate, removed.title, removed.body, removed.index);
              notice.hide();
              await this.render();
            });
            await this.render();
          },
        }).open();
      });

      const open = row.createEl("button", { text: "↗", cls: "gd-cell-more gd-tl-open" });
      open.setAttribute("aria-label", "在文件里定位");
      open.addEventListener("click", async (e) => {
        e.stopPropagation();
        const c = this.snapshot?.cells.find((x) => x.title === card.title) ?? this.snapshot?.timeline.find((x) => x.title === card.title);
        if (c) await this.openAtSection(c);
      });
    }
  }

  /** 重新从磁盘读一遍原文缓存（时间流里改完后同步格子墙数据） */
  private async refreshRawFromDisk(): Promise<void> {
    try {
      await this.refreshRawCache();
    } catch (e) {
      console.error("[grid-diary] 重读失败", e);
    }
  }

  /** 给渲染出来的图片套一层可缩放的框（手动拖拽，不依赖 CSS resize），拖完写回 md */
  private bindImages(root: HTMLElement): void {
    this.imgRos = this.imgRos.filter((x) => x.box.isConnected);
    for (const img of Array.from(root.querySelectorAll("img"))) {
      if (img.parentElement?.classList.contains("gd-imgbox")) continue;
      const doc = root.ownerDocument;
      const box = doc.createElement("div");
      box.className = "gd-imgbox";
      img.replaceWith(box);
      box.appendChild(img);

      const attrW = Number.parseInt(img.getAttribute("width") || "", 10);
      if (Number.isFinite(attrW) && attrW > 0) {
        box.style.width = `${attrW}px`;
      } else {
        // 文件里没写宽度：默认 400px，避免一张图铺满整条气泡
        box.style.width = "400px";
      }
      img.style.width = "100%";

      // 右下角拖拽手柄（CSS resize 在 Obsidian 里不可靠，改手动实现）
      const handle = doc.createElement("span");
      handle.className = "gd-img-handle";
      handle.setAttribute("aria-label", "拖动调整图片大小");
      box.appendChild(handle);

      let dragging = false;
      let startX = 0;
      let startW = 0;
      let moved = false;
      handle.addEventListener("pointerdown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        dragging = true;
        moved = false;
        startX = ev.clientX;
        startW = box.getBoundingClientRect().width;
        handle.setPointerCapture(ev.pointerId);
      });
      handle.addEventListener("pointermove", (ev) => {
        if (!dragging) return;
        ev.preventDefault();
        const parentW = (box.parentElement?.clientWidth ?? 800) || 800;
        const next = Math.max(60, Math.min(parentW, Math.round(startW + (ev.clientX - startX))));
        if (Math.abs(next - startW) > 2) moved = true;
        box.style.width = `${next}px`;
      });
      handle.addEventListener("pointerup", (ev) => {
        if (!dragging) return;
        dragging = false;
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        if (!moved) return;
        const w = Math.round(box.getBoundingClientRect().width);
        if (w >= 60) void this.persistImageWidth(img, w);
      });
      handle.addEventListener("pointercancel", () => {
        dragging = false;
      });

      // 兼容：拖框边缘（非手柄）不触发任何写盘
      const ro = new ResizeObserver(() => {
        /* 仅用于占位，保持 imgRos 结构，实际写盘由手柄控制 */
      });
      ro.observe(box);
      this.imgRos.push({ ro, box });
    }
  }

  /** 把图片宽度写回 Markdown：![[图片名|宽度]] */
  private async persistImageWidth(img: HTMLImageElement, width: number): Promise<void> {
    let name = "";
    const src = img.getAttribute("src") || "";
    if (src) {
      try {
        const clean = decodeURIComponent(src.split("?")[0].split("#")[0]);
        name = clean.split(/[\\/]/).pop() || "";
      } catch {
        name = "";
      }
    }
    if (!name) name = img.getAttribute("alt") || "";
    if (!name || !/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name)) return;
    try {
      this.selfWriteUntil = Date.now() + 1500;
      await this.plugin.store.setImageWidth(this.currentDate, name, width);
    } catch (e) {
      console.error("[grid-diary] 保存图片宽度失败", e);
    }
  }

  private renderEmpty(grid: HTMLElement, text: string, btnText: string): void {
    const empty = grid.createDiv({ cls: "gd-empty" });
    empty.createEl("p", { text });
    const btn = empty.createEl("button", { text: btnText, cls: "gd-btn gd-btn-primary" });
    btn.addEventListener("click", () => this.pickTemplate());
  }

  private renderCell(cell: DayCell): HTMLElement {
    const el = document.createElement("div");
    el.className = "gd-cell";

    const head = el.createDiv({ cls: "gd-cell-head" });
    head.createEl("div", { text: cell.title, cls: "gd-cell-title" });

    const tools = head.createDiv({ cls: "gd-cell-tools" });
    const handle = tools.createEl("span", { text: "⠿", cls: "gd-cell-handle" });
    handle.setAttribute("aria-label", "按住拖动，换格子顺序");
    handle.setAttribute("draggable", "true");
    const status = tools.createEl("span", { text: "", cls: "gd-cell-status" });
    const jump = tools.createEl("button", { text: "↗", cls: "gd-cell-more" });
    jump.setAttribute("aria-label", "在文件里定位");
    jump.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.openAtSection(cell);
    });
    const moreBtn = tools.createEl("button", { text: "···", cls: "gd-cell-more" });
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openCellMenu(e, cell);
    });

    const fmt = el.createDiv({ cls: "gd-cell-fmt" });

    const body = el.createDiv({ cls: "gd-cell-body" });
    const preview = body.createDiv({ cls: "gd-cell-preview markdown-rendered gd-cell-text" });
    const ta = body.createEl("textarea", { cls: "gd-cell-editor gd-cell-text is-hidden" });
    ta.value = this.rawCache.get(cell.title) ?? "";
    ta.spellcheck = false;
    ta.setAttribute("placeholder", "在这里写…");


    const renderPreview = async () => {
      const text = this.rawCache.get(cell.title) ?? "";
      preview.empty();
      if (!text.trim()) {
        preview.createDiv({ cls: "gd-cell-placeholder", text: "点击这里开始写…" });
        return;
      }
      try {
        await MarkdownRenderer.render(
          this.app,
          text,
          preview,
          this.plugin.store.pathFor(this.currentDate),
          this,
        );
      } catch {
        preview.setText(text);
      }
    };
    void renderPreview();

    let editing = false;
    const enterEdit = () => {
      if (editing) return;
      editing = true;
      preview.addClass("is-hidden");
      ta.removeClass("is-hidden");
      ta.value = this.rawCache.get(cell.title) ?? "";
      this.autoGrow(ta);
      ta.focus();
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
    };
    preview.addEventListener("click", (e) => {
      e.stopPropagation();
      enterEdit();
    });

    // —— 格式快捷按钮：按钮不吃焦点，选区不丢失 ——
    // textarea 失焦后 selectionStart/End 仍然保留，所以额外缓存一份更稳妥
    let lastSel: { start: number; end: number } = { start: 0, end: 0 };
    const readSel = () => {
      const v = ta.value;
      let start = ta.selectionStart ?? v.length;
      let end = ta.selectionEnd ?? v.length;
      const focused = document.activeElement === ta;
      // 没有焦点且当前光标已折叠时，回退到失焦前缓存的选区
      if (!focused && start === end && lastSel.start !== lastSel.end) {
        start = Math.min(lastSel.start, v.length);
        end = Math.min(lastSel.end, v.length);
      }
      if (start > end) [start, end] = [end, start];
      return { start, end };
    };
    const saveSel = () => {
      lastSel = { start: ta.selectionStart ?? 0, end: ta.selectionEnd ?? 0 };
    };
    ta.addEventListener("select", saveSel);
    ta.addEventListener("keyup", saveSel);
    ta.addEventListener("mouseup", saveSel);
    ta.addEventListener("blur", saveSel);

    const applyFormat = (before: string, after: string) => {
      const { start, end } = readSel();
      const v = ta.value;
      const sel = v.slice(start, end) || "文字";
      ta.value = v.slice(0, start) + before + sel + after + v.slice(end);
      const caret = start + before.length + sel.length;
      lastSel = { start: caret, end: caret };
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(caret, caret);
      ta.dispatchEvent(new Event("input"));
    };

    const addFmt = (label: string, tip: string, before: string, after: string) => {
      const b = fmt.createEl("button", { text: label, cls: "gd-fmt-btn" });
      b.type = "button";
      b.setAttribute("aria-label", tip);
      // 关键：在 mousedown 就阻止默认行为，输入框不失焦、选区不消失
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 若输入框已被隐藏（预览态，或刚被 blur 收起来），先重新进入编辑
        if (ta.classList.contains("is-hidden")) {
          editing = false;
          enterEdit();
          lastSel = { start: ta.value.length, end: ta.value.length };
        }
        applyFormat(before, after);
      });
    };
    addFmt("B", "粗体 **文字**", "**", "**");
    addFmt("I", "斜体 *文字*", "*", "*");
    addFmt("S", "删除线 ~~文字~~", "~~", "~~");
    addFmt("H", "高亮 ==文字==", "==", "==");

    /** 在光标处插入纯文本（不替换选区） */
    const insertAt = (text: string) => {
      if (ta.classList.contains("is-hidden")) {
        editing = false;
        enterEdit();
        lastSel = { start: ta.value.length, end: ta.value.length };
      }
      const { start, end } = readSel();
      const v = ta.value;
      ta.value = v.slice(0, start) + text + v.slice(end);
      const caret = start + text.length;
      lastSel = { start: caret, end: caret };
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(caret, caret);
      ta.dispatchEvent(new Event("input"));
    };

    // —— 调色盘：莫兰迪浅色 + 原生取色器 ——
    const COLORS: Array<[string, string]> = [
      ["#e05555", "胭脂"],
      ["#d97706", "琥珀"],
      ["#c2a20a", "芥末"],
      ["#4d9e6a", "薄荷"],
      ["#3d9b8f", "青瓷"],
      ["#4a86c5", "雾蓝"],
      ["#6a6fc4", "靛青"],
      ["#9a6bbd", "浅紫"],
      ["#c76ba0", "樱花"],
      ["#a8766b", "陶土"],
      ["#8a8f98", "石灰"],
      ["#5a5f66", "墨灰"],
    ];
    const paletteBtn = fmt.createEl("button", { text: "🎨", cls: "gd-fmt-btn gd-fmt-color" });
    paletteBtn.type = "button";
    paletteBtn.setAttribute("aria-label", "文字颜色");
    paletteBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    paletteBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pop = document.createElement("div");
      pop.className = "gd-palette";
      const grid = pop.createDiv({ cls: "gd-palette-grid" });
      for (const [hex, name] of COLORS) {
        const sw = grid.createEl("button", { cls: "gd-swatch" });
        sw.type = "button";
        sw.setAttribute("aria-label", name);
        sw.style.background = hex;
        sw.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        });
        sw.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (ta.classList.contains("is-hidden")) {
            editing = false;
            enterEdit();
            lastSel = { start: ta.value.length, end: ta.value.length };
          }
          applyFormat(`<span style="color:${hex}">`, "</span>");
          pop.remove();
        });
      }
      const custom = pop.createEl("label", { cls: "gd-palette-custom" });
      custom.createSpan({ text: "自定义" });
      const picker = custom.createEl("input");
      picker.type = "color";
      picker.value = "#e05555";
      picker.addEventListener("input", () => {
        if (ta.classList.contains("is-hidden")) {
          editing = false;
          enterEdit();
          lastSel = { start: ta.value.length, end: ta.value.length };
        }
        // 实时替换：先去掉上一次自定义，再包新的
        const v = ta.value;
        const hex = picker.value;
        const last = (picker as HTMLInputElement).dataset.lastColor || "";
        let { start, end } = readSel();
        if (last && end - start > 0) {
          // 选区内容可能已被包装，简单处理：直接包一层
        }
        const sel = v.slice(start, end) || "文字";
        ta.value = v.slice(0, start) + `<span style="color:${hex}">${sel}</span>` + v.slice(end);
        const caret = start + `<span style="color:${hex}">${sel}</span>`.length;
        lastSel = { start: caret, end: caret };
        picker.dataset.lastColor = hex;
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(caret, caret);
        ta.dispatchEvent(new Event("input"));
        pop.remove();
      });
      const rect = paletteBtn.getBoundingClientRect();
      pop.style.position = "fixed";
      pop.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
      pop.style.top = `${rect.bottom + 6}px`;
      document.body.appendChild(pop);
      const close = (ev: MouseEvent) => {
        if (!pop.contains(ev.target as Node)) {
          pop.remove();
          document.removeEventListener("mousedown", close, true);
        }
      };
      window.setTimeout(() => document.addEventListener("mousedown", close, true), 0);
    });

    // —— 多媒体：图片 / 附件 / 录音 ——
    const pickAndInsert = (accept: string, asImage: boolean) => {
      const input = document.createElement("input");
      input.type = "file";
      if (accept) input.accept = accept;
      input.addEventListener("change", () => {
        const f = input.files?.[0];
        if (!f) return;
        void (async () => {
          try {
            const ext = (f.name.split(".").pop() || "bin").toLowerCase();
            const name = await this.plugin.saveAttachment(this.currentDate, f, ext);
            insertAt(asImage ? `![[${name}|400]]` : `![[${name}]]`);
            new Notice(`已插入 ${f.name}`);
          } catch (err) {
            console.error("[grid-diary] 插入附件失败", err);
            new Notice("插入失败");
          }
        })();
      });
      input.click();
    };

    const addMedia = (label: string, tip: string, cb: () => void) => {
      const b = fmt.createEl("button", { text: label, cls: "gd-fmt-btn gd-fmt-media" });
      b.type = "button";
      b.setAttribute("aria-label", tip);
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 保证之后插入有落脚点
        if (ta.classList.contains("is-hidden")) {
          editing = false;
          enterEdit();
          lastSel = { start: ta.value.length, end: ta.value.length };
        }
        cb();
      });
    };
    addMedia("🖼", "插入图片", () => pickAndInsert("image/*", true));
    addMedia("📎", "插入附件（PDF / 音频 / 任意文件）", () => pickAndInsert("", false));

    // 录音：MediaRecorder，存成 webm，插入 ![[name]]
    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    const mic = fmt.createEl("button", { text: "🎙", cls: "gd-fmt-btn gd-fmt-media" });
    mic.type = "button";
    mic.setAttribute("aria-label", "录音");
    mic.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    mic.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void (async () => {
        // 停止录音
        if (recorder && recorder.state === "recording") {
          recorder.stop();
          mic.removeClass("is-recording");
          mic.setText("🎙");
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          const rec = new MediaRecorder(stream);
          recorder = rec;
          rec.addEventListener("dataavailable", (ev) => {
            if (ev.data.size > 0) chunks.push(ev.data);
          });
          rec.addEventListener("stop", () => {
            stream.getTracks().forEach((t) => t.stop());
            void (async () => {
              try {
                const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
                const ext = blob.type.includes("ogg") ? "ogg" : "webm";
                const name = await this.plugin.saveAttachment(this.currentDate, blob, ext, "rec-");
                insertAt(`![[${name}]]`);
                new Notice("录音已插入");
              } catch (err) {
                console.error("[grid-diary] 保存录音失败", err);
                new Notice("录音保存失败");
              }
            })();
          });
          rec.start();
          mic.addClass("is-recording");
          mic.setText("■");
          new Notice("开始录音，再点一次停止");
        } catch (err) {
          console.error("[grid-diary] 无法录音", err);
          new Notice("无法访问麦克风");
        }
      })();
    });

    let timer: number | null = null;
    const commit = async () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      const value = ta.value;
      if (value === (this.rawCache.get(cell.title) ?? "")) {
        this.pendingSaves.delete(cell.title);
        return;
      }
      status.setText("保存中");
      this.suppressRenderUntil = Date.now() + 2000;
      this.selfWriteUntil = Date.now() + 1500;
      const ok = await this.plugin.store.writeSection(this.currentDate, cell.title, value);
      this.pendingSaves.delete(cell.title);
      if (ok) {
        // 文件里已是转换后的段落结构，缓存保持与文件一致
        this.rawCache.set(cell.title, paragraphsFromSoftBreaks(value));
        status.setText("已保存");
        window.setTimeout(() => {
          if (status.isConnected && status.getText() === "已保存") status.setText("");
        }, 1600);
      } else {
        status.setText("保存失败");
      }
    };

    const exitEdit = async () => {
      await commit();
      editing = false;
      ta.addClass("is-hidden");
      preview.removeClass("is-hidden");
      await renderPreview();
    };
    ta.addEventListener("input", () => {
      this.autoGrow(ta);
      status.setText("编辑中");
      this.pendingSaves.set(cell.title, commit);
      // 实时把改动喂给快照，并刷新下方时间流（不重建格子，光标不丢）
      this.syncCellToSnapshot(cell.title, ta.value);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void commit(), 250);
    });
    ta.addEventListener("blur", () => void exitEdit());
    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void commit();
        ta.blur();
      }
      e.stopPropagation();
    });
    ta.addEventListener("click", (e) => e.stopPropagation());

    // —— 按住手柄拖动换位 ——
    const clearMarks = () => {
      el.classList.remove("gd-drop-before", "gd-drop-after", "gd-dragging");
    };
    handle.addEventListener("dragstart", (e) => {
      this.draggingTitle = cell.title;
      if (e.dataTransfer) {
        e.dataTransfer.setData("text/plain", cell.title);
        e.dataTransfer.effectAllowed = "move";
      }
      el.classList.add("gd-dragging");
    });
    handle.addEventListener("dragend", () => {
      this.draggingTitle = null;
      clearMarks();
    });
    el.addEventListener("dragover", (e) => {
      if (!this.draggingTitle) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      const rect = el.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      el.classList.toggle("gd-drop-before", before);
      el.classList.toggle("gd-drop-after", !before);
    });
    el.addEventListener("dragleave", (e) => {
      if (!el.contains(e.relatedTarget as Node | null)) {
        el.classList.remove("gd-drop-before", "gd-drop-after");
      }
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = this.draggingTitle;
      this.draggingTitle = null;
      clearMarks();
      if (!from || from === cell.title) return;
      const rect = el.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      void (async () => {
        const ok = await this.plugin.store.moveSection(this.currentDate, from, cell.title, before);
        if (ok) {
          new Notice(`已移动到「${cell.title}」${before ? "之前" : "之后"}`);
          await this.render();
        } else {
          new Notice("换位失败");
        }
      })();
    });
    return el;
  }

  private autoGrow(ta: HTMLTextAreaElement): void {
    // 内容区高度固定（由 CSS 变量 --gd-cell-h 控制），输入框撑满容器、超出即滚动
    ta.style.height = "100%";
    ta.style.overflowY = "auto";
  }

  private async openAtSection(cell: DayCell): Promise<void> {
    const file = this.plugin.store.fileFor(this.currentDate);
    if (!file) return;
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { eState: { line: cell.line } });
  }

  private async openWholeFile(): Promise<void> {
    const file = this.plugin.store.fileFor(this.currentDate);
    if (!file) return;
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
  }

  private goDate(date: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    this.currentDate = date;
    this.plugin.setActiveDate(date, this);
    void (async () => {
      try {
        await this.ensureDayFile(date, true);
      } catch (e) {
        console.error("[grid-diary] 建文件失败", e);
      }
      try {
        await this.render();
      } catch (e) {
        console.error("[grid-diary] 渲染失败", e);
        new Notice("这一天渲染失败，请看控制台");
      }
    })();
  }

  /** 当天文件缺失时按模板静默创建（onlyToday=true 时只对今天生效） */
  private async ensureDayFile(date: string, onlyToday = false): Promise<void> {
    if (!this.plugin.settings.autoCreateToday) return;
    if (onlyToday && date !== todayStr()) return;
    if (this.plugin.store.fileFor(date)) return;
    try {
      await this.plugin.createDayFileFor(date);
    } catch (e) {
      console.error("[grid-diary] 自动创建失败", e);
    }
  }

  /** 侧栏日历点了日期：主视图跟着跳 */
  jumpTo(date: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (date === this.currentDate) return;
    this.currentDate = date;
    void this.render().catch((e) => console.error("[grid-diary] 渲染失败", e));
  }


  private addCell(): void {
    new PromptModal(this.app, {
      title: "新格子",
      desc: "写在文件里的二级标题（## 后面的字）：",
      placeholder: "例如：今日饮食",
      onSubmit: async (title) => {
        const ok = await this.plugin.store.addSection(this.currentDate, title);
        if (ok) new Notice(`已添加：${title}`);
        await this.render();
      },
    }).open();
  }

  private pickTemplate(): void {
    new TemplatePickModal(
      this.app,
      this.plugin.settings.templates,
      async (tpl) => {
        const added = await this.plugin.store.fillWithTemplate(this.currentDate, tpl.titles);
        new Notice(added.length ? `已补齐 ${added.length} 个格子` : "这个模板的格子已经有了");
        await this.render();
      },
      async (tpl) => {
        this.plugin.settings.defaultTemplate = tpl.name;
        await this.plugin.saveSettings();
        new Notice(`已把「${tpl.name}」设为当前模板`);
        await this.render();
      }
    ).open();
  }

  private openHeaderMenu(evt: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((i) =>
      i
        .setTitle("选择日期…")
        .setIcon("calendar")
        .onClick(() => {
          const input = document.createElement("input");
          input.type = "date";
          input.value = this.currentDate;
          input.style.position = "fixed";
          input.style.opacity = "0";
          document.body.appendChild(input);
          input.addEventListener("change", () => {
            if (input.value) this.goDate(input.value);
            input.remove();
          });
          input.showPicker?.();
        })
    );
    menu.addItem((i) =>
      i.setTitle("用模板补齐格子").setIcon("layout-template").onClick(() => this.pickTemplate())
    );
    menu.addItem((i) =>
      i.setTitle("打开这一天的文件").setIcon("file-text").onClick(() => void this.openWholeFile())
    );
    menu.addItem((i) =>
      i.setTitle("新建这一天的文件").setIcon("file-plus").onClick(async () => {
        if (this.plugin.store.fileFor(this.currentDate)) {
          new Notice("文件已存在");
          return;
        }
        const tpl = this.plugin.getDefaultTemplate();
        await this.plugin.store.createDayFile(this.currentDate, tpl ? tpl.titles : []);
        await this.render();
      })
    );
    menu.showAtMouseEvent(evt);
  }

  private openCellMenu(evt: MouseEvent, cell: DayCell): void {
    const menu = new Menu();
    menu.addItem((i) =>
      i.setTitle("在文件里定位").setIcon("file-symlink").onClick(() => void this.openAtSection(cell))
    );
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("删除这一格")
        .setIcon("trash")
        .onClick(async () => {
          const date = this.currentDate;
          const removed = await this.plugin.store.deleteSection(date, cell.title);
          await this.render();
          if (!removed) return;
          const notice = new Notice(`已删除「${cell.title}」`, 5000);
          let done = false;
          const btn = notice.noticeEl.createEl("button", { text: "撤销", cls: "gd-undo-btn" });
          btn.addEventListener("click", async () => {
            if (done) return;
            done = true;
            await this.plugin.store.restoreSection(
              date,
              removed.title,
              removed.body,
              removed.index
            );
            notice.hide();
            await this.render();
            new Notice(`已恢复「${removed.title}」`);
          });
        })
    );
    menu.showAtMouseEvent(evt);
  }
}

