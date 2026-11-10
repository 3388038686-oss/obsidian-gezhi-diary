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
    el.style.height = clamp(s.stageHeight || 220, 120, 1200) + "px";
    const lay = this.layers();
    const box = el.createDiv({ cls: "gd-stage-box" });

    for (const k of LAYER_KEYS) {
      const L = lay[k];
      if (!L) continue;
      /* 照片墙开着时，第二层 img 不再画：它只是右侧一条 30% 窄框，
       照片全挤在那儿、浮不到整张背景上。改由下面整块舞台的浮层来画。
       但「视频缩成右侧小窗」仍画在这一层（视频不属于照片墙），要留着。 */
      if (k === "img" && this.wallActive() && !this.isVideoLayer()) continue;
      /* 座右铭这一层归「显示座右铭」总开关管：总开关开着就画，
         否则用户会出现「设置里开着座右铭，画面上却没有」的怪事 */
      const shown = k === "text" ? !!s.showMotto : !!L.on;
      if (!shown) continue;
      const d = box.createDiv({ cls: `gd-layer gd-layer-${k}` + (this.sel === k ? " is-sel" : "") });
      d.style.left = L.x + "%";
      d.style.top = L.y + "%";
      d.style.width = L.w + "%";
      d.style.height = L.h + "%";
      d.style.zIndex = String(k === "bg" ? 1 : k === "img" ? 2 : k === "text" ? 3 : 4);
      this.fillLayer(d, k);
      d.onpointerdown = (e) => this.onLayerDown(e, k, d);
      d.oncontextmenu = (e) => { e.preventDefault(); this.layerMenu(e, k); };
      /* 四角能拖（用户：「四角能拖」「四角拖拽不要做得显眼」）。
         只给第二层（照片墙 / 视频）——背景拖的是取景位置，文字和标志靠拖动改位置就够，
         加把手反而会挡双击编辑。 */
      if (k === "img") {
        this.bindLayerGrips(d, k);
        if (this.isVideoLayer()) d.addClass("is-video-layer");
        if (this.view.layout.videoPip) d.addClass("is-video-pip");
      }
    }

    /* 照片墙 = 一堆「头像式」小图浮在整块背景上（用户 m00886：「按头像的设计，
       把头像多加几个，可以选择多张照片」）。它不再挤在右侧 30% 的 img 窄框里，
       而是单独一层铺满整块舞台，坐标按整块舞台算，能拖到任意位置、四角缩放、
       单独裁剪 / 换图 / 删。显隐是全局的（settings.projectBg.home.wall.on），
       跟哪一天、跟 lay.img.on 都无关——换一天照样显示。 */
    if (this.wallActive()) {
      const wl = box.createDiv({ cls: "gd-wall-layer" });
      wl.style.zIndex = "5";   /* 盖在背景 / 照片 / 文字 / 标志之上 */
      this.fillWall(wl, this.wall());
    }

    /* 分屏时的分割线（上下 / 左右）：画出来就能直接拖。 */
    const sm = s.splitMode || "whole";
    if (sm !== "whole") {
      const line = box.createDiv({ cls: "gd-split-line " + (sm === "top" ? "is-h" : "is-v") });
      const at = clamp(Number(s.splitAt) || 58, 20, 80);
      if (sm === "top") line.style.top = at + "%"; else line.style.left = at + "%";
      line.setAttr("title", "拖动这条线调整分屏比例");
      this.bindSplitDrag(line, sm);
    }

    /* 推板搬到画面外（用户要求：按钮不许压在图上） */
    const foot = el.createDiv({ cls: "gd-stage-foot" });
    this.renderBar(foot);
  }

  /* 拖分屏那条线：只改 splitAt，并把 bg/img 两层实时跟着改，
     松手才存盘。不能在一次拖动里调 view.applySplit()，那会整块重画、
     把正在拖的这条线自己销毁掉。 */
  bindSplitDrag(line, sm) {
    const horizontal = sm === "top";
    let on = false;
    const box = () => this.el.querySelector(".gd-stage-box") || this.el;
    const move = (ev) => {
      if (!on) return;
      const r = box().getBoundingClientRect();
      if (!r.width || !r.height) return;
      const p = horizontal
        ? ((ev.clientY - r.top) / r.height) * 100
        : ((ev.clientX - r.left) / r.width) * 100;
      const at = clamp(Math.round(p), 20, 80);
      this.sx.splitAt = at;
      if (horizontal) line.style.top = at + "%"; else line.style.left = at + "%";
      const bg = this.el.querySelector(".gd-layer-bg");
      const im = this.el.querySelector(".gd-layer-img");
      for (const d of [bg, im]) {
        if (!d) continue;
        if (horizontal) { d.style.top = "0%"; d.style.height = at + "%"; }
        else { d.style.left = "0%"; d.style.width = at + "%"; }
      }
      ev.preventDefault();
    };
    const up = () => {
      if (!on) return;
      on = false;
      line.removeClass("is-dragging");
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      this.plugin.saveSettings();
    };
    line.addEventListener("pointerdown", (ev) => {
      on = true;
      line.addClass("is-dragging");
      document.addEventListener("pointermove", move, true);
      document.addEventListener("pointerup", up, true);
      ev.preventDefault();
      ev.stopPropagation();
    });
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
      /* 第一层「背景」现在是全局的一张，画在舞台根元素上（见 applyProjectBg 的
         key==="home" 分支）。这一层不再自己画一次，否则会叠出两层重影，
         而且「按日换图」也会被这里盖掉。这一层只留位置和取景拖动。 */
      const gbg = (this.sx.projectBg && this.sx.projectBg.home) || {};
      const hasGlobal = !!(gbg.image || gbg.video);
      if (hasGlobal) {
        /* 让底下那层全局背景透出来 */
        d.addClass("is-transparent-bg");
        d.style.backgroundImage = "";
        return;
      }
      /* 老做法（主页背景没设过才走）：用这一篇自己的封面 */
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
      /* 第二层 = 照片墙（用户：「照片墙只独属于主页」）。
         墙上每张照片各有自己的百分比坐标，能拖能四角缩放；
         没放照片墙时退回原来的「一张照片」。 */
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
      const shape = s.avatarShape || "circle";
      const av = d.createDiv({ cls: `gd-avatar gd-ring-${ring} gd-shape-${shape}` });
      av.style.width = av.style.height = size + "px";
      const url = this.view.avatarUrl(lay.avatar || s.avatar || "");
      if (url) {
        av.style.backgroundImage = `url("${url}")`;
        /* 头像在舞台上是标志层画的，这里以前没套裁剪框，
           所以框选完还是整张图。裁剪信息存在 settings.avatarCrop 里。 */
        applyCrop(av, (lay.crops && lay.crops.mark) || s.avatarCrop || null, "50% 50%");
      }
      else av.setText(String(s.avatarText || (this.view.h1 || this.view.date || "").slice(0, 1)).slice(0, 2));
      const nm = s.markName || lay.motto || "";
      if (nm) d.createDiv({ cls: "gd-mark-name", text: String(nm).slice(0, 12) });
      return;
    }
  }

  /* 照片墙是否要显示：只看全局开关，跟每篇日记的 lay.img.on 无关 */
  wallActive() {
    const w = this.wall();
    return !!(w && w.on && w.items && w.items.length);
  }

  /* 照片墙数据（只主页用；存在 settings.projectBg.home.wall） */
  wall() {
    const s = this.sx;
    s.projectBg = s.projectBg || {};
    const cfg = s.projectBg.home || (s.projectBg.home = {});
    if (!cfg.wall) cfg.wall = { on: false, items: [], limit: 12, unlimited: false };
    return cfg.wall;
  }

  /* 把墙上的每张照片画出来（浮层铺满整块舞台） */
  fillWall(d, wall) {
    d.empty();
    d.addClass("is-wall");
    const list = wall.unlimited ? wall.items : wall.items.slice(0, clamp(Number(wall.limit) || 12, 1, 200));
    list.forEach((it, i) => {
      const ph = d.createDiv({ cls: "gd-wall-photo" });
      const url = this.view.avatarUrl ? this.view.avatarUrl(it.src || "") : "";
      if (url) ph.style.backgroundImage = 'url("' + url + '")';
      else ph.addClass("is-empty");
      /* 每张照片自己框选过的那一块（用户：「直接出来图片了并且选择区域」） */
      if (it.crop) applyCrop(ph, it.crop, "50% 50%");
      /* 头像式：正方形。边长按舞台宽度的百分比算（w），高由 CSS aspect-ratio 撑开 */
      const w = clamp(Number(it.w) || 16, 4, 100);
      ph.style.left = (Number(it.x) || 0) + "%";
      ph.style.top = (Number(it.y) || 0) + "%";
      ph.style.width = w + "%";
      ph.style.height = "auto";
      ph.dataset.i = String(i);
      /* 四角把手：视觉上不显眼（用户要求） */
      for (const c of ["nw", "ne", "sw", "se"]) {
        ph.createDiv({ cls: "gd-wall-grip is-" + c });
      }
      this.bindWallItem(ph, it, i);
    });
    if (!list.length) d.createSpan({ cls: "gd-layer-tip", text: "点这里加照片" });
  }

  /* 单张照片：拖动移动 / 抓角缩放（尺寸是正方形边长，按舞台宽度百分比算） */
  bindWallItem(ph, it, idx) {
    ph.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      const grip = (ev.target && ev.target.classList && ev.target.classList.contains("gd-wall-grip"))
        ? [...ev.target.classList].find((c) => c.startsWith("is-") && c !== "is-empty") : "";
      /* 浮层就是照片的父元素，铺满整块舞台 —— 拿它当坐标基准，照片才能拖到背景任意位置 */
      const box = ph.parentElement;
      const r = box.getBoundingClientRect();
      const W = Math.max(r.width, 1), H = Math.max(r.height, 1);
      const x0 = ev.clientX, y0 = ev.clientY;
      const it0 = { x: Number(it.x) || 0, y: Number(it.y) || 0, w: clamp(Number(it.w) || 16, 4, 100) };
      ph.setPointerCapture && ph.setPointerCapture(ev.pointerId);
      ph.addClass("is-drag");
      const move = (e) => {
        const dx = ((e.clientX - x0) / W) * 100;   // 宽度百分比
        const dy = ((e.clientY - y0) / H) * 100;   // 高度百分比
        if (!grip) {
          it.x = clamp(it0.x + dx, 0, 100 - it0.w);
          it.y = clamp(it0.y + dy, 0, Math.max(0, 100 - it0.w * W / H));   // 正方形占高度的百分比
        } else {
          /* 四角统一改边长：横 / 纵取变化更大的那个，正方形永远是正方形。
             纵向 dy(高%) 换算成宽度百分比要乘 H / W。 */
          const sx = grip.includes("e") ? 1 : -1;
          const sy = grip.includes("s") ? 1 : -1;
          const dW = sx * dx;
          const dH = sy * dy * H / W;
          const d = Math.abs(dW) >= Math.abs(dH) ? dW : dH;
          let nw = clamp(it0.w + d, 4, 100);
          if (grip.includes("w")) { it.x = clamp(it0.x + it0.w - nw, 0, 100 - nw); nw = clamp(nw, 4, 100 - it.x); }
          const maxY = Math.max(0, 100 - nw * W / H);
          if (grip.includes("n")) { it.y = clamp(it0.y + (it0.w - nw) * W / H, 0, maxY); }
          it.w = nw; it.h = nw;              /* 老数据里的 h 跟着走，避免读旧值又变成长条 */
          it.x = clamp(it.x, 0, 100 - nw);
          it.y = clamp(it.y, 0, maxY);
        }
        ph.style.left = it.x + "%"; ph.style.top = it.y + "%";
        ph.style.width = it.w + "%";
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        ph.removeClass("is-drag");
        this.view.scheduleSave && this.view.scheduleSave();
        this.plugin.saveSettings();
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
    ph.addEventListener("contextmenu", (e) => {
      e.preventDefault(); e.stopPropagation();
      const m = new Menu();
      m.addItem((i) => i.setTitle("换这张照片").setIcon("image").onClick(async () => {
        const got = await chooseImage(this.plugin.app, this.plugin, {
          title: "给照片墙选张图", multiple: false, cropTitle: "裁剪这张照片（框选完再保存）",
        });
        if (!got) return;
        it.src = got.path;
        if (got.crop) it.crop = got.crop; else delete it.crop;
        this.plugin.saveSettings();
        this.render();
      }));
      m.addItem((i) => i.setTitle("重新框选这张").setIcon("crop").onClick(async () => {
        if (!it.src) { new Notice("这张还没设图"); return; }
        const url = this.view.avatarUrl ? this.view.avatarUrl(it.src) : "";
        if (!url) { new Notice("这张图读不出来"); return; }
        openCrop(this.plugin.app, {
          url, ratio: 1, crop: it.crop || null, title: "重新框选这张照片",
          onOk: (c) => {
            if (c) it.crop = c; else delete it.crop;
            this.plugin.saveSettings(); this.render();
          },
        });
      }));
      m.addSeparator();
      m.addItem((i) => i.setTitle("把这张放大").setIcon("maximize").onClick(() => {
        it.w = clamp(it.w * 1.2, 4, 100); it.h = it.w;
        this.plugin.saveSettings(); this.render();
      }));
      m.addItem((i) => i.setTitle("去掉这张").setIcon("trash").onClick(() => {
        this.wall().items.splice(idx, 1);
        this.plugin.saveSettings(); this.render();
      }));
      showMenuAt(m, e);
    });
  }

  /* 第一层「背景」：只能一张，而且是全局的（跟哪一天无关）。
     用户：「背景只能增加一张且是全局」。换图入口就是点层级里的这一项，
     点完直接进选图器 + 裁剪框（居中裁剪 / 填充 / 适应 / 拉伸 / 平铺 / 原图）。 */
  async pickGlobalBg() {
    const got = await chooseImage(this.plugin.app, this.plugin, {
      title: "第一层 · 背景（一张，全局生效）",
      multiple: false,
      cropTitle: "裁剪背景（框选完再保存）",
    });
    if (!got || !got.path) return;
    const s = this.sx;
    s.projectBg = s.projectBg || {};
    const cur = s.projectBg.home || {};
    s.projectBg.home = Object.assign({}, cur, { mode: "image", image: got.path, crop: got.crop || null });
    await this.plugin.saveSettings();
    this.layers().bg.on = true;
    this.plugin.applyProjectBg();
    this.render();
    new Notice("背景已换（全局，所有日子都一样）");
  }

  /* 第二层「照片墙」：可以加多张，每张单独框选（用户：「直接出来图片并且选择区域」）。
     照片是头像式的正方形，浮在整块背景上，能拖到任意位置、四角缩放。 */
  async addWallPhotos() {
    const w = this.wall();
    /* 先把来源选出来（可多选），再逐张进裁剪框 —— 这样每张都能「选择区域」。 */
    const list = await chooseImagesWithCrop(this.plugin.app, this.plugin, {
      title: "往照片墙加照片（可多选，选完逐张框选）",
      multiple: true,
      ratio: 1,        /* 头像式正方形：逐张框选时锁 1:1，框出来正好是正方形那块 */
    });
    if (!list || !list.length) return;
    for (const g of list) {
      if (!g || !g.path) continue;
      const n = w.items.length;
      const it = {
        src: g.path,
        x: 5 + (n % 5) * 18,
        y: 6 + Math.floor(n / 5) * 34,
        w: 15, h: 15,
      };
      if (g.crop) it.crop = g.crop;
      w.items.push(it);
    }
    w.on = true;
    await this.plugin.saveSettings();
    this.view.scheduleSave && this.view.scheduleSave();
    this.render();
    new Notice("已加 " + list.length + " 张到照片墙");
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
    const s = this.sx, lay = this.layers(), wall = this.wall();
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
    const shownSel = this.sel === "img" ? wall.on : lay[this.sel].on;
    hint.setText("正在调：" + LAYER_NAMES[this.sel] + (shownSel ? "" : "（已隐藏）"));

    if (!this.barOpen) return;

    const bar = foot.createDiv({ cls: "gd-stage-bar" });

    /* 用户要求：把「背景」「照片」并成一个大类叫「层级」，
       点「层级」进去有第一层级、第二层级；座右铭、标志单独列。 */
    const chips = bar.createDiv({ cls: "gd-stage-chips" });

    const layerOn = (this.sel === "bg" || this.sel === "img");
    const lvBtn = chips.createEl("button", {
      cls: "gd-chip gd-chip-layer" + (layerOn ? " is-on" : "") +
        ((lay.bg.on || wall.on) ? " has" : ""),
      text: "层级",
      attr: { title: "第一层：背景（主题色/纯色/纹理/图片/视频/渐变/玻璃/透明）；第二层：照片墙" },
    });
    lvBtn.onclick = (e) => {
      e.stopPropagation();
      const m = new Menu();
      /* 用户：「直接点击照片墙这三个字就行了，直接出来图片了并且选择区域」。
         所以这两项不是「切换选中层」，而是直接弹选图器 + 裁剪框：
           第一层 · 背景   → 只能一张，而且是全局的（换一天也一样）
           第二层 · 照片墙 → 可以加多张，每张各自拖、各自框选
         「换图」按钮已经删了，换图入口就只剩这里。 */
      m.addItem((i) => i.setTitle("第一层 · 背景（换一张，全局）").setIcon("image")
        .onClick(() => this.pickGlobalBg()));
      m.addItem((i) => i.setTitle("第二层 · 照片墙（加照片，可多选）").setIcon("layout-grid")
        .onClick(() => this.addWallPhotos()));
      m.addSeparator();
      m.addItem((i) => i.setTitle(lay.bg.on ? "隐藏背景层" : "显示背景层").setIcon(lay.bg.on ? "eye-off" : "eye")
        .onClick(() => { lay.bg.on = !lay.bg.on; this.view.scheduleSave(); this.render(); }));
      m.addItem((i) => i.setTitle(wall.on ? "隐藏照片墙" : "显示照片墙").setIcon(wall.on ? "eye-off" : "eye")
        .onClick(async () => { wall.on = !wall.on; await this.plugin.saveSettings(); this.render(); }));
      showMenuAt(m, e);
    };

    /* 用户：「直接点击照片墙这三个字就行了，直接出来图片了并且选择区域」。
       所以「层级」菜单里的这两项现在不是切换选中层，而是直接弹选图器 + 裁剪框：
         第一层 · 背景   → 只能一张，而且是全局的（换一天也一样）
         第二层 · 照片墙 → 可以加多张，每张各自拖、各自框选
       「换图」按钮已经删了，换图入口就只剩这里。 */

    for (const k of ["text", "mark"]) {
      const b = chips.createEl("button", {
        cls: "gd-chip" + (this.sel === k ? " is-on" : "") + ((k === "text" ? s.showMotto : lay[k].on) ? " has" : ""),
        text: LAYER_NAMES[k],
        attr: { title: "选中「" + LAYER_NAMES[k] + "」；右键可开关" },
      });
      b.onclick = (e) => { e.stopPropagation(); this.sel = k; this.render(); };
      b.oncontextmenu = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (k === "text") {
          this.sx.showMotto = !this.sx.showMotto;
          this.plugin.saveSettings();
        } else {
          lay[k].on = !lay[k].on;
          this.view.scheduleSave();
        }
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
    /* 「换图」已按用户要求删掉：换图入口统一在「层级」里 */
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

  /* 第二层是不是视频（视频要单独处理：它不能当背景图用） */
  isVideoLayer() {
    const lay = this.view.layout;
    const p = lay.photo || "";
    if (p && isVideoSrc(p)) return true;
    const w = this.wall();
    return !!(w && w.on && (w.items || []).some((it) => isVideoSrc(it.src || "")));
  }

  /* 四角把手：不显眼的四个小角，拖了改这一层的百分比宽高 */
  bindLayerGrips(d, k) {
    const lay = this.layers();
    const L = lay[k];
    if (!L) return;
    for (const c of ["nw", "ne", "sw", "se"]) {
      const g = d.createDiv({ cls: "gd-layer-grip is-" + c });
      g.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault(); ev.stopPropagation();
        this.sel = k;
        const box = this.el.querySelector(".gd-stage-box");
        const br = box ? box.getBoundingClientRect() : { width: 1, height: 1 };
        const x0 = ev.clientX, y0 = ev.clientY;
        const o = { x: L.x, y: L.y, w: L.w, h: L.h };
        d.addClass("is-resizing");
        const move = (e2) => {
          const dx = ((e2.clientX - x0) / Math.max(1, br.width)) * 100;
          const dy = ((e2.clientY - y0) / Math.max(1, br.height)) * 100;
          if (c.includes("w")) {
            const nw = clamp(o.w - dx, 6, 100);
            L.w = Math.round(nw * 10) / 10;
            L.x = Math.round(clamp(o.x + (o.w - nw), 0, 100 - L.w) * 10) / 10;
          } else {
            L.w = Math.round(clamp(o.w + dx, 6, 100 - o.x) * 10) / 10;
          }
          if (c.includes("n")) {
            const nh = clamp(o.h - dy, 6, 100);
            L.h = Math.round(nh * 10) / 10;
            L.y = Math.round(clamp(o.y + (o.h - nh), 0, 100 - L.h) * 10) / 10;
          } else {
            L.h = Math.round(clamp(o.h + dy, 6, 100 - o.y) * 10) / 10;
          }
          d.style.left = L.x + "%"; d.style.top = L.y + "%";
          d.style.width = L.w + "%"; d.style.height = L.h + "%";
        };
        const up = () => {
          document.removeEventListener("pointermove", move, true);
          document.removeEventListener("pointerup", up, true);
          d.removeClass("is-resizing");
          this.view.scheduleSave();
        };
        document.addEventListener("pointermove", move, true);
        document.addEventListener("pointerup", up, true);
      });
    }
  }

  /* 视频缩成右侧小窗 / 恢复整块（1.3）：
     小窗时这一层变成右侧一条竖长的区域，照片墙留在左边，两者并排不重合。 */
  setVideoPip(on) {
    const lay = this.layers();
    const L = lay.img;
    if (on) {
      /* 记下原来整块的位置，恢复时要能回来 */
      if (!this.view.layout.pipRestore) {
        this.view.layout.pipRestore = { x: L.x, y: L.y, w: L.w, h: L.h };
      }
      L.x = 70; L.y = 4; L.w = 27; L.h = 92;
    } else {
      const r = this.view.layout.pipRestore;
      if (r) {
        L.x = r.x; L.y = r.y; L.w = r.w; L.h = r.h;
        delete this.view.layout.pipRestore;
      } else {
        L.x = 0; L.y = 0; L.w = 100; L.h = 100;
      }
    }
    this.view.layout.videoPip = !!on;
    this.view.scheduleSave();
    this.render();
    new Notice(on ? "视频已缩到右侧小窗" : "视频已恢复整块");
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
      m.addItem((i) => i.setTitle("换一张照片").setIcon("image").onClick(() => this.view.pickCover && this.view.pickPhoto ? this.view.pickPhoto() : this.view.pickCover()));
      m.addItem((i) => i.setTitle("裁剪这张照片").setIcon("crop").onClick(() => this.view.cropPhoto()));
      /* 1.3 视频：能缩成右侧小窗口，跟照片并排 */
      if (this.isVideoLayer()) {
        m.addItem((i) => i.setTitle(this.view.layout.videoPip ? "视频恢复整块" : "视频缩成右侧小窗").setIcon("picture-in-picture").onClick(() => {
          this.setVideoPip(!this.view.layout.videoPip);
        }));
      }
      m.addItem((i) => i.setTitle("去掉照片").setIcon("x").onClick(() => {
        this.view.layout.photo = ""; this.view.scheduleSave(); this.render();
      }));
    }
    if (k === "text") {
      m.addItem((i) => i.setTitle("编辑座右铭").setIcon("type").onClick(() => this.view.editMotto()));
      m.addItem((i) => i.setTitle("放到左上角").setIcon("corner-up-left").onClick(() => {
        const L = lay.text;
        L.x = 4; L.y = 8; L.w = 56; L.h = 26;
        this.sx.showMotto = true;
        this.view.scheduleSave(); this.plugin.saveSettings(); this.render();
      }));
      m.addItem((i) => i.setTitle("拉到整幅宽（通栏）").setIcon("move-horizontal").onClick(() => {
        const L = lay.text;
        L.x = 0; L.w = 100;
        this.sx.showMotto = true;
        this.view.scheduleSave(); this.plugin.saveSettings(); this.render();
      }));
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
