/* ============ 粘贴生成对话框 · 模板 · 输入 ============ */


/* ============ 批量封面：一次给很多天设同一张壁纸 ============
 * 用户的原话是「图片壁纸只能一个个设计，无法批量选中」。
 * 这里做成：选一张图 → 勾选要套用的日期（默认全选）→ 一次写入所有 layout。 */
class BatchCoverModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.picked = "";              // 已选的图片路径
    this.dates = new Set();        // 勾选的日期
    this.mode = "set";             // set | clear
    this.height = 160;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-modal"); contentEl.addClass("gd-batch-cover");
    if (this.modalEl) this.modalEl.style.width = "min(720px, 92vw)";
    contentEl.createEl("h3", { text: "批量封面" });
    contentEl.createEl("p", {
      text: "选一张图，勾上要套用的日子，一次全部写好。已有的格子内容一个字都不会动。",
      cls: "gd-modal-desc",
    });

    /* 选图 */
    const pickRow = contentEl.createDiv({ cls: "gd-batch-pick" });
    this.pickRow = pickRow;
    const pickBtn = pickRow.createEl("button", { text: "选择图片…", cls: "mod-cta" });
    this.pickLabel = pickRow.createSpan({ cls: "gd-batch-pickname", text: "还没有选图" });
    pickBtn.onclick = () => this.pickImage();

    /* 从库里挑已有图片 */
    const libBtn = pickRow.createEl("button", { text: "从库里的图片挑" });
    libBtn.onclick = () => this.pickFromVault();

    /* 高度 */
    const hRow = contentEl.createDiv({ cls: "gd-batch-row" });
    hRow.createSpan({ text: "封面高度" });
    const hInput = hRow.createEl("input", { attr: { type: "range", min: "60", max: "320", step: "10", value: String(this.height) }, cls: "gd-batch-range" });
    const hVal = hRow.createSpan({ text: this.height + "px", cls: "gd-batch-hval" });
    hInput.oninput = () => { this.height = parseInt(hInput.value, 10) || 160; hVal.textContent = this.height + "px"; };

    /* 日期清单 */
    const listHead = contentEl.createDiv({ cls: "gd-batch-row" });
    listHead.createSpan({ text: "要套用的日期" });
    const ops = listHead.createDiv({ cls: "gd-batch-ops" });
    const allBtn = ops.createEl("button", { text: "全选" });
    const noneBtn = ops.createEl("button", { text: "全不选" });
    const recentBtn = ops.createEl("button", { text: "最近 30 天" });

    this.listEl = contentEl.createDiv({ cls: "gd-batch-list" });
    const files = this.plugin.dayFiles();
    for (const f of files) {
      const key = f.basename;
      const row = this.listEl.createDiv({ cls: "gd-batch-item" });
      const cb = row.createEl("input", { attr: { type: "checkbox" } });
      cb.checked = true;
      this.dates.add(key);
      cb.onchange = () => { if (cb.checked) this.dates.add(key); else this.dates.delete(key); this.updateCount(); };
      row.createSpan({ text: dateShort(key) + "  " + weekdayCN(key), cls: "gd-batch-date" });
      const suf = splitDayKey(key).suffix;
      if (suf) row.createSpan({ text: "第 " + suf + " 篇", cls: "gd-batch-tag" });
      row.onclick = (e) => { if (e.target !== cb) { cb.checked = !cb.checked; cb.onchange(); } };
    }
    allBtn.onclick = () => { this.listEl.querySelectorAll("input").forEach((c) => { c.checked = true; }); this.dates = new Set(files.map((f) => f.basename)); this.updateCount(); };
    noneBtn.onclick = () => { this.listEl.querySelectorAll("input").forEach((c) => { c.checked = false; }); this.dates.clear(); this.updateCount(); };
    recentBtn.onclick = () => {
      const cut = shiftDate(todayStr(), -30);
      this.dates.clear();
      this.listEl.querySelectorAll(".gd-batch-item").forEach((row, i) => {
        const key = files[i] && files[i].basename;
        const on = !!key && key >= cut;
        const cb = row.querySelector("input");
        if (cb) cb.checked = on;
        if (on && key) this.dates.add(key);
      });
      this.updateCount();
    };

    this.countEl = contentEl.createDiv({ cls: "gd-batch-count" });
    this.updateCount();

    const foot = contentEl.createDiv({ cls: "gd-modal-actions" });
    const clearBtn = foot.createEl("button", { text: "只清除封面" });
    clearBtn.onclick = () => this.commit("clear");
    foot.createEl("button", { text: "取消" }).onclick = () => this.close();
    const go = foot.createEl("button", { text: "套用到选中的日期", cls: "mod-cta" });
    go.onclick = () => this.commit("set");
  }
  updateCount() {
    if (!this.countEl) return;
    this.countEl.textContent = `已选 ${this.dates.size} 天` + (this.picked ? `　图片：${this.picked.split("/").pop()}` : "　还没选图");
  }
  async pickImage() {
    const f = await chooseLocalFile({ accept: "image/*", title: "选一张封面图" });
    if (!f) return;
    try {
      const folder = this.plugin.attachDir();
      await this.plugin.ensureFolder(folder);
      const safe = String(f.name || "cover.png").replace(/[\\/:*?"<>|]/g, "_");
      let path = `${folder}/${safe}`;
      if (await this.app.vault.adapter.exists(path)) path = `${folder}/${Date.now()}-${safe}`;
      const buf = await f.arrayBuffer();
      await this.app.vault.adapter.writeBinary(path, buf);
      if (!(await this.app.vault.adapter.exists(path))) { new Notice("图片写不进去：" + path); return; }
      this.picked = path;
      this.updateCount();
      this.showThumb(path);
      new Notice("已选好：" + safe + "（" + Math.round((buf.byteLength || 0) / 1024) + " KB）");
    } catch (e) {
      new Notice("保存图片失败：" + (e && e.message ? e.message : e));
      console.error("[格间日记] BatchCoverModal.pickImage", e);
    }
  }
  /* 选完给用户看得到的东西：缩略图，而不是只有一行字 */
  showThumb(path) {
    if (!this.pickRow) return;
    if (this.thumbEl) { this.thumbEl.remove(); this.thumbEl = null; }
    const res = this.plugin.thumbUrl ? this.plugin.thumbUrl(path) : "";
    if (!res) return;
    const img = document.createElement("img");
    img.addClass("gd-batch-thumb");
    img.src = res;
    this.thumbEl = img;
    this.pickRow.appendChild(img);
  }
  pickFromVault() {
    const imgs = this.app.vault.getFiles().filter((f) => /^(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(f.extension));
    if (!imgs.length) { new Notice("库里还没有图片"); return; }
    const m = new Menu();
    for (const f of imgs.slice(-30).reverse()) {
      m.addItem((i) => i.setTitle(f.basename).setIcon("image").onClick(() => {
        this.picked = f.path;
        this.updateCount();
      }));
    }
    showMenuAt(m, { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
  }
  async commit(mode) {
    if (!this.dates.size) { new Notice("先勾选要套用的日期"); return; }
    if (mode === "set" && !this.picked) { new Notice("先选一张图"); return; }
    const folder = normalizePath(this.plugin.settings.rootFolder || "日记");
    const errors = [];
    let ok = 0, fail = 0;
    for (const key of this.dates) {
      try {
        const path = `${folder}/${key}.md`;
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) { fail++; errors.push(key + "：文件不在 " + path); continue; }
        const raw = await this.app.vault.read(file);
        const parsed = parseDay(raw, this.plugin.settings.headingLevel);
        const lay = normalizeLayout(parsed.layout, this.plugin.settings);
        if (mode === "clear") {
          lay.cover = "";
          lay.coverHeight = 0;
          if (lay.layers && lay.layers.bg) lay.layers.bg.on = false;
        } else {
          lay.cover = this.picked;
          lay.coverHeight = this.height;
          lay.coverPos = "";
          /* 关键：舞台模式下背景层不打开，设了封面也看不见 —— 这正是"批量换壁纸没反应"的真因之一 */
          if (!lay.layers) lay.layers = normalizeLayers(null, lay, this.plugin.settings);
          lay.layers.bg.on = true;
          if (!this.plugin.settings.showStage) {
            /* 不在舞台模式时，老封面框也得能看见 */
            if (!lay.coverHeight || lay.coverHeight < 60) lay.coverHeight = this.height;
          }
        }
        const cells = normalizeCells(parsed.cells, lay, this.plugin.settings);
        const md = serializeDay(splitDayKey(key).date, cells, {
          fm: parsed.fm, h1: parsed.h1,
          columns: lay.cols || (parsed.layout && parsed.layout.cols) || this.plugin.settings.columns,
          level: this.plugin.settings.headingLevel,
          layout: lay,
        });
        await this.app.vault.modify(file, md);
        ok++;
      } catch (e) {
        fail++;
        errors.push(key + "：" + ((e && e.message) || String(e)));
        console.error("[格间日记] 批量封面失败", key, e);
      }
    }
    const head = mode === "clear" ? `已清除 ${ok} 天的封面` : `已给 ${ok} 天套上封面`;
    new Notice(fail ? `${head}，${fail} 天没成功（详见控制台）` : head, fail ? 8000 : 3000);
    if (errors.length) {
      console.warn("[格间日记] 批量封面失败明细：\n" + errors.join("\n"));
      new Notice(errors.slice(0, 3).join("\n"), 12000);
    }
    this.close();
    this.plugin.refreshAll(true);
  }

}

class PasteModal extends Modal {
  constructor(app, plugin, initialText) {
    super(app);
    this.plugin = plugin;
    this.mode = plugin.settings.pasteMode;
    this.target = plugin.settings.pasteTarget;
    this.text = initialText || "";
    this.segments = [];
    this.reparse = debounce(() => this.renderSegments(), 180);
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-modal"); contentEl.addClass("gd-paste-modal");
    if (this.modalEl) this.modalEl.style.width = "min(880px, 92vw)";
    contentEl.createEl("h3", { text: "粘贴生成格子" });
    contentEl.createEl("p", {
      text: "把任意纯文本贴进来，自动拆成格子；右侧可以改标题、调顺序、去掉不要的段落，确认后一次写入。",
      cls: "gd-modal-desc",
    });

    const bar = contentEl.createDiv({ cls: "gd-paste-bar" });
    new Setting(bar).setName("识别方式").addDropdown((d) => {
      for (const [v, n] of PASTE_MODES) d.addOption(v, n);
      d.setValue(this.mode).onChange((v) => { this.mode = v; this.renderSegments(); });
    });
    new Setting(bar).setName("写入方式").addDropdown((d) => {
      for (const [v, n] of PASTE_TARGETS) d.addOption(v, n);
      d.setValue(this.target).onChange((v) => { this.target = v; });
    });

    const body = contentEl.createDiv({ cls: "gd-paste-body" });
    const left = body.createDiv({ cls: "gd-paste-left" });
    left.createEl("label", { text: "原文", cls: "gd-field-label" });
    this.input = left.createEl("textarea", { cls: "gd-paste-input", attr: { placeholder: "例如：\n\n今日事件\n今天去看了展\n\n今日新知\n原来纸张会随时间变黄\n\n或者 ## 标题 / 标题：内容 / | 表格 |" } });
    this.input.value = this.text;
    this.input.addEventListener("input", () => { this.text = this.input.value; this.reparse(); });

    const right = body.createDiv({ cls: "gd-paste-right" });
    const rh = right.createDiv({ cls: "gd-paste-rhead" });
    rh.createEl("label", { text: "识别结果", cls: "gd-field-label" });
    this.countEl = rh.createSpan({ cls: "gd-paste-count" });
    this.listEl = right.createDiv({ cls: "gd-seg-list" });

    const foot = contentEl.createDiv({ cls: "gd-modal-actions" });
    const clip = foot.createEl("button", { text: "读取剪贴板" });
    clip.onclick = async () => {
      try {
        const t = await navigator.clipboard.readText();
        this.input.value = t; this.text = t; this.renderSegments();
      } catch (e) { new Notice("读取剪贴板失败，请直接粘贴到左侧文本框"); }
    };
    foot.createEl("button", { text: "取消" }).onclick = () => this.close();
    const go = foot.createEl("button", { text: "生成格子", cls: "mod-cta" });
    go.onclick = () => this.commit();

    this.renderSegments();
    setTimeout(() => { if (!this.text) this.input.focus(); }, 60);
  }
  renderSegments() {
    const opts = {
      pasteFirstLineAsTitle: this.plugin.settings.pasteFirstLineAsTitle,
      pasteSeparator: this.plugin.settings.pasteSeparator,
    };
    const parsed = parsePaste(this.text, this.mode, opts);
    // 保留用户对已识别分段的手动修改
    const old = this.segments || [];
    this.segments = parsed.map((p, i) => ({
      title: (old[i] && old[i].__dirty) ? old[i].title : p.title,
      content: p.content,
      __skip: (old[i] && old[i].__skip) || false,
      __dirty: (old[i] && old[i].__dirty) || false,
    }));
    /* 对齐当前模板：标题写法统一、模板里没写到的格子补空 */
    const tpl = (this.plugin.settings.templates || []).find((x) => x.name === this.plugin.settings.activeTemplate)
      || (this.plugin.settings.templates || [])[0];
    const tplTitles = tpl && Array.isArray(tpl.cells) ? tpl.cells.map((c) => c.title) : [];
    if (tplTitles.length) {
      const norm = (s) => String(s || "").replace(/[\s　:：*_#]/g, "").toLowerCase();
      const tplMap = new Map(tplTitles.map((x) => [norm(x), x]));
      for (const seg of this.segments) {
        if (seg.__dirty) continue;
        const hit = tplMap.get(norm(seg.title));
        if (hit) seg.title = hit;
      }
      /* 按模板顺序重排，并把模板里缺的补进来（空内容，用户可在右侧删掉） */
      const byTitle = new Map(this.segments.map((s) => [norm(s.title), s]));
      const ordered = [];
      for (const title of tplTitles) {
        const hit = byTitle.get(norm(title));
        if (hit) { ordered.push(hit); byTitle.delete(norm(title)); }
        else ordered.push({ title, content: "", __skip: true, __dirty: false, __fill: true });
      }
      for (const rest of byTitle.values()) ordered.push(rest);
      this.segments = ordered;
    }

    const n = this.segments.length;
    this.countEl.textContent = n ? `${n} 个格子` : "等待输入";
    this.listEl.empty();
    if (!n) { this.listEl.createEl("p", { text: "左侧贴入内容后，这里会实时显示拆分结果。", cls: "gd-empty" }); return; }
    this.segments.forEach((seg, i) => {
      const row = this.listEl.createDiv({ cls: "gd-seg-row" + (seg.__skip ? " is-off" : "") });
      const check = row.createEl("input", { attr: { type: "checkbox", title: "保留这一段" }, cls: "gd-seg-check" });
      check.checked = !seg.__skip;
      check.onchange = () => { seg.__skip = !check.checked; row.toggleClass("is-off", seg.__skip); };
      const mid = row.createDiv({ cls: "gd-seg-mid" });
      const ti = mid.createEl("input", { cls: "gd-seg-title", attr: { placeholder: "格子标题" } });
      ti.value = seg.title;
      ti.oninput = () => { seg.title = ti.value; seg.__dirty = true; };
      if (seg.__fill) mid.createEl("div", { text: "（这一格没写，保留为空）", cls: "gd-seg-preview gd-seg-fill" });
      else mid.createEl("div", { text: truncate(seg.content, 90) || "（空）", cls: "gd-seg-preview" });
      const ops = row.createDiv({ cls: "gd-seg-ops" });
      const up = ops.createEl("button", { text: "↑", cls: "gd-mini-btn", attr: { title: "上移" } });
      up.onclick = () => { if (i > 0) { const t = this.segments[i - 1]; this.segments[i - 1] = seg; this.segments[i] = t; this.renderSegments(); } };
      const dn = ops.createEl("button", { text: "↓", cls: "gd-mini-btn", attr: { title: "下移" } });
      dn.onclick = () => { if (i < this.segments.length - 1) { const t = this.segments[i + 1]; this.segments[i + 1] = seg; this.segments[i] = t; this.renderSegments(); } };
    });
  }
  async commit() {
    const view = this.plugin.gridView();
    if (!view) { new Notice("请先打开格间日记视图"); return; }
    const picked = this.segments.filter((s) => !s.__skip);
    if (!picked.length) { new Notice("没有选中任何段落"); return; }
    await view.saveNow(); // 先把输入框里还没落盘的内容写进去，避免被覆盖
    const before = await this.app.vault.read(view.file);
    this.plugin.history.pushUndo(view.file, before, "粘贴生成格子");
    await this.plugin.history.snapshot(view.file, "粘贴前", true);
    view.cells = applyPaste(view.cells, this.segments, this.target);
    await view.save(true);
    this.plugin.settings.pasteMode = this.mode;
    this.plugin.settings.pasteTarget = this.target;
    await this.plugin.saveSettings();
    this.close();
    new Notice(`已生成 ${picked.length} 个格子`);
  }
  onClose() { this.reparse.cancel(); this.contentEl.empty(); }
}

class PromptModal extends Modal {
  constructor(app, title, label, value, onOk) {
    super(app);
    this.t = title; this.l = label; this.v = value || ""; this.onOk = onOk;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-modal");
    contentEl.createEl("h3", { text: this.t });
    new Setting(contentEl).setName(this.l).addText((t) => {
      t.setValue(this.v).onChange((v) => { this.v = v; });
      t.inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { this.close(); this.onOk(this.v); } });
      setTimeout(() => t.inputEl.focus(), 50);
    });
    const row = contentEl.createDiv({ cls: "gd-modal-actions" });
    row.createEl("button", { text: "取消" }).onclick = () => this.close();
    row.createEl("button", { text: "确定", cls: "mod-cta" }).onclick = () => { this.close(); this.onOk(this.v); };
  }
  onClose() { this.contentEl.empty(); }
}

/* 保存模板：可选只存标题骨架，还是标题 + 内容一起存 */
class TemplateSaveModal extends Modal {
  constructor(app, plugin, cells, defaultName) {
    super(app);
    this.plugin = plugin;
    this.cells = cells || [];
    this.name = defaultName || "";
    this.withContent = false;
    this.kind = "grid";
    this.picked = this.cells.map(() => true);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-modal");
    contentEl.createEl("h3", { text: "存成模板" });
    contentEl.createEl("p", {
      cls: "gd-modal-desc",
      text: "「只存标题」是空的骨架，下次套用是一张白纸；「连内容一起存」会把现在写的东西也存进去，当范文或重复的固定格式用。",
    });

    new Setting(contentEl).setName("模板名字").addText((tx) => {
      tx.setValue(this.name).setPlaceholder("比如：九宫格晨间");
      tx.oninput = () => { this.name = tx.value.trim(); };
    });

    new Setting(contentEl).setName("模板种类")
      .setDesc("分类只影响模板列表怎么分组，不影响格子的行为。排序为：主页 → 目录 → 日历 → 悬浮窗 → 格子 → 表格。")
      .addDropdown((d) => {
        for (const [v, n] of TEMPLATE_KINDS) d.addOption(v, n);
        d.setValue("grid").onChange((v) => { this.kind = v; });
      });

    new Setting(contentEl).setName("存什么").setDesc("连内容一起存，下次套用会把这些字也带过来。").addDropdown((d) => {
      d.addOption("titles", "只存标题（空骨架）");
      d.addOption("content", "标题 + 内容一起存");
      d.setValue("titles").onChange((v) => { this.withContent = v === "content"; });
    });

    contentEl.createEl("h4", { text: "包含哪些格" });
    const list = contentEl.createDiv({ cls: "gd-tpl-pick" });
    this.cells.forEach((c, i) => {
      const row = list.createDiv({ cls: "gd-tpl-pick-row" });
      const cb = row.createEl("input", { attr: { type: "checkbox" } });
      cb.checked = true;
      cb.onchange = () => { this.picked[i] = cb.checked; };
      row.createSpan({ text: ` ${c.title || "（未命名）"}　${truncate(String(c.content || "").replace(/\s+/g, " "), 30) || "（空）"}`, cls: "gd-tpl-pick-txt" });
    });

    const foot = contentEl.createDiv({ cls: "gd-modal-actions" });
    foot.createEl("button", { text: "全选" }).onclick = () => {
      this.picked = this.picked.map(() => true);
      list.querySelectorAll("input").forEach((x) => { x.checked = true; });
    };
    foot.createEl("button", { text: "全不选" }).onclick = () => {
      this.picked = this.picked.map(() => false);
      list.querySelectorAll("input").forEach((x) => { x.checked = false; });
    };
    foot.createEl("button", { text: "取消" }).onclick = () => this.close();
    foot.createEl("button", { text: "保存", cls: "mod-cta" }).onclick = async () => {
      const name = (this.name || "").trim();
      if (!name) { new Notice("先给模板起个名字"); return; }
      const picked = this.cells.filter((c, i) => this.picked[i]);
      if (!picked.length) { new Notice("至少要选一个格"); return; }
      const tpl = extractTemplate(name, picked, this.withContent);
      tpl.kind = this.kind || "grid";
      const arr = this.plugin.settings.templates;
      const idx = arr.findIndex((x) => x.name === name);
      if (idx >= 0) {
        new ConfirmModal(this.app, "重名了", `已经有叫「${name}」的模板，覆盖它？`, async () => {
          tpl.kind = this.kind || (arr[idx] && arr[idx].kind) || "grid";
          arr[idx] = tpl;
          this.plugin.settings.activeTemplate = name;
          await this.plugin.saveSettings();
          new Notice(`已覆盖模板「${name}」`);
          this.close();
        }).open();
        return;
      }
      arr.push(tpl);
      this.plugin.settings.activeTemplate = name;
      await this.plugin.saveSettings();
      new Notice(`已保存模板「${name}」·${picked.length} 格${this.withContent ? "·含内容" : ""}`);
      this.close();
    };
  }

  onClose() { this.contentEl.empty(); }
}

class TemplateModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-modal");
    contentEl.createEl("h3", { text: "套用格子模板" });
    contentEl.createEl("p", { text: "会替换当前这篇的格子结构，替换前自动存一份快照，可在时间线里恢复。", cls: "gd-modal-desc" });
    let keepMine = true;
    new Setting(contentEl).setName("保留我现在写的内容")
      .setDesc("开着：只换格子的标题和排布，已经写下的字按标题对上去保留。关掉：完全用模板的（模板带内容时会把内容也覆盖掉）。")
      .addToggle((tg) => tg.setValue(true).onChange((v) => { keepMine = v; }));
    const list = contentEl.createDiv({ cls: "gd-tpl-list" });
    const nameOfKind = (k) => (TEMPLATE_KINDS.find((x) => x[0] === k) || ["", "格子"])[1];
    let lastKind = "";
    for (const tpl of sortTemplates(this.plugin.settings.templates)) {
      const k = templateKind(tpl);
      if (k !== lastKind) {
        lastKind = k;
        const kh = list.createDiv({ cls: "gd-tpl-kind" });
        kh.createSpan({ text: nameOfKind(k) });
      }
      const row = list.createDiv({ cls: "gd-tpl-row" });
      const info = row.createDiv();
      info.createEl("strong", { text: tpl.name });
      info.createEl("span", { text: " " + nameOfKind(k), cls: "gd-tpl-kind-badge" });
      info.createEl("div", { text: `${(tpl.cells || []).length} 格${tpl.mode === "content" ? " · 含内容" : ""} · ${truncate((tpl.cells || []).map((c) => c.title).join(" / "), 70)}`, cls: "gd-tpl-sub" });
      row.createEl("button", { text: "套用", cls: "gd-mini-btn" }).onclick = async () => {
        this.close();
        const view = this.plugin.gridView();
        if (!view) return;
        await view.saveNow();
        const before = await this.app.vault.read(view.file);
        this.plugin.history.pushUndo(view.file, before, "套用模板前");
        await this.plugin.history.snapshot(view.file, "套用模板前", true);
        const built = buildFromTemplate(view.date, tpl, view.plugin.settings.headingLevel, { blank: false });
        if (keepMine) {
          /* 按归一化标题把我现在写的内容接回新骨架，避免"换个模板字全没了" */
          const mine = new Map();
          for (const c of view.cells) {
            const k = normHeadKey(c.title);
            if (!mine.has(k)) mine.set(k, c);
          }
          for (const c of built.cells) {
            const old = mine.get(normHeadKey(c.title));
            if (old && old.content) c.content = old.content;
          }
        }
        view.cells = built.cells;
        await view.save(true);
        new Notice(`已套用「${tpl.name}」`);
      };
    }
    const foot = contentEl.createDiv({ cls: "gd-modal-actions" });
    foot.createEl("button", { text: "关闭" }).onclick = () => this.close();
  }
  onClose() { this.contentEl.empty(); }
}
