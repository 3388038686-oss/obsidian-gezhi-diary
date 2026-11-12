/* ============ 主视图：九宫格 ============
 * v3 改造要点（对应需求）：
 *  1. 每格右上角「＋」——就近加格 / 插图 / 加贴纸 / 插入片段
 *  2. 五种页面风格 + 五种格子边框 + 贴纸 + 封面图
 *  3. 三种排布：竖向（原状）/ 横向滚动 / 横向翻页 —— 解决"只能上下拉"
 *  4. 动图（GIF/WebP/APNG）拖入即播，可选「悬停才播」
 * ============================================================ */

const CELL_PLACEHOLDERS = [
  "写点什么…",
  "今天这里发生了什么？",
  "随手记一句…",
  "想到了就写下来…",
  "空着也行，先占个位…",
];
const CONTENT_SNIPPETS = [
  ["分隔线", "\n---\n"],
  ["待办清单", "\n- [ ] \n- [ ] \n"],
  ["引用", "\n> \n"],
  ["代码块", "\n```\n\n```\n"],
  ["小标题", "\n**小标题**\n"],
];

function firstImageOf(text) {
  const wiki = /!\[\[([^\]|#]+?)(?:\|[^\]]*)?\]\]/.exec(text || "");
  if (wiki) return { kind: "wiki", path: wiki[1].trim() };
  const md = /!\[[^\]]*\]\(([^)\s]+)/.exec(text || "");
  if (md) return { kind: "url", path: md[1].trim() };
  return null;
}
function isAnimName(name) {
  return /\.(gif|webp|apng)$/i.test(String(name || ""));
}

class GridView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.date = todayStr();
    this.key = this.date;
    this.file = null;
    this.cells = [];
    this.fm = "";
    this.h1 = "";
    this.layout = {};
    this.layoutCols = plugin.settings.columns;
    this.gridCols = plugin.settings.columns;
    this.previewMode = false;
    this.saving = false;
    this.cellHist = new Map();      // 旧版「每格独立撤销 / 重做」
    this._editStart = null;
    this.statusText = "";
    this.pageNo = 1;
    this.pageTotal = 1;
    this.scheduleSave = debounce(() => this.saveNow(), 700);
    this._pasteHandler = null;
    this._scrollHandler = null;
    this._resize = null;
    this.rawMode = false;   // 原文（Markdown）模式
    this._rawText = "";
    this._rawDirty = false;
  }
  get sx() { return this.plugin.settings; }
  getViewType() { return VIEW_GRID; }
  getDisplayText() { return this.key ? `格间日记 · ${dateShort(this.key)}` : "格间日记"; }
  getIcon() { return ICON_GRID; }

  getState() { return { key: this.key }; }
  async setState(state) {
    const k = state && state.key;
    if (k && /^\d{4}-\d{2}-\d{2}/.test(k)) this.pendingKey = k;
  }
  async onOpen() {
    this.build();
    await this.openDay(this.pendingKey || this.key || todayStr());
  }
  onClose() {
    this.scheduleSave.cancel();
    this.stopCarouselTimer();
    if (this._pasteHandler) this.contentEl.removeEventListener("paste", this._pasteHandler, true);
    if (this._scrollHandler && this.scrollEl) this.scrollEl.removeEventListener("scroll", this._scrollHandler);
  }

  build() {
    const el = this.contentEl;
    el.empty();
    el.addClass("gd-root"); el.addClass("gd-grid-root");
    if (IS_MOBILE) el.addClass("is-mobile");
    this.applyTheme();

    this.scrollEl = el.createDiv({ cls: "gd-scroll" });
    this.coverWrapEl = this.scrollEl.createDiv({ cls: "gd-cover-wrap is-hidden" });
    this.coverEl = this.coverWrapEl.createDiv({ cls: "gd-cover" });
    this.mottoEl = this.coverWrapEl.createDiv({ cls: "gd-motto" });
    /* 四层舞台（新版封面）：和旧版 coverWrapEl 二选一显示 */
    this.stageEl = this.scrollEl.createDiv({ cls: "gd-cover-stage is-hidden" });
    this.stage = new GDStage(this);
    this.headEl = this.scrollEl.createDiv({ cls: "gd-head" });
    this.toolbarEl = this.headEl.createDiv({ cls: "gd-toolbar" });
    this.gridEl = this.scrollEl.createDiv({ cls: "gd-grid" });
    this.pageBarEl = this.scrollEl.createDiv({ cls: "gd-pagebar" });
    this.footEl = this.scrollEl.createDiv({ cls: "gd-foot" });

    this._pasteHandler = (evt) => {
      const t = evt.target;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      const text = evt.clipboardData ? evt.clipboardData.getData("text/plain") : "";
      if (!text || !text.trim()) return;
      evt.preventDefault();
      evt.stopPropagation();
      new PasteModal(this.app, this.plugin, text).open();
    };
    el.addEventListener("paste", this._pasteHandler, true);

    /* 翻页模式：滚动停下时算当前第几页 */
    this._scrollHandler = debounce(() => this.updatePageIndicator(), 90);
    this.scrollEl.addEventListener("scroll", this._scrollHandler, { passive: true });
  }

  /* ---------- 主题 / 变量 ---------- */
  applyTheme() {
    const s = this.sx, el = this.contentEl;
    for (const t of THEMES) el.removeClass(`gd-theme-${t[0]}`);
    for (const f of GRID_FLOWS) el.removeClass(`gd-flow-${f[0]}`);
    el.addClass(`gd-theme-${(s.theme || "card")}`);
    const flow = s.flow || "vertical";
    el.addClass(`gd-flow-${flow}`);
    const cols = (s.mobileOneColumn && IS_MOBILE) ? 1 : clamp(this.gridCols || s.columns, 1, 6);
    el.style.setProperty("--gd-cols", String(cols));
    el.style.setProperty("--gd-cell-w", `${clamp(s.cellWidth || 260, 190, 560)}px`);
    el.style.setProperty("--gd-rows", String(clamp(s.flowRows || 3, 1, 6)));
    el.style.setProperty("--gd-row-h", `${clamp(s.rowHeight, 80, 600)}px`);
    el.style.setProperty("--gd-gap", `${clamp(s.gap, 0, 48)}px`);
    el.style.setProperty("--gd-pad", `${clamp(s.pad, 4, 72)}px`);
    el.style.setProperty("--gd-radius", `${clamp(s.radius, 0, 28)}px`);
    el.style.setProperty("--gd-accent", s.accent || "#c2704f");
    el.style.setProperty("--gd-opacity", String(clamp(s.cardOpacity, 0.2, 1)));
    el.style.setProperty("--gd-line-h", String(clamp(s.lineHeight || 1.7, 1.2, 2.6)));
    /* 正文排版：首行缩进 / 段距 / 字体下距（单位 em） */
    el.style.setProperty("--gd-para-indent", (clamp(s.paraIndent == null ? 2 : s.paraIndent, 0, 4)) + "em");
    el.style.setProperty("--gd-para-gap", (clamp(s.paraGap == null ? 0.8 : s.paraGap, 0, 3)) + "em");
    el.style.setProperty("--gd-para-font-gap", (clamp(s.paraFontGap == null ? 0.5 : s.paraFontGap, 0, 2)) + "em");

    /* ── 主题系统 v4：字色 / 字距 / 线体 / 底色 ── */
    el.toggleClass("gd-has-font-color", !!s.fontColor);
    if (s.fontColor) el.style.setProperty("--gd-ink", s.fontColor);
    el.style.setProperty("--gd-letter-spacing", (clamp(s.letterSpacing || 0, -1, 6)) + "px");

    el.toggleClass("gd-has-line-color", !!s.lineColor);
    if (s.lineColor) el.style.setProperty("--gd-line", s.lineColor);
    el.style.setProperty("--gd-line-w", (clamp(s.lineWidth || 1, 0.5, 4)) + "px");
    el.style.setProperty("--gd-line-style", s.lineStyle || "solid");

    /* 底色：v3.23 起主页背景只有一个出口 —— applyProjectBg()（projectBg.home）。
       这里绝对不再自己画，否则就是「两次写入抢同一批变量」，
       用户看到的就是主页背景忽有忽无、改了没反应。
       老 data.json 里的 bgMode/bgColor/bgImage 由 bgCfgOf() 在 projectBg.home
       为空时兜底读取，所以不用在这里补一遍。 */
    el.removeAttribute?.("data-bg-mode");
    el.removeAttribute?.("data-bg-texture");
    el.removeAttribute?.("data-rhythm");
    el.style.removeProperty("--gd-bg-color");
    el.style.removeProperty("--gd-bg-image");
    el.toggleClass("has-bg", false);
    return this.applyThemeTail(s, el, true);
  }

  /* applyTheme 的尾段：字体、字色、线体、跟随主题、视频。
     抽出来是为了「底色由根元素接管」时能直接跳到这一段。 */
  applyThemeTail(s, el, ownedByRoot) {
    if (s.fontFamily) el.style.setProperty("--gd-font", s.fontFamily);
    else el.style.removeProperty("--gd-font");
    el.style.setProperty("--gd-font-size", `${clamp(s.fontSize, 10, 26)}px`);
    el.style.setProperty("--gd-weight", String(clamp(s.fontWeight || 400, 100, 900)));
    el.toggleClass("is-hover-lift", !!s.hoverLift);
    el.toggleClass("is-glass-on", !!s.glassEnabled);
    el.dataset.skin = s.glassEnabled ? "glass" : (s.skin || "zebra");
    /* 老版「背景图」字段：只有根元素没接管时才用，否则会盖掉新的背景 */
    if (s.background && !ownedByRoot) {
      try {
        el.style.setProperty("--gd-bg-image", `url("${this.app.vault.adapter.getResourcePath(normalizePath(s.background))}")`);
        el.addClass("has-bg");
      } catch (e) { el.removeClass("has-bg"); el.style.removeProperty("--gd-bg-image"); }
    } else { el.removeClass("has-bg"); el.style.removeProperty("--gd-bg-image"); }

    /* ── B1：跟随 Obsidian 主题（深色 / 浅色自动切） ── */
    el.toggleClass("is-follow-obsidian", !!s.bgFollowObsidian);
    if (s.bgFollowObsidian) {
      const dark = document.body.classList.contains("theme-dark");
      el.toggleClass("is-follow-dark", dark);
      el.style.setProperty("--gd-follow-blur", (clamp(s.bgFollowBlur || 0, 0, 24)) + "px");
    } else {
      el.removeClass("is-follow-dark");
    }

    /* ── B1：背景视频（CSS 背景放不了视频，单独铺一层 <video>） ── */
    try { this.applyBgVideo(); } catch (e) { /* 视频失败不影响排版 */ }
  }

  /* 背景视频：挂一个绝对定位的 <video> 铺在最底层 */
  applyBgVideo() {
    const el = this.contentEl;
    const s = this.sx;
    const old = el.querySelector(".gd-bg-video");
    if (old) old.remove();
    if (!s.bgVideo || s.bgMode !== "image" || IS_MOBILE) return;
    if (!isVideoSrc(s.bgVideo)) return;
    const u = this.coverUrl ? this.coverUrl(s.bgVideo) : "";
    if (!u) return;
    const v = document.createElement("video");
    v.className = "gd-bg-video";
    v.src = u;
    v.autoplay = true;
    v.muted = true;
    v.playsInline = true;
    if (s.bgVideoLoop !== false) v.loop = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "");
    const wrap = el.querySelector(".gd-scroll") || el;
    wrap.insertBefore(v, wrap.firstChild);
  }

  /* B7：一键重置整篇排版（只动 layout，不动正文） */
  resetLayout() {
    new ConfirmModal(this.app, "重置这一篇的排版？", "只把封面、层的位置、格子边框、皮肤这些「排版」恢复默认；格子里的文字一个字都不会动。", async () => {
      const s = this.sx;
      const keepCells = this.cells;
      this.layout = {
        v: 3,
        cols: s.columns || 2,
        skin: "",
        border: s.defaultBorder || "hair",
        cover: "",
        coverHeight: s.coverHeight || 160,
        stickers: [],
        layers: null,
      };
      this.gridCols = clamp(this.layout.cols, 1, 6);
      this.cells = keepCells;
      await this.saveNow();
      this.render();
      new Notice("排版已重置（文字没动）");
    }).open();
  }

  attachDir() { return this.plugin.attachDir(); }

  /* B3：把别的某一天的封面 / 照片搬过来用 */
  reuseCoverFromDay() {
    const files = this.plugin.dayFiles().filter((f) => f.basename !== this.key);
    if (!files.length) { new Notice("还没有别的日记可以复用"); return; }
    const menu = new Menu();
    let shown = 0;
    for (const f of files) {
      if (shown >= 40) break;
      menu.addItem((i) => i.setTitle(splitDayKey(f.basename).date || f.basename).setIcon("image")
        .onClick(async () => {
          try {
            const raw = await this.app.vault.cachedRead(f);
            const parsed = parseDay(raw);
            const lay = parsed.layout || {};
            const src = lay.cover || lay.photo || (parsed.fm && parsed.fm.cover) || "";
            if (!src) { new Notice("这一天没有设过图片"); return; }
            this.layout.cover = src;
            this.layout.coverHeight = lay.coverHeight || this.layout.coverHeight;
            this.layout.coverPos = lay.coverPos || this.layout.coverPos;
            if (!this.layout.layers) this.layout.layers = normalizeLayers(null, this.layout, this.sx);
            this.layout.layers.bg.on = true;
            this.layout.layers.bg.src = src;
            await this.saveNow();
            this.render();
            new Notice("已复用 " + (splitDayKey(f.basename).date || f.basename) + " 的图片");
          } catch (e) { new Notice("复用失败：" + (e && e.message ? e.message : e)); }
        }));
      shown++;
    }
    showMenuAt(menu, { clientX: window.innerWidth / 2, clientY: 120 });
  }

  async openDay(key) {
    this.scheduleSave.cancel();
    if (this.rawMode) await this.saveRaw();
    if (this.file instanceof TFile) await this.saveNow(); // 切走之前先落盘
    this.key = key || todayStr();
    const dm = /^(\d{4})-(\d{2})-(\d{2})/.exec(this.key);
    this.date = dm ? dm[0] : todayStr();
    const s = this.plugin.settings;
    const folder = normalizePath(s.rootFolder || "日记");
    const path = `${folder}/${this.key}.md`;
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      if (!s.autoCreateToday) {
        this.file = null; this.fm = ""; this.h1 = ""; this.cells = []; this.layout = {};
        this.render();
        return;
      }
      file = await this.plugin.createDayFileFor(this.key);
    }
    this.file = file;
    await this.reload();
      try { this.maybeRotateCarousel(); this.startCarouselTimer(); } catch (e) { /* 轮播失败不影响打开 */ }
    if (this.plugin.sidebar) this.plugin.sidebar.setActive(this.key);
    /* v3.21：主区换天是唯一真源，通知浮窗 / 日历 / 流线图跟上 */
    if (this.plugin.applyDayToOthers) this.plugin.applyDayToOthers(this.key, this.plugin._daySource || "grid");
  }
  async reload() {
    if (!(this.file instanceof TFile)) return;
    const parsed = parseDay(await this.app.vault.read(this.file), this.plugin.settings.headingLevel);
    this.fm = parsed.fm;
    this.h1 = parsed.h1;
    this.layout = normalizeLayout(parsed.layout, this.plugin.settings);
    this.layoutCols = (parsed.layout && parsed.layout.cols) || this.plugin.settings.columns;
    this.gridCols = clamp(this.layoutCols, 1, 6);
    this.cells = normalizeCells(parsed.cells, parsed.layout, { ...this.plugin.settings, columns: this.gridCols });
    this.render();
  }

  render() {
    if (!this.gridEl) return;
    this.applyTheme();
    this.renderCover();
    this.renderHead();
    this.renderStickerBar();
    if (this.rawMode) { this.renderRaw(); return; }
    this.gridEl.removeClass("is-raw");
    const s = this.plugin.settings;
    const flow = s.flow || "vertical";
    const cols = (s.mobileOneColumn && IS_MOBILE) ? 1 : clamp(this.gridCols, 1, 6);
    this.gridEl.empty();
    if (flow === "vertical") {
      this.gridEl.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
      this.gridEl.style.gridTemplateRows = "";
      this.gridEl.style.gridAutoFlow = "row";
      this.gridEl.style.gridAutoColumns = "";
      this.gridEl.style.width = "";
    } else {
      /* 横向 / 翻页：行数固定，列由内容向右自动长出（不再显式定义列，
       * 否则显式列 + auto-flow:column 会把格子塞进前 cols 列里） */
      this.gridEl.style.gridTemplateColumns = "";
      this.gridEl.style.gridTemplateRows = `repeat(var(--gd-rows), minmax(var(--gd-row-h), auto))`;
      this.gridEl.style.gridAutoFlow = "column";
      this.gridEl.style.gridAutoColumns = "var(--gd-cell-w)";
      this.gridEl.style.width = "max-content";
    }
    if (!this.cells.length) {
      this.gridEl.createDiv({ cls: "gd-no-cells", text: "还没有格子。点右上角「＋」加一格，或者直接 Ctrl+V 贴一段文字自动生成。" });
    }
    this.cells.forEach((cell, i) => this.renderCell(cell, i));
    this.renderPageBar();
    this.footEl.empty();
    this.footEl.createEl("span", { text: `${dateCN(this.date)} · ${this.cells.length} 格 · ${this.cells.reduce((n, c) => n + c.content.length, 0)} 字` });
    if (!IS_MOBILE) this.footEl.createEl("span", { text: "提示：空白处 Ctrl+V 把纯文本转成格子；Shift+滚轮 可横向滚动", cls: "gd-foot-tip" });
  }

  /* ---------- 封面 ---------- */
  coverSrc() {
    const s = this.sx;
    if (!s.showCover || !(s.coverHeight > 0)) return null;
    if (this.layout && this.layout.cover) return { kind: "path", path: this.layout.cover };
    const m = /^\s*(?:cover|banner)\s*:\s*(.+)$/im.exec(this.fm || "");
    if (m) {
      const v = m[1].trim().replace(/^["']|["']$/g, "").replace(/^!?\[\[|\]\]$/g, "").split("|")[0];
      if (v) return { kind: "path", path: v };
    }
    if (s.coverFallback === "firstImage") {
      const first = firstImageOf(this.cells.map((c) => c.content).join("\n"));
      if (first) return first;
    }
    return null;
  }
  renderCover() {
    const wrap = this.coverWrapEl;
    const el = this.coverEl;
    if (!wrap || !el) return;
    /* 舞台模式时旧封面完全让位，否则两套会同时画 */
    if (this.sx.showStage) {
      wrap.addClass("is-hidden");
      if (this.stage) this.stage.render();
      return;
    }
    if (this.stageEl) this.stageEl.addClass("is-hidden");
    el.empty();
    const s = this.sx;
    const src = this.coverSrc();
    const h = clamp(this.layout.coverHeight != null ? this.layout.coverHeight : s.coverHeight, 0, 320);
    const wantMotto = !!s.showMotto;
    const srcHidden = (!src && s.coverFallback !== "gradient") || !h;
    /* 图和座右铭是一个整体：图没了但座右铭开着时，整块变成一条窄的座右铭栏 */
    if (srcHidden && !wantMotto) { wrap.addClass("is-hidden"); return; }
    wrap.removeClass("is-hidden");
    wrap.toggleClass("is-motto", wantMotto);
    el.toggleClass("is-hidden", srcHidden);
    el.style.height = h + "px";
    wrap.style.minHeight = h + "px";

    el.toggleClass("is-gradient", !src);
    /* 先按裁剪框铺；没裁剪才退回取景位置 */
    this.applyCoverCrop(el);
    if (src) {
      let url = "";
      try {
        if (src.kind === "url") url = src.path;
        else {
          const f = this.app.metadataCache.getFirstLinkpathDest(normalizePath(src.path), this.file ? this.file.path : "");
          url = f ? this.app.vault.adapter.getResourcePath(f.path) : "";
        }
      } catch (e) { url = ""; }
      if (url) el.style.backgroundImage = `url("${url}")`;
      else { el.style.backgroundImage = ""; el.addClass("is-gradient"); }
    } else el.style.backgroundImage = "";

    /* 遮罩层：标题 + 动图角标 + 左下角头像 */
    const shade = el.createDiv({ cls: "gd-cover-shade" });
    const left = shade.createDiv({ cls: "gd-cover-left" });
    if (s.showAvatar) {
      const av = left.createDiv({ cls: "gd-avatar gd-shape-" + (s.avatarShape || "circle") });
      av.style.width = av.style.height = clamp(s.avatarSize || 44, 24, 96) + "px";
      const url = this.avatarUrl(s.avatar);
      if (url) {
        av.style.backgroundImage = `url("${url}")`;
        applyCrop(av, s.avatarCrop, "50% 50%");
      }
      else av.setText(String(s.avatarText || (s.avatarText === "" ? "" : (this.h1 || this.date).slice(0, 1))).slice(0, 2));
      av.setAttribute("title", "封面标志 · 右键更换");
      av.oncontextmenu = (e) => {
        e.preventDefault();
        const m = new Menu();
        m.addItem((i2) => i2.setTitle("上传一张图").setIcon("image").onClick(() => this.pickAvatar()));
        m.addItem((i2) => i2.setTitle("裁剪这张图").setIcon("crop").onClick(() => this.cropAvatar()));
        m.addItem((i2) => i2.setTitle("换轮廓").setIcon("shapes").onClick(() => {
          const m2 = new Menu();
          const cur = s.avatarShape || "circle";
          for (const [v, nm] of AVATAR_SHAPES) {
            m2.addItem((i3) => i3.setTitle((cur === v ? "✓ " : "") + nm).onClick(async () => {
              this.sx.avatarShape = v;
              await this.plugin.saveSettings();
              this.renderCover();
              new Notice("头像轮廓：" + nm);
            }));
          }
          showMenuAt(m2, e);
        }));
        m.addItem((i2) => i2.setTitle("用文字标记").setIcon("type").onClick(() => {
          new PromptModal(this.app, "封面标志", "输入 1–2 个字", s.avatarText || "", async (v) => {
            this.sx.avatar = ""; this.sx.avatarText = String(v || "").trim().slice(0, 2);
            this.sx.showAvatar = true;
            await this.plugin.saveSettings(); this.renderCover();
          }).open();
        }));
        m.addItem((i2) => i2.setTitle("不要标志").setIcon("x").onClick(async () => {
          this.sx.showAvatar = false; await this.plugin.saveSettings(); this.renderCover();
        }));
        showMenuAt(m, e);
      };
      left.appendChild(av);
    }
    if (isAnimName(this.layout.cover || "")) left.createSpan({ cls: "gd-cover-badge", text: "动图" });
    left.createSpan({ cls: "gd-cover-title", text: this.h1 || dateCN(this.date) });

    /* 右侧座右铭栏 */
    if (wantMotto) {
      const mo = this.mottoEl;
      mo.empty();
      mo.style.alignItems = s.mottoAlign === "center" ? "center" : s.mottoAlign === "right" ? "flex-end" : "flex-start";
      mo.style.textAlign = s.mottoAlign || "left";
      const text = this.layout.motto || s.motto || "";
      const line = mo.createDiv({ cls: "gd-motto-text" + (text ? "" : " is-empty") });
      line.style.fontSize = clamp(s.mottoSize || 15, 11, 28) + "px";
      line.setText(text || "点这里写一句座右铭…");
      line.onclick = () => this.editMotto();
      line.setAttribute("title", "点击编辑座右铭");
      const tools = mo.createDiv({ cls: "gd-motto-tools" });
      const tb = (txt, tip, fn) => {
        const b = tools.createEl("button", { text: txt, cls: "gd-motto-btn", attr: { title: tip } });
        b.onclick = (e) => { e.stopPropagation(); fn(); };
      };
      tb("改", "编辑座右铭", () => this.editMotto());
      tb("图", "给这一篇单独设封面图", () => this.pickCover());
      tb("位置", "拖动调整取景", () => this.dragCoverPos());
      tb("隐藏", "收起源泉右铭栏", async () => { this.sx.showMotto = false; await this.plugin.saveSettings(); this.renderCover(); });
    }

    const ops = el.createDiv({ cls: "gd-cover-ops" });
    const b = (text, title, fn) => {
      const btn = ops.createEl("button", { text, cls: "gd-cover-btn", attr: { title } });
      btn.onclick = (e) => { e.stopPropagation(); fn(e); };
      return btn;
    };
    b("换封面", "选一张图当封面", () => this.pickCover());
    b("高度", "拖动调整封面高度", () => this.tuneCoverHeight());
    b("取景", "在图上拖动，选你想显示的那一块", () => this.dragCoverPos());
    b("裁剪", "框选要显示的区域，框外切掉", () => this.cropCover());
    b(s.showMotto ? "关座右铭" : "开座右铭", "封面右侧显示一句座右铭", () => this.toggleMotto());
    if (src) b("移除", "去掉封面图", async () => {
      this.layout.cover = "";
      this.layout.coverHeight = 0;
      this.render(); this.scheduleSave();
    });

    el.oncontextmenu = (evt) => {
      evt.preventDefault();
      const m = new Menu();
      m.addItem((i2) => i2.setTitle("换封面图").setIcon("image").onClick(() => this.pickCover()));
      m.addItem((i2) => i2.setTitle("从今天的第一张图取").setIcon("image-plus").onClick(() => {
        const f = firstImageOf(this.cells.map((c) => c.content).join("\n"));
        if (!f) { new Notice("这一篇里还没有图片"); return; }
        this.layout.cover = f.path; this.render(); this.scheduleSave();
      }));
      m.addItem((i2) => i2.setTitle("拖动调整取景位置").setIcon("move").onClick(() => this.dragCoverPos()));
      m.addItem((i2) => i2.setTitle("调封面高度").setIcon("move-vertical").onClick(() => this.tuneCoverHeight()));
      m.addSeparator();
      m.addItem((i2) => i2.setTitle("编辑座右铭").setIcon("quote").onClick(() => this.editMotto()));
      m.addItem((i2) => i2.setTitle("显示/隐藏座右铭栏").setIcon("panel-right").onClick(() => this.toggleMotto()));
      m.addItem((i2) => i2.setTitle("换封面标志").setIcon("user").onClick(() => this.pickAvatar()));
      m.addSeparator();
      m.addItem((i2) => i2.setTitle("不要封面").setIcon("x").onClick(() => { this.layout.cover = ""; this.layout.coverHeight = 0; this.render(); this.scheduleSave(); }));
      showMenuAt(m, evt);
    };
  }
  /* 把 layout.crops.cover 应用到元素背景；没有裁剪就按取景位置 */
  applyCoverCrop(el) {
    const c = (this.layout && this.layout.crops && this.layout.crops.cover) || null;
    applyCrop(el, c, this.layout.coverPos || "50% 50%");
  }

  /* 照片层裁剪：按照片层当前的宽高比 */
  cropPhoto() {
    const p = this.layout && this.layout.photo;
    if (!p) { new Notice("照片层还没有图"); return; }
    const url = this.avatarUrl(p);
    if (!url) { new Notice("这张图读不出来"); return; }
    const L = (this.layout.layers && this.layout.layers.img) || null;
    const boxW = (this.stageEl && this.stageEl.clientWidth) || 600;
    const boxH = (this.stageEl && this.stageEl.clientHeight) || 260;
    const ratio = L ? (L.w / Math.max(L.h, 1)) * (boxW / Math.max(boxH, 1)) : boxW / Math.max(boxH, 1);
    openCrop(this.app, {
      url,
      ratio,
      crop: (this.layout.crops && this.layout.crops.photo) || null,
      title: "裁剪照片",
      onOk: (c) => {
        this.layout.crops = this.layout.crops || {};
        if (c) this.layout.crops.photo = c; else delete this.layout.crops.photo;
        if (this.stage) this.stage.render();
        this.render(); this.scheduleSave();
        new Notice(c ? "照片已裁剪" : "照片恢复整张");
      },
    });
  }

  /* 头像裁剪：正方形框（跟微信头像一样） */
  cropAvatar() {
    const url = this.avatarUrl(this.sx.avatar);
    if (!url) { new Notice("还没上传头像图"); return; }
    openCrop(this.app, {
      url,
      ratio: 1,
      crop: this.sx.avatarCrop || null,
      title: "裁剪头像",
      onOk: async (c) => {
        this.sx.avatarCrop = c || null;
        await this.plugin.saveSettings();
        this.renderCover();
        new Notice(c ? "头像已裁剪" : "头像恢复整张");
      },
    });
  }

  /* 打开封面裁剪框：图先换成自己的 resource 路径 */
  cropCover() {
    const src = this.coverSrc();
    if (!src) { new Notice("还没有封面图"); return; }
    let url = "";
    try {
      if (src.kind === "url") url = src.path;
      else {
        const f = this.app.metadataCache.getFirstLinkpathDest(normalizePath(src.path), this.file ? this.file.path : "");
        url = f ? this.app.vault.adapter.getResourcePath(f.path) : "";
      }
    } catch (e) { url = ""; }
    if (!url) { new Notice("这张图读不出来，先换一张"); return; }
    const h = this.layout.coverHeight || this.sx.coverHeight || 160;
    const w = (this.el && this.el.clientWidth) || 600;
    openCrop(this.app, {
      url,
      ratio: w / Math.max(h, 1),
      crop: (this.layout.crops && this.layout.crops.cover) || null,
      title: "裁剪封面",
      onOk: (c) => {
        this.layout.crops = this.layout.crops || {};
        if (c) this.layout.crops.cover = c;
        else delete this.layout.crops.cover;
        this.render(); this.scheduleSave();
        new Notice(c ? "封面已裁剪" : "封面恢复整张");
      },
    });
  }

  /* 头像图片转成可用的 resource 路径 */
  coverUrl(src) {
    if (!src || !src.path) return "";
    try {
      if (src.kind === "url") return src.path;
      const f = this.app.metadataCache.getFirstLinkpathDest(normalizePath(src.path), this.file ? this.file.path : "");
      return f ? this.app.vault.adapter.getResourcePath(f.path) : "";
    } catch (e) { return ""; }
  }
  /* 舞台的「照片」层：跟背景是两张独立的图 */
  async pickPhoto() {
    /* 图片 / 动图 / 视频都走这条路（视频按 CSS 规则必须叠 <video>） */
    const f = await chooseFileLike(this.plugin, { title: "选一张照片（舞台的照片层）" });
    if (!f) return;
    const nm = String(f.name || "");
    const isVid = isVideoSrc(nm);
    const isAnim = isAnimSrc(nm);
    if (!isVid && !isAnim && !/\.(png|jpe?g|webp|svg|bmp|avif)$/i.test(nm)) {
      new Notice("这个格式放不了：只支持 图片 / 动图(gif webp apng) / 视频(mp4 webm mov)");
      return;
    }
    /* 图片和动图先裁剪再落盘（用户要求）。视频不裁剪：它是流媒体，
       框选之后必须真转码出一个新文件，太重，直接放上去再拖取景。 */
    if (!isVid) {
      let tmp = "";
      try { tmp = URL.createObjectURL(new Blob([await f.arrayBuffer()])); }
      catch (e) { new Notice("这张图读不出来，换一张试试"); return; }
      const boxW = (this.stageEl && this.stageEl.clientWidth) || 600;
      const boxH = (this.stageEl && this.stageEl.clientHeight) || 260;
      const L = (this.layout.layers && this.layout.layers.img) || { w: 40, h: 60 };
      const ratio = (L.w / Math.max(L.h, 1)) * (boxW / Math.max(boxH, 1));
      openCrop(this.app, {
        url: tmp,
        ratio,
        crop: (this.layout.crops && this.layout.crops.photo) || null,
        title: "裁剪照片（框选完再保存）",
        onCancel: () => { try { URL.revokeObjectURL(tmp); } catch (e) { } new Notice("没放照片"); },
        onOk: (crop) => {
          try { URL.revokeObjectURL(tmp); } catch (e) { }
          this.placePhoto(f, nm, isVid, isAnim, crop);
        },
      });
      return;
    }
    /* 体积与时长限制（用户要求：性能别崩） */
    const s = this.plugin.settings;
    const maxMB = clamp(s.videoMaxMB || 20, 1, 200);
    if (f.size && f.size > maxMB * 1024 * 1024) {
      new Notice("文件太大：" + (f.size / 1048576).toFixed(1) + " MB，上限 " + maxMB + " MB");
      return;
    }
    this.placePhoto(f, nm, isVid, isAnim, null);
  }

  /* 真正的落盘与接线：crop 为 null 表示整张铺 */
  async placePhoto(f, nm, isVid, isAnim, crop) {
    const s = this.plugin.settings;
    try {
      const folder = this.attachDir();
      await this.plugin.ensureFolder(folder);
      const safe = nm.replace(/[\\/:*?"<>|]/g, "_");
      let p2 = `${folder}/${safe}`;
      if (await this.app.vault.adapter.exists(p2)) p2 = `${folder}/${Date.now()}-${safe}`;
      const buf = await f.arrayBuffer();
      await this.app.vault.adapter.writeBinary(p2, buf);
      if (isVid) {
        if (!s.videoEnabled || IS_MOBILE) {
          new Notice(IS_MOBILE ? "移动端不支持视频壁纸（省电）" : "视频壁纸还没开，去设置 → 外观 → 图片层里打开");
          return;
        }
        /* 时长校验：造个临时 video 读 metadata */
        const sec = await this.probeVideoSeconds(p2);
        const maxSec = clamp(s.videoMaxSec || 60, 5, 600);
        if (sec > maxSec) {
          new Notice("视频太长：" + sec.toFixed(1) + " 秒，上限 " + maxSec + " 秒");
          return;
        }
        this.layout.photo = p2;
        this.layout.videoLoop = true;
      } else {
        this.layout.photo = p2;
      }
      /* 合并模式（背景和照片合成一层）时，照片层是隐藏的，图要落到背景层才看得见 */
      if (this.layout.layers) {
        if (s.mergeBgImg) {
          this.layout.layers.bg.on = true;
          this.layout.layers.img.on = false;
        } else {
          this.layout.layers.img.on = true;
        }
      }
      this.layout.crops = this.layout.crops || {};
      if (crop) this.layout.crops.photo = crop; else delete this.layout.crops.photo;
      this.scheduleSave();
      if (this.stage) this.stage.render();
      new Notice(isVid ? "视频已放上舞台（静音循环播放）" : isAnim ? "动图已放上舞台" : "照片已放上舞台，可拖动挪位置");
    } catch (e) {
      new Notice("放照片失败：" + (e && e.message ? e.message : e));
    }
  }

  /* 读视频时长（秒），读不到返回 0 */
  probeVideoSeconds(path) {
    return new Promise((resolve) => {
      try {
        const url = this.avatarUrl(path);
        if (!url) { resolve(0); return; }
        const v = document.createElement("video");
        v.preload = "metadata";
        v.muted = true;
        let done = false;
        const fin = (n) => { if (done) return; done = true; try { v.src = ""; v.remove?.(); } catch (e) { } resolve(n); };
        v.onloadedmetadata = () => fin(Number(v.duration) || 0);
        v.onerror = () => fin(0);
        setTimeout(() => fin(0), 3000);
        v.src = url;
      } catch (e) { resolve(0); }
    });
  }

  /* 轮播壁纸（T-07）：选多张，按间隔自动换 */
  async pickCarousel() {
    const f = await chooseFileLike(this.plugin, { multiple: true, title: "挑几张图做轮播壁纸" });
    if (!f) return;
    const arr = Array.isArray(f) ? f : [f];
    if (!arr.length) return;
    try {
      const folder = this.attachDir();
      await this.plugin.ensureFolder(folder);
      const paths = [];
      for (const one of arr) {
        const safe = String(one.name || "img").replace(/[\\/:*?"<>|]/g, "_");
        let p2 = `${folder}/${safe}`;
        if (await this.app.vault.adapter.exists(p2)) p2 = `${folder}/${Date.now()}-${safe}`;
        await this.app.vault.adapter.writeBinary(p2, await one.arrayBuffer());
        paths.push(p2);
      }
      const s = this.plugin.settings;
      s.carouselList = paths;
      s.carouselIndex = 0;
      s.carouselEvery = s.carouselEvery || "open";
      await this.plugin.saveSettings();
      this.layout.photo = paths[0];
      if (this.layout.layers) this.layout.layers.img.on = true;
      this.scheduleSave();
      if (this.stage) this.stage.render();
      new Notice("轮播组已放好，共 " + paths.length + " 张");
    } catch (e) {
      new Notice("建轮播组失败：" + (e && e.message ? e.message : e));
    }
  }

  /* 按设置换下一张轮播图 */
  /* 打开一篇日记时按 carouselEvery 决定要不要换 */
  maybeRotateCarousel() {
    const s = this.plugin.settings;
    const list = Array.isArray(s.carouselList) ? s.carouselList : [];
    if (list.length < 2) return false;
    const every = s.carouselEvery || "open";
    if (every === "day") {
      const today = todayStr();
      if (s.carouselDay === today) return false;
      s.carouselDay = today;
    }
    this.nextCarousel();
    return true;
  }

  /* 轮播定时器（30s / 5m） */
  startCarouselTimer() {
    this.stopCarouselTimer();
    const s = this.plugin.settings;
    const list = Array.isArray(s.carouselList) ? s.carouselList : [];
    if (list.length < 2) return;
    const every = s.carouselEvery || "open";
    const ms = every === "30s" ? 30000 : every === "5m" ? 300000 : 0;
    if (!ms) return;
    this._carouselTimer = setInterval(() => {
      if (this.layout && this.layout.photo) this.nextCarousel();
    }, ms);
  }

  stopCarouselTimer() {
    if (this._carouselTimer) { clearInterval(this._carouselTimer); this._carouselTimer = null; }
  }

  nextCarousel() {
    const s = this.plugin.settings;
    const list = Array.isArray(s.carouselList) ? s.carouselList : [];
    if (list.length < 2) return false;
    s.carouselIndex = ((Number(s.carouselIndex) || 0) + 1) % list.length;
    this.layout.photo = list[s.carouselIndex];
    this.plugin.saveSettings();
    if (this.stage) this.stage.render();
    return true;
  }
  avatarUrl(path) {
    if (!path) return "";
    try {
      if (/^https?:/i.test(path)) return path;
      const f = this.app.metadataCache.getFirstLinkpathDest(normalizePath(path), this.file ? this.file.path : "");
      return f ? this.app.vault.adapter.getResourcePath(f.path) : "";
    } catch (e) { return ""; }
  }
  /* 换封面：先裁剪，再落盘。用户 2026-11-08 撤回「先上传再调」，
     改成跟微信换头像一样——框选完了才存进库里，取消就什么都不写。 */
  async pickCover() {
    const f = await chooseFileLike(this.plugin, { title: "换封面" });
    if (!f) return;
    let tmp = "";
    try {
      tmp = URL.createObjectURL(new Blob([await f.arrayBuffer()]));
    } catch (e) {
      new Notice("这张图读不出来，换一张试试");
      return;
    }
    const h0 = this.layout.coverHeight || this.sx.coverHeight || 160;
    const w0 = (this.el && this.el.clientWidth) || 600;
    openCrop(this.app, {
      url: tmp,
      ratio: w0 / Math.max(h0, 1),
      crop: (this.layout.crops && this.layout.crops.cover) || null,
      title: "裁剪封面（框选完再保存）",
      onCancel: () => { try { URL.revokeObjectURL(tmp); } catch (e) { } new Notice("没换封面"); },
      onOk: async (crop) => {
        try { URL.revokeObjectURL(tmp); } catch (e) { }
        try {
          const folder = this.attachDir();
          await this.plugin.ensureFolder(folder);
          const safe = String(f.name || "cover.png").replace(/[\\/:*?"<>|]/g, "_");
          let path = `${folder}/${safe}`;
          if (await this.app.vault.adapter.exists(path)) path = `${folder}/${Date.now()}-${safe}`;
          await this.app.vault.createBinary(path, await f.arrayBuffer());
          this.layout.cover = path;
          if (!this.layout.coverHeight) this.layout.coverHeight = clamp(this.sx.coverHeight || 160, 60, 320);
          this.layout.crops = this.layout.crops || {};
          if (crop) this.layout.crops.cover = crop; else delete this.layout.crops.cover;
          /* 舞台模式下，图是画在「背景」层上的；不开这一层，设了封面也看不见 */
          if (this.layout.layers && this.layout.layers.bg) this.layout.layers.bg.on = true;
          this.render(); await this.save(true);
          new Notice(this.sx.showStage ? "封面已换上（画在背景层）" : "封面已设置");
        } catch (e) { new Notice("设置封面失败：" + (e && e.message ? e.message : e)); }
      },
    });
  }
  tuneCoverHeight() {
    const el = this.coverEl;
    if (!el) return;
    const startY = { y: 0 };
    const h0 = this.layout.coverHeight || this.sx.coverHeight || 160;
    el.addClass("is-resizing");
    const move = (ev) => {
      const h = clamp(Math.round(h0 + ev.clientY - startY.y), 0, 320);
      el.style.height = `${h}px`;
      this.layout.coverHeight = h;
    };
    const down = (ev) => { startY.y = ev.clientY; };
    const up = () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      el.removeClass("is-resizing");
      this.render(); this.scheduleSave();
    };
    startY.y = h0;
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    new Notice("移动鼠标调整封面高度，松开即保存");
  }

  /* ---------- 封面分屏：整块 / 上下 / 左右，中缝可拖 ----------
   * 用户要求：图片在上、日历自动往下，两者不许重合；
   *          分屏时中缝能拖，拖的是分割线本身，不碰图片和文字。 */
  applySplit(mode) {
    const lay = this.layout.layers || (this.layout.layers = deepClone(DEFAULT_LAYERS));
    const at = clamp(this.sx.splitAt || 58, 20, 80);
    if (mode === "top") {
      lay.bg.on = true; lay.bg.x = 0; lay.bg.y = 0; lay.bg.w = 100; lay.bg.h = at;
      lay.img.on = true; lay.img.x = 0; lay.img.y = 0; lay.img.w = 100; lay.img.h = at;
    } else if (mode === "left") {
      lay.bg.on = true; lay.bg.x = 0; lay.bg.y = 0; lay.bg.w = at; lay.bg.h = 100;
      lay.img.on = true; lay.img.x = 0; lay.img.y = 0; lay.img.w = at; lay.img.h = 100;
    } else {
      lay.bg.on = true; lay.bg.x = 0; lay.bg.y = 0; lay.bg.w = 100; lay.bg.h = 100;
      lay.img.on = false;
    }
    this.sx.splitMode = mode;
    this.render(); this.scheduleSave();
  }

  showSplitMenu() {
    const m = new Menu();
    const add = (k, name) => m.addItem((i) => i.setTitle(name).setChecked((this.sx.splitMode || "whole") === k).onClick(() => this.applySplit(k)));
    add("whole", "整块铺满（一张图打底）");
    add("top", "上下分屏（图在上，可以拖中缝）");
    add("left", "左右分屏（图在左，可以拖中缝）");
    m.addItem((i) => i.setTitle("拖动分割线").onClick(() => this.dragSplit()));
    showMenuAt(m);
  }

  /* 拖分割线：只改 splitAt，改完把 bg/img 的 h（或 w）跟着重算 */
  dragSplit() {
    if ((this.sx.splitMode || "whole") === "whole") { new Notice("先选上下分屏或左右分屏"); return; }
    const horizontal = this.sx.splitMode === "top";
    const stage = this.stageEl;
    const line = stage.querySelector(".gd-split-line");
    if (!line) { new Notice("分割线还没画出来，先刷新一下"); return; }
    let dragging = false;
    const rect = stage.getBoundingClientRect();
    const move = (ev) => {
      if (!dragging) return;
      const p = horizontal
        ? ((ev.clientY - rect.top) / rect.height) * 100
        : ((ev.clientX - rect.left) / rect.width) * 100;
      this.sx.splitAt = clamp(Math.round(p), 20, 80);
      this.applySplit(this.sx.splitMode);
    };
    const up = () => {
      dragging = false;
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      this.scheduleSave();
    };
    line.onpointerdown = (ev) => { ev.preventDefault(); dragging = true; };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", up, true);
    new Notice("拖动那条分割线即可，松手保存");
  }

  /* 拖动封面调整取景位置（就是"选中我想要的那一块"） */
  dragCoverPos() {
    const el = this.coverEl;
    if (!el) return;
    const cur = this.layout.coverPos || "50% 50%";
    const m = /(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(cur);
    let x = m ? parseFloat(m[1]) : 50;
    let y = m ? parseFloat(m[2]) : 50;
    let sx = 0, sy = 0, dragging = false;
    const apply = () => { el.style.backgroundPosition = x + "% " + y + "%"; };
    apply();
    el.addClass("is-panning");
    new Notice("在封面上拖动选位置，松手即保存");
    const down = (ev) => {
      dragging = true; sx = ev.clientX; sy = ev.clientY;
      el.setPointerCapture && el.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    };
    const move = (ev) => {
      if (!dragging) return;
      const rect = el.getBoundingClientRect();
      const dx = ((ev.clientX - sx) / Math.max(rect.width, 1)) * 100;
      const dy = ((ev.clientY - sy) / Math.max(rect.height, 1)) * 100;
      x = clamp(x - dx, 0, 100);
      y = clamp(y - dy, 0, 100);
      sx = ev.clientX; sy = ev.clientY;
      apply();
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      el.removeClass("is-panning");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      this.layout.coverPos = x.toFixed(0) + "% " + y.toFixed(0) + "%";
      this.scheduleSave();
      new Notice("封面位置已保存");
    };
    el.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }
  /* 座右铭：点一下就能改 */
  editMotto() {
    new PromptModal(this.app, "封面座右铭", "写一句想每天看到的话（清空则不显示）", this.layout.motto || this.sx.motto || "", (v) => {
      this.layout.motto = String(v || "").trim();
      this.renderCover(); this.scheduleSave();
    }).open();
  }
  toggleMotto() {
    const on = this.coverWrapEl ? !this.coverWrapEl.hasClass("is-motto") : true;
    this.sx.showMotto = on;
    this.renderCover();
    if (on && !(this.layout.motto || this.sx.motto)) this.editMotto();
  }
  /* 头像：选图 → 正方形框选 → 落盘（跟微信换头像一样） */
  async pickAvatar() {
    const f = await chooseFileLike(this.plugin, { title: "换头像" });
    if (!f) return;
    let tmp = "";
    try { tmp = URL.createObjectURL(new Blob([await f.arrayBuffer()])); }
    catch (e) { new Notice("这张图读不出来，换一张试试"); return; }
    openCrop(this.app, {
      url: tmp,
      ratio: 1,
      crop: this.sx.avatarCrop || null,
      title: "裁剪头像（框选完再保存）",
      onCancel: () => { try { URL.revokeObjectURL(tmp); } catch (e) { } new Notice("没换头像"); },
      onOk: async (crop) => {
        try { URL.revokeObjectURL(tmp); } catch (e) { }
        try {
          const folder = this.attachDir();
          await this.plugin.ensureFolder(folder);
          const safe = String(f.name || "avatar.png").replace(/[\\/:*?"<>|]/g, "_");
          let path = `${folder}/avatar-${safe}`;
          if (await this.app.vault.adapter.exists(path)) path = `${folder}/avatar-${Date.now()}-${safe}`;
          await this.app.vault.createBinary(path, await f.arrayBuffer());
          this.sx.avatar = path;
          this.sx.avatarCrop = crop || null;
          this.sx.showAvatar = true;
          await this.plugin.saveSettings();
          this.renderCover();
          new Notice("头像已设置");
        } catch (e) { new Notice("设置头像失败：" + (e && e.message ? e.message : e)); }
      },
    });
  }

  /* ---------- 头部 ---------- */
  renderHead() {
    const h = this.headEl;
    h.empty();
    const d = parseDate(this.date);
    const info = h.createDiv({ cls: "gd-date-block" });
    info.createDiv({ cls: "gd-daynum", text: pad2(d.getDate()) });
    const meta = info.createDiv({ cls: "gd-date-meta" });
    meta.createDiv({ cls: "gd-date-cn", text: `${d.getMonth() + 1}月 · ${d.getFullYear()}` });
    meta.createDiv({ cls: "gd-week", text: `${weekdayCN(this.date)} · ${this.cells.length} 格` });

    this.toolbarEl = h.createDiv({ cls: "gd-toolbar" });
    const btn = (text, title, cls, fn) => {
      const b = this.toolbarEl.createEl("button", { text, cls: `gd-tbtn ${cls || ""}`, attr: { title } });
      b.onclick = fn;
      return b;
    };
    btn("‹", "前一天", "gd-hide-mobile", () => this.openDay(shiftDate(this.date, -1)));
    btn("今天", "回到今天", "", () => this.openDay(todayStr()));
    btn("›", "后一天", "gd-hide-mobile", () => this.openDay(shiftDate(this.date, 1)));
    btn("＋", "加一个格子", "gd-tbtn-accent", (e) => this.showPlusMenu(e, null));
    btn("粘贴生成", "把纯文本拆成格子（也可直接 Ctrl+V）", "gd-hide-mobile", () => new PasteModal(this.app, this.plugin, "").open());
    btn("模板", "套用格子模板", "gd-hide-mobile", () => new TemplateModal(this.app, this.plugin).open());
    btn(this.previewMode ? "编辑" : "预览", "切换 Markdown 预览 / 编辑", "", () => { this.previewMode = !this.previewMode; this.render(); });
    btn(this.rawMode ? "格子" : "原文", "直接编辑整篇 Markdown 原文（格式可切换）", "gd-hide-mobile", () => { if (this.rawMode) this.exitRaw(); else this.enterRaw(); });
    btn("排布", "竖向 / 横向滚动 / 左右翻页", "gd-hide-mobile", (e) => this.showFlowMenu(e));
    btn("⋯", "更多", "", (e) => this.showViewMenu(e));

    // 旧版「同一天多篇」：主篇 / 壹 / 贰 … 顶部直接切换
    const entries = this.plugin.dayFiles().filter((f) => splitDayKey(f.basename).date === this.date);
    const bar = h.createDiv({ cls: "gd-entry-bar" });
    for (const f of entries) {
      const info2 = splitDayKey(f.basename);
      const ebtn = bar.createEl("button", {
        text: info2.suffix ? `第 ${info2.suffix} 篇` : "主篇",
        cls: "gd-entry-btn" + (f.basename === this.key ? " is-on" : ""),
        attr: { title: `${f.basename}.md` },
      });
      ebtn.onclick = () => this.openDay(f.basename);
    }
    const addEntry = bar.createEl("button", { text: "＋篇", cls: "gd-entry-btn gd-entry-add", attr: { title: "在这一天再写一篇" } });
    addEntry.onclick = () => this.plugin.newEntryFor(this.date);
    this.statusEl = bar.createSpan({ cls: "gd-save-status", text: this.statusText });

    /* 贴纸条放在头部之后统一重建，避免被 head.empty() 清掉 */
    if (this.stickerBarEl && this.stickerBarEl.parentElement) this.stickerBarEl.remove();
    this.stickerBarEl = this.scrollEl.createDiv({ cls: "gd-sticker-bar" });
    this.headEl.after(this.stickerBarEl);

    /* 顶栏项目 / 主题切换（v4）——用户要「一个主题管多个项目，顶部栏切换」 */
    try {
      if (this.projectBarEl && this.projectBarEl.parentElement) this.projectBarEl.remove();
      const bar2 = this.scrollEl.createDiv({ cls: "gd-project-bar" });
      const s0 = this.plugin.settings;
      const tchip = bar2.createEl("button", { cls: "gd-project-chip is-on", text: "主题：" + (s0.activeTheme || "散项") });
      tchip.onclick = (e2) => this.plugin.showThemeMenu(e2);
      const pchip = bar2.createEl("button", { cls: "gd-project-chip", text: "项目：" + (s0.projectName || "日记") });
      pchip.onclick = async (e2) => {
        new PromptModal(this.app, "切换项目", "项目名字（同一个主题可以管多个项目）", s0.projectName || "日记", async (v) => {
          await this.plugin.switchProject(String(v || "").trim());
        }).open();
      };
      this.headEl.after(bar2);
      this.projectBarEl = bar2;
    } catch (e) { /* 项目条出错不影响主界面 */ }
  }

  /* ---------- 整篇贴纸 ---------- */
  renderStickerBar() {
    const el = this.stickerBarEl;
    if (!el) return;
    el.empty();
    const list = (this.layout.stickers || []);
    el.toggleClass("is-empty", !list.length);
    for (let i = 0; i < list.length; i++) {
      const s = el.createSpan({ cls: "gd-sticker", text: list[i], attr: { title: "点一下去掉" } });
      s.onclick = () => { this.layout.stickers = list.filter((_, j) => j !== i); this.render(); this.scheduleSave(); };
    }
    const add = el.createEl("button", { cls: "gd-sticker-add", text: "+ 贴纸", attr: { title: "给这一天加贴纸" } });
    add.onclick = (e) => this.pickSticker(e, null);
  }
  pickSticker(evt, cell) {
    const menu = new Menu();
    for (const [key, name, list] of STICKER_GROUPS) {
      menu.addItem((i) => i.setTitle(name).setIcon("smile").onClick(() => {
        const sub = new Menu();
        for (const s of list) {
          sub.addItem((x) => x.setTitle(s).onClick(() => this.applySticker(s, cell)));
        }
        sub.addItem((x) => x.setTitle("用文件里的动图").setIcon("image").onClick(() => this.insertMedia(cell, true)));
        showMenuAt(sub, evt);
      }));
    }
    menu.addSeparator();
    if (cell && cell.sticker) {
      menu.addItem((i) => i.setTitle("去掉这格的贴纸").setIcon("x").onClick(() => this.applySticker("", cell)));
    }
    showMenuAt(menu, evt);
  }
  applySticker(s, cell) {
    if (cell) {
      cell.sticker = s;
    } else {
      const list = (this.layout.stickers || []).slice();
      if (s && list.length < 5) list.push(s);
      this.layout.stickers = list;
    }
    this.render(); this.scheduleSave();
  }

  /* ---------- 排布切换 ---------- */
  showFlowMenu(evt) {
    const m = new Menu();
    const cur = this.sx.flow || "vertical";
    for (const [v, n] of GRID_FLOWS) {
      m.addItem((i) => i.setTitle(`${v === cur ? "● " : "　"}${n}`).setIcon(v === "vertical" ? "arrow-down" : "arrow-right").onClick(async () => {
        this.sx.flow = v;
        await this.plugin.saveSettings();
        this.plugin.refreshAll();
        new Notice(v === "vertical" ? "已切回上下滚" : v === "horizontal" ? "已切到左右滚（Shift+滚轮也行）" : "已切到左右翻页");
      }));
    }
    m.addSeparator();
    m.addItem((i) => i.setTitle(`每格宽度 ${this.sx.cellWidth}px → 调大`).setIcon("move-horizontal").onClick(async () => {
      this.sx.cellWidth = clamp((this.sx.cellWidth || 260) + 40, 190, 560);
      await this.plugin.saveSettings(); this.plugin.refreshAll();
      new Notice(`每格宽度 ${this.sx.cellWidth}px`);
    }));
    m.addItem((i) => i.setTitle(`每格宽度 ${this.sx.cellWidth}px → 调小`).setIcon("move-horizontal").onClick(async () => {
      this.sx.cellWidth = clamp((this.sx.cellWidth || 260) - 40, 190, 560);
      await this.plugin.saveSettings(); this.plugin.refreshAll();
      new Notice(`每格宽度 ${this.sx.cellWidth}px`);
    }));
    m.addItem((i) => i.setTitle(`横向时每屏 ${this.sx.flowRows} 行 → 切换`).setIcon("rows").onClick(async () => {
      this.sx.flowRows = clamp((this.sx.flowRows || 3) >= 6 ? 1 : (this.sx.flowRows || 3) + 1, 1, 6);
      await this.plugin.saveSettings(); this.plugin.refreshAll();
    }));
    m.addItem((i) => i.setTitle(`翻页一屏 ${this.sx.pageCols} 列 → 切换`).setIcon("columns").onClick(async () => {
      this.sx.pageCols = clamp((this.sx.pageCols || 3) >= 6 ? 1 : (this.sx.pageCols || 3) + 1, 1, 6);
      await this.plugin.saveSettings(); this.plugin.refreshAll();
    }));
    showMenuAt(m, evt);
  }

  /* ---------- 翻页指示 ---------- */
  renderPageBar() {
    const el = this.pageBarEl;
    if (!el) return;
    el.empty();
    const flow = this.sx.flow || "vertical";
    if (flow !== "paged") { el.addClass("is-hidden"); return; }
    el.removeClass("is-hidden");
    const prev = el.createEl("button", { text: "‹", cls: "gd-page-btn", attr: { title: "上一页" } });
    prev.onclick = () => this.pageTo(-1);
    this.pageLabelEl = el.createSpan({ cls: "gd-page-label", text: "1 / 1" });
    const next = el.createEl("button", { text: "›", cls: "gd-page-btn", attr: { title: "下一页" } });
    next.onclick = () => this.pageTo(1);
    const fit = el.createEl("button", { text: "全宽", cls: "gd-page-btn", attr: { title: "把每页列数设成刚好铺满" } });
    fit.onclick = async () => {
      const w = this.gridEl ? this.gridEl.parentElement.clientWidth : 1200;
      const cw = clamp(this.sx.cellWidth || 260, 190, 560);
      this.sx.pageCols = clamp(Math.max(1, Math.floor((w - 40) / (cw + clamp(this.sx.gap, 0, 48)))), 1, 6);
      await this.plugin.saveSettings(); this.plugin.refreshAll();
    };
    this.updatePageIndicator();
  }
  pageWidth() {
    if (!this.gridEl) return 1;
    const cw = clamp(this.sx.cellWidth || 260, 190, 560) + clamp(this.sx.gap, 0, 48);
    return Math.max(1, Math.round(cw * clamp(this.sx.pageCols || 3, 1, 6)));
  }
  updatePageIndicator() {
    if (!this.pageLabelEl || !this.scrollEl) return;
    const pw = this.pageWidth();
    const total = Math.max(1, Math.ceil((this.gridEl.scrollWidth - 8) / pw));
    const cur = clamp(Math.round(this.scrollEl.scrollLeft / pw) + 1, 1, total);
    this.pageNo = cur; this.pageTotal = total;
    this.pageLabelEl.textContent = `${cur} / ${total}`;
  }
  pageTo(delta) {
    const pw = this.pageWidth();
    const target = (this.pageNo - 1 + delta) * pw;
    if (this.scrollEl.scrollTo) this.scrollEl.scrollTo({ left: target, behavior: "smooth" });
    else this.scrollEl.scrollLeft = target;
  }

  /* ---------- 更多菜单 ---------- */
  setStatus(t) {
    this.statusText = t;
    if (this.statusEl) this.statusEl.textContent = t;
  }
  /* 批量把这个月/最近 N 天的皮肤与边框统一换掉 */
  /* 图片层：一张 / 轮播 / 视频 / 动图 */
  showPhotoMenu(evt) {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("放一张图 / 动图 / 视频…").setIcon("image").onClick(() => this.pickPhoto()));
    menu.addItem((i) => i.setTitle("选一组图做轮播…").setIcon("images").onClick(() => this.pickCarousel()));
    menu.addItem((i) => i.setTitle("换下一张（轮播组）").setIcon("refresh-cw").onClick(() => {
      if (!this.nextCarousel()) new Notice("还没有轮播组");
    }));
    menu.addSeparator();
    const s = this.plugin.settings;
    menu.addItem((i) => i.setTitle(s.videoEnabled ? "✓ 允许视频" : "允许视频（桌面端）").setIcon("video")
      .onClick(async () => { s.videoEnabled = !s.videoEnabled; await this.plugin.saveSettings(); this.stage?.render(); }));
    menu.addItem((i) => i.setTitle("去掉这张图").setIcon("trash").onClick(async () => {
      this.layout.photo = "";
      if (this.layout.layers) this.layout.layers.img.on = false;
      this.scheduleSave();
      this.stage?.render();
    }));
    if (evt) showMenuAt(menu, evt); else menu.showAtMouseEvent(new MouseEvent("click"));
  }

  showBatchSkinMenu() {
    const menu = new Menu();
    const skins = THEMES;
    for (const [key, name] of skins) {
      menu.addItem((i) => i.setTitle("全部换成：" + name).setIcon("palette").onClick(async () => {
        await this.plugin.applySkinToAll(key, "", 0);
      }));
    }
    menu.addSeparator();
    const borders = BORDERS;
    for (const [key, name] of borders) {
      menu.addItem((i) => i.setTitle("边框全换：" + name).setIcon("square").onClick(async () => {
        await this.plugin.applySkinToAll("", key, 0);
      }));
    }
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("只改最近 30 天").setIcon("calendar").onClick(async () => {
      await this.plugin.applySkinToAll(this.plugin.settings.theme, this.plugin.settings.defaultBorder, 30);
    }));
    showMenuAt(menu, { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
  }
  showViewMenu(evt) {
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("今天是……（跳转日期）").setIcon("calendar").onClick(() => {
      new PromptModal(this.app, "跳转到日期", "格式 YYYY-MM-DD", this.date, (v) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) this.openDay(v.trim());
        else new Notice("日期格式不对");
      }).open();
    }));
    menu.addItem((i) => i.setTitle("把当前布局存为模板").setIcon("save").onClick(() => this.saveAsTemplate()));
    menu.addItem((i) => i.setTitle("查看版本历史 / 恢复").setIcon("history").onClick(() => new SnapshotModal(this.app, this.plugin, this.file).open()));
    menu.addItem((i) => i.setTitle("打开日历").setIcon("calendar-days").onClick(() => this.plugin.openCalendar()));
    menu.addItem((i) => i.setTitle("批量设置封面…").setIcon("images").onClick(() => this.plugin.openBatchCover()));
    menu.addItem((i) => i.setTitle("批量选中 / 全部套用皮肤").setIcon("palette").onClick(() => this.showBatchSkinMenu()));
    menu.addItem((i) => i.setTitle("重新载入文件").setIcon("refresh-cw").onClick(() => this.reload()));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle(`本篇列数 ${this.gridCols} → ${this.gridCols >= 6 ? 1 : this.gridCols + 1}`).setIcon("columns").onClick(async () => {
      this.gridCols = this.gridCols >= 6 ? 1 : this.gridCols + 1;
      for (const c of this.cells) c.cs = clamp(c.cs, 1, this.gridCols);
      this.render();
      await this.save(true);
      new Notice(`本篇改为 ${this.gridCols} 列（跟随文件同步到手机）`);
    }));
    menu.addItem((i) => i.setTitle("切换页面风格").setIcon("palette").onClick((e2) => this.showThemeMenu(e2 || evt)));
    menu.addItem((i) => i.setTitle("主题：选择 / 保存 / 回滚").setIcon("palette").onClick((e2) => this.plugin.showThemeMenu(e2 || evt)));
    menu.addItem((i) => i.setTitle("换一张图 / 轮播 / 视频").setIcon("image").onClick((e2) => this.showPhotoMenu(e2 || evt)));
    menu.addItem((i) => i.setTitle("切换格子边框").setIcon("square").onClick((e2) => this.showBorderMenu(e2 || evt, null)));
    menu.addItem((i) => i.setTitle(this.rawMode ? "切回九宫格" : "打开原文 MD（可切换格式）").setIcon("code").onClick(() => { if (this.rawMode) this.exitRaw(); else this.enterRaw(); }));
    menu.addItem((i) => i.setTitle("在 Obsidian 中打开这篇 md").setIcon("file-text").onClick(() => this.app.workspace.getLeaf(true).openFile(this.file)));
    showMenuAt(menu, evt);
  }
  showThemeMenu(evt) {
    const m = new Menu();
    for (const [v, n] of THEMES) {
      m.addItem((i) => i.setTitle(`${this.sx.theme === v ? "● " : "　"}${n}`).onClick(async () => {
        this.sx.theme = v;
        await this.plugin.saveSettings();
        this.plugin.refreshAll();
      }));
    }
    showMenuAt(m, evt);
  }
  showBorderMenu(evt, cell) {
    const m = new Menu();
    for (const [v, n] of BORDERS) {
      const cur = cell ? (cell.border || this.layout.border) : this.layout.border;
      m.addItem((i) => i.setTitle(`${cur === v ? "● " : "　"}${n}`).onClick(() => {
        if (cell) { cell.border = v; this.render(); this.scheduleSave(); }
        else { this.layout.border = v; this.render(); this.scheduleSave(); }
      }));
    }
    m.addSeparator();
    m.addItem((i) => i.setTitle("设为新格子的默认边框").setIcon("settings").onClick(async () => {
      this.sx.defaultBorder = cell ? (cell.border || this.layout.border) : this.layout.border;
      await this.plugin.saveSettings();
      new Notice("已设为默认边框");
    }));
    showMenuAt(m, evt);
  }

  /* ---------- 格子右上角「＋」 ---------- */
  showPlusMenu(evt, cell) {
    const m = new Menu();
    m.addItem((i) => i.setTitle("在下面加一格").setIcon("plus").onClick(() => this.addCell(cell, "below")));
    m.addItem((i) => i.setTitle("在右边加一格").setIcon("arrow-right").onClick(() => this.addCell(cell, "right")));
    m.addSeparator();
    m.addItem((i) => i.setTitle("插入图片").setIcon("image").onClick(() => this.insertMedia(cell, false)));
    m.addItem((i) => i.setTitle("插入动图（GIF）").setIcon("film").onClick(() => this.insertMedia(cell, true)));
    m.addItem((i) => i.setTitle("插入贴纸").setIcon("smile").onClick((e2) => this.pickSticker(e2 || evt, cell)));
    m.addItem((i) => i.setTitle("插入片段…").setIcon("text").onClick((e2) => {
      const sub = new Menu();
      for (const [n, t] of CONTENT_SNIPPETS) {
        sub.addItem((x) => x.setTitle(n).onClick(() => this.insertText(cell, t)));
      }
      showMenuAt(sub, e2 || evt);
    }));
    if (cell) {
      m.addSeparator();
      m.addItem((i) => i.setTitle("格子设置（大小 / 颜色 / 顺序）").setIcon("more-horizontal").onClick(() => this.showCellMenu(evt, cell)));
      m.addItem((i) => i.setTitle("删除这一格").setIcon("trash").onClick(() => {
        new ConfirmModal(this.app, "删除格子？", `「${cell.title}」的内容会一起删除。删除前会自动存快照，可以用「撤销」或时间线恢复。`, () => {
          this.cells = this.cells.filter((c) => c.id !== cell.id);
          this.render(); this.scheduleSave();
        }).open();
      }));
    }
    showMenuAt(m, evt);
  }
  insertText(cell, text) {
    if (cell) {
      cell.content = (cell.content || "") + text;
      this.render(); this.scheduleSave();
      return;
    }
    const c = { id: uid(), title: "新格子", content: text.trim(), cs: 1, rs: 1, h: 0, accent: "", collapsed: false, border: "", sticker: "" };
    this.cells.push(c);
    this.render(); this.scheduleSave();
  }
  /* 插图 / 插动图：拖拽不行时也能从菜单进 */
  async insertMedia(cell, animOnly) {
    const f = await chooseFileLike(this.plugin, {
      title: animOnly ? "插一张动图" : "插一张图",
      accept: animOnly ? "image/gif,image/webp,image/apng,.gif,.webp,.apng" : "image/*,video/*",
    });
    if (!f) return;
    try {
      const limitMB = clamp(this.sx.animMaxMB || 8, 1, 200);
      if (isAnimName(f.name) && f.size > limitMB * 1024 * 1024) {
        new Notice(`这个动图有 ${(f.size / 1048576).toFixed(1)}MB，超过 ${limitMB}MB 可能会卡。仍然可以插入。`, 6000);
      }
      const folder = this.attachDir();
      await this.plugin.ensureFolder(folder);
      const safe = f.name.replace(/[\\/:*?"<>|]/g, "_");
      let path = `${folder}/${safe}`;
      if (await this.app.vault.adapter.exists(path)) path = `${folder}/${Date.now()}-${safe}`;
      await this.app.vault.createBinary(path, await f.arrayBuffer());
      const md = `![[${safe}|420]]`;
      if (cell) {
        cell.content = (cell.content || "") + (cell.content && !cell.content.endsWith("\n") ? "\n" : "") + md;
      } else {
        this.cells.push({ id: uid(), title: "图", content: md, cs: 1, rs: 1, h: 0, accent: "", collapsed: false, border: "", sticker: "" });
      }
      this.render(); await this.save(true);
      new Notice(isAnimName(safe) ? "已插入动图，它会一直播放" : "已插入图片");
    } catch (e) { new Notice("插入失败：" + e.message); }
  }

  /* ---------- 单格 ---------- */
  renderCell(cell, index) {
    const s = this.plugin.settings;
    const flow = s.flow || "vertical";
    const isH = flow !== "vertical";
    const cols = (s.mobileOneColumn && IS_MOBILE) ? 1 : clamp(this.gridCols, 1, 6);
    const cs = clamp(cell.cs, 1, cols);
    const border = cell.border || this.layout.border || s.defaultBorder || "hair";
    const isCenter = s.centerCell && this.cells.length >= 9 && index === 4;
    const el = this.gridEl.createDiv({
      cls: "gd-cell" + (cell.collapsed ? " is-collapsed" : "") + (cell.accent ? " has-accent" : "")
        + (cell.sticker ? " has-sticker" : "") + (isCenter ? " is-center" : ""),
    });
    el.dataset.id = cell.id;
    el.dataset.border = border;
    el.style.gridColumn = `span ${cs}`;
    el.style.gridRow = `span ${clamp(cell.rs, 1, 6)}`;
    if (!isH) {
      el.style.minHeight = cell.h ? `${cell.h}px` : `${clamp(cell.rs, 1, 6) * clamp(s.rowHeight, 80, 600) + (clamp(cell.rs, 1, 6) - 1) * clamp(s.gap, 0, 48)}px`;
    } else if (cell.h) {
      el.style.height = `${cell.h}px`;
    }
    if (cell.accent) el.style.setProperty("--gd-cell-accent", cell.accent);

    const head = el.createDiv({ cls: "gd-cell-head" });
    const ti = head.createEl("input", { cls: "gd-cell-title", attr: { placeholder: "格子标题（可以是一句问句）", spellcheck: "false" } });
    ti.value = cell.title;
    ti.oninput = () => { cell.title = ti.value; this.scheduleSave(); };
    if (cell.sticker) {
      const st = head.createSpan({ cls: "gd-cell-sticker", text: cell.sticker, attr: { title: "点一下换贴纸" } });
      st.onclick = (e) => this.pickSticker(e, cell);
    }
    head.createSpan({ cls: "gd-cell-dim", text: cs > 1 || cell.rs > 1 ? `${cs}×${cell.rs}` : "" });
    const more = head.createEl("button", { cls: "gd-cell-more", text: "⋯", attr: { title: "格子设置" } });
    more.onclick = (e) => this.showCellMenu(e, cell);
    const plus = head.createEl("button", { cls: "gd-cell-plus", text: "＋", attr: { title: "加一格 / 插图 / 贴纸" } });
    plus.onclick = (e) => this.showPlusMenu(e, cell);

    let taRef = null;
    this.renderFmtBar(el, cell, () => taRef);
    const body = el.createDiv({ cls: "gd-cell-body" });
    if (this.previewMode) {
      const pv = body.createDiv({ cls: "gd-cell-preview" });
      if (cell.content.trim()) this.renderMarkdown(pv, cell.content).then(() => this.bindImages(pv, cell));
      else pv.createDiv({ cls: "gd-cell-placeholder", text: this.emptyHint(index) });
    } else {
      const ta = body.createEl("textarea", {
        cls: "gd-cell-editor",
        attr: { placeholder: this.emptyHint(index), spellcheck: "false" },
      });
      taRef = ta;
      ta.value = cell.content;
      ta.onfocus = () => { this._editStart = { id: cell.id, value: ta.value }; el.addClass("is-editing"); };
      ta.onblur = () => { this.commitCellEdit(cell, ta.value); el.removeClass("is-editing"); };
      ta.oninput = () => {
        cell.content = ta.value;
        this.setStatus("编辑中");
        this.scheduleSave();
        this.tickWords(cell, el);
        /* 改一格其他格跟随：其它同名格的内容实时更新（不重绘，避免抢焦点） */
        if (this.plugin.settings.autoFollowCells) {
          const nk = normHeadKey(cell.title || "");
          if (nk) {
            for (const c of this.cells) {
              if (c.id === cell.id || normHeadKey(c.title || "") !== nk) continue;
              c.content = ta.value;
              const other = this.gridEl.querySelector('.gd-cell[data-id="' + c.id + '"] .gd-cell-editor');
              if (other && other !== ta) other.value = ta.value;
            }
          }
        }
      };
      ta.onkeydown = (e) => {
        if (e.key === "Tab") { e.preventDefault(); const p = ta.selectionStart; ta.setRangeText("  ", p, p, "end"); }
      };
      /* 直接把图片/动图拖进格子 */
      ta.addEventListener("dragover", (e) => { if (e.dataTransfer && e.dataTransfer.types.includes("Files")) { e.preventDefault(); el.addClass("is-drop"); } });
      ta.addEventListener("dragleave", () => el.removeClass("is-drop"));
      ta.addEventListener("drop", async (e) => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        e.preventDefault(); e.stopPropagation();
        el.removeClass("is-drop");
        await this.dropFilesInto(cell, files);
      });
    }
    /* 编辑态也把图片显示出来：textarea 永远不会渲染 ![[图]]，
     * 用户看到的是一串源码，就以为"图片坏了"。这里在格子底部补一条缩略图。 */
    if (!this.previewMode) this.renderCellImages(el, cell);
    if (s.showWordTicker) el.createDiv({ cls: "gd-cell-ticker" });

    /* v3.21：四角手柄（用户：四个角都能拉，两种模式）。
       linked = 拖任意一角，整张表一起变高 / 变宽；single = 只改这一格占几列几行。 */
    const gripCorners = IS_MOBILE ? ["se"] : ["nw", "ne", "sw", "se"];
    for (const cn of gripCorners) {
      const grip = el.createDiv({ cls: "gd-cell-grip gd-grip-" + cn, attr: { title: "拖动调整大小" } });
      grip.addEventListener("pointerdown", (e) => this.beginResize(e, cell, el, cn));
    }

    if (!IS_MOBILE) {
      head.draggable = true;
      head.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/gd-cell", cell.id); el.addClass("is-dragging"); });
      head.addEventListener("dragend", () => el.removeClass("is-dragging"));
      el.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("text/gd-cell")) { e.preventDefault(); el.addClass("is-drop"); } });
      el.addEventListener("dragleave", () => el.removeClass("is-drop"));
      el.addEventListener("drop", (e) => {
        const from = e.dataTransfer.getData("text/gd-cell");
        if (!from) return;
        e.preventDefault(); el.removeClass("is-drop");
        const a = this.cells.findIndex((c) => c.id === from), b = this.cells.findIndex((c) => c.id === cell.id);
        if (a >= 0 && b >= 0 && a !== b) {
          const [m] = this.cells.splice(a, 1);
          this.cells.splice(b, 0, m);
          this.render(); this.scheduleSave();
        }
      });
    }
  }
  /* ---------- 原文（Markdown）模式 ---------- */
  async enterRaw() {
    if (!(this.file instanceof TFile)) { new Notice("还没有这个文件"); return; }
    try { this._rawText = await this.app.vault.read(this.file); } catch (e) { this._rawText = ""; }
    this._rawDirty = false;
    this.rawMode = true;
    this.render();
  }
  async exitRaw() {
    await this.saveRaw();
    this.rawMode = false;
    await this.reload();
  }
  renderRaw() {
    const g = this.gridEl;
    g.empty();
    g.addClass("is-raw");
    g.style.gridTemplateColumns = "";
    g.style.gridTemplateRows = "";
    g.style.gridAutoFlow = "";
    g.style.gridAutoColumns = "";
    g.style.width = "";
    const wrap = g.createDiv({ cls: "gd-raw" });
    const bar = wrap.createDiv({ cls: "gd-raw-bar" });
    bar.createSpan({ text: "Markdown 原文 · 直接改整篇" });
    const b1 = bar.createEl("button", { text: "回到九宫格", cls: "gd-tbtn gd-tbtn-accent" });
    b1.onclick = () => this.exitRaw();
    const b2 = bar.createEl("button", { text: "立即保存", cls: "gd-tbtn" });
    b2.onclick = () => this.saveRaw(true);
    const ta = wrap.createEl("textarea", { cls: "gd-raw-ta", attr: { spellcheck: "false" } });
    ta.value = this._rawText || "";
    ta.oninput = () => { this._rawText = ta.value; this._rawDirty = true; this.setStatus("原文编辑中"); };
    ta.onblur = () => this.saveRaw();
    this._rawTa = ta;
    this.setStatus(this._rawDirty ? "原文未保存" : "原文 · 已同步");
  }
  async saveRaw(force) {
    if (!this._rawDirty && !force) return;
    if (!(this.file instanceof TFile)) return;
    try {
      const cur = await this.app.vault.read(this.file);
      if (cur === this._rawText) { this._rawDirty = false; this.setStatus("已保存"); return; }
      this.plugin.history.pushUndo(this.file, cur, "原文编辑");
      await this.plugin.history.snapshot(this.file, "自动", false);
      await this.app.vault.modify(this.file, this._rawText);
      this._rawDirty = false;
      this.setStatus("已保存 · 原文");
      this.plugin.notifyRefresh();
    } catch (e) { new Notice("保存失败：" + e.message); }
  }

  emptyHint(index) {
    if (!this.sx.showPromptHint) return "（空）";
    const set = PROMPT_SETS[this.sx.promptSet] || PROMPT_SETS["日间"];
    const q = set[index % set.length];
    return `写点什么…（${q}？）`;
  }
  tickWords(cell, el) {
    const t = el.querySelector(".gd-cell-ticker");
    if (!t) return;
    const n = (cell.content || "").length;
    t.style.setProperty("--gd-p", `${clamp(n / 400, 0, 1)}`);
  }
  async dropFilesInto(cell, files) {
    for (const f of Array.from(files).slice(0, 8)) {
      try {
        const folder = this.attachDir();
        await this.plugin.ensureFolder(folder);
        const safe = (f.name || "paste.png").replace(/[\\/:*?"<>|]/g, "_");
        let path = `${folder}/${safe}`;
        if (await this.app.vault.adapter.exists(path)) path = `${folder}/${Date.now()}-${safe}`;
        await this.app.vault.createBinary(path, await f.arrayBuffer());
        const md = f.type && f.type.startsWith("image") ? `![[${safe}|420]]` : `[[${safe}]]`;
        cell.content = (cell.content || "") + (cell.content && !cell.content.endsWith("\n") ? "\n" : "") + md;
      } catch (e) { new Notice("拖入失败：" + e.message); }
    }
    this.render(); await this.save(true);
  }

  /* 旧版的格子格式条：粗体 / 斜体 / 删除线 / 高亮 / 文字颜色 / 插图 / 动图 / 附件 */
  renderFmtBar(el, cell, getTa) {
    const fmt = el.createDiv({ cls: "gd-cell-fmt" });
    const apply = (before, after) => {
      const ta = getTa();
      if (!ta) { new Notice("先切到编辑模式"); return; }
      const s = ta.selectionStart, e = ta.selectionEnd;
      const sel = ta.value.slice(s, e) || "文字";
      ta.setRangeText(before + sel + after, s, e, "select");
      cell.content = ta.value;
      this.setStatus("编辑中"); this.scheduleSave();
      ta.focus();
    };
    const btn = (text, title, fn) => {
      const b = fmt.createEl("button", { text, cls: "gd-fmt-btn", attr: { title } });
      b.onmousedown = (e) => e.preventDefault(); // 别让按钮抢走文本选区
      b.onclick = fn;
      return b;
    };
    btn("B", "粗体 **文字**", () => apply("**", "**"));
    btn("I", "斜体 *文字*", () => apply("*", "*"));
    btn("S", "删除线 ~~文字~~", () => apply("~~", "~~"));
    btn("==", "高亮 ==文字==", () => apply("==", "=="));
    btn("色", "文字颜色", (e) => {
      const cm = new Menu();
      for (const [n, v] of [["墨灰", "#4a4a4a"], ["胭脂", "#b3524b"], ["陶土", "#c2704f"], ["琥珀", "#c99a3e"], ["芥末", "#9a9b4a"], ["薄荷", "#5b8c6e"], ["青瓷", "#5f9b9b"], ["雾蓝", "#6b8eb3"], ["靛青", "#4f6fa8"], ["浅紫", "#9a7bb0"], ["樱花", "#c98ba0"], ["石灰", "#8d8a7d"]]) {
        cm.addItem((x) => x.setTitle(n).onClick(() => apply(`<span style="color:${v}">`, "</span>")));
      }
      showMenuAt(cm, e);
    });
    btn("图", "插入图片", () => this.insertMedia(cell, false));
    btn("动", "插入动图（GIF / WebP）", () => this.insertMedia(cell, true));
    btn("附", "插入附件（PDF / 音频 / 任意文件）", () => this.insertAttachment(cell, getTa(), "file"));
    return fmt;
  }
  async insertAttachment(cell, ta, kind) {
    if (!ta) { new Notice("先切到编辑模式"); return; }
    const f = kind === "image"
      ? await chooseFileLike(this.plugin, { title: "插一张图" })
      : await chooseLocalFile({ accept: undefined, title: "选一个附件" });
    if (!f) return;
    try {
      const folder = this.attachDir();
      await this.plugin.ensureFolder(folder);
      const safe = f.name.replace(/[\\/:*?"<>|]/g, "_");
      let path = `${folder}/${safe}`;
      if (await this.app.vault.adapter.exists(path)) path = `${folder}/${Date.now()}-${safe}`;
      await this.app.vault.createBinary(path, await f.arrayBuffer());
      const md = kind === "image" ? `![[${safe}|400]]` : `[[${safe}]]`;
      const p = ta.selectionStart;
      ta.setRangeText(md, p, p, "end");
      cell.content = ta.value;
      await this.save(true);
      new Notice(kind === "image" ? "已插入图片（预览模式可拖动改宽度）" : "已插入附件");
    } catch (e) { new Notice("插入失败：" + e.message); }
  }
  /* 预览模式里拖动图片改宽度，写回 ![[图|宽]] */
  bindImages(root, cell) {
    for (const img of Array.from(root.querySelectorAll("img"))) {
      const name = (img.getAttribute("src") || "").split("/").pop();
      if (!name) continue;
      img.style.cursor = "ew-resize";
      img.setAttribute("title", "拖动调整图片宽度");
      if (isAnimName(name)) {
        img.classList.add("gd-anim");
        img.dataset.gdAnim = "1";
      }
      img.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const x0 = e.clientX, w0 = img.getBoundingClientRect().width;
        let w = w0;
        const move = (ev) => { w = Math.max(60, Math.round(w0 + ev.clientX - x0)); img.style.width = `${w}px`; };
        const up = () => {
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", up);
          if (Math.abs(w - w0) < 3) return; // 只是点了一下，别改宽度
          const re = new RegExp(`(!\\[\\[${escapeRe(decodeURIComponent(name))})(?:\\|\\d+)?(\\]\\])`, "g");
          cell.content = cell.content.replace(re, `$1|${w}$2`);
          this.setStatus("图片宽度已保存"); this.scheduleSave();
        };
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
      });
    }
  }

  /* 旧版每格独立的撤销 / 重做（与整篇的快照撤回是两套） */
  /* 格子里的图片就地预览：把 ![[图]] 与 ![a](b) 都认出来，渲染成缩略图 */
  renderCellImages(el, cell) {
    const text = cell.content || "";
    const found = [];
    const re = /!\[\[([^\]|#]+?)(?:\|([^\]]*))?\]\]|!\[([^\]]*)\]\(([^)\s]+)\)/g;
    let m;
    while ((m = re.exec(text))) {
      const target = (m[1] || m[4] || "").trim();
      if (!target) continue;
      if (!/^https?:/i.test(target) && !/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(target)) continue;
      found.push(target);
      if (found.length >= 8) break;
    }
    if (!found.length) return;
    const strip = el.createDiv({ cls: "gd-cell-imgs" });
    for (const target of found) {
      const url = this.plugin.thumbUrl ? this.plugin.thumbUrl(target) : "";
      const box = strip.createDiv({ cls: "gd-cell-img" + (url ? "" : " is-broken") });
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = target.split("/").pop();
        img.addClass("gd-cell-img-el");
        box.appendChild(img);
        box.setAttribute("title", "点一下看大图");
        box.onclick = (e) => { e.stopPropagation(); this.showImage(url, img.alt); };
      } else {
        box.setText("图丢了：" + target.split("/").pop());
        box.setAttribute("title", "这个文件找不到（常见原因：被回收站改名加了 .trashed- 前缀）。右键 → 修复断链图片 可以修。");
        box.onclick = (e) => { e.stopPropagation(); this.plugin.openRepairLinks(); };
      }
    }
  }

  /* 点缩略图看大图，不跳转、不占标签页 */
  showImage(url, name) {
    let box = document.querySelector(".gd-img-view");
    if (box) box.remove();
    box = document.createElement("div");
    box.addClass("gd-img-view");
    const img = document.createElement("img");
    img.src = url;
    img.addClass("gd-img-view-el");
    box.appendChild(img);
    const cap = document.createElement("div");
    cap.addClass("gd-img-view-cap");
    cap.setText(name || "");
    box.appendChild(cap);
    box.addEventListener("click", () => box.remove());
    document.body.appendChild(box);
    const esc = (e) => { if (e.key === "Escape") { box.remove(); window.removeEventListener("keydown", esc); } };
    window.addEventListener("keydown", esc);
  }

  /* 「改一格其他格跟随」：把这一格的标题 + 内容同步到其它同名格子。
   * 只在 autoFollowCells 打开时生效；不同名的不动，避免误伤。 */
  syncCellToNamesakes(cell) {
    if (!this.plugin.settings.autoFollowCells) return 0;
    const key = normHeadKey(cell.title || "");
    if (!key) return 0;
    let n = 0;
    for (const c of this.cells) {
      if (c.id === cell.id) continue;
      if (normHeadKey(c.title || "") !== key) continue;
      if (c.content !== cell.content) { c.content = cell.content; n++; }
    }
    return n;
  }
  commitCellEdit(cell, value) {
    if (!this._editStart || this._editStart.id !== cell.id) return;
    if (this._editStart.value !== value) {
      const h = this.cellHist.get(cell.id) || { undo: [], redo: [] };
      h.undo.push(this._editStart.value);
      if (h.undo.length > 30) h.undo.shift();
      h.redo.length = 0;
      this.cellHist.set(cell.id, h);
    }
    this._editStart = null;
  }
  stepCell(cell, dir) {
    const h = this.cellHist.get(cell.id);
    const ta = this.gridEl.querySelector(`.gd-cell[data-id="${cell.id}"] .gd-cell-editor`);
    if (!ta) { new Notice("先切到编辑模式"); return; }
    if (!h) { new Notice("这个格子还没有可撤销的改动"); return; }
    if (dir < 0) {
      if (!h.undo.length) { new Notice("已经到最早的一步"); return; }
      h.redo.push(cell.content); cell.content = h.undo.pop();
    } else {
      if (!h.redo.length) { new Notice("已经到最新的一步"); return; }
      h.undo.push(cell.content); cell.content = h.redo.pop();
    }
    ta.value = cell.content;
    this.setStatus("编辑中"); this.scheduleSave();
  }
  async openWholeFile(cell) {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.openFile(this.file);
    const ed = leaf.view && leaf.view.editor;
    if (ed && cell) {
      try {
        const mark = "#".repeat(clamp(this.plugin.settings.headingLevel || 2, 2, 4));
        const lines = ed.getValue().split("\n");
        const i = lines.findIndex((l) => l.trim() === `${mark} ${cell.title}`);
        if (i >= 0) {
          ed.setCursor({ line: i, ch: 0 });
          if (ed.scrollIntoView) ed.scrollIntoView({ from: { line: i, ch: 0 }, to: { line: i, ch: 0 } }, true);
        }
      } catch (e) { /* 视图还没准备好就算了 */ }
    }
  }
  async renderMarkdown(el, md) {
    el.empty();
    try { await MarkdownRenderer.render(this.app, md, el, this.file ? this.file.path : "", this); }
    catch (e) {
      try { await MarkdownRenderer.renderMarkdown(md, el, this.file ? this.file.path : "", this); }
      catch (e2) { el.createEl("pre", { text: md }); }
    }
    /* 正文排版：只给“直接子级段落”打标记，标题/列表/引用/表格不碰 */
    try {
      for (const p of Array.from(el.children || [])) {
        if (p && p.tagName === "P") p.classList.add("gd-p");
      }
    } catch (e3) { /* 标记失败不影响渲染 */ }
  }
  beginResize(e, cell, el, corner) {
    e.preventDefault(); e.stopPropagation();
    const s = this.plugin.settings;
    const cn = corner || "se";
    const sx = cn.includes("e") ? 1 : -1;   /* 东侧手柄往右变多，西侧反过来 */
    const sy = cn.includes("s") ? 1 : -1;
    const mode = s.cellResizeMode || "linked";
    const flow = s.flow || "vertical";
    const cols = (s.mobileOneColumn && IS_MOBILE) ? 1 : clamp(this.gridCols, 1, 6);
    const gap = clamp(s.gap, 0, 48);
    const grid = this.gridEl.getBoundingClientRect();
    const cw = flow === "vertical"
      ? (grid.width - (cols - 1) * gap) / cols
      : clamp(s.cellWidth || 260, 190, 560) + gap;
    const rh = clamp(s.rowHeight, 80, 600) + gap;
    const x0 = e.clientX, y0 = e.clientY, cs0 = cell.cs, rs0 = cell.rs;
    const rh0 = clamp(s.rowHeight, 80, 600), cols0 = cols;
    document.body.addClass("gd-is-resizing");
    const move = (ev) => {
      if (mode !== "linked") {
        /* 单格：只改这一格占几列 / 几行（旧行为） */
        const cs = clamp(cs0 + sx * Math.round((ev.clientX - x0) / cw), 1, cols);
        const rs = clamp(rs0 + sy * Math.round((ev.clientY - y0) / rh), 1, 6);
        if (cs !== cell.cs || rs !== cell.rs) {
          cell.cs = cs; cell.rs = rs;
          el.style.gridColumn = `span ${cs}`;
          el.style.gridRow = `span ${rs}`;
          if (!cell.h && flow === "vertical") el.style.minHeight = `${rs * clamp(s.rowHeight, 80, 600) + (rs - 1) * gap}px`;
          const dim = el.querySelector(".gd-cell-dim");
          if (dim) dim.textContent = `${cs}×${rs}`;
        }
        return;
      }
      /* 联动：整张表一起缩放。上下 = 行高，左右 = 列数 */
      const nh = clamp(Math.round((rh0 + sy * (ev.clientY - y0)) / 10) * 10, 80, 600);
      const nc = clamp(cols0 + Math.round(sx * (ev.clientX - x0) / 120), 1, 6);
      if (nh !== s.rowHeight) {
        s.rowHeight = nh;
        this.contentEl.style.setProperty("--gd-row-h", nh + "px");
      }
      if (nc !== this.gridCols) {
        this.gridCols = nc;
        s.columns = nc;
        this.contentEl.style.setProperty("--gd-cols", String(nc));
        this.gridEl.style.gridTemplateColumns = `repeat(${nc}, minmax(0, 1fr))`;
      }
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.removeClass("gd-is-resizing");
      if (mode === "linked") { this.render(); this.plugin.saveSettings && this.plugin.saveSettings(); }
      this.scheduleSave();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }
  showCellMenu(evt, cell) {
    const s0 = this.plugin.settings;
    /* （联动开关在整篇级别，先加到菜单顶部） */
    const menu = new Menu();
    const s = this.plugin.settings;
    const maxCols = (s.mobileOneColumn && IS_MOBILE) ? 1 : clamp(this.gridCols, 1, 6);
    menu.addItem((i) => i.setTitle("重命名").setIcon("pencil").onClick(() => {
      new PromptModal(this.app, "重命名格子", "标题", cell.title, (v) => { cell.title = v.trim() || cell.title; this.render(); this.scheduleSave(); }).open();
    }));
    menu.addItem((i) => i.setTitle((s0.autoFollowCells ? "✓ " : "　") + "改一格其他格跟随（同名格）").setIcon("link").onClick(async () => {
      this.plugin.settings.autoFollowCells = !this.plugin.settings.autoFollowCells;
      await this.plugin.saveSettings();
      new Notice(this.plugin.settings.autoFollowCells ? "已开启：同名格子内容会一起变" : "已关闭：每格各自独立");
    }));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle(cell.cs > 1 ? "恢复占 1 列" : "占 2 列").setIcon("columns").onClick(() => { cell.cs = cell.cs > 1 ? 1 : clamp(2, 1, maxCols); this.render(); this.scheduleSave(); }));
    menu.addItem((i) => i.setTitle(cell.rs > 1 ? "恢复占 1 行" : "占 2 行").setIcon("rows").onClick(() => { cell.rs = cell.rs > 1 ? 1 : 2; this.render(); this.scheduleSave(); }));
    menu.addItem((i) => i.setTitle("高度 +60px").setIcon("arrow-down").onClick(() => { cell.h = (cell.h || s.rowHeight) + 60; this.render(); this.scheduleSave(); }));
    menu.addItem((i) => i.setTitle("高度 −60px").setIcon("arrow-up").onClick(() => { cell.h = Math.max(80, (cell.h || s.rowHeight) - 60); this.render(); this.scheduleSave(); }));
    menu.addItem((i) => i.setTitle("边框").setIcon("square").onClick((e2) => this.showBorderMenu(e2 || evt, cell)));
    const colors = [["默认", ""], ["暖橙", "#c2704f"], ["墨绿", "#5b8c6e"], ["雾蓝", "#6b8eb3"], ["藕紫", "#9a7bb0"], ["赭红", "#b25a5a"]];
    menu.addItem((i) => i.setTitle("强调色").setIcon("palette").onClick(() => {
      const cm = new Menu();
      for (const [n, v] of colors) cm.addItem((x) => x.setTitle(n).onClick(() => { cell.accent = v; this.render(); this.scheduleSave(); }));
      showMenuAt(cm, evt);
    }));
    menu.addItem((i) => i.setTitle("贴纸").setIcon("smile").onClick((e2) => this.pickSticker(e2 || evt, cell)));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("撤销这一格").setIcon("undo-2").onClick(() => this.stepCell(cell, -1)));
    menu.addItem((i) => i.setTitle("重做这一格").setIcon("redo-2").onClick(() => this.stepCell(cell, 1)));
    menu.addItem((i) => i.setTitle("在文件里定位 / 打开整篇").setIcon("file-text").onClick(() => this.openWholeFile(cell)));
    menu.addItem((i) => i.setTitle("用模板补齐格子（保留旧内容）").setIcon("layout-template").onClick(async () => {
      const tpl = this.plugin.settings.templates.find((t) => t.name === this.plugin.settings.activeTemplate) || this.plugin.settings.templates[0];
      const n = await this.plugin.fillMissingCells(this.key, (tpl.cells || []).map((c) => c.title));
      new Notice(n ? `已补齐 ${n} 个格子，原有内容没动` : "这个模板的格子已经有了");
    }));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("上移").setIcon("chevron-up").onClick(() => this.moveCell(cell, -1)));
    menu.addItem((i) => i.setTitle("下移").setIcon("chevron-down").onClick(() => this.moveCell(cell, 1)));
    menu.addItem((i) => i.setTitle("在此之后插入一格").setIcon("plus").onClick(() => this.addCell(cell, "below")));
    menu.addItem((i) => i.setTitle("删除这一格").setIcon("trash").onClick(() => {
      new ConfirmModal(this.app, "删除格子？", `「${cell.title}」的内容会一起删除。删除前会自动存快照，可以用「撤销」或时间线恢复。`, () => {
        this.cells = this.cells.filter((c) => c.id !== cell.id);
        this.render(); this.scheduleSave();
      }).open();
    }));
    showMenuAt(menu, evt);
  }
  moveCell(cell, delta) {
    const i = this.cells.findIndex((c) => c.id === cell.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.cells.length) return;
    const [m] = this.cells.splice(i, 1);
    this.cells.splice(j, 0, m);
    this.render(); this.scheduleSave();
  }
  addCell(after, where) {
    new PromptModal(this.app, "新增格子", "标题（可以写成一句问句）", where === "right" ? "新格子" : "新格子", (v) => {
      const c = {
        id: uid(), title: v.trim() || "新格子", content: "", cs: 1, rs: 1, h: 0,
        accent: "", collapsed: false, border: "", sticker: "",
      };
      const i = after ? this.cells.findIndex((x) => x.id === after.id) : -1;
      if (i >= 0) this.cells.splice(i + 1, 0, c); else this.cells.push(c);
      this.render(); this.scheduleSave();
      setTimeout(() => {
        const els = this.gridEl.querySelectorAll(".gd-cell");
        const last = els[els.length - 1];
        if (last) { const t = last.querySelector(".gd-cell-title"); if (t) { t.focus(); t.select(); } }
      }, 30);
    }).open();
  }
  saveAsTemplate() {
    new TemplateSaveModal(this.app, this.plugin, this.cells, `${this.date} 的布局`).open();
  }
  async saveNow() {
    if (!(this.file instanceof TFile) || this.saving) return;
    this.saving = true;
    this.setStatus("保存中");
    try {
      const text = serializeDay(this.date, this.cells, {
        fm: this.fm, h1: this.h1, columns: this.gridCols,
        level: this.plugin.settings.headingLevel,
        layout: this.layout,
      });
      const current = await this.app.vault.read(this.file);
      if (current === text) { this.setStatus("已保存 · 自动"); return; }
      this.plugin.history.pushUndo(this.file, current, `编辑 ${dateShort(this.date)}`);
      if (this.plugin.settings.autoSnapshot) await this.plugin.history.snapshot(this.file, "自动");
      await this.app.vault.modify(this.file, text);
      this.plugin.notifyRefresh();
      this.setStatus("已保存 · 自动");
    } catch (e) {
      console.error("[格间日记] 保存失败", e);
      this.setStatus("保存失败");
      new Notice("保存失败：" + e.message);
    } finally { this.saving = false; }
  }
  async save(immediate) {
    this.scheduleSave.cancel();
    if (immediate) await this.saveNow();
    else this.scheduleSave();
  }
}
