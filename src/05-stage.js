/* ============================================================
 * 封面舞台：四层自由布局
 * 用户要求（m01776）：「图片的拉扯只限于图片，不是拉扯表格框框；
 *   文本框的拉扯只限于文本框；背景的拉扯也只限于背景。彼此独立，互不影响。」
 * 所以这里不是「一个框装一张图」，而是一块舞台 + 四个各自独立的层。
 * ============================================================ */
class GDStage {
  constructor(view) {
    this.view = view;
    this.plugin = view.plugin;
    this.sx = view.sx;
    this.el = view.stageEl;
    this.sel = "bg";
    this.drag = null;
    this.barOpen = false;   // 推板默认收起，只留画面外一个 ⋯
  }

  layers() {
    const v = this.view;
    if (!v.layout.layers) v.layout.layers = deepClone(DEFAULT_LAYERS);
    return v.layout.layers;
  }

  render() {
    const el = this.el, s = this.sx;
    if (!el) return;
    const on = !!s.showStage;
    el.toggleClass("is-hidden", !on);
    if (this.view.coverWrapEl) this.view.coverWrapEl.toggleClass("is-hidden", on);
    if (!on) return;

    el.empty();
    el.style.height = clamp(s.stageHeight || 220, 120, 520) + "px";
    const lay = this.layers();
    const box = el.createDiv({ cls: "gd-stage-box" });

    for (const k of LAYER_KEYS) {
      const L = lay[k];
      if (!L || !L.on) continue;
      const d = box.createDiv({ cls: `gd-layer gd-layer-${k}` + (this.sel === k ? " is-sel" : "") });
      d.style.left = L.x + "%";
      d.style.top = L.y + "%";
      d.style.width = L.w + "%";
      d.style.height = L.h + "%";
      d.style.zIndex = String(k === "bg" ? 1 : k === "img" ? 2 : k === "text" ? 3 : 4);
      this.fillLayer(d, k);
      d.onpointerdown = (e) => this.onLayerDown(e, k, d);
      d.oncontextmenu = (e) => { e.preventDefault(); this.layerMenu(e, k); };
    }

    /* 分屏时的分割线（上下 / 左右），可拖 */
    const sm = s.splitMode || "whole";
    if (sm !== "whole") {
      const line = box.createDiv({ cls: "gd-split-line " + (sm === "top" ? "is-h" : "is-v") });
      const at = clamp(Number(s.splitAt) || 58, 20, 80);
      if (sm === "top") line.style.top = at + "%"; else line.style.left = at + "%";
      line.setAttr("title", "拖动这条线调整分屏比例");
    }

    /* 推板搬到画面外（用户要求：按钮不许压在图上） */
    const foot = el.createDiv({ cls: "gd-stage-foot" });
    this.renderBar(foot);
  }

  fillLayer(d, k) {
    const s = this.sx, lay = this.view.layout;

    /* B4：把「背景」和「照片」合成一层——只画一张图，不再两层叠着出重影 */
    if (s.mergeBgImg) {
      if (k === "bg") {
        const src =
          (lay.layers && lay.layers.bg && lay.layers.bg.src) ||
          lay.cover || lay.photo || "";
        const url = src ? (this.view.avatarUrl ? this.view.avatarUrl(src) : "") : "";
        d.addClass("is-gradient");
        if (url) {
          if (isVideoSrc(src)) {
            const v = d.createEl("video", { cls: "gd-layer-video" });
            v.src = url; v.autoplay = true; v.muted = true;
            if (s.bgVideoLoop !== false) v.loop = true;
            v.playsInline = true;
            v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
            /* 视频不是背景图，取景位置要用 object-position，不是 background-position */
            v.style.objectPosition = lay.coverPos || "50% 50%";
            d.addClass("is-video");
          } else {
            d.style.backgroundImage = `url("${url}")`;
            d.removeClass("is-gradient");
            this.applyFit(d, s);
          }
        }
        applyCrop(d, (lay.crops && lay.crops.bg) || (lay.crops && lay.crops.cover) || null, lay.coverPos || "50% 50%");
        return;
      }
      if (k === "img") { d.style.display = "none"; return; }
    }

    if (k === "bg") {
      const src = this.view.coverSrc();
      d.addClass("is-gradient");
      if (src && src.path) {
        const url = this.view.coverUrl ? this.view.coverUrl(src) : "";
        if (url) { d.style.backgroundImage = `url("${url}")`; d.removeClass("is-gradient"); this.applyFit(d, s); }
      }
      applyCrop(d, (lay.crops && lay.crops.bg) || null, lay.coverPos || "50% 50%");
      return;
    }
    if (k === "img") {
      const p = lay.photo || "";
      if (p) {
        const url = this.view.avatarUrl ? this.view.avatarUrl(p) : "";
        if (url && isVideoSrc(p)) {
          /* 视频壁纸：CSS background-image 放不了视频，必须叠一个 <video> */
          const v = d.createEl("video", { cls: "gd-layer-video" });
          v.src = url;
          v.autoplay = true;
          v.muted = true;
          v.loop = true;
          v.playsInline = true;
          v.setAttribute("playsinline", "");
          v.setAttribute("muted", "");
          v.setAttribute("disablepictureinpicture", "");
          v.style.objectPosition = lay.coverPos || "50% 50%";
          v.onerror = () => { d.addClass("is-video-err"); };
          d.addClass("is-video");
        } else if (url) {
          d.style.backgroundImage = `url("${url}")`;
          this.applyFit(d, s);
          applyCrop(d, (lay.crops && lay.crops.photo) || null, lay.coverPos || "50% 50%");
          if (isAnimSrc(p)) d.addClass("is-anim");
        }
      }
      if (!d.style.backgroundImage && !d.hasClass?.("is-video") && !d.querySelector?.("video")) {
        d.createSpan({ cls: "gd-layer-tip", text: "点这里放一张照片" });
        d.onclick = () => this.view.pickPhoto();
      }
      d.addClass("gd-layer-frame");
      return;
    }
    if (k === "text") {
      const text = lay.motto || s.motto || "";
      const t = d.createDiv({ cls: "gd-layer-motto" + (text ? "" : " is-empty") });
      t.style.fontSize = clamp(s.mottoSize || 15, 11, 34) + "px";
      t.style.fontWeight = String(clamp(s.mottoWeight || 600, 300, 900));
      t.style.opacity = String(clamp(s.mottoOpacity == null ? 1 : s.mottoOpacity, 0.2, 1));
      t.style.textAlign = s.mottoAlign || "left";
      if (s.mottoColor) t.style.color = s.mottoColor;
      d.toggleClass("is-shadow", s.mottoShadow !== false);
      t.setText(text || "点这里写一句座右铭…");
      t.setAttribute("title", "双击编辑");
      t.ondblclick = (e) => { e.stopPropagation(); this.view.editMotto(); };
      return;
    }
    if (k === "mark") {
      const size = clamp(s.markSize || 56, 24, 140);
      const ring = s.markRing || "none";
      const av = d.createDiv({ cls: `gd-avatar gd-ring-${ring}` });
      av.style.width = av.style.height = size + "px";
      const url = this.view.avatarUrl(lay.avatar || s.avatar || "");
      if (url) av.style.backgroundImage = `url("${url}")`;
      else av.setText(String(s.avatarText || (this.view.h1 || this.view.date || "").slice(0, 1)).slice(0, 2));
      const nm = s.markName || lay.motto || "";
      if (nm) d.createDiv({ cls: "gd-mark-name", text: String(nm).slice(0, 12) });
      return;
    }
  }

  onLayerDown(e, k, d) {
    if (e.button !== 0) return;
    this.sel = k;
    if (this.el) {
      for (const n of this.el.querySelectorAll(".gd-layer")) n.removeClass("is-sel");
      d.addClass("is-sel");
    }
    const box = this.el.querySelector(".gd-stage-box");
    if (!box) return;
    const br = box.getBoundingClientRect();
    const s = this.sx;
    if (k === "bg") {
      /* 背景拖的是取景位置，不改坐标 */
      const pos = this.view.layout.coverPos || "50% 50%";
      const [px, py] = pos.split(/\s+/).map((x) => parseFloat(x) || 50);
      this.drag = { mode: "pan", k, sx: e.clientX, sy: e.clientY, px, py, w: br.width, h: br.height };
    } else {
      const L = this.layers()[k];
      this.drag = { mode: "move", k, sx: e.clientX, sy: e.clientY, x: L.x, y: L.y, o: { ...L }, w: br.width, h: br.height };
    }
    d.setPointerCapture && d.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
    const move = (ev) => this.onLayerMove(ev);
    const up = (ev) => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      this.onLayerUp(ev);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  }

  onLayerMove(ev) {
    const g = this.drag;
    if (!g) return;
    const dx = ev.clientX - g.sx;
    const dy = ev.clientY - g.sy;
    if (g.mode === "pan") {
      const px = clamp(Math.round(g.px - (dx / Math.max(1, g.w)) * 100), 0, 100);
      const py = clamp(Math.round(g.py - (dy / Math.max(1, g.h)) * 100), 0, 100);
      const d = this.el.querySelector(".gd-layer-bg");
      if (d) {
        d.style.backgroundPosition = `${px}% ${py}%`;
        /* 视频壁纸：背景位置对它无效，要改 <video> 的 object-position */
        const v = d.querySelector("video");
        if (v) v.style.objectPosition = `${px}% ${py}%`;
      }
      this.drag.next = `${px}% ${py}%`;
      return;
    }
    const L = this.layers()[g.k];
    const nx = clamp(Math.round((g.x + (dx / Math.max(1, g.w)) * 100) * 10) / 10, 0, 100 - L.w);
    const ny = clamp(Math.round((g.y + (dy / Math.max(1, g.h)) * 100) * 10) / 10, 0, 100 - L.h);
    L.x = nx; L.y = ny;
    const d = this.el.querySelector(`.gd-layer-${g.k}`);
    if (d) { d.style.left = nx + "%"; d.style.top = ny + "%"; }
  }

  onLayerUp() {
    const g = this.drag;
    this.drag = null;
    if (!g) return;
    if (g.mode === "pan") {
      if (g.next) { this.view.layout.coverPos = g.next; this.view.scheduleSave(); }
      return;
    }
    this.view.scheduleSave();
  }

  /* ---------- 推板（画面外，默认收成一个 ⋯）---------- */
  /* B2：图片四种填充 —— 居中裁剪 / 完整显示 / 拉伸 / 九宫格 */
  applyFit(d, s) {
    const fit = s.photoFit || "cover";
    d.removeClass("fit-cover"); d.removeClass("fit-contain"); d.removeClass("fit-fill"); d.removeClass("fit-nine");
    d.addClass("fit-" + fit);
    if (fit === "nine") {
      const n = clamp(s.nineSlice || 24, 4, 120);
      d.style.setProperty("--gd-nine", n + "px");
    } else {
      d.style.removeProperty("--gd-nine");
    }
  }

  renderBar(foot) {
    const s = this.sx, lay = this.layers();
    foot.empty();

    const row = foot.createDiv({ cls: "gd-stage-foot-row" });
    const toggle = row.createEl("button", {
      cls: "gd-stage-more" + (this.barOpen ? " is-on" : ""),
      text: this.barOpen ? "收起" : "⋯",
      attr: { title: "封面设置：换图 / 座右铭 / 分屏 / 摆放" },
    });
    toggle.onclick = (e) => { e.stopPropagation(); this.barOpen = !this.barOpen; this.render(); };

    /* 当前选中层的名字，给个一眼可见的提示，不占画面 */
    const hint = row.createDiv({ cls: "gd-stage-hint" });
    hint.setText("正在调：" + LAYER_NAMES[this.sel] + (lay[this.sel].on ? "" : "（已隐藏）"));

    if (!this.barOpen) return;

    const bar = foot.createDiv({ cls: "gd-stage-bar" });

    const chips = bar.createDiv({ cls: "gd-stage-chips" });
    for (const k of LAYER_KEYS) {
      const b = chips.createEl("button", {
        cls: "gd-chip" + (this.sel === k ? " is-on" : "") + (lay[k].on ? " has" : ""),
        text: LAYER_NAMES[k],
        attr: { title: "选中「" + LAYER_NAMES[k] + "」；右键可开关" },
      });
      b.onclick = (e) => { e.stopPropagation(); this.sel = k; this.render(); };
      b.oncontextmenu = (e) => {
        e.preventDefault(); e.stopPropagation();
        lay[k].on = !lay[k].on;
        this.view.scheduleSave();
        this.render();
      };
    }

    const step = bar.createDiv({ cls: "gd-stage-step" });
    for (const v of LAYER_STEPS) {
      const b = step.createEl("button", { cls: "gd-step" + ((s.layerStep || 5) === v ? " is-on" : ""), text: String(v) });
      b.onclick = async (e) => {
        e.stopPropagation();
        this.sx.layerStep = v;
        await this.plugin.saveSettings();
        this.render();
      };
    }

    const pad = bar.createDiv({ cls: "gd-stage-pad" });
    const mv = (dx, dy) => {
      const L = this.layers()[this.sel];
      if (this.sel === "bg") return;
      const st = s.layerStep || 5;
      L.x = clamp(Math.round((L.x + dx * st) * 10) / 10, 0, 100 - L.w);
      L.y = clamp(Math.round((L.y + dy * st) * 10) / 10, 0, 100 - L.h);
      this.view.scheduleSave();
      this.render();
    };
    const mk = (txt, tip, fn) => {
      const b = pad.createEl("button", { cls: "gd-padbtn", text: txt, attr: { title: tip } });
      b.onclick = (e) => { e.stopPropagation(); fn(); };
    };
    mk("↑", "上移", () => mv(0, -1));
    mk("←", "左移", () => mv(-1, 0));
    mk("→", "右移", () => mv(1, 0));
    mk("↓", "下移", () => mv(0, 1));

    const wh = bar.createDiv({ cls: "gd-stage-wh" });
    const size = (dw, dh) => {
      const L = this.layers()[this.sel];
      if (this.sel === "bg") return;
      const st = s.layerStep || 5;
      L.w = clamp(Math.round((L.w + dw * st) * 10) / 10, 4, 100 - L.x);
      L.h = clamp(Math.round((L.h + dh * st) * 10) / 10, 4, 100 - L.y);
      this.view.scheduleSave();
      this.render();
    };
    for (const [txt, tip, dw, dh] of [["窄", "变窄", -1, 0], ["宽", "变宽", 1, 0], ["矮", "变矮", 0, -1], ["高", "变高", 0, 1]]) {
      const b = wh.createEl("button", { cls: "gd-padbtn", text: txt, attr: { title: tip } });
      b.onclick = (e) => { e.stopPropagation(); size(dw, dh); };
    }

    const al = bar.createDiv({ cls: "gd-stage-align" });
    const ALIGNS = [["↖", 0, 0], ["↗", 1, 0], ["↙", 0, 1], ["↘", 1, 1]];
    for (const [txt, fx, fy] of ALIGNS) {
      const b = al.createEl("button", { cls: "gd-padbtn", text: txt, attr: { title: "贴到这一角" } });
      b.onclick = (e) => {
        e.stopPropagation();
        const L = this.layers()[this.sel];
        if (this.sel === "bg") return;
        L.x = fx ? 100 - L.w : 0;
        L.y = fy ? 100 - L.h : 0;
        this.view.scheduleSave();
        this.render();
      };
    }

    /* 换图 / 座右铭 / 分屏 —— 用户要的「一个按钮里好几个功能」 */
    const acts = bar.createDiv({ cls: "gd-stage-acts" });
    const act = (txt, tip, fn) => {
      const b = acts.createEl("button", { cls: "gd-padbtn", text: txt, attr: { title: tip } });
      b.onclick = (e) => { e.stopPropagation(); fn(); };
    };
    act("换图", "换背景图 / 照片", () => this.view.pickCover());
    act("座右铭", "编辑座右铭文字", () => this.view.editMotto());
    act("分屏", "整块铺满 / 上下分屏 / 左右分屏", () => this.view.showSplitMenu && this.view.showSplitMenu());

    const x = bar.createEl("button", { cls: "gd-stage-x", text: "×", attr: { title: "收起舞台（回到旧版封面）" } });
    x.onclick = async (e) => {
      e.stopPropagation();
      this.sx.showStage = false;
      await this.plugin.saveSettings();
      this.view.render();
    };

    bar.onpointerdown = (e) => e.stopPropagation();
  }

  layerMenu(e, k) {
    const lay = this.layers();
    const m = new Menu();
    m.addItem((i) => i.setTitle(`${lay[k].on ? "隐藏" : "显示"}${LAYER_NAMES[k]}`).setIcon(lay[k].on ? "eye-off" : "eye").onClick(() => {
      lay[k].on = !lay[k].on; this.view.scheduleSave(); this.render();
    }));
    if (k === "bg") {
      m.addItem((i) => i.setTitle("换一张背景图").setIcon("image").onClick(() => this.view.pickCover()));
      m.addItem((i) => i.setTitle("裁剪背景图").setIcon("crop").onClick(() => this.view.cropCover()));
      m.addItem((i) => i.setTitle("重新取景（拖背景）").setIcon("move").onClick(() => this.view.dragCoverPos()));
    }
    if (k === "img") {
      m.addItem((i) => i.setTitle("换一张照片").setIcon("image").onClick(() => this.view.pickPhoto()));
      m.addItem((i) => i.setTitle("裁剪这张照片").setIcon("crop").onClick(() => this.view.cropPhoto()));
      m.addItem((i) => i.setTitle("去掉照片").setIcon("x").onClick(() => {
        this.view.layout.photo = ""; this.view.scheduleSave(); this.render();
      }));
    }
    if (k === "text") {
      m.addItem((i) => i.setTitle("编辑座右铭").setIcon("type").onClick(() => this.view.editMotto()));
    }
    if (k === "mark") {
      m.addItem((i) => i.setTitle("上传标志图").setIcon("image").onClick(() => this.view.pickAvatar()));
      m.addItem((i) => i.setTitle("裁剪标志图").setIcon("crop").onClick(() => this.view.cropAvatar()));
      m.addItem((i) => i.setTitle("用文字标记").setIcon("type").onClick(() => {
        new PromptModal(this.plugin.app, "封面标志", "输入 1–2 个字", this.sx.avatarText || "", async (v) => {
          this.sx.avatarText = String(v || "").trim().slice(0, 2);
          this.sx.avatar = "";
          await this.plugin.saveSettings();
          this.render();
        }).open();
      }));
    }
    m.addSeparator();
    for (const [txt, fy] of [["顶对齐", 0], ["垂直居中", 0.5], ["底对齐", 1]]) {
      m.addItem((i) => i.setTitle(txt).onClick(() => {
        const L = lay[k];
        if (k === "bg") return;
        L.y = clamp(Math.round((fy * (100 - L.h)) * 10) / 10, 0, 100 - L.h);
        this.view.scheduleSave(); this.render();
      }));
    }
    showMenuAt(m, e);
  }
}
