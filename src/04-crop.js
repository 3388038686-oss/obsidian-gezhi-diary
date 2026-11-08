/* ============ 裁剪对话框（类似微信头像的居中裁剪）============
 * 用户要的是「选完图之后再点进去调」，所以这里不拦在选图流程里，
 * 而是给每个图层一个「裁剪」入口。
 *
 * 存法：不剪原图，只把「框在图的哪个位置、多大」存成百分比。
 *   crop = { x, y, w, h }   都是相对原图的百分比（0–100）
 * 这样随时能改回来，原图一直完好。
 *
 * 渲染：cropCss(crop) 把它翻译成 background-size / background-position。
 * ============================================================ */

/* 把 crop 换成背景的 size / position */
function cropCss(crop) {
  if (!crop || !(crop.w > 0) || !(crop.h > 0)) return null;
  const w = clamp(Number(crop.w) || 100, 1, 100);
  const h = clamp(Number(crop.h) || 100, 1, 100);
  const x = clamp(Number(crop.x) || 0, 0, 100 - w);
  const y = clamp(Number(crop.y) || 0, 0, 100 - h);
  /* 宽高都给死：裁剪框和容器的宽高比是同一个，所以不会拉变形 */
  const size = (10000 / w).toFixed(2) + "% " + (10000 / h).toFixed(2) + "%";
  const px = w >= 99.9 ? 0 : (x / (100 - w)) * 100;
  const py = h >= 99.9 ? 0 : (y / (100 - h)) * 100;
  return { size, position: px.toFixed(2) + "% " + py.toFixed(2) + "%" };
}

/* 把 crop 应用到某个元素的背景上；crop 为空就退回 cover / 取景位置 */
function applyCrop(el, crop, fallbackPos) {
  const c = cropCss(crop);
  if (c) {
    el.style.backgroundSize = c.size;
    el.style.backgroundPosition = c.position;
    return true;
  }
  el.style.backgroundSize = "cover";
  el.style.backgroundPosition = fallbackPos || "50% 50%";
  return false;
}

class CropModal extends Modal {
  /**
   * opts = {
   *   url,           图片地址（resource 路径）
   *   ratio,         裁剪框宽高比，0 = 自由
   *   crop,          已有的 crop
   *   title,         标题
   *   onOk(crop)     确定回调，传 null 表示「不裁剪，整张铺」
   * }
   */
  constructor(app, opts) {
    super(app);
    this.o = opts || {};
    this.ratio = Number(this.o.ratio) || 0;
    this.zoom = 1;
    this.ox = 0;
    this.oy = 0;
    this.nw = 0;
    this.nh = 0;
    this.ready = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-modal");
    contentEl.addClass("gd-crop-modal");
    contentEl.createEl("h3", { text: this.o.title || "裁剪图片" });

    const tip = contentEl.createDiv({ cls: "gd-crop-tip" });
    tip.setText("拖动图片挪位置，滚轮或双指缩放。框外的部分会被切掉。");

    const stage = contentEl.createDiv({ cls: "gd-crop-stage" });
    /* 框的尺寸：按比例算，最长边不超过 420 */
    const R = this.ratio > 0 ? this.ratio : 1.75;
    let bw = 420, bh = Math.round(bw / R);
    if (bh > 320) { bh = 320; bw = Math.round(bh * R); }
    if (bh < 120) { bh = 120; bw = Math.round(bh * R); }
    stage.style.width = bw + "px";
    stage.style.height = bh + "px";
    this.bw = bw; this.bh = bh;

    this.img = stage.createEl("img", { cls: "gd-crop-img" });
    this.img.src = this.o.url || "";
    this.img.draggable = false;
    this.img.onload = () => {
      this.nw = this.img.naturalWidth || this.bw;
      this.nh = this.img.naturalHeight || this.bh;
      this.ready = true;
      /* 有旧 crop 就从它推回来，没有就居中铺满 */
      if (this.o.crop && this.o.crop.w > 0) this.applyCropInit(this.o.crop);
      this.paint();
    };
    this.img.onerror = () => { tip.setText("这张图加载不出来，可能路径失效了。"); };

    /* 框：用超大 box-shadow 压暗外面 */
    stage.createDiv({ cls: "gd-crop-frame" });

    /* 交互 */
    let dragging = false, sx = 0, sy = 0, ox0 = 0, oy0 = 0;
    stage.addEventListener("pointerdown", (e) => {
      if (!this.ready) return;
      dragging = true; sx = e.clientX; sy = e.clientY; ox0 = this.ox; oy0 = this.oy;
      stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
      stage.addClass("is-drag");
      e.preventDefault();
    });
    stage.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      this.ox = ox0 + (e.clientX - sx);
      this.oy = oy0 + (e.clientY - sy);
      this.paint();
    });
    const stop = () => { dragging = false; stage.removeClass("is-drag"); };
    stage.addEventListener("pointerup", stop);
    stage.addEventListener("pointercancel", stop);
    stage.addEventListener("wheel", (e) => {
      if (!this.ready) return;
      e.preventDefault();
      this.setZoom(this.zoom * (e.deltaY > 0 ? 0.94 : 1.06));
    }, { passive: false });

    const zoomRow = contentEl.createDiv({ cls: "gd-crop-zoom" });
    const zl = zoomRow.createEl("button", { cls: "gd-mini-btn", text: "－" });
    zl.onclick = () => this.setZoom(this.zoom / 1.15);
    this.zLabel = zoomRow.createSpan({ cls: "gd-crop-zval", text: "100%" });
    const zr = zoomRow.createEl("button", { cls: "gd-mini-btn", text: "＋" });
    zr.onclick = () => this.setZoom(this.zoom * 1.15);

    const acts = contentEl.createDiv({ cls: "gd-modal-actions" });
    const bCenter = acts.createEl("button", { text: "居中" });
    bCenter.onclick = () => { this.ox = 0; this.oy = 0; this.zoom = 1; this.paint(); };
    const bFull = acts.createEl("button", { text: "不裁剪" });
    bFull.onclick = () => { this.close(); if (this.o.onOk) this.o.onOk(null); };
    const bCancel = acts.createEl("button", { text: "取消" });
    bCancel.onclick = () => this.close();
    const bOk = acts.createEl("button", { text: "确定", cls: "mod-cta" });
    bOk.onclick = () => { this.close(); if (this.o.onOk) this.o.onOk(this.result()); };
  }

  onClose() { this.contentEl.empty(); }

  /* 从已有 crop 反推 zoom / 偏移 */
  applyCropInit(c) {
    const w = clamp(Number(c.w) || 100, 1, 100);
    /* crop 占图宽的 w%，框宽 bw ⇒ 图宽 = bw * 100 / w */
    const imgW = this.bw * (100 / w);
    const baseScale = Math.max(this.bw / this.nw, this.bh / this.nh);
    this.zoom = clamp(imgW / (this.nw * baseScale), 1, 8);
    const scale = baseScale * this.zoom;
    const fullW = this.nw * scale;
    const fullH = this.nh * scale;
    /* 让 crop 左上角落在框左上角 */
    const targetX = -(Number(c.x) || 0) / 100 * fullW;
    const targetY = -(Number(c.y) || 0) / 100 * fullH;
    this.ox = targetX - (this.bw - fullW) / 2;
    this.oy = targetY - (this.bh - fullH) / 2;
  }

  setZoom(z) {
    const old = this.zoom;
    this.zoom = clamp(z, 1, 8);
    const k = this.zoom / old;
    this.ox *= k; this.oy *= k;
    this.paint();
  }

  /* 算出当前图的位置，写进样式，并夹住不让框露白 */
  paint() {
    if (!this.ready) return;
    const baseScale = Math.max(this.bw / this.nw, this.bh / this.nh);
    const scale = baseScale * this.zoom;
    const fullW = this.nw * scale;
    const fullH = this.nh * scale;
    /* 居中 + 偏移，然后夹住 */
    let x = (this.bw - fullW) / 2 + this.ox;
    let y = (this.bh - fullH) / 2 + this.oy;
    x = clamp(x, this.bw - fullW, 0);
    y = clamp(y, this.bh - fullH, 0);
    this._x = x; this._y = y; this._fullW = fullW; this._fullH = fullH;
    this.img.style.width = fullW + "px";
    this.img.style.height = fullH + "px";
    this.img.style.left = x + "px";
    this.img.style.top = y + "px";
    if (this.zLabel) this.zLabel.setText(Math.round(this.zoom * 100) + "%");
  }

  /* 当前可见框对应的 crop（原图百分比） */
  result() {
    if (!this.ready || !this._fullW) return null;
    return {
      x: Math.round((-this._x / this._fullW) * 1000) / 10,
      y: Math.round((-this._y / this._fullH) * 1000) / 10,
      w: Math.round((this.bw / this._fullW) * 1000) / 10,
      h: Math.round((this.bh / this._fullH) * 1000) / 10,
    };
  }
}

/* 打开裁剪框的快捷方式：传 view 或 plugin 都行 */
function openCrop(app, opts) {
  new CropModal(app, opts).open();
}
