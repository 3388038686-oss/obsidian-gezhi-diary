/* ============================================================
 * 时间线：竖轴 + 左右错开 + 严格按日期过滤
 *  - TimelinePanel：真正的画面（标签页和悬浮窗共用同一套）
 *  - TimelineView ：只负责占一个 Obsidian 标签页，把面板塞进去
 *  - 悬浮窗在 09-plugin.js 里用 openTimelineFloat() 直接建 div，可多开
 * ============================================================ */

class TimelinePanel {
  constructor(plugin, opts) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.opts = opts || {};
    this.inFloat = !!this.opts.float;
    this.el = null;
    this.listEl = null;
    this.range = 90;
    this.keyword = "";
    this.expanded = new Set();
    this.activeKey = "";
    this.followDay = true;
    this.dayFilter = "";
    this.renderDebounced = debounce(() => this.render(), 120);
    this.dead = false;
  }

  openInPane(container) {
    this.el = container;
    container.empty();
    container.addClass("gd-root");
    container.addClass("gd-timeline-root");
    this.applyThemeVars();
    if (this.inFloat) container.addClass("is-float");
    if (IS_MOBILE) container.addClass("is-mobile");
    this.build();
    this.render();
  }

  /* v3.22：流线图以前只挂了 gd-root，没有 gd-theme-*，所以卡片底色/字色/皮肤
     全掉回默认浅色，强调色只剩 projectVars.tl 里那份旧紫色。这里补上主题类，
     并让外壳变量跟主页同一套（tlFollowTheme=false 时才用流线图自己的配色）。 */
  applyThemeVars() {
    const el = this.el;
    if (!el) return;
    const s = this.plugin.settings || {};
    try {
      for (const t of THEMES) el.removeClass("gd-theme-" + t[0]);
      this.plugin.applyShellTheme(el, s.tlFollowTheme === false ? "tl" : null);
    } catch (e) { }
  }

  close() {
    this.dead = true;
    this.renderDebounced.cancel();
  }

  refresh() {
    if (this.dead) return;
    this.applyThemeVars();
    this.build();
    this.render();
  }

  setActive(key) {
    this.activeKey = key || "";
    if (this.followDay) this.refresh();
  }

  build() {
    const el = this.el;
    if (!el) return;
    el.empty();

    const s = this.plugin.settings;
    const compact = s.timelineCompactTop !== false;

    const top = el.createDiv({ cls: "gd-tl-top" + (compact && !this.topOpen ? " is-compact" : "") });
    const tline = top.createDiv({ cls: "gd-tl-titlebar" });
    tline.createEl("h4", { text: this.focusDate() ? "这一天的记录" : "时间线" });

    /* 用户要求：顶部那堆（近90天 / 跟随当天 / 看全部 / 撤销 / 重做 / 搜索）
       收成一个点一个图标，点开才展开。 */
    if (compact) {
      const gear = tline.createEl("button", { cls: "gd-tbtn gd-tl-gear", text: this.topOpen ? "▴" : "▾", attr: { title: "展开/收起顶部工具" } });
      gear.onclick = (e) => { e.stopPropagation(); this.topOpen = !this.topOpen; this.build(); this.render(); };
      if (!this.topOpen) {
        this.listEl = el.createDiv({ cls: "gd-tl-list" });
        if (!this.inFloat) el.createDiv({ cls: "gd-tl-note", text: "每次改动前自动留版本；点「恢复」回到任意一版。" });
        return;
      }
    }

    const acts = top.createDiv({ cls: "gd-tl-acts" });
    const sel = acts.createEl("select", { cls: "gd-select" });
    for (const [v, n] of [["30", "近 30 天"], ["90", "近 90 天"], ["0", "全部"]]) sel.createEl("option", { text: n, attr: { value: v } });
    sel.value = String(this.range);
    sel.onchange = () => { this.range = Number(sel.value); this.render(); };
    const mkBtn = (txt, title, fn, on) => {
      const b = acts.createEl("button", { cls: "gd-tbtn" + (on ? " is-on" : ""), text: txt, attr: { title } });
      b.onclick = fn;
      return b;
    };
    mkBtn("跟随当天", "只看主视图当前这一天（默认开）", () => {
      this.followDay = !this.followDay;
      this.build(); this.render();
    }, this.followDay);
    mkBtn("看全部", "不跟随，列出范围内的全部日期", () => {
      this.followDay = false; this.dayFilter = "";
      this.build(); this.render();
    }, !this.followDay);
    mkBtn("撤销", "撤销上一次改动", () => this.plugin.history.undo());
    mkBtn("重做", "重做", () => this.plugin.history.redo());

    const search = el.createDiv({ cls: "gd-side-search" });
    const si = search.createEl("input", { cls: "gd-side-search-input", attr: { type: "search", placeholder: "搜索日期 / 内容…" } });
    si.value = this.keyword;
    si.addEventListener("input", () => { this.keyword = si.value.trim(); this.renderDebounced(); });

    this.listEl = el.createDiv({ cls: "gd-tl-list" });
    if (!this.inFloat) el.createDiv({ cls: "gd-tl-note", text: "每次改动前自动留版本；点开任意一天可查看 / 恢复历史内容。" });
  }

  /* 列表下方那一块：这一天的逐篇明细（每篇的第一格 / 格子标题 → 一键打开） */
  renderDetailPanel(t) {
    const box = this.el.createDiv({ cls: "gd-tl-detailbox" });
    const bar = box.createDiv({ cls: "gd-tl-detailbox-head" });
    bar.createEl("strong", { text: "详情 · " + dateCN(t.date) });
    const shut = bar.createEl("button", { text: "收起", cls: "gd-mini-btn" });
    shut.onclick = (e) => { e.stopPropagation(); this.expanded.delete(t.date); this.render(); };
    for (const p of t.parts) {
      const tag = p.it.suffix ? "第 " + p.it.suffix + " 篇" : "主篇";
      const r = box.createDiv({ cls: "gd-tl-cell" });
      const head = r.createDiv({ cls: "gd-tl-cell-head" });
      head.createEl("strong", { text: tag });
      const w = (p.text || "").replace(/\s/g, "").length;
      head.createSpan({ text: `${w} 字 · ${(p.parsed.cells || []).length} 格`, cls: "gd-tl-cell-meta" });
      const open2 = head.createEl("button", { text: "打开", cls: "gd-mini-btn" });
      open2.onclick = (e) => { e.stopPropagation(); this.plugin.openDay(p.it.file.basename); };
      const titles = (p.parsed.cells || []).map((c) => c.title).filter(Boolean);
      r.createDiv({ cls: "gd-tl-cell-titles", text: titles.join(" / ") || "（空）" });
      const body = (p.text || "").replace(/\n+/g, " · ");
      if (body) r.createDiv({ cls: "gd-tl-cell-body", text: truncate(body, 220) });
    }
  }

  /* 严格取「当前这一天」：点哪天就只出哪天，绝不掺别的日期 */
  focusDate() {
    if (!this.followDay || !this.activeKey) return this.dayFilter || "";
    return splitDayKey(this.activeKey).date || this.dayFilter || "";
  }

  firstImg(cells) {
    for (const c of cells || []) {
      const m = /!\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\(([^)\s]+)\)/.exec(c.content || "");
      if (!m) continue;
      const src = (m[1] || m[2] || "").trim();
      if (!src) continue;
      const url = this.plugin.thumbUrl ? this.plugin.thumbUrl(src) : "";
      if (url) return { url, name: src };
    }
    return null;
  }

  groupByDate(files) {
    const map = new Map();
    for (const f of files) {
      const { date, suffix } = splitDayKey(f.basename);
      const d = date || f.basename;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push({ file: f, suffix });
    }
    const list = [...map.entries()].map(([date, items]) => {
      items.sort((a, b) => {
        const va = cnValue(a.suffix), vb = cnValue(b.suffix);
        return (Number.isFinite(va) ? va : -1) - (Number.isFinite(vb) ? vb : -1);
      });
      return { date, items };
    });
    list.sort((a, b) => b.date.localeCompare(a.date));
    return list;
  }

  async render() {
    if (!this.listEl || this.dead) return;
    const kw = this.keyword.toLowerCase();
    const focus = this.focusDate();
    let files;
    if (focus) {
      files = this.plugin.dayFiles().filter((f) => splitDayKey(f.basename).date === focus);
    } else {
      const cutoff = this.range > 0 ? shiftDate(todayStr(), -this.range) : "";
      files = this.plugin.dayFiles().filter((f) => !cutoff || f.basename >= cutoff);
    }

    this.listEl.empty();
    this.listEl.removeClass("is-axis");
    this.listEl.addClass("is-single");

    const shownDay = focus || "";
    if (shownDay) {
      const bar = this.listEl.createDiv({ cls: "gd-tl-focus" });
      const dk = dayKind(shownDay);
      const tag = dk.kind === "holiday" ? ` · ${dk.name || "节假日"}` : dk.kind === "weekend" ? " · 周末" : "";
      bar.createSpan({ text: "只看 " + dateCN(shownDay) + tag + " · 共 " + files.length + " 篇" });
      const all2 = bar.createEl("button", { text: "看全部日期", cls: "gd-mini-btn" });
      all2.onclick = () => { this.followDay = false; this.dayFilter = ""; this.build(); this.render(); };
    }

    const groups = this.groupByDate(files);
    let shown = 0;
    let year = "";
    let detailTarget = null;   // 列表下方那块详情要画哪一天
    for (const g of groups) {
      const parts = [];
      for (const it of g.items) {
        try {
          const parsed = parseDay(await this.app.vault.cachedRead(it.file));
          parts.push({ it, parsed, text: parsed.cells.map((c) => `${c.title} ${c.content}`).join("\n") });
        } catch (e) { /* ignore */ }
      }
      const allText = parts.map((p) => p.text).join("\n");
      if (kw && !(g.date.includes(kw) || allText.toLowerCase().includes(kw))) continue;
      shown++;

      const y = g.date.slice(0, 4);
      if (y !== year) {
        year = y;
        const yb = this.listEl.createDiv({ cls: "gd-tl-year" });
        yb.createSpan({ cls: "gd-tl-year-num", text: y });
        yb.createSpan({ cls: "gd-tl-year-cn", text: cnYearLabel(y) });
      }

      const row = this.listEl.createDiv({ cls: "gd-tl-row" });
      row.createDiv({ cls: "gd-tl-node" });

      const card = row.createDiv({ cls: "gd-tl-card" });
      /* 改动类型上色：新增 / 修改 / 删除 各一色（用户：只做颜色，不细到哪一格）。
         判断依据是「这一天的正文」跟「最近一版快照」比：
           没有快照          → 新增（这一版从没被覆盖过）
           正文比快照变短/为空 → 删除
           正文跟快照不同      → 修改
           正文跟快照相同      → 不打标（还没动过）
         以前两个分支都加 edit，del 那条 CSS 写了却永远用不上。 */
      let snapsForDay = [];
      try {
        const f0x = g.items[0] && g.items[0].file;
        if (f0x) snapsForDay = (await this.plugin.history.list(f0x)) || [];
        if (this.plugin.settings.timelineColorDiff !== false) {
          const bodyText = allText.replace(/\s/g, "");
          if (!snapsForDay.length) card.addClass("gd-tl-diff-new");
          else {
            let prevText = "";
            try { prevText = await this.plugin.app.vault.adapter.read(snapsForDay[0].path); } catch (e) { prevText = ""; }
            /* 快照里除了正文还有 layout 那段 JSON，直接比长度会被它带偏，
               所以先解析出正文再比。 */
            let prevBody = "";
            try {
              const pd = parseDay(prevText);
              prevBody = (pd.cells || []).map((c) => c.content || "").join("").replace(/\s/g, "");
            } catch (e) { prevBody = String(prevText || "").replace(/\s/g, ""); }
            const prevLen = prevBody.length;
            if (!bodyText.length) card.addClass("gd-tl-diff-del");
            else if (prevLen > 0 && bodyText.length < prevLen * 0.5) card.addClass("gd-tl-diff-del");
            else if (prevBody !== bodyText) card.addClass("gd-tl-diff-edit");
          }
        }
      } catch (e) { /* 上色失败不影响列表 */ }
      const dk = dayKind(g.date);
      if (dk.kind === "holiday") card.addClass("is-holiday");
      else if (dk.kind === "weekend") card.addClass("is-weekend");

      const head = card.createDiv({ cls: "gd-tl-head" });
      const db = head.createDiv({ cls: "gd-tl-datebox" });
      db.createEl("strong", { text: dateShort(g.date) });
      db.createEl("span", { text: `${weekdayCN(g.date)} · ${g.items.length} 篇 · ${allText.replace(/\s/g, "").length} 字` });
      if (dk.kind === "holiday" && dk.name) db.createEl("i", { cls: "gd-tl-holiday", text: dk.name });
      /* 整行点一下就开这一天的浮窗（手机上不用长按右键） */
      row.setAttribute("title", "点一下：打开这一天的浮窗");
      row.onclick = () => {
        if (this.inFloat) return;             /* 浮窗里再点不再套娃 */
        this.plugin.openTimelineFloat(g.date);
      };
      const btns = head.createDiv({ cls: "gd-tl-head-btns" });
      const anyKey = g.items[0] ? g.items[0].file.basename : "";
      btns.createEl("button", { text: this.expanded.has(g.date) ? "收起" : "详情", cls: "gd-mini-btn" }).onclick = (e) => {
        e.stopPropagation();
        if (this.expanded.has(g.date)) this.expanded.delete(g.date); else this.expanded.add(g.date);
        this.render();
      };
      btns.createEl("button", { text: "打开", cls: "gd-mini-btn" }).onclick = (e) => { e.stopPropagation(); this.plugin.openDay(anyKey); };
      btns.createEl("button", { text: "版本", cls: "gd-mini-btn" }).onclick = (e) => {
        e.stopPropagation();
        const f = g.items[0] && g.items[0].file;
        if (f) new SnapshotModal(this.app, this.plugin, f).open();
      };

      let img = null;
      for (const p of parts) { const hit = this.firstImg(p.parsed.cells); if (hit) { img = hit; break; } }
      const mainBox = card.createDiv({ cls: "gd-tl-mainbox" });
      if (img) {
        const thumb = mainBox.createDiv({ cls: "gd-tl-thumb" });
        thumb.style.backgroundImage = `url("${img.url}")`;
        thumb.setAttribute("title", img.name);
        thumb.onclick = (e) => { e.stopPropagation(); this.plugin.openDay(anyKey); };
      }
      mainBox.createDiv({ cls: "gd-tl-sum", text: truncate(allText.replace(/\n+/g, " · "), 110) || "（空）" });

      try {
        const f0 = g.items[0] && g.items[0].file;
        if (f0) {
          const snaps = await this.plugin.history.list(f0);
          if (snaps.length) {
            const sr = card.createDiv({ cls: "gd-tl-snaps-line" });
            sr.createSpan({ text: `改过 ${snaps.length} 次 · 最近 ${snaps[0].time}` });
            const rb = sr.createEl("button", { text: "恢复", cls: "gd-mini-btn is-accent", attr: { title: "列出这一天的所有版本，点一下回到那一版" } });
            rb.onclick = (e) => {
              e.stopPropagation();
              if (f0) new SnapshotModal(this.app, this.plugin, f0).open();
            };
            const hb = sr.createEl("button", { text: "看修改", cls: "gd-mini-btn" });
            hb.onclick = () => new SnapshotModal(this.app, this.plugin, f0).open();
          }
        }
      } catch (e) { /* ignore */ }

      /* 详情不在卡片里了（用户：「详细内容从时间线卡片里移出来，
         放到卡片外面、列表下方」）。这里只记下「要展开哪一天」，
         等整个列表画完，在列表下方单独画一块。 */
      if (this.expanded.has(g.date)) detailTarget = { date: g.date, parts };
    }

    if (detailTarget) this.renderDetailPanel(detailTarget);

    if (!shown) {
      this.listEl.createDiv({
        cls: "gd-empty",
        text: kw ? "没有匹配的日记" : (shownDay ? "这一天还没有日记，去写一篇吧" : "这个范围内没有日记"),
      });
    }
  }
}

/* 标签页宿主：一个标签页一份面板 */
class TimelineView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.panel = null;
  }
  getViewType() { return VIEW_TIMELINE; }
  getDisplayText() { return "日记时间线"; }
  getIcon() { return ICON_TIMELINE; }

  async onOpen() {
    if (!this.panel) this.panel = new TimelinePanel(this.plugin, { float: false });
    this.panel.openInPane(this.contentEl);
    this.plugin.registerTimelinePanel(this.panel);
  }
  onClose() {
    if (this.panel) { this.plugin.unregisterTimelinePanel(this.panel); this.panel.close(); }
  }

  /* 兼容旧调用 */
  setActive(key) { if (this.panel) this.panel.setActive(key); }
  refresh() { if (this.panel) this.panel.refresh(); }
  render() { if (this.panel) this.panel.render(); }
}
