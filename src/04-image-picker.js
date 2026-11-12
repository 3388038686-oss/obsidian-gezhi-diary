/* ============ 统一选图器（v3.12）============
 * 用户原话：「你的背景选择是从哪选择的？要统一，所有的格式都要是从图库里、
 *           从系统里、从一些链接里面，这些全部要统一化的。只要它要选取图片。」
 *           还有：「别忘了背景……它里面必须要从系统里面、从库里面这些，
 *           必须要重点提及。一个都不要忘，不然的话我到时候不好选图片了。」
 *
 * 所以全库只留这一条选图路径，八处入口（封面 / 照片层 / 头像 / 格子插图 /
 * 格子插动图 / 轮播壁纸 / 日历底图 / 主页背景图）全部走它，
 * 谁都不许自己弹文件框。三个来源一个都不能少：
 *   1. 从系统里选   —— 弹系统文件管理器，硬盘任意位置
 *   2. 从库里挑     —— 列库里已有的图，点一下选中，不用重新上传
 *   3. 贴链接       —— 粘一个 http(s) 图片地址
 * 三条路选完都进同一个裁剪框，裁完才落盘。
 * ============================================================ */

function pickIsImagePath(p) { return /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(String(p || "")); }
function pickIsVideoPath(p) { return typeof isVideoSrc === "function" ? isVideoSrc(p) : /\.(mp4|webm|ogv|mov|m4v|mkv)$/i.test(String(p || "")); }
function pickIsMediaPath(p) { return pickIsImagePath(p) || pickIsVideoPath(p); }
/* 系统文件框的 accept：允许视频时一起放开，否则「从系统里选」根本选不到 mp4 */
function pickAccept(o) {
  const a = o && o.accept;
  if (a) return a;
  return (o && o.allowVideo === false) ? "image/*" : "image/*,video/*";
}
function pickExtOf(p) {
  const m = /\.([a-z0-9]{2,5})$/i.exec(String(p || "").split("?")[0]);
  return m ? m[1].toLowerCase() : "";
}

/* 从库里挑：类型筛选（全部 / 图片 / 视频）+ 缩略图网格 + 搜索 + 多选。
   v3.23：加了 mdOnly，给灵感浮窗的「普通笔记」挑 md 用 —— 那种场景不要视频不要图。 */
class VaultPickModal extends Modal {
  constructor(app, plugin, opts) {
    super(app);
    this.plugin = plugin;
    this.o = opts || {};
    this.multi = !!this.o.multiple;
    this.mdOnly = !!this.o.mdOnly;
    this.allowVideo = this.o.allowVideo !== false;
    this.picked = new Set();
    this.kw = "";
    /* 类型筛选：跟着设置记住上次选的，下次打开还是那一档 */
    const saved = plugin && plugin.settings && plugin.settings.pickKind;
    this.kind = this.o.kind || (saved === "image" || saved === "video" ? saved : (this.allowVideo ? "all" : "image"));
    if (!this.allowVideo) this.kind = "image";
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-modal");
    contentEl.addClass("gd-vaultpick");
    if (this.modalEl) this.modalEl.style.width = "min(860px, 94vw)";
    contentEl.createEl("h3", { text: this.o.title || "从库里挑一张图" });
    contentEl.createDiv({
      cls: "gd-vaultpick-tip",
      text: this.mdOnly
        ? (this.multi ? "点一下选中（可多选）。这里只列笔记。" : "点一下就打开这篇笔记。")
        : (this.multi ? "点一下选中（可多选），最后按「用这些」。图片和视频都在这里。" : "点一下就选中。图片和视频都在这里。"),
    });

    const bar = contentEl.createDiv({ cls: "gd-vaultpick-bar" });
    /* 类型筛选：用户要的「能选视频，也要有格式」。挑笔记时不显示 */
    if (this.allowVideo && !this.mdOnly) {
      this.tabsEl = bar.createDiv({ cls: "gd-vaultpick-tabs" });
      const tabs = [["all", "全部"], ["image", "图片"], ["video", "视频"]];
      for (const [k, label] of tabs) {
        const b = this.tabsEl.createEl("button", { text: label, cls: "gd-vaultpick-tab" });
        if (this.kind === k) b.addClass("is-on");
        b.onclick = () => {
          this.kind = k;
          if (this.plugin && this.plugin.settings) { this.plugin.settings.pickKind = k; try { this.plugin.saveSettings(); } catch (e) { } }
          for (const x of this.tabsEl.children) x.removeClass("is-on");
          b.addClass("is-on");
          this.paint();
        };
      }
    }
    const inp = bar.createEl("input", { attr: { type: "text", placeholder: "搜文件名…" }, cls: "gd-vaultpick-search" });
    inp.oninput = () => { this.kw = String(inp.value || "").trim().toLowerCase(); this.paint(); };

    this.gridEl = contentEl.createDiv({ cls: "gd-vaultpick-grid" });
    this.footEl = contentEl.createDiv({ cls: "gd-modal-actions" });

    this.all = (this.app.vault.getFiles() || [])
      .filter((f) => {
        if (this.mdOnly) return f.extension === "md";
        return this.allowVideo ? pickIsMediaPath(f.path) : pickIsImagePath(f.path);
      })
      .sort((a, b) => (b.stat && b.stat.mtime ? b.stat.mtime : 0) - (a.stat && a.stat.mtime ? a.stat.mtime : 0));
    this.paint();

    if (this.multi) {
      this.footEl.createEl("button", { text: "取消" }).onclick = () => { this.close(); this.done([]); };
      const go = this.footEl.createEl("button", { text: "用这些", cls: "mod-cta" });
      go.onclick = () => {
        const list = Array.from(this.picked).map((p) => ({ kind: "path", path: p }));
        this.close(); this.done(list);
      };
    }
  }
  done(list) {
    if (this.o.onDone) this.o.onDone(list && list.length ? list : null);
  }
  paint() {
    if (!this.gridEl) return;
    this.gridEl.empty();
    let list = this.all;
    if (!this.mdOnly) {
      if (this.kind === "image") list = list.filter((f) => pickIsImagePath(f.path));
      else if (this.kind === "video") list = list.filter((f) => pickIsVideoPath(f.path));
    }
    if (this.kw) list = list.filter((f) => f.path.toLowerCase().includes(this.kw));
    if (!list.length) {
      const what = this.mdOnly ? "笔记" : (this.kind === "video" ? "视频" : (this.kind === "image" ? "图片" : "图片或视频"));
      this.gridEl.createDiv({
        cls: "gd-vaultpick-empty",
        text: this.mdOnly
          ? (this.all.length ? "没有匹配的笔记，换个词试试" : "库里还没有 md 笔记")
          : (this.all.length ? `没有匹配的${what}，换个词或切一下上面的「全部 / 图片 / 视频」` : `库里还没有${what}，先用「从系统里选」传一个`),
      });
      return;
    }
    for (const f of list.slice(0, 240)) {
      const isVid = !this.mdOnly && pickIsVideoPath(f.path);
      const cell = this.gridEl.createDiv({ cls: "gd-vaultpick-cell" });
      if (this.picked.has(f.path)) cell.addClass("is-on");
      const box = cell.createDiv({ cls: "gd-vaultpick-thumb" });
      if (this.mdOnly) {
        box.addClass("is-md");
        box.createDiv({ cls: "gd-vaultpick-md", text: "MD" });
      } else if (isVid) {
        box.addClass("is-video");
        box.createDiv({ cls: "gd-vaultpick-play", text: "▶" });
      } else {
        const url = this.plugin && this.plugin.thumbUrl ? this.plugin.thumbUrl(f.path) : "";
        if (url) box.style.backgroundImage = `url("${url}")`;
      }
      /* 格式角标：视频显示 mp4/webm，图片也标一下扩展名，用户要「有格式」 */
      const ext = pickExtOf(f.path);
      if (ext && !this.mdOnly) cell.createDiv({ cls: "gd-vaultpick-badge" + (isVid ? " is-video" : ""), text: ext.toUpperCase() });
      cell.createDiv({ cls: "gd-vaultpick-name", text: f.basename });
      cell.onclick = () => {
        if (this.multi) {
          if (this.picked.has(f.path)) { this.picked.delete(f.path); cell.removeClass("is-on"); }
          else { this.picked.add(f.path); cell.addClass("is-on"); }
          return;
        }
        this.close(); this.done([{ kind: "path", path: f.path }]);
      };
    }
  }
}

/* 三来源入口：系统 / 库里 / 链接 */
class ImageSourceModal extends Modal {
  constructor(app, plugin, opts) {
    super(app);
    this.plugin = plugin;
    this.o = opts || {};
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-modal");
    contentEl.addClass("gd-src");
    contentEl.createEl("h3", { text: this.o.title || "选一张图" });
    contentEl.createDiv({
      cls: "gd-src-tip",
      text: "三个来源都能用：硬盘里的、笔记库里的、网络上的。选完进裁剪框，裁完才保存。",
    });
    const box = contentEl.createDiv({ cls: "gd-src-list" });
    const row = (icon, name, desc, fn) => {
      const b = box.createDiv({ cls: "gd-src-item" });
      const ic = b.createDiv({ cls: "gd-src-icon" });
      try { setIcon(ic, icon); } catch (e) { }
      const tx = b.createDiv({ cls: "gd-src-text" });
      tx.createDiv({ cls: "gd-src-name", text: name });
      tx.createDiv({ cls: "gd-src-desc", text: desc });
      b.onclick = () => fn();
    };
    row("folder-open", "从系统里选", "弹电脑的文件管理器，硬盘任意位置都行", () => this.fromSystem());
    row("image", "从库里挑", "列笔记库里已有的图，点一下就选中，不用重新上传", () => this.fromVault());
    row("link", "贴一个链接", "粘 http:// 或 https:// 开头的图片地址（只存网址，不占地方）", () => this.fromUrl());
    if (this.o.allowUrl !== false) {
      row("download", "下载网络图片", "填网址，存进库里的附件夹：断网、对方删图都还看得见", () => this.fromUrlDownload());
    }
    const foot = contentEl.createDiv({ cls: "gd-modal-actions" });
    foot.createEl("button", { text: "取消" }).onclick = () => { this.close(); this.finish(null); };
  }
  finish(list) { if (this.o.onDone) this.o.onDone(list && list.length ? list : null); }
  async fromSystem() {
    const f = await chooseLocalFile({
      accept: pickAccept(this.o),
      multiple: !!this.o.multiple,
      title: this.o.systemTitle || "从电脑里选图或视频",
    });
    if (!f) return;
    const arr = Array.isArray(f) ? f : [f];
    const list = arr.filter(Boolean).map((x) => ({ kind: "file", file: x }));
    if (!list.length) return;
    this.close(); this.finish(list);
  }
  fromVault() {
    const self = this;
    new VaultPickModal(this.app, this.plugin, {
      title: this.o.title || "从库里挑一张图",
      multiple: !!this.o.multiple,
      allowVideo: this.o.allowVideo !== false,
      onDone: (list) => { self.close(); self.finish(list); },
    }).open();
  }
  fromUrl() {
    const self = this;
    new PromptModal(this.app, "用网络图片", "图片地址（http:// 或 https:// 开头）", "", (v) => {
      const u = String(v || "").trim();
      if (!u) { new Notice("没有填地址"); return; }
      if (!/^https?:\/\//i.test(u)) { new Notice("要以 http:// 或 https:// 开头"); return; }
      self.close(); self.finish([{ kind: "url", url: u }]);
    }).open();
  }

  /* 问题 3：粘网址的图断网 / 对方删图就变空白，所以给第二条路 —— 直接下载进库。
     选完跟别的一样进裁剪框。 */
  fromUrlDownload() {
    const self = this;
    new PromptModal(this.app, "下载网络图片", "填图片地址，会存进库里的附件夹，以后断网也看得见", "", async (v) => {
      const u = String(v || "").trim();
      if (!u) { new Notice("没有填地址"); return; }
      if (!/^https?:\/\//i.test(u)) { new Notice("要以 http:// 或 https:// 开头"); return; }
      new Notice("正在下载…");
      const got = await downloadUrlToVault(self.plugin, u, self.o.prefix || "url");
      if (!got) { new Notice("没下载下来，可能对方不许外链，换个地址或用「贴一个链接」"); return; }
      self.close(); self.finish([{ kind: "path", path: got }]);
    }).open();
  }
}

/* 问题 3：把网络图片下载进库，返回库内路径（失败返回 ""）。
   粘网址只存网址最省地方，但断网/对方删图就空白，所以给一个「存下来」的按钮。 */
async function downloadUrlToVault(plugin, url, prefix) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return "";
  try {
    const res = await fetch(u);
    if (!res || !res.ok) throw new Error("HTTP " + (res && res.status));
    const buf = await res.arrayBuffer();
    if (!buf || !buf.byteLength) throw new Error("空文件");
    const folder = plugin.attachDir();
    await plugin.ensureFolder(folder);
    let base = "";
    try { base = decodeURIComponent((u.split("?")[0].split("#")[0].split("/").pop() || "")); } catch (e) { base = ""; }
    base = String(base || "image").replace(/[\\/:*?"<>|]/g, "_");
    if (!/\.[a-z0-9]{2,5}$/i.test(base)) base += ".png";
    let path = `${folder}/${prefix ? prefix + "-" : ""}${base}`;
    if (await plugin.app.vault.adapter.exists(path)) path = `${folder}/${prefix ? prefix + "-" : ""}${Date.now()}-${base}`;
    await plugin.app.vault.adapter.writeBinary(path, buf);
    if (!(await plugin.app.vault.adapter.exists(path))) return "";
    return path;
  } catch (e) {
    console.error("[格间日记] 下载网络图片失败", e);
    return "";
  }
}

/* 批量选完逐个框选：照片墙要「直接出来图片并且选择区域」。
   返回 [{path,url,crop}]，取消的跳过。 */
async function chooseImagesWithCrop(app, plugin, opts) {
  const o = opts || {};
  const list = await pickImageSources(app, plugin, o);
  if (!list || !list.length) return [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const src = list[i];
    const nm = src.kind === "file" ? String(src.file.name || "") : String(src.path || src.url || "");
    const isVid = typeof isVideoSrc === "function" && isVideoSrc(nm);
    let crop = null;
    if (!isVid) {
      crop = await cropSource(app, plugin, src, Object.assign({}, o, {
        cropTitle: "裁剪第 " + (i + 1) + " / " + list.length + " 张（框选完再保存）",
        crop: null,
      }));
      if (crop === undefined) continue;   // 这一张取消，其余继续
    }
    const saved = await saveImageSource(plugin, src, o.prefix || "");
    if (!saved) continue;
    out.push({ path: saved.path, url: saved.url, crop: crop || null, kind: src.kind });
  }
  return out;
}

/* 打开选图器，返回数组（取消返回 null） */
function pickImageSources(app, plugin, opts) {
  return new Promise((resolve) => {
    new ImageSourceModal(app, plugin, Object.assign({}, opts, { onDone: resolve })).open();
  });
}

/* 拿一个可显示的地址（给裁剪框用） */
async function sourcePreviewUrl(plugin, src) {
  try {
    if (src.kind === "url") return src.url;
    if (src.kind === "path") return plugin.thumbUrl ? plugin.thumbUrl(src.path) : "";
    return URL.createObjectURL(new Blob([await src.file.arrayBuffer()]));
  } catch (e) { return ""; }
}

/* 把选中的来源落盘：file → 写进 attachments；path / url 原样用 */
async function saveImageSource(plugin, src, prefix) {
  if (!src) return null;
  if (src.kind === "url") return { path: src.url, url: src.url };
  if (src.kind === "path") return { path: src.path, url: plugin.thumbUrl ? plugin.thumbUrl(src.path) : "" };
  const f = src.file;
  try {
    const folder = plugin.attachDir();
    await plugin.ensureFolder(folder);
    const safe = String((f && f.name) || (prefix || "img") + ".png").replace(/[\\/:*?"<>|]/g, "_");
    let path = `${folder}/${prefix ? prefix + "-" : ""}${safe}`;
    if (await plugin.app.vault.adapter.exists(path)) path = `${folder}/${prefix ? prefix + "-" : ""}${Date.now()}-${safe}`;
    await plugin.app.vault.adapter.writeBinary(path, await f.arrayBuffer());
    if (!(await plugin.app.vault.adapter.exists(path))) return null;
    return { path, url: plugin.thumbUrl ? plugin.thumbUrl(path) : "" };
  } catch (e) {
    console.error("[格间日记] saveImageSource", e);
    return null;
  }
}

/* 裁剪：返回 crop 对象 / null（不裁剪）/ undefined（取消） */
function cropSource(app, plugin, src, opts) {
  return new Promise((resolve) => {
    const o = opts || {};
    let tmp = "";
    const done = () => { if (tmp) { try { URL.revokeObjectURL(tmp); } catch (e) { } } };
    (async () => {
      let url = "";
      try { url = await sourcePreviewUrl(plugin, src); } catch (e) { url = ""; }
      if (src.kind === "file" && url) tmp = url;
      if (!url) { done(); resolve(null); return; }
      openCrop(app, {
        url,
        ratio: Number(o.ratio) || 0,
        crop: o.crop || null,
        title: o.cropTitle || "裁剪图片（框选完再保存）",
        onCancel: () => { done(); resolve(undefined); },
        onOk: (c) => { done(); resolve(c || null); },
      });
    })();
  });
}

/* 一站式：选来源 → 裁剪 → 落盘。返回 { path, url, crop, kind } 或 null */
async function chooseImage(app, plugin, opts) {
  const o = opts || {};
  const list = await pickImageSources(app, plugin, o);
  if (!list || !list.length) return null;
  const src = list[0];
  const nm = src.kind === "file" ? String(src.file.name || "") : String(src.path || src.url || "");
  const isVid = typeof isVideoSrc === "function" && isVideoSrc(nm);
  let crop = null;
  /* 定案 6：所有选图入口（单张）都要先过裁剪框，默认居中裁剪，
     下面一排「居中裁剪 / 填充 / 适应 / 拉伸 / 平铺 / 原图」，再下面手动框选 / 取消 / 保存。
     以前是「只有传了 ratio 才裁」，所以大部分入口选完直接就落盘，根本看不到那一排。
     多选（照片墙、批量填槽）不逐个弹框，走 o.crop === false 的情形。 */
  const skipCrop = isVid || !!o.multiple || o.crop === false;
  if (!skipCrop) {
    crop = await cropSource(app, plugin, src, o);
    if (crop === undefined) return null;
  }
  const saved = await saveImageSource(plugin, src, o.prefix || "");
  if (!saved) { new Notice("这张图存不进去，换一张试试"); return null; }
  return { path: saved.path, url: saved.url, crop: crop || null, kind: src.kind };
}

/* 只选不裁（格子插图、附件、轮播这类用） */
async function chooseImageRaw(app, plugin, opts) {
  const o = opts || {};
  const list = await pickImageSources(app, plugin, o);
  if (!list || !list.length) return null;
  return o.multiple ? list : list[0];
}

/* 把任意来源统一成「类 File」对象（name / size / arrayBuffer），
   这样老代码不用改就能继续用：库里挑的读成 buffer，链接的 fetch 下来。 */
async function sourceToFile(plugin, src) {
  if (!src) return null;
  if (src.kind === "file") return src.file;
  const base = (s) => String(s || "").split("?")[0].split("/").pop() || "image.png";
  if (src.kind === "path") {
    try {
      const buf = await plugin.app.vault.adapter.readBinary(normalizePath(src.path));
      return {
        name: base(src.path), path: src.path, size: buf.byteLength, type: "",
        arrayBuffer: () => Promise.resolve(buf),
      };
    } catch (e) { console.error("[格间日记] 读库内图失败", e); return null; }
  }
  if (src.kind === "url") {
    return {
      name: base(src.url), path: "", size: 0, type: "", url: src.url,
      arrayBuffer: async () => {
        const res = await fetch(src.url);
        if (!res || !res.ok) throw new Error("下载失败 " + (res && res.status));
        return await res.arrayBuffer();
      },
    };
  }
  return null;
}

/* 给老代码用的入口：返回「类 File」对象，multiple 时返回数组。
   三个来源、缩略图选择、链接下载，全在这一条路上。 */
async function chooseFileLike(plugin, opts) {
  const o = opts || {};
  const list = await pickImageSources(plugin.app, plugin, o);
  if (!list || !list.length) return null;
  const files = [];
  for (const src of list) {
    const f = await sourceToFile(plugin, src);
    if (f) files.push(f);
  }
  if (!files.length) { new Notice("这个来源读不出来，换一个试试"); return null; }
  return o.multiple ? files : files[0];
}

/* 把选中的「类 File」落进 attachments，返回库内路径。
   已经在库里挑的（f.path 是库内路径）就直接复用，不重复存一份。 */
async function stashFile(plugin, f, prefix) {
  if (!f) return "";
  const p0 = String(f.path || "");
  if (p0 && plugin.app.vault.getAbstractFileByPath(normalizePath(p0))) return p0;
  try {
    const folder = plugin.attachDir();
    await plugin.ensureFolder(folder);
    const safe = String(f.name || "img.png").replace(/[\\/:*?"<>|]/g, "_");
    let path = `${folder}/${prefix ? prefix + "-" : ""}${safe}`;
    if (await plugin.app.vault.adapter.exists(path)) path = `${folder}/${prefix ? prefix + "-" : ""}${Date.now()}-${safe}`;
    await plugin.app.vault.adapter.writeBinary(path, await f.arrayBuffer());
    if (!(await plugin.app.vault.adapter.exists(path))) return "";
    return path;
  } catch (e) {
    console.error("[格间日记] stashFile", e);
    return "";
  }
}
