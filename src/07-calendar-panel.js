/* ============ 日历面板：5 骨架 × 6 纹理 + 农历 / 节气 / 节日 ============
 * 设计原则（来自用户 2026-11-07 的定稿）：
 *   1. 骨架决定「日期怎么排」，纹理决定「底子怎么画」，两者可自由组合 —— 5×6 = 30 种外观，
 *      代码只写 11 份，不用为每一款外观单独写一遍。
 *   2. 底图由用户自设，可放左上 / 右下 / 双角 / 铺满，可以拖动位置；文字必须自动保底可读。
 *   3. 左键：有日记就打开，没有就新建后打开；**已有多篇时先问要不要再建一篇**。
 *   4. 右键：写第二篇 / 只看这天 / 给这天换壁纸 / 标记纪念日。
 *
 * 这个类只负责「画」，不持有日记数据之外的任何状态；所有写入都走 plugin 的 API。
 * ============================================================ */

const CAL_WEEK_HEAD = ["日", "一", "二", "三", "四", "五", "六"];
const CAL_MONTH_CN = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

class CalendarPanel {
  constructor(plugin) {
    this.plugin = plugin;
    this.el = null;
    this.anchor = todayStr();        // 聚焦日期
    this.index = null;               // Map<date, {count, files[]}>
    this.sumCache = new Map();       // LRU: date -> {words, thumb, stickers}
    this.drag = null;
    this.collapsed = false;          // 折叠成一条细边（用户要求）
    this.refreshTimer = debounce(() => this.refresh(), 240);
  }
  get app() { return this.plugin.app; }
  get sx() { return this.plugin.settings; }
  get skel() { return this.sx.calSkeleton || "grid"; }
  get texture() { return this.sx.calTexture || "paper"; }

  /* ---------- 生命周期 ---------- */
  attachDir() { return this.plugin.attachDir(); }

  openInPane(container) {
    this.el = container;
    /* 补 gd-root：别的项目根元素都挂了它，变量才能从全局继承下来。
       少了这个，日历在「各管一份」里留空时不会回落，而是直接没值。 */
    this.el.addClass("gd-root");
    this.el.addClass("gd-cal-panel");
    this.buildIndex();
    this.render();
  }
  close() { this.el = null; }

  /* v3.21：主区 / 浮窗换天时，日历把焦点挪到同一天（标签页和浮窗都吃这一口） */
  setAnchor(key) {
    if (!key) return;
    const d = splitDayKey(key).date;
    if (!d) return;
    if (this.anchor === key) return;
    this.anchor = key;
    if (this.el) this.render();
  }

  /* ---------- 数据索引：只扫文件名，正文按需惰性读 ---------- */
  buildIndex() {
    const map = new Map();
    for (const f of this.plugin.dayFiles()) {
      const d = splitDayKey(f.basename).date;
      if (!d) continue;
      const cur = map.get(d) || { count: 0, files: [] };
      cur.count++;
      cur.files.push(f);
      map.set(d, cur);
    }
    this.index = map;
  }
  info(dateStr) { return (this.index && this.index.get(dateStr)) || { count: 0, files: [] }; }
  has(dateStr) { return this.info(dateStr).count > 0; }

  /* 某天的摘要（字数 / 首图 / 贴纸），带 LRU 上限 */
  async detail(dateStr) {
    if (this.sumCache.has(dateStr)) {
      const v = this.sumCache.get(dateStr);
      this.sumCache.delete(dateStr);
      this.sumCache.set(dateStr, v);
      return v;
    }
    const out = { words: 0, thumb: "", stickers: [] };
    const it = this.info(dateStr);
    if (it.count) {
      try {
        const raw = await this.app.vault.read(it.files[0]);
        const parsed = parseDay(raw, this.sx.headingLevel);
        let w = 0;
        for (const c of parsed.cells) w += (c.content || "").replace(/\s/g, "").length;
        out.words = w;
        const lay = parsed.layout || {};
        out.stickers = Array.isArray(lay.stickers) ? lay.stickers : [];
        if (laysCover(lay)) out.thumb = lay.cover;
        else {
          for (const c of parsed.cells) {
            const m = firstImageOf(c.content);
            if (m) { out.thumb = m; break; }
          }
        }
      } catch (e) { /* 读不到就当空 */ }
    }
    this.sumCache.set(dateStr, out);
    if (this.sumCache.size > 200) this.sumCache.delete(this.sumCache.keys().next().value);
    return out;
  }
  thumbOf(link) {
    if (!link) return "";
    if (/^https?:/i.test(link)) return link;
    const f = this.app.metadataCache.getFirstLinkpathDest(link, "");
    return f ? this.app.vault.getResourcePath(f) : "";
  }

  /* ---------- 渲染入口 ---------- */
  refresh() { if (this.el) { this.buildIndex(); this.render(); } }

  render() {
    if (!this.el) return;
    this.el.empty();
    this.el.dataset.skeleton = this.skel;
    this.el.dataset.texture = this.texture;
    /* 用户：「能折叠成一条，留细边点回来」 */
    this.el.toggleClass("is-cal-collapsed", !!this.collapsed);
    if (this.collapsed) { this.renderCollapsed(); return; }
    this.applyWallpaper();
    this.renderTop();
    const body = this.el.createDiv({ cls: "gd-cal-body" });
    this.bodyEl = body;
    const fn = {
      grid: () => this.renderGrid(body),
      strip: () => this.renderStrip(body),
      annual: () => this.renderAnnual(body),
      hero: () => this.renderHero(body),
      split: () => this.renderSplit(body),
      dual: () => this.renderDual(body),
    }[this.skel] || (() => this.renderGrid(body));
    fn();
    this.paintExtras();
  }

  /* 折叠成一条细边：只留周期标题 +「展开」 */
  renderCollapsed() {
    const bar = this.el.createDiv({ cls: "gd-cal-collapsed" });
    bar.createSpan({ cls: "gd-cal-collapsed-title", text: this.titleText() });
    bar.createSpan({ cls: "gd-cal-collapsed-tip", text: "展开" });
    bar.setAttr("title", "点一下展开日历");
    bar.onclick = () => this.setCollapsed(false);
    if (this.plugin.calFloatEl) this.plugin.applyCalCollapsed();
  }

  /* 折叠 / 展开：浮窗里要跟着改高度，标签页里只改自己 */
  setCollapsed(on) {
    this.collapsed = !!on;
    this.render();
    if (this.plugin.calFloatEl) this.plugin.applyCalCollapsed();
  }

  /* 底图（v3.24 两种摆法）
     banner = 顶部横幅：图片独占一条，日历整体排在它下面 —— 靠 CSS 的 flex 顺序
              让横幅是真的占位，不是叠在字上，所以永远不会重叠。
     full   = 整块铺满：图片当整页背景，日历浮在上面（会压一层蒙层保证可读）。
     图片的取景位置由 calWallCrop 控制（裁剪框里拖位置），跟摆放方式无关。 */
  applyWallpaper() {
    const el = this.el;
    const wp = this.sx.calWallpaper;
    el.classList.remove("is-wall", "is-wall-full", "is-wall-banner");
    el.removeAttribute("data-wall-pos");
    el.style.removeProperty("--gd-cal-wall");
    el.style.removeProperty("--gd-cal-wall-opacity");
    el.style.removeProperty("--gd-cal-wall-blur");
    el.style.removeProperty("--gd-cal-wall-size");
    el.style.removeProperty("--gd-cal-wall-pos");
    el.style.removeProperty("--gd-cal-wall-repeat");
    el.style.removeProperty("--gd-cal-wall-h");
    if (!wp) return;
    const url = this.thumbOf(wp);
    if (!url) return;
    el.classList.add("is-wall");
    const pos = this.sx.calWallpaperPos === "full" ? "full" : "banner";
    el.classList.add(pos === "full" ? "is-wall-full" : "is-wall-banner");
    el.dataset.wallPos = pos;
    el.style.setProperty("--gd-cal-wall", `url("${url}")`);
    /* 取景：有裁剪框就用它给的 size/position（拖框就换位置）；
       没裁剪就用「填满 / 完整放下」+ 居中 */
    const cc = cropCss(this.plugin.settings.calWallCrop);
    const fit = this.sx.calWallFit === "contain" ? "contain" : "cover";
    el.style.setProperty("--gd-cal-wall-size", cc ? cc.size : fit);
    el.style.setProperty("--gd-cal-wall-pos", cc ? cc.position : "50% 50%");
    el.style.setProperty("--gd-cal-wall-repeat", "no-repeat");
    el.style.setProperty("--gd-cal-wall-opacity", String(clamp(this.sx.calWallpaperOpacity ?? 0.85, 0.1, 1)));
    el.style.setProperty("--gd-cal-wall-blur", `${clamp(this.sx.calWallpaperBlur || 0, 0, 12)}px`);
    /* 横幅高度可调：默认 120px，范围 60–360 */
    el.style.setProperty("--gd-cal-wall-h", clamp(Number(this.sx.calBannerH) || 120, 60, 360) + "px");
  }

  /* 顶栏：‹ 今天 › + 周期胶囊 + 骨架/纹理切换 */
  renderTop() {
    const top = this.el.createDiv({ cls: "gd-cal-top" });
    const nav = top.createDiv({ cls: "gd-cal-nav" });
    const prev = nav.createEl("button", { cls: "gd-cal-nbtn", text: "‹" });
    prev.onclick = () => this.shift(-1);
    const today = nav.createEl("button", { cls: "gd-cal-nbtn is-text", text: "今天" });
    today.onclick = () => { this.anchor = todayStr(); this.render(); };
    const next = nav.createEl("button", { cls: "gd-cal-nbtn", text: "›" });
    next.onclick = () => this.shift(1);

    const title = top.createDiv({ cls: "gd-cal-title" });
    title.setText(this.titleText());

    const ops = top.createDiv({ cls: "gd-cal-ops" });
    const sk = ops.createEl("button", { cls: "gd-cal-obtn", text: "骨架" });
    sk.onclick = (e) => {
      const m = new Menu();
      for (const [k, n] of CAL_SKELETONS) {
        m.addItem((i) => i.setTitle(n).setChecked(this.skel === k).onClick(async () => {
          this.sx.calSkeleton = k; await this.plugin.saveSettings(); this.render();
        }));
      }
      showMenuAt(m, { clientX: e.clientX, clientY: e.clientY });
    };
    const tx = ops.createEl("button", { cls: "gd-cal-obtn", text: "纹理" });
    tx.onclick = (e) => {
      const m = new Menu();
      for (const [k, n] of CAL_TEXTURES) {
        m.addItem((i) => i.setTitle(n).setChecked(this.texture === k).onClick(async () => {
          this.sx.calTexture = k; await this.plugin.saveSettings(); this.render();
        }));
      }
      showMenuAt(m, { clientX: e.clientX, clientY: e.clientY });
    };
    const pic = ops.createEl("button", { cls: "gd-cal-obtn", text: "底图" });
    pic.onclick = (e) => this.wallMenu(e);
    const cls = ops.createEl("button", { cls: "gd-cal-obtn", text: "—" });
    cls.setAttr("title", "折叠成一条（点细边再回来）");
    cls.onclick = () => this.setCollapsed(true);
    const cls2 = ops.createEl("button", { cls: "gd-cal-obtn", text: "■" });
    cls2.setAttr("title", "关闭这个日历");
    /* 以前这里调 toggleCalendar()，它永远开浮窗；
     * 于是在标签页里点「关闭」，反而弹出一个浮窗 —— 用户说的「不要弹」。
     * 现在只关自己所在的那个：浮窗里就关浮窗，标签页里就关标签页。 */
    cls2.onclick = () => {
      if (this.inFloat) this.plugin.closeCalendarFloat();
      else {
        const leaf = this.plugin.app.workspace.getLeavesOfType(VIEW_CALENDAR)[0];
        if (leaf) leaf.detach();
      }
    };
  }

  titleText() {
    const a = this.anchor;
    switch (this.skel) {
      case "annual": return a.slice(0, 4) + " 年";
      case "strip": return `第 ${weekNo(a)} 周`;
      case "hero": return "今天";
      case "dual": {
        const y = Number(a.slice(0, 4)), m = Number(a.slice(5, 7));
        const n1 = `${y} 年 ${m} 月`;
        const nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
        return n1 + " – " + `${ny} 年 ${nm} 月`;
      }
      default: return `${a.slice(0, 4)} 年 ${Number(a.slice(5, 7))} 月`;
    }
  }

  shift(dir) {
    const a = this.anchor;
    if (this.skel === "annual") this.anchor = shiftMonth(a, 12 * dir);
    else if (this.skel === "strip") this.anchor = shiftDate(a, 7 * dir);
    else if (this.skel === "hero") this.anchor = shiftDate(a, dir);
    else this.anchor = shiftMonth(a, dir);
    this.render();
  }

  /* ---------- 骨架 1：月网格（七列六行）---------- */
  renderGrid(box) {
    const head = box.createDiv({ cls: "gd-cal-wdays" });
    const start = this.sx.calWeekStart === 0 ? 0 : 1;
    for (let i = 0; i < 7; i++) {
      head.createDiv({ cls: "gd-cal-wd", text: CAL_WEEK_HEAD[(start + i) % 7] });
    }
    const grid = box.createDiv({ cls: "gd-cal-grid" });
    const cells = this.monthCells(this.anchor, start);
    for (const c of cells) {
      const el = grid.createDiv({ cls: "gd-cal-cell" });
      this.fillCell(el, c.date, c.inMonth);
    }
    this.paintCells(grid);
  }

  /* 一个月要显示的日期（含前后补白） */
  monthCells(anchor, start) {
    const y = Number(anchor.slice(0, 4)), m = Number(anchor.slice(5, 7));
    const first = y + "-" + pad2(m) + "-01";
    const lastDay = new Date(y, m, 0).getDate();
    const last = y + "-" + pad2(m) + "-" + pad2(lastDay);
    const dow = parseDate(first).getDay();          // 0=周日
    const lead = (dow - start + 7) % 7;
    const out = [];
    for (let i = lead; i > 0; i--) out.push({ date: shiftDate(first, -i), inMonth: false });
    for (let d = 1; d <= lastDay; d++) out.push({ date: y + "-" + pad2(m) + "-" + pad2(d), inMonth: true });
    let k = 1;
    while (out.length % 7) { out.push({ date: shiftDate(last, k++), inMonth: false }); }
    return out;
  }

  /* 一格：日号 + 农历那行小字 + 有日记的标记 */
  fillCell(el, date, inMonth) {
    el.dataset.date = date;
    if (!inMonth) el.addClass("is-dim");
    if (date === todayStr()) el.addClass("is-today");
    if (date === this.anchor) el.addClass("is-anchor");
    const it = this.info(date);
    if (it.count) el.addClass("has");
    if (it.count > 1) el.addClass("is-multi");

    /* B8：节假日 / 调休上班 / 周末着色 */
    if (this.sx.calShowHoliday !== false) {
      try {
        const dk = dayKind(date);
        if (dk.kind === "holiday") el.addClass("is-holiday");
        else if (dk.kind === "workday") el.addClass("is-makeup");
        else if (dk.kind === "weekend") el.addClass("is-weekend");
        if (dk.name && dk.kind === "holiday") el.setAttribute("title", dk.name);
      } catch (e) { /* 节假日表缺失不影响渲染 */ }
    }

    const num = el.createDiv({ cls: "gd-cal-num" });
    num.setText(String(Number(date.slice(8, 10))));
    if (it.count > 1) num.createSpan({ cls: "gd-cal-badge", text: "×" + it.count });

    const sub = el.createDiv({ cls: "gd-cal-sub" });
    sub.setText(this.subText(date));

    const mark = el.createDiv({ cls: "gd-cal-mark" });
    if (it.count) mark.createSpan({ cls: "gd-cal-dot" });

    el.onclick = (e) => this.onDayClick(date, e);
    el.ondblclick = (e) => { e.preventDefault(); this.onDayDblClick(date, e); };
    el.oncontextmenu = (e) => { e.preventDefault(); this.dayMenu(date, e); };
  }

  /* 格子下方那行：节日 > 节气 > 农历（受 calLunarMode 控制） */
  subText(date) {
    const s = this.sx;
    if (s.calShowHoliday !== false) {
      try {
        const dk = dayKind(date);
        if (dk.kind === "holiday" && dk.name) return dk.name;
      } catch (e) { /* ignore */ }
    }
    if (s.calShowFestival) {
      const f = festivalOf(date);
      if (f) return f;
    }
    if (s.calShowTerm) {
      const t = termOf(date);
      if (t) return t;
    }
    if (s.calLunarMode === "none") return "";
    return lunarLabel(date, s.calLunarMode);
  }

  /* 异步补缩略图与字数（不阻塞首屏） */
  paintCells(scope) {
    if (!scope) return;
    const cells = scope.querySelectorAll(".gd-cal-cell, .gd-cal-strip-cell, .gd-cal-split-cell");
    let i = 0;
    const step = () => {
      if (i >= cells.length) return;
      const el = cells[i++];
      const date = el.dataset.date;
      this.detail(date).then((d) => {
        if (!d) return;
        if (d.thumb) {
          const t = el.querySelector(".gd-cal-thumb");
          if (t) t.style.backgroundImage = `url("${this.thumbOf(d.thumb)}")`;
        }
        if (d.stickers.length) {
          const sk = el.querySelector(".gd-cal-stk");
          if (sk) sk.setText(d.stickers.slice(0, 3).join(""));
        }
      });
      setTimeout(step, 12);
    };
    step();
  }

  /* ---------- 骨架 2：周条（上横条 + 当天详情）---------- */
  renderStrip(box) {
    const start = this.sx.calWeekStart === 0 ? 0 : 1;
    const base = this.weekStart(this.anchor, start);
    const strip = box.createDiv({ cls: "gd-cal-strip" });
    for (let i = 0; i < 7; i++) {
      const date = shiftDate(base, i);
      const el = strip.createDiv({ cls: "gd-cal-strip-cell" });
      this.fillCell(el, date, true);
      el.addClass("is-strip");
      const wd = el.createDiv({ cls: "gd-cal-wd2", text: CAL_WEEK_HEAD[(start + i) % 7] });
      el.insertBefore(wd, el.firstChild);
    }
    const det = box.createDiv({ cls: "gd-cal-detail" });
    this.renderDayDetail(det, this.anchor);
    this.paintCells(strip);
  }

  weekStart(dateStr, start) {
    const d = new Date(dateStr + "T00:00:00Z");
    const dow = d.getUTCDay();
    const diff = (dow - start + 7) % 7;
    return shiftDate(dateStr, -diff);
  }

  /* ---------- 骨架 3：纵向年历（12 个月竖排）---------- */
  renderAnnual(box) {
    const y = Number(this.anchor.slice(0, 4));
    const wrap = box.createDiv({ cls: "gd-cal-annual" });
    for (let m = 1; m <= 12; m++) {
      const mm = wrap.createDiv({ cls: "gd-cal-mini" });
      mm.createDiv({ cls: "gd-cal-mini-title", text: CAL_MONTH_CN[m - 1] });
      const g = mm.createDiv({ cls: "gd-cal-mini-grid" });
      const start = this.sx.calWeekStart === 0 ? 0 : 1;
      for (let i = 0; i < 7; i++) g.createDiv({ cls: "gd-cal-mini-wd", text: CAL_WEEK_HEAD[(start + i) % 7] });
      const cells = this.monthCells(`${y}-${pad2(m)}-01`, start);
      for (const c of cells) {
        const el = g.createDiv({ cls: "gd-cal-mini-cell" + (c.inMonth ? "" : " is-dim") + (this.has(c.date) ? " has" : "") + (c.date === todayStr() ? " is-today" : "") });
        el.dataset.date = c.date;
        el.setText(String(Number(c.date.slice(8, 10))));
        if (this.has(c.date)) el.addClass("has");
        el.onclick = (e) => this.onDayClick(c.date, e);
        el.oncontextmenu = (e) => { e.preventDefault(); this.dayMenu(c.date, e); };
      }
    }
  }

  /* ---------- 骨架 4：大日期（巨号数字 + 农历 + 节日）---------- */
  renderHero(box) {
    const date = this.anchor;
    const hero = box.createDiv({ cls: "gd-cal-hero" });
    const big = hero.createDiv({ cls: "gd-cal-big" });
    big.setText(String(Number(date.slice(8, 10))));
    const side = hero.createDiv({ cls: "gd-cal-hero-side" });
    side.createDiv({ cls: "gd-cal-hero-week", text: "星期" + CAL_WEEK_HEAD[new Date(date + "T00:00:00Z").getUTCDay()] });
    side.createDiv({ cls: "gd-cal-hero-year", text: `${date.slice(0, 4)} 年 ${Number(date.slice(5, 7))} 月` });
    const ln = lunarOf(date);
    if (ln) side.createDiv({ cls: "gd-cal-hero-lunar", text: `${ln.ganzhi}年 ${ln.monthName}${ln.dayName}` });
    const fest = festivalOf(date);
    if (fest) side.createDiv({ cls: "gd-cal-hero-fest", text: fest });
    const term = termOf(date);
    if (term && term !== fest) side.createDiv({ cls: "gd-cal-hero-term", text: "节气 · " + term });

    const nav = hero.createDiv({ cls: "gd-cal-hero-nav" });
    for (const [txt, delta] of [["‹", -1], ["今天", 0], ["›", 1]]) {
      const b = nav.createEl("button", { cls: "gd-cal-nbtn", text: txt });
      b.onclick = (e) => {
        if (delta === 0) this.anchor = todayStr();
        else this.anchor = shiftDate(this.anchor, delta);
        this.render();
      };
    }
    const det = box.createDiv({ cls: "gd-cal-detail" });
    this.renderDayDetail(det, date);
  }

  /* ---------- 骨架 6：双月并排（左本月 / 右下月，各一套完整七列网格）---------- */
  renderDual(box) {
    const start = this.sx.calWeekStart === 0 ? 0 : 1;
    const wrap = box.createDiv({ cls: "gd-cal-dual" });
    const a = this.anchor;
    const nextAnchor = shiftMonth(a, 1);
    for (const [anchor, which] of [[a, "l"], [nextAnchor, "r"]]) {
      const col = wrap.createDiv({ cls: "gd-cal-dual-col is-" + which });
      const hd = col.createDiv({ cls: "gd-cal-dual-head" });
      hd.createSpan({ cls: "gd-cal-dual-mon", text: `${anchor.slice(0, 4)} 年 ${Number(anchor.slice(5, 7))} 月` });

      const head = col.createDiv({ cls: "gd-cal-wdays" });
      for (let i = 0; i < 7; i++) head.createDiv({ cls: "gd-cal-wd", text: CAL_WEEK_HEAD[(start + i) % 7] });

      const grid = col.createDiv({ cls: "gd-cal-grid is-small is-dual" });
      for (const c of this.monthCells(anchor, start)) {
        const el = grid.createDiv({ cls: "gd-cal-cell is-small" });
        this.fillCell(el, c.date, c.inMonth);
      }
      this.paintCells(grid);
    }
    const foot = box.createDiv({ cls: "gd-cal-dual-foot" });
    const st = this.sx.calDualPick;
    if (st) foot.createSpan({ cls: "gd-cal-dual-sel", text: `已选：${dateShort(st)} · ${weekdayCN(st)}` });
    else foot.createSpan({ cls: "gd-cal-dual-sel", text: "点日期即可预览，双击进入那一天" });
  }

  /* ---------- 骨架 5：双栏月历（左网格 右详情）---------- */
  renderSplit(box) {
    const wrap = box.createDiv({ cls: "gd-cal-split" });
    const left = wrap.createDiv({ cls: "gd-cal-split-l" });
    const right = wrap.createDiv({ cls: "gd-cal-split-r" });
    const start = this.sx.calWeekStart === 0 ? 0 : 1;
    const head = left.createDiv({ cls: "gd-cal-wdays" });
    for (let i = 0; i < 7; i++) head.createDiv({ cls: "gd-cal-wd", text: CAL_WEEK_HEAD[(start + i) % 7] });
    const grid = left.createDiv({ cls: "gd-cal-grid is-small" });
    for (const c of this.monthCells(this.anchor, start)) {
      const el = grid.createDiv({ cls: "gd-cal-cell is-small" });
      this.fillCell(el, c.date, c.inMonth);
    }
    this.renderDayDetail(right, this.anchor);
    this.paintCells(grid);
  }

  /* 某天的详情面板（周条 / 大日期 / 双栏共用） */
  renderDayDetail(box, date) {
    box.empty();
    const head = box.createDiv({ cls: "gd-cal-dhead" });
    head.createDiv({ cls: "gd-cal-ddate", text: dateShort(date) + " · " + weekdayCN(date) });
    const ln = lunarOf(date);
    if (ln) head.createDiv({ cls: "gd-cal-dlunar", text: ln.monthName + ln.dayName });
    const it = this.info(date);
    const acts = box.createDiv({ cls: "gd-cal-dacts" });
    const add = acts.createEl("button", { cls: "gd-cal-act", text: it.count ? "再写一篇" : "写这一篇" });
    add.onclick = () => this.createAndOpen(date);
    if (it.count) {
      const open = acts.createEl("button", { cls: "gd-cal-act", text: "打开今天这篇" });
      open.onclick = () => this.plugin.openDay(it.files[0].basename);
    }
    const list = box.createDiv({ cls: "gd-cal-dlist" });
    if (!it.count) {
      list.createDiv({ cls: "gd-cal-dempty", text: "这天还没有日记" });
      return;
    }
    it.files.forEach((f, i) => {
      const row = list.createDiv({ cls: "gd-cal-drow" });
      row.createSpan({ cls: "gd-cal-didx", text: i === 0 ? "主篇" : "第 " + splitDayKey(f.basename).suffix + " 篇" });
      const sum = row.createSpan({ cls: "gd-cal-dsum", text: f.basename });
      row.onclick = () => this.plugin.openDay(f.basename);
      row.oncontextmenu = (e) => { e.preventDefault(); this.dayMenu(date, e); };
    });
    this.detail(date).then((d) => {
      if (d && d.thumb && list.isConnected) {
        const th = list.createDiv({ cls: "gd-cal-dthumb" });
        th.style.backgroundImage = `url("${this.thumbOf(d.thumb)}")`;
      }
    });
  }

  /* ---------- 交互 ---------- */
  /* 单击 = 就地预览，不跳转；双击 = 进入那一天。
   * 用户原话：「其实就是点开了之后它不跳转就行了。我可以在同一个页面点开多个日历。」
   * 空日子没有可预览的东西，单击也先给预览卡（里面有「写这一篇」），避免误触直接跳走。 */
  onDayClick(date, evt) {
    this.anchor = date;
    const el = evt && evt.currentTarget;
    if (this._clickTimer) clearTimeout(this._clickTimer);
    this._clickTimer = setTimeout(() => {
      this._clickTimer = null;
      this.showPreview(date, el);
    }, 220);
  }

  /* 双击：取消待触发的单击预览，直接进入 */
  onDayDblClick(date, evt) {
    if (this._clickTimer) { clearTimeout(this._clickTimer); this._clickTimer = null; }
    this.hidePreview();
    const it = this.info(date);
    if (it.count > 1 && evt && !evt.shiftKey) {
      new ConfirmModal(
        this.app,
        "这天已经写了 " + it.count + " 篇",
        "要再新建第 " + (it.count + 1) + " 篇吗？点「打开已有」就直接看第 1 篇。",
        () => { this.createAndOpen(date); },
        "再建一篇",
        "打开已有",
        () => { this.plugin.openDay(it.files[0].basename); }
      ).open();
      return;
    }
    if (it.count >= 1) { this.plugin.openDay(it.files[0].basename); return; }
    this.createAndOpen(date);
  }

  /* 预览卡：贴着被点的格子浮出来，点别处 / Esc 就消失 */
  showPreview(date, anchorEl) {
    this.hidePreview();
    const doc = (typeof document !== "undefined") ? document : null;
    if (!doc || !doc.body) return;
    const mk = (tag, cls, txt) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (txt != null) n.textContent = txt;
      return n;
    };
    const card = mk("div", "gd-cal-pop");
    doc.body.appendChild(card);
    this.popEl = card;

    const head = mk("div", "gd-cal-pop-head");
    const ln = lunarOf(date);
    const fest = festivalOf(date) || termOf(date) || "";
    const sub = fest || (ln ? ln.monthName + ln.dayName : "");
    head.appendChild(mk("div", "gd-cal-pop-title", dateShort(date) + " · " + weekdayCN(date) + (sub ? " · " + sub : "")));
    const x = mk("button", "gd-cal-pop-x", "×");
    x.onclick = () => this.hidePreview();
    head.appendChild(x);
    card.appendChild(head);

    const it = this.info(date);
    const body = mk("div", "gd-cal-pop-body");
    if (!it.count) {
      body.appendChild(mk("p", "gd-cal-pop-empty", "这天还没有日记"));
    } else {
      for (const f of it.files) {
        const row = mk("a", "gd-cal-pop-row", f.basename === date ? "主篇" : "第 " + splitDayKey(f.basename).suffix + " 篇");
        row.onclick = (e) => { e.stopPropagation(); this.hidePreview(); this.plugin.openDay(f.basename); };
        body.appendChild(row);
      }
    }
    card.appendChild(body);

    const acts = mk("div", "gd-cal-pop-acts");
    const act = (txt, fn) => {
      const b = mk("button", "gd-cal-pop-btn", txt);
      b.onclick = (e) => { e.stopPropagation(); fn(); };
      acts.appendChild(b);
    };
    act(it.count ? "再写一篇" : "写这一篇", () => { this.hidePreview(); this.createAndOpen(date); });
    if (it.count) act("进入这一天", () => { this.hidePreview(); this.plugin.openDay(it.files[0].basename); });
    act("换壁纸", () => { this.hidePreview(); this.pickWall(date); });
    card.appendChild(acts);

    /* 定位：贴着格子的下方，放不下翻到上方 */
    const vw = (typeof window !== "undefined" && window.innerWidth) || 1200;
    const vh = (typeof window !== "undefined" && window.innerHeight) || 800;
    const r = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
    const cr = card.getBoundingClientRect ? card.getBoundingClientRect() : { width: 240, height: 170 };
    let left = r && r.left ? r.left : 120;
    let top = r && r.bottom ? r.bottom + 6 : 140;
    if (left + cr.width > vw - 8) left = Math.max(8, vw - cr.width - 8);
    if (top + cr.height > vh - 8) top = Math.max(8, (r && r.top ? r.top : 200) - cr.height - 6);
    card.style.left = Math.round(left) + "px";
    card.style.top = Math.round(top) + "px";

    this._popOutside = (e) => { if (!card.contains(e.target)) this.hidePreview(); };
    setTimeout(() => doc.addEventListener("mousedown", this._popOutside, true), 0);
    this._popEsc = (e) => { if (e.key === "Escape") this.hidePreview(); };
    doc.addEventListener("keydown", this._popEsc, true);
  }

  hidePreview() {
    const doc = (typeof document !== "undefined") ? document : null;
    if (this._popOutside && doc) { doc.removeEventListener("mousedown", this._popOutside, true); this._popOutside = null; }
    if (this._popEsc && doc) { doc.removeEventListener("keydown", this._popEsc, true); this._popEsc = null; }
    if (this.popEl) { this.popEl.remove(); this.popEl = null; }
  }

  async createAndOpen(date) {
    try {
      await this.plugin.newEntryFor(date);
      this.refresh();
    } catch (e) { new Notice("新建失败：" + e.message); }
  }

  dayMenu(date, evt) {
    const m = new Menu();
    const it = this.info(date);
    m.addItem((i) => i.setTitle(it.count ? "再写一篇" : "写这一篇").setIcon("plus").onClick(() => this.createAndOpen(date)));
    if (it.count) {
      m.addItem((i) => i.setTitle("只看这天").setIcon("eye").onClick(async () => {
        await this.plugin.openDay(it.files[0].basename);
      }));
      m.addItem((i) => i.setTitle("在 Obsidian 里打开文件").setIcon("file-text").onClick(() => {
        this.app.workspace.getLeaf(true).openFile(it.files[0]);
      }));
    }
    m.addSeparator();
    m.addItem((i) => i.setTitle("给这天换壁纸…").setIcon("image").onClick(() => this.pickWall(date)));
    m.addItem((i) => i.setTitle("日历底图…").setIcon("picture-in-picture").onClick((e2) => this.wallMenu(evt || e2)));
    m.addItem((i) => i.setTitle("标记为纪念日").setIcon("star").onClick(async () => {
      new PromptModal(this.app, "纪念日", "给这天加一句备注（会写进当天日记的 frontmatter）", "", async (v) => {
        if (!v) return;
    try {
          const f = it.files[0] || (await this.plugin.createDayFileFor(date));
          if (!f) return;
          await this.app.fileManager.processFrontMatter(f, (fm) => { fm["纪念日"] = v; });
          new Notice("已标记：" + v);
          this.refresh();
        } catch (e) { new Notice("标记失败：" + e.message); }
      }).open();
    }));
    showMenuAt(m, { clientX: (evt && evt.clientX) || 0, clientY: (evt && evt.clientY) || 0 });
  }

  /* 给某天单独设壁纸（写进那天的 layout.cover） */
  async pickWall(date) {
    const f = await chooseFileLike(this.plugin, { title: "给这天设壁纸" });
    if (!f) return;
    try {
      const folder = this.attachDir();
      await this.plugin.ensureFolder(folder);
      const safe = f.name.replace(/[\\/:*?"<>|]/g, "_");
      let path = `${folder}/${safe}`;
      if (await this.app.vault.adapter.exists(path)) path = `${folder}/${Date.now()}-${safe}`;
      await this.app.vault.createBinary(path, await f.arrayBuffer());
      const file = this.info(date).files[0] || (await this.plugin.createDayFileFor(date));
      if (!file) return;
      const raw = await this.app.vault.read(file);
      const parsed = parseDay(raw, this.sx.headingLevel);
      const lay = normalizeLayout(parsed.layout, this.sx);
      lay.cover = path;
      if (!lay.coverHeight) lay.coverHeight = 160;
      const cells = normalizeCells(parsed.cells, parsed.layout, this.sx);
      await this.app.vault.modify(file, serializeDay(date, cells, {
        fm: parsed.fm, h1: parsed.h1,
        columns: (parsed.layout && parsed.layout.cols) || this.sx.columns,
        level: this.sx.headingLevel, layout: lay,
      }));
      new Notice("已给 " + dateShort(date) + " 换上壁纸");
      this.refresh();
      this.plugin.refreshAll();
    } catch (e) { new Notice("设壁纸失败：" + e.message); }
  }

  /* 日历自身的底图菜单 */
  wallMenu(evt) {
    const m = new Menu();
    m.addItem((i) => i.setTitle("选一张图…").setIcon("image-plus").onClick(() => this.pickCalWall()));
    m.addItem((i) => i.setTitle("从库里的图片挑…").setIcon("images").onClick(() => {
      const imgs = this.app.vault.getFiles().filter((f) => /^(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(f.extension));
      const m2 = new Menu();
      for (const f of imgs.slice(-30).reverse()) {
        m2.addItem((i2) => i2.setTitle(f.basename).setIcon("image").onClick(async () => {
          this.sx.calWallpaper = f.path; await this.plugin.saveSettings(); this.render();
        }));
      }
      if (!imgs.length) m2.addItem((i2) => i2.setTitle("库里还没有图片").setDisabled(true));
      showMenuAt(m2, { clientX: (evt && evt.clientX) || 0, clientY: (evt && evt.clientY) || 0 });
    }));
    m.addSeparator();
    for (const [k, n] of CAL_WALL_POS) {
      m.addItem((i) => i.setTitle("摆位：" + n).setChecked((this.sx.calWallpaperPos || "left-top") === k).onClick(async () => {
        this.sx.calWallpaperPos = k; await this.plugin.saveSettings(); this.render();
      }));
    }
    m.addSeparator();
    m.addItem((i) => i.setTitle("去掉底图").setIcon("trash").onClick(async () => {
      this.sx.calWallpaper = ""; await this.plugin.saveSettings(); this.render();
    }));
    showMenuAt(m, { clientX: (evt && evt.clientX) || 0, clientY: (evt && evt.clientY) || 0 });
  }
  async pickCalWall() {
    const f = await chooseFileLike(this.plugin, { title: "换日历底图" });
    if (!f) return;
    try {
      const folder = this.attachDir();
      await this.plugin.ensureFolder(folder);
      const safe = f.name.replace(/[\\/:*?"<>|]/g, "_");
      let path = `${folder}/${safe}`;
      if (await this.app.vault.adapter.exists(path)) path = `${folder}/${Date.now()}-${safe}`;
      await this.app.vault.createBinary(path, await f.arrayBuffer());
      this.sx.calWallpaper = path;
      await this.plugin.saveSettings();
      this.render();
    } catch (e) { new Notice("设底图失败：" + e.message); }
  }

  /* 空实现占位：留着以后放"标记点"等装饰 */
  paintExtras() { }
}

/* 判断 layout 有没有封面（避免 undefined 判断散落各处） */
function laysCover(lay) { return !!(lay && lay.cover); }

/* 第几周（ISO 近似，够用） */
function weekNo(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - start) / 86400000 + start.getUTCDay() + 1) / 7);
}
