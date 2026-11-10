/* ============ 设置面板 · 模板编辑器 ============ */

class TemplateEditorModal extends Modal {
  constructor(app, plugin, tpl, isNew) {
    super(app);
    this.plugin = plugin;
    this.tpl = tpl ? deepClone(tpl) : { name: "新模板", cells: [{ title: "新格子", cs: 1, rs: 1, h: 0, accent: "", border: "", sticker: "" }] };
    this.isNew = !!isNew;
    this.originalName = this.isNew ? "" : this.tpl.name;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("gd-modal"); contentEl.addClass("gd-tpl-editor");
    if (this.modalEl) this.modalEl.style.width = "min(720px, 92vw)";
    contentEl.createEl("h3", { text: this.isNew ? "新建模板" : `编辑「${this.tpl.name}」` });
    new Setting(contentEl).setName("模板名称").addText((t) => t.setValue(this.tpl.name).onChange((v) => { this.tpl.name = v; }));
    contentEl.createDiv({ cls: "gd-set-note", text: "每一格就是九宫格里的一个方块。标题可以写成一句问句，比如「今天最开心的一刻」。占列/占行决定它占几个格子大小。" });

    const list = contentEl.createDiv({ cls: "gd-tpl-cells" });
    const head = list.createDiv({ cls: "gd-tpl-cells-head" });
    for (const h of ["标题", "占列", "占行", "高度", ""]) head.createEl("span", { text: h });
    this.rowsEl = list.createDiv({ cls: "gd-tpl-rows" });
    this.drawRows();

    const foot = contentEl.createDiv({ cls: "gd-modal-actions" });
    const addBtn = foot.createEl("button", { text: "+ 添加格子" });
    addBtn.onclick = () => { this.tpl.cells.push({ title: "新格子", cs: 1, rs: 1, h: 0, accent: "", border: "", sticker: "" }); this.drawRows(); };
    foot.createEl("button", { text: "取消" }).onclick = () => this.close();
    foot.createEl("button", { text: "保存", cls: "mod-cta" }).onclick = () => this.commit();
  }
  drawRows() {
    const rows = this.rowsEl;
    rows.empty();
    this.tpl.cells.forEach((c, i) => {
      const row = rows.createDiv({ cls: "gd-tpl-row" });
      const t = row.createEl("input", { cls: "gd-input" }); t.value = c.title || "";
      t.oninput = () => { c.title = t.value; };
      const cs = row.createEl("input", { cls: "gd-input gd-num", attr: { type: "number", min: "1", max: "6" } }); cs.value = String(c.cs || 1);
      cs.onchange = () => { c.cs = clamp(cs.value, 1, 6); };
      const rs = row.createEl("input", { cls: "gd-input gd-num", attr: { type: "number", min: "1", max: "6" } }); rs.value = String(c.rs || 1);
      rs.onchange = () => { c.rs = clamp(rs.value, 1, 6); };
      const h = row.createEl("input", { cls: "gd-input gd-num", attr: { type: "number", min: "0", max: "1200" } }); h.value = String(c.h || 0);
      h.onchange = () => { c.h = clamp(h.value, 0, 1200); };
      row.createEl("button", { text: "×", cls: "gd-mini-btn", attr: { title: "删除这一格" } }).onclick = () => {
        this.tpl.cells.splice(i, 1);
        this.drawRows();
      };
    });
  }
  async commit() {
    const name = (this.tpl.name || "").trim();
    if (!name) { new Notice("模板名称不能为空"); return; }
    this.tpl.name = name;
    const arr = this.plugin.settings.templates;
    const idx = arr.findIndex((t) => t.name === this.originalName);
    if (this.isNew || idx < 0) arr.push(this.tpl);
    else arr[idx] = this.tpl;
    await this.plugin.saveSettings();
    this.close();
    this.plugin.openSettings();
    new Notice("模板已保存");
  }
  onClose() { this.contentEl.empty(); }
}

/* ============ 设置面板 ============ */

class GridSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.tab = "theme";
  }
  get s() { return this.plugin.settings; }
  display() {
    const { containerEl: el } = this;
    el.empty();
    el.addClass("gd-settings");
    el.addClass("gd-theme-" + (this.s.theme === "paper" ? "paper" : this.s.theme === "magazine" ? "magazine" : this.s.theme === "bento" ? "bento" : this.s.theme === "mono" ? "mono" : "card"));
    el.style.setProperty("--gd-accent", this.s.accent || "#c2704f");
    el.style.setProperty("--gd-font-size", (this.s.fontSize || 15) + "px");
    el.createEl("h2", { text: "格间日记 · 设置" });
    const tabs = el.createDiv({ cls: "gd-set-tabs" });
    const defs = [
      ["theme", "主题"], ["home", "主页"], ["dir", "目录"], ["layout", "排布"],
      ["calendar", "日历"], ["float", "灵感"], ["timeline", "流线图"],
      ["template", "模板"], ["paste", "粘贴"], ["history", "历史"],
    ];
    for (const [key, name] of defs) {
      const b = tabs.createEl("button", { text: name, cls: "gd-set-tab" + (this.tab === key ? " is-on" : "") });
      b.onclick = () => { this.tab = key; this.display(); };
    }
    const panel = el.createDiv({ cls: "gd-set-panel" });
    if (this.tab === "theme") this.themePane(panel);
    else if (this.tab === "home") this.homePane(panel);
    else if (this.tab === "dir") this.dirPane(panel);
    else if (this.tab === "layout") this.layout(panel);
    else if (this.tab === "calendar") this.calendar(panel);
    else if (this.tab === "float") this.floatTab(panel);
    else if (this.tab === "timeline") this.timelinePane(panel);
    else if (this.tab === "template") this.template(panel);
    else if (this.tab === "paste") this.paste(panel);
    else this.history(panel);
  }
  save() { return this.plugin.saveSettings(); }
  refresh(reload) { this.plugin.refreshAll(reload); }
  /* 目录项改动后重建左侧栏（结构变了要 build，内容变了只需 render） */
  rebuildSidebar() {
    const sb = this.plugin.sidebar;
    if (!sb) return;
    try {
      if (typeof sb.build === "function") sb.build();
      if (typeof sb.render === "function") sb.render();
    } catch (e) { console.warn("[格间日记] 重建目录失败", e); }
  }
  folders() {
    const set = new Set(["/"]);
    for (const f of this.app.vault.getFiles()) set.add(f.parent ? f.parent.path : "/");
    return Array.from(set).sort();
  }

  /* ---------- 常规 ---------- */
  /* ══════════ 主题（v4）══════════ */
  /* HSL 字符串 → hex（<input type=color> 只吃 hex） */
  /* ══════════ 一处背景（五处共用，v3.14）══════════
   * 用户要求：底图从主题里拿出来，分散装到主页/目录/日历/悬浮窗/流线图；
   * 每处都能纯色、图片、渐变、纹理、玻璃；格子背景也放在这一块里，不许散。 */
  bgPane(p, key, name) {
    const s = this.s;
    s.projectBg = s.projectBg || {};
    const cfg = bgCfgOf(s, key);
    const write = async (patch) => {
      s.projectBg = s.projectBg || {};
      s.projectBg[key] = Object.assign({}, s.projectBg[key] || {}, patch);
      await this.save();
      this.plugin.applyProjectBg();
      const g = this.plugin.gridView && this.plugin.gridView();
      if (g && g.stage) g.stage.render();
      this.display();
    };

    p.createEl("h4", { text: name + "的背景" });
    p.createDiv({
      cls: "gd-set-hint",
      text: "第一层是主题底色，第二层是" + (key === "dir" ? "「缩略图」（一张，只当图标用，不能拖不能缩）" : "「图片」") +
        "。纯色、图片、渐变、纹理、玻璃磨砂、视频、透明七种都在这儿选" +
        (key === "home" ? "；照片墙在下面单独一块（只有主页有）。" : "。") +
        (key === "home" ? "格子背景也在下面。" : ""),
    });

    /* 第二层的叫法按项目不同：主页叫照片墙（多张），目录叫缩略图，
       其余一律叫图片（一张）。用户明确要求，不许混着叫。 */
    const modeLabel = (k) => {
      if (key !== "home" && key !== "dir" && k === "image") return "图片";
      if (key === "dir" && k === "image") return "缩略图";
      const hit = BG_MODES.find((x) => x[0] === k);
      return hit ? hit[1] : k;
    };

    new Setting(p).setName("背景形态")
      .setDesc("玻璃磨砂要开 GPU 才顺，低配机可能掉帧。")
      .addDropdown((d) => {
        for (const [v, nm] of BG_MODES) d.addOption(v, modeLabel(v));
        d.setValue(cfg.mode || "color");
        d.onChange((v) => write({ mode: v }));
      });

    if (cfg.mode === "color") {
      new Setting(p).setName("背景颜色")
        .addText((x) => {
          x.setValue(cfg.color || "");
          x.inputEl.type = "color";
          x.onChange((v) => write({ color: v }));
        })
        .addExtraButton((bb) => bb.setIcon("eraser").setTooltip("清空（跟主题）")
          .onClick(() => write({ color: "" })));
    }

    if (cfg.mode === "gradient") {
      new Setting(p).setName("渐变")
        .setDesc("CSS 渐变，例如 linear-gradient(160deg,#f4f6f9 0%,#eef2f7 100%)")
        .addText((x) => x.setValue(cfg.gradient || "").setPlaceholder("linear-gradient(...)")
          .onChange((v) => write({ gradient: v })));
    }

    if (cfg.mode === "image") {
      new Setting(p).setName(key === "dir" ? "第二层 · 缩略图（一张）" : "第二层 · 图片（一张）")
        .setDesc(cfg.image ? "当前：" + String(cfg.image).split("/").pop() : "还没选图。" +
          (key === "home" ? "主页的背景只有一张，而且是全局的：换哪天都一样。" : ""))
        .addButton((bb) => bb.setButtonText("选图…").onClick(async () => {
          const got = await chooseImage(this.app, this.plugin, {
            title: "给" + name + "选张背景图", multiple: false,
            cropTitle: "裁剪背景（框选完再保存）",
          });
          if (!got) return;
          await write({ image: got.path, crop: got.crop || null });
        }))
        .addExtraButton((bb) => bb.setIcon("eraser").setTooltip("清空")
          .onClick(() => write({ image: "", crop: null })));
    }

    if (cfg.mode === "texture") {
      new Setting(p).setName("纹理").setDesc("全部是代码画的，不占空间。")
        .addDropdown((d) => {
          for (const [v, nm] of CAL_TEXTURES) d.addOption(v, nm);
          d.setValue(cfg.texture || "none");
          d.onChange((v) => write({ texture: v }));
        });
    }

    if (cfg.mode === "video") {
      new Setting(p).setName("背景视频")
        .setDesc(cfg.video ? "当前：" + String(cfg.video).split("/").pop() : "还没选视频。支持 mp4 / webm / mov。")
        .addButton((bb) => bb.setButtonText("选视频…").onClick(async () => {
          const got = await chooseImage(this.app, this.plugin, { title: "给" + name + "选段视频", multiple: false });
          if (!got) return;
          await write({ video: got.path });
        }))
        .addExtraButton((bb) => bb.setIcon("eraser").setTooltip("清空").onClick(() => write({ video: "" })));
      new Setting(p).setName("视频循环播放")
        .addToggle((x) => x.setValue(cfg.videoLoop !== false).onChange((v) => write({ videoLoop: v })));
    }

    if (cfg.mode === "transparent") {
      p.createDiv({ cls: "gd-set-hint", text: "透明 = 不铺任何底，直接露出主题底色。想让底下的东西透出来就选它。" });
    }

    if (cfg.mode === "glass") {
      new Setting(p).setName("玻璃模糊强度").setDesc("0 = 不糊，24 = 很糊。")
        .addSlider((x) => x.setLimits(0, 24, 1).setValue(cfg.glass || 12).setDynamicTooltip()
          .onChange((v) => write({ glass: v })));
      new Setting(p).setName("玻璃底色")
        .setDesc("留空就用主题的表面色。")
        .addText((x) => {
          x.setValue(cfg.glassTint || "");
          x.inputEl.type = "color";
          x.onChange((v) => write({ glassTint: v }));
        })
        .addExtraButton((bb) => bb.setIcon("eraser").setTooltip("清空")
          .onClick(() => write({ glassTint: "" })));
    }

    /* —— 目录第二层的「缩略图」 ——
       用户定案：目录 = 主题底色 + 一张缩略图，当图标用；**每个文件夹各一张**（问题 1）。 */
    if (key === "dir") {
      p.createEl("h4", { text: "目录的第二层 · 缩略图" });
      p.createDiv({
        cls: "gd-set-hint",
        text: "每个文件夹各一张，只当图标用：不能拖、不能缩。写网址也只存网址（断网会看不见），想永远看得见就用选图器里的「下载网络图片」。在目录里右键某个文件夹 →「用缩略图当图标…」就能单独给它换。",
      });
      const folders = this.plugin.folderKeysForStyle ? this.plugin.folderKeysForStyle() : [];
      if (!folders.length) {
        p.createDiv({ cls: "gd-set-hint", text: "还没有文件夹。先在目录里建一个，再回来这里给它配缩略图。" });
      } else {
        for (const f of folders) {
          const st = (this.s.treeFolderStyles || {})[f] || {};
          new Setting(p).setName(f || "（根目录）")
            .setDesc(st.img ? "当前：" + String(st.img).split("/").pop() : "还没设，用默认图标。")
            .addButton((bb) => bb.setButtonText("选缩略图…").onClick(async () => {
              const got = await chooseImage(this.app, this.plugin, { title: "给「" + (f || "根目录") + "」选一张缩略图", multiple: false });
              if (!got || !got.path) return;
              const all = this.s.treeFolderStyles || {};
              all[f] = Object.assign({}, all[f] || {}, { img: got.path, emoji: "", icon: "" });
              this.s.treeFolderStyles = all;
              await this.save();
              this.plugin.refreshAll && this.plugin.refreshAll();
              this.display();
            }))
            .addExtraButton((bb) => bb.setIcon("eraser").setTooltip("清空").onClick(async () => {
              const all = this.s.treeFolderStyles || {};
              all[f] = Object.assign({}, all[f] || {}, { img: "" });
              this.s.treeFolderStyles = all;
              await this.save();
              this.plugin.refreshAll && this.plugin.refreshAll();
              this.display();
            }));
        }
      }
    }

    /* —— 照片墙：只有主页有（用户：「照片墙只独属于主页」）—— */
    if (key === "home") {
      p.createEl("h4", { text: "主页的照片墙" });
      p.createDiv({
        cls: "gd-set-hint",
        text: "照片墙只属于主页。目录第二层叫「缩略图」，日历、灵感、流线图第二层叫「图片」，都只有一张，没有照片墙。",
      });
      const wall = cfg.wall || { on: false, items: [], limit: 12, unlimited: false };
      new Setting(p).setName("打开照片墙")
        .setDesc("开着时，主页背景上浮一张张头像式小照片，能拖到任意位置、四角缩放、单独裁剪/换图。")
        .addToggle((x) => x.setValue(!!wall.on).onChange((v) => write({ wall: Object.assign({}, wall, { on: v }) })));
      new Setting(p).setName("照片数量上限")
        .setDesc("默认 12 张。选了「不限」就按实际加的算。")
        .addSlider((x) => x.setLimits(1, 60, 1).setValue(clamp(Number(wall.limit) || 12, 1, 60)).setDynamicTooltip()
          .onChange((v) => write({ wall: Object.assign({}, wall, { limit: v }) })))
        .addToggle((x) => x.setValue(!!wall.unlimited).setTooltip("不限张数")
          .onChange((v) => write({ wall: Object.assign({}, wall, { unlimited: v }) })));
      new Setting(p).setName("往照片墙加照片")
        .setDesc("现在有 " + ((wall.items || []).length) + " 张。可以一次多选，选完逐张框选。")
        .addButton((bb) => bb.setButtonText("加照片…").onClick(async () => {
          const got = await chooseImagesWithCrop(this.app, this.plugin, { title: "往照片墙加照片（可多选，选完逐张框选）", multiple: true, ratio: 1 });
          if (!got || !got.length) return;
          const list = got.filter((g) => g && g.path);
          if (!list.length) return;
          const items = (wall.items || []).slice();
          list.forEach((g) => {
            const n = items.length;
            const it = { src: g.path, x: 5 + (n % 5) * 18, y: 6 + Math.floor(n / 5) * 34, w: 15, h: 15 };
            if (g.crop) it.crop = g.crop;
            items.push(it);
          });
          await write({ wall: Object.assign({}, wall, { items, on: true }) });
        }))
        .addExtraButton((bb) => bb.setIcon("trash").setTooltip("清空照片墙").onClick(() => write({ wall: Object.assign({}, wall, { items: [] }) })));
      if ((wall.items || []).length) {
        const listBox = p.createDiv({ cls: "gd-wall-list" });
        (wall.items || []).forEach((it, i) => {
          const row = listBox.createDiv({ cls: "gd-wall-row" });
          const th = row.createDiv({ cls: "gd-wall-thumb" });
          const u = this.plugin.thumbUrl ? this.plugin.thumbUrl(String(it.src || "")) : "";
          if (u) th.style.backgroundImage = 'url("' + u + '")';
          row.createSpan({ text: "第 " + (i + 1) + " 张 · " + String(it.src || "").split("/").pop(), cls: "gd-wall-name" });
          const del = row.createEl("button", { cls: "gd-mini-btn", text: "去掉" });
          del.onclick = async () => {
            const items = (wall.items || []).slice();
            items.splice(i, 1);
            await write({ wall: Object.assign({}, wall, { items }) });
          };
        });
      }
    }

    /* —— 换色节奏 —— */
    new Setting(p).setName("换色节奏")
      .setDesc("按日七槽一天一换；按周七天各一槽；按月九槽循环（月不统一，九槽够用）。每槽都能是颜色、图片或纹理。")
      .addDropdown((d) => {
        d.addOption("off", "不换（用上面的固定背景）");
        d.addOption("day", "按日换（七个槽循环）");
        d.addOption("week", "按周换（周一起，七天七槽）");
        d.addOption("month", "按月换（一个月一个槽）");
        d.setValue(cfg.rhythm || "off");
        d.onChange((v) => write({ rhythm: v }));
      });

    const rhythm = cfg.rhythm || "off";
    const mk = async (mapName, key2, kind, value) => {
      const cur = Object.assign({}, cfg[mapName] || {});
      cur[key2] = slotRaw("", kind, value);
      await write({ [mapName]: cur });
    };
    if (rhythm === "day") {
      const keys = [], labels = [];
      for (let i = 0; i < 7; i++) { keys.push("d" + i); labels.push("第 " + (i + 1) + " 槽"); }
      this.slotGridFor(p, cfg, "byDay", keys, labels, DAY_PALETTE, mk);
    }
    if (rhythm === "week") {
      const wd = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
      const keys = [], labels = [];
      for (let i = 0; i < 7; i++) { keys.push("wd" + i); labels.push(wd[i]); }
      this.slotGridFor(p, cfg, "byWeek", keys, labels, WEEK_PALETTE, mk);
    }
    if (rhythm === "month") {
      /* 用户：「月不统一，按 9 个色来变就行」→ 9 个槽循环 */
      const keys = [], labels = [];
      for (let m = 0; m < MONTH_SLOT_N; m++) { keys.push("m" + m); labels.push("第 " + (m + 1) + " 槽"); }
      const pal = keys.map((k) => MONTH_PALETTE[k] || "#ffffff");
      this.slotGridFor(p, cfg, "byMonth", keys, labels, pal, mk);
    }

    /* —— 格子背景：只有主页下区（九宫格）和日历有格子 ——
       用户：「标题要写清「格子的背景」」；目录/灵感/流线图没有格子，不许出现。 */
    if (key === "home" || key === "cal") {
      p.createEl("h4", { text: key === "home" ? "格子的背景" : "日历格子的背景" });
      p.createDiv({
        cls: "gd-set-hint",
        text: key === "home"
          ? "这一块只管下区那九宫格，跟上面「背景」分开算。九宫格本体不动，只换格子的底色 / 底图 / 磨砂。"
          : "日历每个日期小格自己的底色 / 底图 / 磨砂。",
      });
      new Setting(p).setName("格子背景形态")
        .setDesc("「跟着上面的背景」= 格子透明，露出底图。")
        .addDropdown((d) => {
          for (const [v, nm] of CELL_BG_MODES) d.addOption(v, nm);
          d.setValue(cfg.cellMode || "follow");
          d.onChange((v) => write({ cellMode: v }));
        });

      if (cfg.cellMode === "color") {
        new Setting(p).setName("格子底色")
          .addText((x) => {
            x.setValue(cfg.cellColor || "");
            x.inputEl.type = "color";
            x.onChange((v) => write({ cellColor: v }));
          })
          .addExtraButton((bb) => bb.setIcon("eraser").setTooltip("清空（跟主题）")
            .onClick(() => write({ cellColor: "" })));
      }
      if (cfg.cellMode === "image") {
        new Setting(p).setName("格子底图")
          .setDesc(cfg.cellImage ? "当前：" + String(cfg.cellImage).split("/").pop() : "每个格子铺同一张图。")
          .addButton((bb) => bb.setButtonText("选图…").onClick(async () => {
            const got = await chooseImage(this.app, this.plugin, { title: "给格子选张底图", multiple: false });
            if (!got) return;
            await write({ cellImage: got.path });
          }))
          .addExtraButton((bb) => bb.setIcon("eraser").setTooltip("清空")
            .onClick(() => write({ cellImage: "" })));
      }
      if (cfg.cellMode === "glass") {
        new Setting(p).setName("格子玻璃模糊")
          .addSlider((x) => x.setLimits(0, 24, 1).setValue(cfg.cellGlass || 8).setDynamicTooltip()
            .onChange((v) => write({ cellGlass: v })));
      }
    }
  }

  /* 五处共用的槽位网格：读写都走传进来的 mk */
  slotGridFor(p, cfg, mapName, keys, labels, palette, mk) {
    /* 用户：「一格一格点换要重复七次」→ 给一个批量按钮，
       一次进库里多选，勾几张就按顺序填进后面的槽位。 */
    const bulkRow = p.createDiv({ cls: "gd-slot-bulk" });
    const bulkBtn = bulkRow.createEl("button", { cls: "gd-mini-btn", text: "批量选图（一次填满这些槽）" });
    bulkBtn.onclick = async () => {
      const got = await chooseImage(this.app, this.plugin, {
        title: "一次选多张，按顺序填进 " + labels.length + " 个槽",
        multiple: true,
      });
      if (!got) return;
      const list = (Array.isArray(got) ? got : [got]).filter((g) => g && g.path);
      if (!list.length) return;
      /* 一次把要写的槽位全算好，再逐槽落盘。
         以前先 mk(第 0 槽) 再循环 1..n，cur 白算一遍、单槽时还会漏写。 */
      const n = Math.min(list.length, keys.length);
      for (let i = 0; i < n; i++) {
        await mk(mapName, keys[i], "image", list[i].path);
      }
      new Notice("已填进 " + n + " 个槽");
    };
    bulkRow.createSpan({ cls: "gd-slot-tip", text: "选中的图片会按顺序放进第 1、2、3… 个槽。" });

    const box = p.createDiv({ cls: "gd-month-grid" });
    const map = cfg[mapName] || {};
    keys.forEach((key, idx) => {
      const cell = box.createDiv({ cls: "gd-month-cell" });
      cell.createDiv({ cls: "gd-month-label", text: labels[idx] });
      const raw = map[key] || palette[idx] || "";
      const slot = parseSlot(raw);
      const pv = cell.createDiv({ cls: "gd-slot-pv" });
      this.paintSlot(pv, slot);
      const row = cell.createDiv({ cls: "gd-slot-row" });
      const pick = row.createEl("button", { cls: "gd-slot-btn", text: "换" });
      pick.onclick = (e) => {
        const m = new Menu();
        m.addItem((i) => i.setTitle("纯色…").setIcon("palette").onClick(() => {
          const inp = cell.createEl("input");
          inp.type = "color";
          inp.style.position = "absolute";
          inp.style.opacity = "0";
          inp.value = slot && slot.kind === "color" ? slot.value : "#ffffff";
          inp.onchange = async () => { await mk(mapName, key, "color", inp.value); inp.remove(); };
          inp.click();
        }));
        m.addItem((i) => i.setTitle("用图片…").setIcon("image").onClick(async () => {
          const got = await chooseImage(this.app, this.plugin, { title: "给这一槽选张图", multiple: false });
          if (!got) return;
          await mk(mapName, key, "image", got.path);
        }));
        const sub = new Menu();
        m.addItem((i) => i.setTitle("用纹理").setIcon("grid").onClick(() => {
          for (const [v, nm] of CAL_TEXTURES) {
            if (v === "none") continue;
            sub.addItem((ii) => ii.setTitle(nm).onClick(async () => { await mk(mapName, key, "texture", v); }));
          }
          showMenuAt(sub, e);
        }));
        m.addSeparator();
        m.addItem((i) => i.setTitle("恢复这一槽").setIcon("rotate-ccw").onClick(async () => {
          const cur = Object.assign({}, cfg[mapName] || {});
          delete cur[key];
          await mk(mapName, key, "color", palette[idx] || "");
        }));
        showMenuAt(m, e);
      };
    });
  }

  /* 一排槽位：每格能存 纯色 / 图片 / 纹理 三种之一。
     mapName 是设置里的字段名（bgByDay / bgByWeek / bgByMonth）。 */
  slotGrid(p, mapName, keys, labels, palette) {
    const s = this.s;
    const map = s[mapName] || {};
    const box = p.createDiv({ cls: "gd-month-grid" });
    keys.forEach((key, idx) => {
      const cell = box.createDiv({ cls: "gd-month-cell" });
      cell.createDiv({ cls: "gd-month-label", text: labels[idx] });
      const raw = map[key] || palette[idx] || palette[String(idx + 1).padStart(2, "0")] || "";
      const slot = parseSlot(raw);

      /* 预览块：颜色就是色块，纹理和图片也画在同一个位置 */
      const pv = cell.createDiv({ cls: "gd-slot-pv" });
      this.paintSlot(pv, slot);

      const row = cell.createDiv({ cls: "gd-slot-row" });
      const pick = row.createEl("button", { cls: "gd-slot-btn", text: "换" });
      pick.onclick = (e) => {
        const m = new Menu();
        m.addItem((i) => i.setTitle("纯色…").setIcon("palette").onClick(() => {
          const inp = cell.createEl("input");
          inp.type = "color";
          inp.style.position = "absolute";
          inp.style.opacity = "0";
          inp.value = slot && slot.kind === "color" ? slot.value : "#ffffff";
          inp.onchange = async () => {
            await this.setSlot(mapName, key, "color", inp.value);
            inp.remove();
          };
          inp.click();
        }));
        m.addItem((i) => i.setTitle("用图片…").setIcon("image").onClick(async () => {
          const got = await chooseImage(this.app, this.plugin, { title: "给这一格选张图", multiple: false });
          if (!got) return;
          await this.setSlot(mapName, key, "image", got.path);
        }));
        const sub = new Menu();
        m.addItem((i) => i.setTitle("用纹理").setIcon("grid").onClick(() => {
          for (const [v, nm] of CAL_TEXTURES) {
            if (v === "none") continue;
            sub.addItem((ii) => ii.setTitle(nm).onClick(async () => {
              await this.setSlot(mapName, key, "texture", v);
            }));
          }
          showMenuAt(sub, e);
        }));
        m.addSeparator();
        m.addItem((i) => i.setTitle("恢复这个槽").setIcon("rotate-ccw").onClick(async () => {
          const mm = Object.assign({}, s[mapName] || {});
          delete mm[key];
          s[mapName] = mm;
          await this.save(); this.plugin.applyAllTheme(); this.display();
        }));
        showMenuAt(m, e);
      };
    });
    if (!p.querySelector(".gd-slot-tip")) {
      p.createDiv({ cls: "gd-slot-tip gd-set-hint", text: "点「换」可以把这一格设成纯色、图片或纹理。纹理是代码画的，不占空间。" });
    }
  }

  /* 把一张槽位预览画出来 */
  paintSlot(el, slot) {
    el.empty();
    el.removeClass?.("is-tex");
    if (!slot) { el.style.background = "transparent"; el.style.backgroundImage = "none"; return; }
    if (slot.kind === "color") {
      el.style.backgroundImage = "none";
      el.style.backgroundColor = slot.value || "transparent";
      return;
    }
    if (slot.kind === "image") {
      const u = this.plugin.thumbUrl ? this.plugin.thumbUrl(slot.value) : "";
      el.style.backgroundColor = "var(--background-secondary)";
      el.style.backgroundImage = u ? 'url("' + u + '")' : "none";
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      return;
    }
    /* 纹理：借网格页的 data-bg-texture 规则太远，这里直接画个近似 */
    const t = slot.value || "none";
    el.style.backgroundColor = "var(--background-secondary)";
    el.style.backgroundSize = "12px 12px";
    const line = "var(--background-modifier-border)";
    const maps = {
      graph: "linear-gradient(90deg," + line + " 1px,transparent 1px),linear-gradient(0deg," + line + " 1px,transparent 1px)",
      dots: "radial-gradient(" + line + " 1px,transparent 1px)",
      lines: "linear-gradient(0deg," + line + " 1px,transparent 1px)",
      diag: "repeating-linear-gradient(45deg," + line + " 0 1px,transparent 1px 8px)",
      cross: "linear-gradient(45deg,transparent 46%," + line + " 46% 54%,transparent 54%),linear-gradient(-45deg,transparent 46%," + line + " 46% 54%,transparent 54%)",
      noise: "radial-gradient(" + line + " .5px,transparent .6px)",
      wood: "repeating-linear-gradient(90deg," + line + " 0 2px,transparent 2px 9px)",
      marble: "radial-gradient(ellipse at 22% 18%,transparent 42%," + line + " 43%,transparent 45%)",
      checker: "linear-gradient(45deg," + line + " 25%,transparent 25% 75%," + line + " 75%)",
      paper: "linear-gradient(0deg," + line + " 1px,transparent 1px)",
      gradient: "linear-gradient(135deg,var(--background-secondary),var(--background-modifier-border))",
    };
    el.style.backgroundImage = maps[t] || "none";
    if (t === "graph" || t === "cross" || t === "checker") el.style.backgroundSize = "14px 14px";
    if (t === "noise") el.style.backgroundSize = "6px 6px";
  }

  async setSlot(mapName, key, kind, value) {
    const s = this.s;
    const mm = Object.assign({}, s[mapName] || {});
    mm[key] = slotRaw("", kind, value);
    s[mapName] = mm;
    await this.save();
    this.plugin.applyAllTheme();
    this.display();
  }

  _rgbOfHsl(hsl) {
    const raw = String(hsl);
    /* 本来就是 hex 就原样返回，别硬当 hsl 解析（否则会变成纯白） */
    if (/^#[0-9a-f]{3,8}$/i.test(raw.trim())) return raw.trim();
    const m = /hsl\(\s*([\d.]+)\s+(\d.+)%\s+(\d.+)%\s*\)/.exec(raw);
    if (!m) return "#ffffff";
    const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
    const hue2rgb = (pp, qq, tt) => {
      let t2 = tt; if (t2 < 0) t2 += 1; if (t2 > 1) t2 -= 1;
      if (t2 < 1 / 6) return pp + (qq - pp) * 6 * t2;
      if (t2 < 1 / 2) return qq;
      if (t2 < 2 / 3) return pp + (qq - pp) * (2 / 3 - t2) * 6;
      return pp;
    };
    let r, g, b;
    if (s === 0) r = g = b = l;
    else {
      const qq = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const pp = 2 * l - qq;
      r = hue2rgb(pp, qq, h + 1 / 3);
      g = hue2rgb(pp, qq, h);
      b = hue2rgb(pp, qq, h - 1 / 3);
    }
    const hx = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
    return "#" + hx(r) + hx(g) + hx(b);
  }

  themePane(p) {
    const s = this.s;
    p.createEl("h3", { text: "主题" });
    p.createDiv({
      cls: "gd-set-hint",
      text: "一个主题管全部视觉：底色、字体、线体、图标、格子、排版。选一套全部跟着变，改一处全联动。主题存在「" +
        (s.themeDir || "主题") + "」文件夹里，是普通 .json 文件，可备份、可跨设备带走。",
    });

    /* —— 当前主题 —— */
    const curBox = p.createDiv({ cls: "gd-theme-cur" });
    const curName = s.activeTheme || "";
    curBox.createSpan({ cls: "gd-theme-badge", text: curName ? "当前主题" : "未套用主题" });
    curBox.createSpan({ cls: "gd-theme-note", text: curName || "下面各项各自生效（散项模式）" });
    if (curName) {
      const b = curBox.createEl("button", { cls: "gd-mini-btn", text: "版本历史 / 回滚" });
      b.onclick = () => this.plugin.openThemeHistory();
    }

    /* —— 选择主题 —— */
    new Setting(p)
      .setName("套用主题")
      .setDesc("选一个，立刻套用；再改下面的细节，就是在这个主题上改。")
      .addDropdown(async (d) => {
        d.addOption("", "（散项模式，不用主题）");
        const list = await this.plugin.themes.list();
        for (const th of list) d.addOption(th.name, th.name + "（v" + th.version + "）");
        d.setValue(s.activeTheme || "");
        d.onChange(async (v) => {
          if (!v) {
            s.activeTheme = "";
            await this.save();
            this.display();
            return;
          }
          const r = await this.plugin.themes.apply(v);
          if (r) this.display();
        });
      })
      .addButton((b) => b.setButtonText("存成新主题…").onClick(() => {
        new PromptModal(this.app, "存成新主题", "主题名字", s.activeTheme || "我的主题", async (v) => {
          await this.plugin.saveThemeAs(v, "从设置页新建");
          this.display();
        }).open();
      }))
      .addButton((b) => b.setButtonText("把改动存回去").onClick(() => {
        if (!s.activeTheme) { new Notice("先选一个主题"); return; }
        new PromptModal(this.app, "更新主题", "这次改了什么（备注）", "", async (v) => {
          await this.plugin.updateActiveTheme(v);
          this.display();
        }).open();
      }));

    /* —— 项目切换 —— */
    new Setting(p).setName("切项目时连视觉一起换")
      .setDesc("开着：每个项目记住自己的一套主题/皮肤/边框/底色，切过去就换回来。关掉：全局共用一套视觉。")
      .addToggle((x) => x.setValue(s.projectCarryLayout !== false).onChange(async (v) => {
        s.projectCarryLayout = v;
        await this.save();
      }));

    /* —— 主题文件位置 —— */
    new Setting(p)
      .setName("主题文件夹")
      .setDesc("相对库根目录。换设备时连同这个文件夹一起拷走即可。")
      .addText((t) => t.setValue(s.themeDir || "主题").setPlaceholder("主题")
        .onChange(async (v) => { s.themeDir = v.trim() || "主题"; await this.save(); }))
      .addExtraButton((b) => b.setIcon("folder-open").setTooltip("打开文件夹").onClick(async () => {
        await this.plugin.themes.ensureDir();
        const f = this.app.vault.getAbstractFileByPath(this.plugin.themes.dir);
        if (f) this.app.workspace.getLeaf(true).openFile(f.path);
      }))
      .addExtraButton((b) => b.setIcon("refresh-cw").setTooltip("重新安装内置六套预设").onClick(async () => {
        const n = await this.plugin.themes.installPresets();
        new Notice(n ? "已补装 " + n + " 套预设" : "六套预设都已存在");
        this.display();
      }));

    /* —— 启动时自动套用 —— */
    new Setting(p)
      .setName("启动时自动套用当前主题")
      .setDesc("关掉的话，每次启动用 data.json 里的散项值。")
      .addToggle((t) => t.setValue(s.autoApplyTheme !== false)
        .onChange(async (v) => { s.autoApplyTheme = v; await this.save(); }));

    /* —— 跟随 Obsidian 主题 + 背景视频（B1）—— */
    p.createEl("h4", { text: "背景：跟随 Obsidian 主题 / 背景视频" });
    new Setting(p).setName("跟随 Obsidian 主题")
      .setDesc("Obsidian 切到深色时，日记底色和字色自动换深。")
      .addToggle((x) => x.setValue(!!s.bgFollowObsidian).onChange(async (v) => {
        s.bgFollowObsidian = v; await this.save(); this.plugin.applyAllTheme(); this.display();
      }));
    if (s.bgFollowObsidian) {
      new Setting(p).setName("跟随时的模糊").setDesc("0 = 不模糊。")
        .addSlider((x) => x.setLimits(0, 24, 1).setValue(s.bgFollowBlur || 0).setDynamicTooltip()
          .onChange(async (v) => { s.bgFollowBlur = v; await this.save(); this.plugin.applyAllTheme(); }));
    }
    new Setting(p).setName("背景视频")
      .setDesc(s.bgVideo ? "当前：" + s.bgVideo.split("/").pop() : "选一段 mp4 / webm，会静音循环铺在底层。")
      .addButton((b) => b.setButtonText("选视频…").onClick(async () => {
        const f = await chooseFileLike(this.plugin, { title: "选一段背景视频" });
        if (!f) return;
        if (!isVideoSrc(f.name)) { new Notice("这不是视频文件（mp4 / webm / ogv / mov / m4v / mkv）"); return; }
        const dir = this.plugin.attachDir();
        await this.plugin.ensureFolder(dir);
        const path = normalizePath(dir + "/" + f.name);
        try {
          if (await this.app.vault.adapter.exists(path)) {
            s.bgVideo = path;
          } else {
            await this.app.vault.adapter.writeBinary(path, await f.arrayBuffer());
            s.bgVideo = path;
          }
          s.bgMode = "image";
          await this.save();
          this.plugin.applyAllTheme();
          this.display();
          new Notice("背景视频已设好");
        } catch (e) { new Notice("设背景视频失败：" + (e && e.message ? e.message : e)); }
      }))
      .addExtraButton((b) => b.setIcon("trash").setTooltip("去掉背景视频").onClick(async () => {
        s.bgVideo = ""; await this.save(); this.plugin.applyAllTheme(); this.display();
      }));
    new Setting(p).setName("背景视频循环").addToggle((x) => x.setValue(s.bgVideoLoop !== false)
      .onChange(async (v) => { s.bgVideoLoop = v; await this.save(); this.plugin.applyAllTheme(); }));

    /* —— 图片填充 + 合并层（B2 / B4）—— */
    p.createEl("h4", { text: "图片层：填充方式 / 合并" });
    new Setting(p).setName("图片填充")
      .setDesc("居中裁剪 = 铺满但裁边；完整显示 = 留白不裁；拉伸 = 变形铺满；九宫格 = 四角不拉伸。")
      .addDropdown((d) => {
        for (const [v, n] of [["cover", "居中裁剪"], ["contain", "完整显示"], ["fill", "拉伸"], ["nine", "九宫格"]]) d.addOption(v, n);
        d.setValue(s.photoFit || "cover").onChange(async (v) => { s.photoFit = v; await this.save(); this.plugin.applyAllTheme(); this.display(); });
      });
    if ((s.photoFit || "cover") === "nine") {
      new Setting(p).setName("九宫格切片").setDesc("角上不被拉伸的像素数。")
        .addSlider((x) => x.setLimits(4, 120, 2).setValue(s.nineSlice || 24).setDynamicTooltip()
          .onChange(async (v) => { s.nineSlice = v; await this.save(); this.plugin.applyAllTheme(); }));
    }
    new Setting(p).setName("背景与照片合并成一层")
      .setDesc("现在「背景」和「照片」是两层，叠在一起会出重影；打开这个就只画一张图。")
      .addToggle((x) => x.setValue(!!s.mergeBgImg).onChange(async (v) => {
        s.mergeBgImg = v; await this.save(); this.plugin.applyAllTheme(); this.display();
      }));

    /* —— 复用别天的壁纸（B3）—— */
    new Setting(p).setName("复用别一天的图")
      .setDesc("打开某一天，把它的封面 / 照片搬过来用。")
      .addButton((b) => b.setButtonText("从某一天复用…").onClick(() => {
        const v = this.plugin.gridView();
        if (!v) { new Notice("先打开一篇日记"); return; }
        v.reuseCoverFromDay();
      }));

    /* —— 一键重置排版（B7）—— */
    new Setting(p).setName("重置这一篇的排版")
      .setDesc("只恢复封面、层位置、边框、皮肤；格子里的文字一个字都不动。")
      .addButton((b) => b.setButtonText("重置…").setWarning().onClick(() => {
        const v = this.plugin.gridView();
        if (!v) { new Notice("先打开一篇日记"); return; }
        v.resetLayout();
      }));

    /* —— 动图 / 视频 / 轮播（T-06 / T-07）—— */
    p.createEl("h4", { text: "图片层：动图 · 视频 · 轮播" });
    p.createDiv({ cls: "gd-set-hint", text: "CSS 的 background-image 放不了视频，插件会在底层叠一个静音循环的 <video>。移动端默认不启用视频（省电）。" });
    new Setting(p).setName("允许视频壁纸")
      .setDesc("桌面端有效；移动端自动禁用。")
      .addToggle((x) => x.setValue(!!s.videoEnabled).onChange(async (v) => { s.videoEnabled = v; await this.save(); }));
    new Setting(p).setName("视频体积上限").setDesc("超过就不让放，避免卡。")
      .addSlider((x) => x.setLimits(5, 200, 5).setValue(s.videoMaxMB || 20).setDynamicTooltip()
        .onChange(async (v) => { s.videoMaxMB = v; await this.save(); }));
    new Setting(p).setName("视频时长上限").setDesc("秒。")
      .addSlider((x) => x.setLimits(5, 300, 5).setValue(s.videoMaxSec || 60).setDynamicTooltip()
        .onChange(async (v) => { s.videoMaxSec = v; await this.save(); }));
    new Setting(p).setName("轮播壁纸")
      .setDesc("像 Windows 的「幻灯片放映」：选一组图，按间隔自动换。")
      .addDropdown((d) => {
        d.addOption("open", "每次打开换一张");
        d.addOption("30s", "30 秒");
        d.addOption("5m", "5 分钟");
        d.addOption("day", "每天换一张");
        d.setValue(s.carouselEvery || "open");
        d.onChange(async (v) => { s.carouselEvery = v; await this.save(); });
      })
      .addButton((b) => b.setButtonText("选一组图…").onClick(() => {
        const v = this.plugin.gridView();
        if (!v) { new Notice("先打开一篇日记"); return; }
        v.pickCarousel();
      }))
      .addButton((b) => b.setButtonText("换下一张").onClick(() => {
        const v = this.plugin.gridView();
        if (v && v.nextCarousel()) new Notice("已换下一张");
        else new Notice("还没有轮播组，或只有一张图");
      }));
    if ((s.carouselList || []).length) {
      p.createDiv({ cls: "gd-set-hint", text: "当前轮播组：" + s.carouselList.length + " 张，正显示第 " + ((Number(s.carouselIndex) || 0) + 1) + " 张。" });
    }

    /* —————— 字体 —————— */
    p.createEl("h4", { text: "字体" });
    new Setting(p).setName("字族").setDesc('留空跟随 Obsidian；可填 "LXGW WenKai" 之类。')
      .addText((t) => t.setValue(s.fontFamily || "").setPlaceholder("留空使用默认字体")
        .onChange(async (v) => { s.fontFamily = v; await this.save(); }));
    new Setting(p).setName("字号").addSlider((x) => x.setLimits(10, 26, 1).setValue(s.fontSize || 15).setDynamicTooltip()
      .onChange(async (v) => { s.fontSize = v; await this.save(); }));
    new Setting(p).setName("字色").addText((t) => {
      t.setValue(s.fontColor || "#3b342c");
      t.inputEl.type = "color";
      t.onChange(async (v) => { s.fontColor = v; await this.save(); });
    }).addExtraButton((b) => b.setIcon("eraser").setTooltip("恢复默认")
      .onClick(async () => { s.fontColor = ""; await this.save(); this.display(); }));
    new Setting(p).setName("行高").addSlider((x) => x.setLimits(1.2, 2.6, 0.05).setValue(s.lineHeight || 1.7).setDynamicTooltip()
      .onChange(async (v) => { s.lineHeight = v; await this.save(); }));
    new Setting(p).setName("字距").setDesc("单位 px，0 = 默认。")
      .addSlider((x) => x.setLimits(-1, 6, 0.5).setValue(s.letterSpacing || 0).setDynamicTooltip()
        .onChange(async (v) => { s.letterSpacing = v; await this.save(); }));
    new Setting(p).setName("主页的字重").addSlider((x) => x.setLimits(100, 900, 100).setValue(s.fontWeight || 400).setDynamicTooltip()
      .onChange(async (v) => { s.fontWeight = v; await this.save(); }));

    /* —————— 线体 —————— */
    p.createEl("h4", { text: "线体" });
    p.createDiv({ cls: "gd-set-hint", text: "这一组管所有线：格子边框、目录层级线、时间线轴线、日历网格线。改一处全联动。" });
    new Setting(p).setName("线色").addText((t) => {
      t.setValue(s.lineColor || "#dddddd");
      t.inputEl.type = "color";
      t.onChange(async (v) => { s.lineColor = v; await this.save(); });
    }).addExtraButton((b) => b.setIcon("eraser").setTooltip("恢复默认")
      .onClick(async () => { s.lineColor = ""; await this.save(); this.display(); }));
    new Setting(p).setName("线宽").addSlider((x) => x.setLimits(0.5, 4, 0.5).setValue(s.lineWidth || 1).setDynamicTooltip()
      .onChange(async (v) => { s.lineWidth = v; await this.save(); }));
    new Setting(p).setName("线型").addDropdown((d) => {
      for (const [v, n] of [["solid", "实线"], ["dashed", "虚线"], ["dotted", "点线"]]) d.addOption(v, n);
      d.setValue(s.lineStyle || "solid");
      d.onChange(async (v) => { s.lineStyle = v; await this.save(); });
    });

    /* —————— 格子 —————— */
    p.createEl("h4", { text: "格子" });
    new Setting(p).setName("风格").addDropdown((d) => {
      for (const [v, n] of THEMES) d.addOption(v, n);
      d.setValue(s.theme || "card");
      d.onChange(async (v) => { s.theme = v; await this.save(); this.display(); });
    });
    new Setting(p).setName("边框").addDropdown((d) => {
      for (const [v, n] of BORDERS) d.addOption(v, n);
      d.setValue(s.defaultBorder || "hair");
      d.onChange(async (v) => { s.defaultBorder = v; await this.save(); });
    });
    new Setting(p).setName("主页的圆角").addSlider((x) => x.setLimits(0, 28, 1).setValue(s.radius || 14).setDynamicTooltip()
      .onChange(async (v) => { s.radius = v; await this.save(); }));
    new Setting(p).setName("间距").addSlider((x) => x.setLimits(0, 48, 1).setValue(s.gap || 14).setDynamicTooltip()
      .onChange(async (v) => { s.gap = v; await this.save(); }));
    new Setting(p).setName("内边距").addSlider((x) => x.setLimits(4, 72, 1).setValue(s.pad || 20).setDynamicTooltip()
      .onChange(async (v) => { s.pad = v; await this.save(); }));
    new Setting(p).setName("主页的强调色").addText((t) => {
      t.setValue(s.accent || "#c2704f");
      t.inputEl.type = "color";
      t.onChange(async (v) => { s.accent = v; await this.save(); });
    });
    new Setting(p).setName("不透明度").addSlider((x) => x.setLimits(0.3, 1, 0.05).setValue(s.cardOpacity || 1).setDynamicTooltip()
      .onChange(async (v) => { s.cardOpacity = v; await this.save(); }));

    /* 自定义 CSS —— 用户明确说这块他自己管，这里只放跳转 */
    p.createEl("h4", { text: "自定义 CSS" });
    p.createDiv({ cls: "gd-set-hint", text: "这一项归你自己写，主题系统不碰它。到「外观 → 自定义 CSS」里编辑。" });

    /* —————— 预设 —————— */
    p.createEl("h4", { text: "六套内置预设" });
    p.createDiv({ cls: "gd-set-hint", text: "下面是点一下就能套的预设。想改就改完再「存成新主题」，不会覆盖预设。" });
    const grid = p.createDiv({ cls: "gd-preset-grid" });
    const presets = (typeof THEME_PRESETS !== "undefined" ? THEME_PRESETS : []);
    (async () => {
      const list = await this.plugin.themes.list();
      for (const pr of presets) {
        const has = list.some((x) => x.name === pr.name);
        const card = grid.createDiv({ cls: "gd-preset-card" + (s.activeTheme === pr.name ? " is-on" : "") });
        card.createDiv({ cls: "gd-preset-name", text: pr.name });
        card.createDiv({ cls: "gd-preset-note", text: pr.note });
        const swatch = card.createDiv({ cls: "gd-preset-swatch" });
        swatch.style.background = pr.tokens.bgColor || "#fff";
        if (pr.tokens.bgGradient) swatch.style.background = pr.tokens.bgGradient;
        const bar = card.createDiv({ cls: "gd-preset-bar" });
        bar.style.background = pr.tokens.accent || "#c2704f";
        const b = card.createEl("button", { cls: "gd-mini-btn", text: has ? "套用" : "装并套用" });
        b.onclick = async () => {
          if (!has) await this.plugin.themes.installPresets();
          await this.plugin.themes.apply(pr.name);
          this.plugin.applyAllTheme();
          this.display();
        };
      }
    })();
  }

  /* ---------- 主页 ---------- */
  homePane(p) {
    /* 背景归这一处自己管（v3.14：从主题里拆出来，五处各一份） */
    this.bgPane(p, "home", "主页");

    p.createEl("h3", { text: "主页" });
    p.createDiv({ cls: "gd-set-hint", text: "主页＝九宫格那一页。这里管它的底色、字体、封面、格子、座右铭、头像。" });
    p.createEl("h4", { text: "主页基础" });
    new Setting(p).setName("主页的日记文件夹").setDesc("所有日期 md 都放这里；目录、日历、流线图都读这个文件夹。").addDropdown((d) => {
      for (const f of this.folders()) d.addOption(f === "/" ? "" : f, f === "/" ? "库根目录" : f);
      d.setValue(this.s.rootFolder || "").onChange(async (v) => { this.s.rootFolder = v; await this.save(); this.refresh(); });
    });
    new Setting(p).setName("主页自动创建今天的日记").addToggle((t) => t.setValue(this.s.autoCreateToday).onChange(async (v) => { this.s.autoCreateToday = v; await this.save(); }));
    new Setting(p).setName("主页手机上强制单列").addToggle((t) => t.setValue(this.s.mobileOneColumn).onChange(async (v) => { this.s.mobileOneColumn = v; await this.save(); this.refresh(); }));
    this.homeLook(p);
  }

  /* 目录里靠后的几项（从常规搬过来） */
  dirExtras(p) {
    new Setting(p).setName("目录显示：左侧栏").addToggle((t) => t.setValue(this.s.showSidebar).onChange(async (v) => { this.s.showSidebar = v; await this.save(); this.plugin.applySidebar(); }));
    new Setting(p).setName("目录显示：最近文件").addToggle((t) => t.setValue(this.s.showRecentFiles !== false).onChange(async (v) => { this.s.showRecentFiles = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("目录显示：文件夹树连线").addToggle((t) => t.setValue(this.s.showTreeLines !== false).onChange(async (v) => { this.s.showTreeLines = v; await this.save(); this.refresh(); }));
  }

  /* ---------- 项目自己的视觉（字体 / 线体 / 格子） ----------
   * 用户：「我想让他们每个人都有自己的一份，这样的话我就可以单独对他们进行设计，
   *       而不是统一对他们进行设计。」以及「按顺序来。背景、字体、颜色，然后往下排」。
   * 所以这里按统一顺序画四段，每个项目页面直接调它。
   * 留空 = 跟主题；填了 = 这个项目单独用这份，换主题也不被覆盖。 */
  projectLook(p, key, name) {
    const s = this.s;
    if (!s.projectVars || typeof s.projectVars !== "object") s.projectVars = {};
    const box = s.projectVars[key] || (s.projectVars[key] = {});
    const sync = async (k, v) => {
      if (v === "" || v == null) delete box[k]; else box[k] = v;
      await this.save();
      this.plugin.applyProjectVars();
    };
    const followBtn = (b) => b.setIcon("rotate-ccw").setTooltip("跟主题（清空这一项）").onClick(async () => {
      for (const k of Object.keys(box)) delete box[k];
      await this.save();
      this.plugin.applyProjectVars();
      this.display();
    });

    p.createEl("h4", { text: name + "的背景" });
    p.createDiv({ cls: "gd-set-hint", text: "这里的背景只管" + name + "自己。想跟主页一致就别填。" });
    new Setting(p).setName(name + "的底色").setDesc("留空＝跟主题。")
      .addText((tx) => { tx.setValue(box.bgColor || ""); tx.inputEl.type = "color"; tx.onChange(async (v) => sync("bgColor", v)); })
      .addExtraButton((b) => b.setIcon("eraser").setTooltip("跟主题").onClick(async () => { delete box.bgColor; await this.save(); this.plugin.applyProjectVars(); this.display(); }));
    new Setting(p).setName(name + "的底图").setDesc("库里已有的图片路径；留空＝不用图。")
      .addText((tx) => tx.setValue(box.bgImage || "").setPlaceholder("留空 = 不用底图")
        .onChange(async (v) => sync("bgImage", v.trim())))
      .addButton((b) => b.setButtonText("从系统 / 库里 / 链接选…").onClick(async () => {
        const got = await chooseImage(this.app, this.plugin, { title: "给" + name + "选一张底图", ratio: 0, prefix: key + "-bg" });
        if (!got) return;
        box.bgImage = got.path;
        await this.save();
        this.plugin.applyProjectVars();
        this.display();
        new Notice(name + "的底图已换好");
      }));

    p.createEl("h4", { text: name + "的字体" });
    new Setting(p).setName(name + "的字族").setDesc("留空＝跟主题。")
      .addText((tx) => tx.setValue(box.fontFamily || "").setPlaceholder("留空 = 跟主题")
        .onChange(async (v) => sync("fontFamily", v.trim())));
    new Setting(p).setName(name + "的字号").setDesc("0＝跟主题。")
      .addSlider((sl) => sl.setLimits(0, 28, 1).setValue(Number(box.fontSize) || 0).setDynamicTooltip()
        .onChange(async (v) => sync("fontSize", Number(v) ? Number(v) : "")));
    new Setting(p).setName(name + "的字色").setDesc("留空＝跟主题。")
      .addText((tx) => { tx.setValue(box.fontColor || ""); tx.inputEl.type = "color"; tx.onChange(async (v) => sync("fontColor", v)); })
      .addExtraButton(followBtn);

    p.createEl("h4", { text: name + "的线体与格子" });
    new Setting(p).setName(name + "的线色").setDesc("留空＝跟主题。")
      .addText((tx) => { tx.setValue(box.lineColor || ""); tx.inputEl.type = "color"; tx.onChange(async (v) => sync("lineColor", v)); })
      .addExtraButton((b) => b.setIcon("eraser").setTooltip("跟主题").onClick(async () => { delete box.lineColor; await this.save(); this.plugin.applyProjectVars(); this.display(); }));
    new Setting(p).setName(name + "的线宽").setDesc("0＝跟主题。")
      .addSlider((sl) => sl.setLimits(0, 4, 0.5).setValue(Number(box.lineWidth) || 0).setDynamicTooltip()
        .onChange(async (v) => sync("lineWidth", Number(v) ? Number(v) : "")));
    new Setting(p).setName(name + "的强调色").setDesc("留空＝跟主题。")
      .addText((tx) => { tx.setValue(box.accent || ""); tx.inputEl.type = "color"; tx.onChange(async (v) => sync("accent", v)); })
      .addExtraButton((b) => b.setIcon("eraser").setTooltip("跟主题").onClick(async () => { delete box.accent; await this.save(); this.plugin.applyProjectVars(); this.display(); }));
    new Setting(p).setName(name + "的圆角").setDesc("0＝跟主题。")
      .addSlider((sl) => sl.setLimits(0, 28, 1).setValue(Number(box.radius) || 0).setDynamicTooltip()
        .onChange(async (v) => sync("radius", Number(v) ? Number(v) : "")));
    new Setting(p).setName(name + "的间距").setDesc("0＝跟主题。")
      .addSlider((sl) => sl.setLimits(0, 40, 1).setValue(Number(box.gap) || 0).setDynamicTooltip()
        .onChange(async (v) => sync("gap", Number(v) ? Number(v) : "")));
    p.createDiv({ cls: "gd-set-hint", text: "这些项留空时全都跟主题走；只有你亲手填过的项才会固定住，换主题不再覆盖它。想恢复联动，点那一行的「跟主题」。" });
  }

  /* 包一层，把「目录」和搬过来的几项合起来 */
  dirPane(p) {
    /* 背景归这一处自己管（v3.14：从主题里拆出来，五处各一份） */
    this.bgPane(p, "dir", "目录");

    this.projectLook(p, "dir", "目录");
    this.treePane(p);
    p.createEl("h4", { text: "目录显示" });
    this.dirExtras(p);
    /* 3.7：磨砂 —— 上（文件夹区）下（文件区）两块各自开，互不影响 */
    p.createEl("h4", { text: "目录的磨砂" });
    p.createDiv({ cls: "gd-set-hint", text: "上下两块分开算：开了哪块就只有那块磨砂，没开的一块一点开销都没有。" });
    new Setting(p).setName("上半 · 文件夹区磨砂")
      .addToggle((t) => t.setValue(this.s.treeGlassTop === true).onChange(async (v) => {
        this.s.treeGlassTop = v; await this.save(); this.plugin.applyProjectBg(); this.display();
      }));
    new Setting(p).setName("下半 · 文件区磨砂")
      .addToggle((t) => t.setValue(this.s.treeGlassBot === true).onChange(async (v) => {
        this.s.treeGlassBot = v; await this.save(); this.plugin.applyProjectBg(); this.display();
      }));
  }

  /* ---------- 流线图（新开） ---------- */
  timelinePane(p) {
    /* 背景归这一处自己管（v3.14：从主题里拆出来，五处各一份） */
    this.bgPane(p, "tl", "流线图");

    p.createEl("h3", { text: "流线图" });
    p.createDiv({ cls: "gd-set-hint", text: "流线图＝右侧那条时间轴。它按天列，点开一天能看到那天插了什么、改过几次、能不能回退。" });
    p.createEl("h4", { text: "流线图位置" });
    new Setting(p).setName("流线图放在哪").setDesc("右侧栏＝一边写字一边看；主区标签页＝占一整页。").addDropdown((d) => {
      d.addOption("right", "右侧栏"); d.addOption("left", "左侧栏"); d.addOption("tab", "主区标签页");
      d.setValue(this.s.timelinePlacement).onChange(async (v) => { this.s.timelinePlacement = v; await this.save(); new Notice("重新打开插件后生效"); });
    });
    new Setting(p).setName("流线图宽度").setDesc("右侧栏太窄会显示成细长条；调宽一点更像正方形。").addSlider((sl) => sl.setLimits(180, 420, 10).setValue(this.s.timelineWidth || 260).setDynamicTooltip()
      .onChange(async (v) => { this.s.timelineWidth = v; await this.save(); this.plugin.applyTimeline(); }));
    new Setting(p).setName("流线图条目接近方形").setDesc("开着：每一条的缩略图和卡片都是方的，不再是扁长条。").addToggle((t) => t.setValue(this.s.timelineSquare !== false).onChange(async (v) => { this.s.timelineSquare = v; await this.save(); this.plugin.refreshAllTimelinePanels && this.plugin.refreshAllTimelinePanels(); }));
    p.createEl("h4", { text: "流线图内容" });
    new Setting(p).setName("顶部工具收成一个图标").setDesc("开着：近 30/90 天、跟随当天、看全部、撤销、重做、搜索全收进标题栏那一个 ▾，点开才展开。关掉就一直摊着。")
      .addToggle((t) => t.setValue(this.s.timelineCompactTop !== false).onChange(async (v) => {
        this.s.timelineCompactTop = v;
        await this.save();
        if (this.plugin.refreshAllTimelinePanels) this.plugin.refreshAllTimelinePanels();
      }));
    new Setting(p).setName("流线图显示缩略轴").setDesc("顶部那条按天排的小圆点，用来快速跳日期。").addToggle((t) => t.setValue(this.s.showCalendarAxis).onChange(async (v) => { this.s.showCalendarAxis = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("流线图点开预览显示在原文上方").setDesc("开着：点一条，预览铺在这篇原文的正上方（视觉在上、文字在下）。关掉：就用原来的浮窗。").addToggle((t) => t.setValue(this.s.timelinePreviewAbove !== false).onChange(async (v) => { this.s.timelinePreviewAbove = v; await this.save(); }));
    p.createEl("h4", { text: "流线图的备份" });
    p.createDiv({ cls: "gd-set-hint", text: "流线图的价值就是「回得去」：每次改动前自动留一版，比 Ctrl+Z 记得久，还看得见。默认开着。" });
    new Setting(p).setName("自动留版本").setDesc("关掉后，流线图里只剩手动备份的版本。")
      .addToggle((t) => t.setValue(this.s.autoSnapshot !== false).onChange(async (v) => { this.s.autoSnapshot = v; await this.save(); new Notice(v ? "已开启自动留版本" : "已关闭自动留版本"); }));
    new Setting(p).setName("改动上色").setDesc("新增 / 修改 / 删除 各一个颜色标在卡片左边，只做颜色。")
      .addToggle((t) => t.setValue(this.s.timelineColorDiff !== false).onChange(async (v) => {
        this.s.timelineColorDiff = v;
        await this.save();
        if (this.plugin.refreshAllTimelinePanels) this.plugin.refreshAllTimelinePanels();
      }));
    this.projectLook(p, "tl", "流线图");
  }

  /* ---------- 外观（五套风格 / 边框 / 封面 / 贴纸） ---------- */
  homeLook(p) {
    new Setting(p).setName("主页的页面风格").setDesc("五套风格都可自由调色，切换不影响日记内容。").addDropdown((d) => {
      for (const [v, n] of THEMES) d.addOption(v, n);
      d.setValue(this.s.theme || "card").onChange(async (v) => { this.s.theme = v; await this.save(); this.refresh(); });
    });
    new Setting(p).setName("主页的格子边框").setDesc("「纸胶带」是手账感最强的一档：格子顶部一条斜纹色带。").addDropdown((d) => {
      for (const [v, n] of BORDERS) d.addOption(v, n);
      d.setValue(this.s.defaultBorder || "hair").onChange(async (v) => {
        this.s.defaultBorder = v;
        await this.save();
        const g = this.plugin.gridView();
        if (g) { g.layout.border = v; g.save(true); }
        this.refresh(true);
      });
    });
    new Setting(p).setName("主页的强调色").addText((t) => {
      t.setValue(this.s.accent).onChange(async (v) => { if (/^#[0-9a-f]{6}$/i.test(v)) { this.s.accent = v; await this.save(); this.refresh(); } });
      t.inputEl.type = "color";
    });
    new Setting(p).setName("主页的圆角").addSlider((s) => s.setLimits(0, 28, 1).setValue(this.s.radius).setDynamicTooltip().onChange(async (v) => { this.s.radius = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页的卡片不透明度").addSlider((s) => s.setLimits(0.3, 1, 0.05).setValue(this.s.cardOpacity).setDynamicTooltip().onChange(async (v) => { this.s.cardOpacity = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页的正文字号").addSlider((s) => s.setLimits(10, 26, 1).setValue(this.s.fontSize).setDynamicTooltip().onChange(async (v) => { this.s.fontSize = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页的行距").addSlider((s) => s.setLimits(1.2, 2.6, 0.05).setValue(this.s.lineHeight || 1.7).setDynamicTooltip().onChange(async (v) => { this.s.lineHeight = v; await this.save(); this.refresh(); }));
    /* ── 正文排版（纸书感）── */
    p.createEl("h4", { text: "正文排版" });
    new Setting(p)
      .setName("主页的首行缩进")
      .setDesc("中文纸书传统：每段开头空两格。0 = 不缩进。")
      .addSlider((s) => s.setLimits(0, 4, 0.5).setValue(this.s.paraIndent == null ? 2 : this.s.paraIndent).setDynamicTooltip()
        .onChange(async (v) => { this.s.paraIndent = v; await this.save(); this.refresh(); }));
    new Setting(p)
      .setName("主页的段落间距")
      .setDesc("两段之间空多少（单位 em，1em = 一个字高）。建议 0.8–1。")
      .addSlider((s) => s.setLimits(0, 2, 0.1).setValue(this.s.paraGap == null ? 0.8 : this.s.paraGap).setDynamicTooltip()
        .onChange(async (v) => { this.s.paraGap = v; await this.save(); this.refresh(); }));
    new Setting(p)
      .setName("主页的标题下方间距")
      .setDesc("标题和正文之间的空隙，单独控制，不和段落间距叠加。")
      .addSlider((s) => s.setLimits(0, 1.5, 0.1).setValue(this.s.paraFontGap == null ? 0.5 : this.s.paraFontGap).setDynamicTooltip()
        .onChange(async (v) => { this.s.paraFontGap = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页的字重").addSlider((s) => s.setLimits(100, 900, 100).setValue(this.s.fontWeight || 400).setDynamicTooltip().onChange(async (v) => { this.s.fontWeight = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页的字体").setDesc("留空跟随 Obsidian；可填 \"LXGW WenKai\" 之类。").addText((t) => t.setValue(this.s.fontFamily).setPlaceholder("留空使用默认字体").onChange(async (v) => { this.s.fontFamily = v; await this.save(); this.refresh(); }));

    p.createEl("h4", { text: "封面图" });
    p.createDiv({ cls: "gd-set-note", text: "封面优先用单篇里设置的；没设就找 frontmatter 的 cover/banner；再没有就按下面的「兜底」来。0 高度＝不要封面。" });
    new Setting(p).setName("主页显示封面").addToggle((t) => t.setValue(this.s.showCover).onChange(async (v) => { this.s.showCover = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页封面高度").addSlider((s) => s.setLimits(0, 1200, 10).setValue(this.s.coverHeight).setDynamicTooltip().onChange(async (v) => { this.s.coverHeight = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页没有封面图时").addDropdown((d) => {
      d.addOption("gradient", "用强调色渐变（推荐，不会破图）");
      d.addOption("firstImage", "自动取正文第一张图");
      d.addOption("none", "不显示封面条");
      d.setValue(this.s.coverFallback).onChange(async (v) => { this.s.coverFallback = v; await this.save(); this.refresh(); });
    });

    p.createEl("h4", { text: "记笔记的手感" });
    new Setting(p).setName("主页输入时格子轻微抬起").addToggle((t) => t.setValue(this.s.hoverLift).onChange(async (v) => { this.s.hoverLift = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页空格子显示引导问句").setDesc("九宫格日记的关键：每格用一句话提示你该写什么。").addToggle((t) => t.setValue(this.s.showPromptHint).onChange(async (v) => { this.s.showPromptHint = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页引导问句库").addDropdown((d) => {
      for (const k of Object.keys(PROMPT_SETS)) d.addOption(k, k);
      d.setValue(this.s.promptSet).onChange(async (v) => { this.s.promptSet = v; await this.save(); this.refresh(); });
    });
    new Setting(p).setName("主页格子底部字数进度纹").addToggle((t) => t.setValue(this.s.showWordTicker).onChange(async (v) => { this.s.showWordTicker = v; await this.save(); this.refresh(); }));

    p.createEl("h4", { text: "动图" });
    p.createDiv({ cls: "gd-set-note", text: "GIF / WebP / APNG 拖进格子就会动。图存在 日记/attachments/ 里，跟着库同步。" });
    new Setting(p).setName("主页动图播放方式").addDropdown((d) => {
      d.addOption("always", "一直播（推荐）");
      d.addOption("hover", "悬停才播（省电）");
      d.setValue(this.s.animPlayMode).onChange(async (v) => { this.s.animPlayMode = v; await this.save(); this.refresh(); });
    });
    new Setting(p).setName("主页动图大小提示阈值（MB）").setDesc("超过这个大小的动图插入时会提醒一句（不影响插入）。").addSlider((s) => s.setLimits(1, 50, 1).setValue(this.s.animMaxMB).setDynamicTooltip().onChange(async (v) => { this.s.animMaxMB = v; await this.save(); }));

    p.createEl("h4", { text: "背景与自定义 CSS" });
    const imgs = this.app.vault.getFiles().filter((f) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f.path));
    new Setting(p).setName("主页的旧版背景图").setDesc("旧版功能，选库里的一张图当整页底纹（低透明度，不挡字）。").addDropdown((d) => {
      d.addOption("", "（无）");
      for (const f of imgs) d.addOption(f.path, f.path);
      const cur = this.s.background || "";
      if (cur && !imgs.some((f) => f.path === cur)) d.addOption(cur, `${cur}　← 文件不存在`);
      d.setValue(cur).onChange(async (v) => { this.s.background = v; await this.save(); this.refresh(); });
    });
    p.createEl("label", { text: "自定义 CSS（高级）", cls: "gd-field-label" });
    const ta = p.createEl("textarea", { cls: "gd-css-input", attr: { placeholder: ".gd-cell { border-width: 2px; }" } });
    ta.value = this.s.customCss || "";
    ta.oninput = debounce(async () => { this.s.customCss = ta.value; await this.save(); this.plugin.applyCustomCss(); }, 400);
    new Setting(p).setName("主页默认开启 Markdown 预览").addToggle((t) => t.setValue(this.s.renderMarkdown).onChange(async (v) => { this.s.renderMarkdown = v; await this.save(); }));

    new Setting(p).setName("主页封面可拖动取景").setDesc("开着的时候，在封面上按住拖动就能选你想显示的那一块。").addToggle((t) => t.setValue(this.s.showCoverPos !== false).onChange(async (v) => { this.s.showCoverPos = v; await this.save(); }));

    p.createEl("h4", { text: "座右铭栏（封面右侧）" });
    new Setting(p).setName("主页显示座右铭栏").setDesc("封面右边一列，写一句每天想看到的话。默认关，开了才有。").addToggle((t) => t.setValue(this.s.showMotto).onChange(async (v) => { this.s.showMotto = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页默认座右铭").setDesc("每天都可以在封面上单独改；这里是不改时用的那句。").addTextArea((ta) => {
      ta.setPlaceholder("比如：今天也只做一件事，做好它。");
      ta.setValue(this.s.motto || "").onChange(async (v) => { this.s.motto = v; await this.save(); this.refresh(); });
    });
    new Setting(p).setName("主页座右铭对齐").addDropdown((d) => {
      d.addOption("left", "左对齐");
      d.addOption("center", "居中");
      d.addOption("right", "右对齐");
      d.setValue(this.s.mottoAlign || "left").onChange(async (v) => { this.s.mottoAlign = v; await this.save(); this.refresh(); });
    });
    new Setting(p).setName("主页座右铭字号").addSlider((s) => s.setLimits(11, 28, 1).setValue(this.s.mottoSize || 15).setDynamicTooltip().onChange(async (v) => { this.s.mottoSize = v; await this.save(); this.refresh(); }));

    p.createEl("h4", { text: "封面标志（左下角头像）" });
    new Setting(p).setName("主页显示封面标志").setDesc("封面上传图之前一直缺这个位置；现在可以放头像/标记/小图。").addToggle((t) => t.setValue(this.s.showAvatar).onChange(async (v) => { this.s.showAvatar = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页标志文字").setDesc("没上传图片时显示 1–2 个字。留空则自动用今天的日期首字。").addText((txt) => {
      txt.setPlaceholder("格");
      txt.setValue(this.s.avatarText || "").onChange(async (v) => { this.s.avatarText = v; await this.save(); this.refresh(); });
    });
    new Setting(p).setName("主页标志大小").addSlider((s) => s.setLimits(24, 96, 2).setValue(this.s.avatarSize || 44).setDynamicTooltip().onChange(async (v) => { this.s.avatarSize = v; await this.save(); this.refresh(); }));

    p.createEl("h4", { text: "封面舞台（四层自由布局）" });
    p.createDiv({ cls: "gd-set-note", text: "打开之后，封面从「一个框装一张图」变成一块舞台，上面叠四层：背景、照片、座右铭、标志。每层各自独立移动缩放，互不连坐 —— 拖图片不影响文本框，拖背景也不动别的。" });
    new Setting(p).setName("主页使用四层舞台").setDesc("关掉就回到旧版封面（一个框 + 右侧座右铭栏）。老日记不会因此改变外观。")
      .addToggle((tg) => tg.setValue(!!this.s.showStage).onChange(async (v) => { this.s.showStage = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("座右铭的位置")
      .setDesc("座右铭是舞台上一个独立的对象，直接在上面的画面上拖就行。下面两个按钮是快速复位。")
      .addButton((b) => b.setButtonText("放到左上角").onClick(async () => {
        const v = this.plugin.gridView();
        if (!v || !v.layout) { new Notice("先打开一篇日记"); return; }
        if (!v.layout.layers) v.layout.layers = deepClone(DEFAULT_LAYERS);
        v.layout.layers.text.x = 4; v.layout.layers.text.y = 8;
        v.layout.layers.text.w = 56; v.layout.layers.text.h = 26;
        this.s.showMotto = true;
        await this.save();
        v.scheduleSave(); v.render();
      }))
      .addButton((b) => b.setButtonText("通栏铺满").onClick(async () => {
        const v = this.plugin.gridView();
        if (!v || !v.layout) { new Notice("先打开一篇日记"); return; }
        if (!v.layout.layers) v.layout.layers = deepClone(DEFAULT_LAYERS);
        v.layout.layers.text.x = 0; v.layout.layers.text.w = 100;
        this.s.showMotto = true;
        await this.save();
        v.scheduleSave(); v.render();
      }));

    new Setting(p).setName("主页舞台高度").addSlider((sl) => sl.setLimits(120, 1200, 10).setValue(this.s.stageHeight || 220).setDynamicTooltip()
      .onChange(async (v) => { this.s.stageHeight = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页推板步长").setDesc("舞台上按一次方向键挪多少（百分比）。")
      .addDropdown((d) => {
        for (const v of LAYER_STEPS) d.addOption(String(v), v + "%");
        d.setValue(String(this.s.layerStep || 5)).onChange(async (v) => { this.s.layerStep = Number(v); await this.save(); });
      });

    p.createEl("h4", { text: "座右铭（舞台上的文字层）" });
    new Setting(p).setName("主页座右铭文字颜色").setDesc("留空跟随主题。舞台上自动加描边光晕，深浅背景都能读。")
      .addColorPicker((c) => c.setValue(this.s.mottoColor || "#2f3237").onChange(async (v) => { this.s.mottoColor = v; await this.save(); this.refresh(); }))
      .addExtraButton((b) => b.setIcon("rotate-ccw").setTooltip("跟随主题").onClick(async () => { this.s.mottoColor = ""; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页座右铭不透明度").addSlider((sl) => sl.setLimits(20, 100, 1).setValue(Math.round((this.s.mottoOpacity == null ? 1 : this.s.mottoOpacity) * 100)).setDynamicTooltip()
      .onChange(async (v) => { this.s.mottoOpacity = v / 100; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页的字重").addSlider((sl) => sl.setLimits(300, 900, 100).setValue(this.s.mottoWeight || 600).setDynamicTooltip()
      .onChange(async (v) => { this.s.mottoWeight = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页座右铭描边光晕").setDesc("在深色图上写白字、浅色图上写黑字都靠它，建议开着。")
      .addToggle((tg) => tg.setValue(this.s.mottoShadow !== false).onChange(async (v) => { this.s.mottoShadow = v; await this.save(); this.refresh(); }));

    p.createEl("h4", { text: "标志（舞台上的头像层）" });
    new Setting(p).setName("主页标志轮廓").setDesc("头像的外轮廓。圆形之外的都会裁掉边角，图不会被拉伸变形。")
      .addDropdown((d) => {
        for (const [v, nm] of AVATAR_SHAPES) d.addOption(v, nm);
        d.setValue(this.s.avatarShape || "circle").onChange(async (v) => {
          this.s.avatarShape = v; await this.save(); this.refresh();
        });
      });
    new Setting(p).setName("主页标志相框样式").setDesc("五款：无 / 细描边 / 双环 / 光晕 / 虚线。")
      .addDropdown((d) => {
        d.addOption("none", "无");
        d.addOption("thin", "细描边");
        d.addOption("double", "双环");
        d.addOption("glow", "光晕");
        d.addOption("dash", "虚线");
        d.setValue(this.s.markRing || "none").onChange(async (v) => { this.s.markRing = v; await this.save(); this.refresh(); });
      });
    new Setting(p).setName("主页标志下方名字").setDesc("留空则不显示。也可以每篇单独在舞台右键里改。")
      .addText((tx) => tx.setPlaceholder("比如：小格").setValue(this.s.markName || "").onChange(async (v) => { this.s.markName = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("主页标志大小").addSlider((sl) => sl.setLimits(24, 140, 2).setValue(this.s.markSize || 56).setDynamicTooltip()
      .onChange(async (v) => { this.s.markSize = v; await this.save(); this.refresh(); }));

    new Setting(p).setName("主页批量设置封面…").setDesc("一次给很多天套同一张壁纸，不用一篇篇来。").addButton((b) => b.setButtonText("打开").onClick(() => this.plugin.openBatchCover()));
  }

  /* ---------- 目录（双面板） ---------- */
  treePane(p) {
    const s = this.s;
    p.createEl("h3", { text: "目录" });
    p.createDiv({ cls: "gd-set-hint", text: "目录就是左侧那条：点文件夹名会弹菜单，排序、只看什么、怎么分组、新建文件夹都在里面。" });

    p.createEl("h4", { text: "目录的形态" });
    new Setting(p).setName("目录上下双面板")
      .setDesc("上面是文件夹，下面是这个文件夹里的笔记。关掉就退回一条通列表。")
      .addToggle((x) => x.setValue(s.treeTwoPane !== false).onChange(async (v) => {
        s.treeTwoPane = v; await this.save(); this.rebuildSidebar();
      }));
    new Setting(p).setName("目录上下面板比例")
      .setDesc("上面那块占多高。也可以直接在目录里拖中间那条线。")
      .addSlider((x) => x.setLimits(15, 85, 1).setValue(Math.round((s.treePaneRatio || 0.42) * 100)).setDynamicTooltip()
        .onChange(async (v) => {
          s.treePaneRatio = v / 100; await this.save();
          const sb = this.plugin.sidebar;
          if (sb && sb.applySplit) sb.applySplit(s.treePaneRatio);
        }));

    p.createEl("h4", { text: "目录的图标与行首标记" });
    new Setting(p).setName("目录行首标记")
      .setDesc("小三角与圆点二选一。选哪个，哪个就能点着折叠展开。")
      .addDropdown((d) => {
        for (const [v, n] of TREE_MARK_MODES) d.addOption(v, n);
        d.setValue(s.treeMarkMode || "caret").onChange(async (v) => {
          s.treeMarkMode = v; await this.save(); this.rebuildSidebar();
        });
      });
    new Setting(p).setName("目录的图标样式")
      .setDesc("这一项以前是死设置（改了没反应），现在真的接上了。单个文件夹可以在它自己的右键菜单里单独设图标或图片。")
      .addDropdown((d) => {
        for (const [v, n] of [["dot", "圆点"], ["ring", "空心圈"], ["square", "方块"], ["diamond", "菱形"], ["arrow", "箭头"], ["check", "对勾"], ["dash", "短横"], ["star", "星"], ["emoji", "表情"], ["icon", "图标字体"], ["none", "不显示"]]) d.addOption(v, n);
        d.setValue(s.treeIconStyle || "dot").onChange(async (v) => {
          s.treeIconStyle = v; await this.save(); this.rebuildSidebar();
        });
      });
    p.createDiv({ cls: "gd-set-hint", text: "单个文件夹想用图片当图标：在目录里右键那个文件夹 →「用图片当图标…」，可以从库里挑，也可以直接粘一个网址。" });
    new Setting(p).setName("目录的移动模式")
      .setDesc("开着时每个文件夹前面出现拖拽手柄，直接拖着换顺序；再点一次工具栏上的同一个图标就退出。")
      .addToggle((x) => x.setValue(!!s.treeMoveMode).onChange(async (v) => {
        s.treeMoveMode = v; await this.save(); this.rebuildSidebar();
      }));

    p.createEl("h4", { text: "目录的条目" });
    new Setting(p).setName("目录显示封面缩略图")
      .setDesc("每条左边一张小图，取这一天日记里的第一张图（没有就用封面）。")
      .addToggle((x) => x.setValue(s.treeThumb !== false).onChange(async (v) => {
        s.treeThumb = v; await this.save(); this.rebuildSidebar();
      }));
    new Setting(p).setName("目录紧凑模式")
      .setDesc("一行一条，不显示摘要，能一次看到更多。")
      .addToggle((x) => x.setValue(!!s.treeCompact).onChange(async (v) => {
        s.treeCompact = v; await this.save(); this.rebuildSidebar();
      }));
    new Setting(p).setName("目录显示篇数与字数")
      .setDesc("文件夹右边显示有几篇；每条右边显示星期和字数。")
      .addToggle((x) => x.setValue(s.treeShowStats !== false).onChange(async (v) => {
        s.treeShowStats = v; await this.save(); this.rebuildSidebar();
      }));
    new Setting(p).setName("目录默认怎么分组")
      .setDesc("「今天 / 昨天 / 前七天 / 更早」最贴近日常找东西的习惯。")
      .addDropdown((d) => {
        d.addOption("smart", "今天 / 昨天 / 前七天 / 更早");
        d.addOption("month", "按月份");
        d.addOption("none", "不分组，一条通到底");
        d.setValue(s.treeGroupMode || "smart").onChange(async (v) => {
          s.treeGroupMode = v; await this.save(); this.rebuildSidebar();
        });
      });
    new Setting(p).setName("目录行间分隔符")
      .setDesc("把每一行隔开，可选线体或小图案。")
      .addDropdown((d) => {
        for (const [v, n] of [["none", "不要"], ["line", "细线"], ["dash", "虚线"], ["dot", "圆点"], ["wave", "齿线"], ["star", "星"], ["heart", "心"], ["leaf", "叶"], ["sun", "日"], ["arrow", "箭头"], ["char", "自定义字符"], ["image", "自定义图片"]]) d.addOption(v, n);
        d.setValue(s.treeSepStyle || "none").onChange(async (v) => {
          s.treeSepStyle = v; await this.save(); this.rebuildSidebar(); this.display();
        });
      });
    if (s.treeSepStyle === "char" || s.treeSepStyle === "image") {
      new Setting(p).setName(s.treeSepStyle === "image" ? "分隔图片路径或网址" : "分隔字符")
        .setDesc(s.treeSepStyle === "image" ? "库内路径（如 日记/attachments/sep.png）或以 http 开头的网址。" : "填一个字符，比如 · 或 ／")
        .addText((tx) => tx.setPlaceholder(s.treeSepStyle === "image" ? "日记/attachments/sep.png" : "·")
          .setValue(s.treeSepChar || "")
          .onChange(async (v) => { s.treeSepChar = v.trim(); await this.save(); this.rebuildSidebar(); }));
    }

    p.createEl("h4", { text: "目录的文件夹" });
    p.createDiv({ cls: "gd-set-note", text: "每个文件夹可以有自己的颜色和图标：在目录里右键文件夹 → 这个文件夹的外观。这里只管整体行为。" });
    new Setting(p).setName("目录文件夹右侧数量徽标")
      .addToggle((x) => x.setValue(s.treeShowBadge !== false).onChange(async (v) => {
        s.treeShowBadge = v; await this.save(); this.rebuildSidebar();
      }));
    new Setting(p).setName("目录允许拖拽移动")
      .setDesc("把一条笔记拖到文件夹上就移过去。")
      .addToggle((x) => x.setValue(s.treeDragMove !== false).onChange(async (v) => {
        s.treeDragMove = v; await this.save();
      }));
    new Setting(p).setName("目录显示被隐藏的文件夹")
      .setDesc("在目录里隐藏过的文件夹，打开这个才会重新出现。")
      .addToggle((x) => x.setValue(!!s.treeShowHidden).onChange(async (v) => {
        s.treeShowHidden = v; await this.save(); this.rebuildSidebar();
      }));
    const hidden = Array.isArray(s.treeHiddenFolders) ? s.treeHiddenFolders : [];
    new Setting(p).setName("目录已隐藏的文件夹（" + hidden.length + " 个）")
      .setDesc(hidden.length ? hidden.join("、" ) : "还没有隐藏任何文件夹。")
      .addButton((b) => b.setButtonText("全部恢复").onClick(async () => {
        s.treeHiddenFolders = [];
        await this.save();
        this.rebuildSidebar();
        this.display();
      }));

    new Setting(p).setName("目录里也显示其它文件")
      .setDesc("除了日记，把库里别的 md 也列出来（附件目录不会混进来）。")
      .addToggle((x) => x.setValue(s.treeShowOtherFiles !== false).onChange(async (v) => {
        s.treeShowOtherFiles = v; await this.save(); this.rebuildSidebar();
      }));
    new Setting(p).setName("目录保留底部三个按钮")
      .setDesc("原本底部有「时间线 / 日历 / 设置」，默认收起来了。")
      .addToggle((x) => x.setValue(!!s.treeShowFoot).onChange(async (v) => {
        s.treeShowFoot = v; await this.save(); this.rebuildSidebar();
      }));

    p.createEl("h4", { text: "目录的附件" });
    new Setting(p).setName("附件文件夹")
      .setDesc("插图、头像、封面都存这里，和日记正文分开。相对日记根目录。")
      .addText((x) => x.setValue(s.attachFolder || "attachments").onChange(async (v) => {
        s.attachFolder = v.trim() || "attachments"; await this.save();
      }));
  }

  /* ---------- 排布（左右滚 / 翻页） ---------- */
  layout(p) {
    p.createDiv({ cls: "gd-set-note", text: "默认是上下滚。想做成九宫格那样一屏一屏翻，用「左右翻页」；只想左右拉就用「左右滚动」。手机上会自动退回单列。" });
    new Setting(p).setName("排布方式").addDropdown((d) => {
      for (const [v, n] of GRID_FLOWS) d.addOption(v, n);
      d.setValue(this.s.flow).onChange(async (v) => { this.s.flow = v; await this.save(); this.refresh(); });
    });
    new Setting(p).setName("列数（上下滚时）").addSlider((s) => s.setLimits(1, 6, 1).setValue(this.s.columns).setDynamicTooltip().onChange(async (v) => { this.s.columns = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("格子宽度（横向时）").setDesc("横向滚动/翻页时每一列的固定宽度。").addSlider((s) => s.setLimits(190, 560, 10).setValue(this.s.cellWidth).setDynamicTooltip().onChange(async (v) => { this.s.cellWidth = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("横向时每屏几行").addSlider((s) => s.setLimits(1, 6, 1).setValue(this.s.flowRows).setDynamicTooltip().onChange(async (v) => { this.s.flowRows = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("翻页一屏几列").addSlider((s) => s.setLimits(1, 6, 1).setValue(this.s.pageCols).setDynamicTooltip().onChange(async (v) => { this.s.pageCols = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("翻页吸附").setDesc("翻完一页自动对齐到页边界。").addToggle((t) => t.setValue(this.s.pagedSnap).onChange(async (v) => { this.s.pagedSnap = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("基础行高").addSlider((s) => s.setLimits(80, 400, 10).setValue(this.s.rowHeight).setDynamicTooltip().onChange(async (v) => { this.s.rowHeight = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("格子间距").addSlider((s) => s.setLimits(0, 48, 2).setValue(this.s.gap).setDynamicTooltip().onChange(async (v) => { this.s.gap = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("页面内边距").addSlider((s) => s.setLimits(4, 72, 2).setValue(this.s.pad).setDynamicTooltip().onChange(async (v) => { this.s.pad = v; await this.save(); this.refresh(); }));
    new Setting(p).setName("中央格强调").setDesc("格数 ≥ 9 时，把正中间那格描边加粗（曼陀罗九宫格的做法）。").addToggle((t) => t.setValue(this.s.centerCell).onChange(async (v) => { this.s.centerCell = v; await this.save(); this.refresh(); }));
  }

  /* ---------- 悬浮窗 ---------- */
  floatTab(p) {
    /* 背景归这一处自己管（v3.14：从主题里拆出来，五处各一份） */
    this.灵感背景(p);

    this.projectLook(p, "float", "灵感");
    p.createDiv({ cls: "gd-set-note", text: "悬浮窗不占主编辑区：在别的笔记里也能随手写今天那一格，写完关掉。位置和大小会记住。快捷键可在「快捷键」里搜「悬浮窗」自定。" });
    new Setting(p).setName("启用悬浮窗").addToggle((t) => t.setValue(this.s.floatEnabled).onChange(async (v) => { this.s.floatEnabled = v; await this.save(); }));
    new Setting(p).setName("默认尺寸").addDropdown((d) => {
      d.addOption("s", "小（480×420）"); d.addOption("m", "中（720×660）"); d.addOption("l", "大（1000×760）");
      d.setValue(this.s.floatSize).onChange(async (v) => { this.s.floatSize = v; await this.save(); });
    });
    new Setting(p).setName("拖到边缘时半收").addToggle((t) => t.setValue(this.s.floatEdgeDock).onChange(async (v) => { this.s.floatEdgeDock = v; await this.save(); }));
    new Setting(p).setName("打开 Obsidian 时自动拉起").setDesc("需要之前用过悬浮窗（记住过位置）才会自动出现。").addToggle((t) => t.setValue(!!this.s.floatRect).setDisabled(!this.s.floatRect).onChange(async (v) => {
      if (!v) this.s.floatRect = null;
      await this.save();
    }));
    const row = p.createDiv({ cls: "gd-modal-actions" });
    row.createEl("button", { text: "现在打开悬浮窗", cls: "mod-cta" }).onclick = () => this.plugin.float.open(todayStr());
    row.createEl("button", { text: "关闭悬浮窗" }).onclick = () => this.plugin.float.close();
    row.createEl("button", { text: "重置位置与大小" }).onclick = async () => { this.s.floatRect = null; await this.save(); this.plugin.float.close(); new Notice("已重置，下次打开在默认位置"); };

    const row2 = p.createDiv({ cls: "gd-modal-actions" });
    row2.createEl("button", { text: "打开灵感", cls: "mod-cta" }).onclick = () => this.plugin.float.open(todayStr());
    row2.createEl("button", { text: "关闭灵感" }).onclick = () => this.plugin.float.close();

    p.createEl("h4", { text: "悬浮窗标题" });
    new Setting(p).setName("标题文字").setDesc("原「格间日记」浮窗已改叫「灵感笔记」，跟日历浮窗区分。")
      .addText((tx) => tx.setValue(this.s.floatTitle || "灵感笔记").onChange(async (v) => {
        this.s.floatTitle = String(v || "").trim() || "灵感笔记"; await this.save();
      }));

    p.createEl("h4", { text: "启动行为" });
    p.createEl("div", {
      cls: "setting-item-description",
      text: "这两项默认都是关的。以前只要「上次用过」就会每次启动都弹出来，所以现在改成必须你手动打开。",
    });
    new Setting(p)
      .setName("启动时自动弹日历浮窗")
      .setDesc("关着的话，启动就是干净的主界面；要用的时候点侧栏日历图标或命令面板。")
      .addToggle((tg) =>
        tg.setValue(this.s.calFloatAutoOpen === true).onChange(async (v) => {
          this.s.calFloatAutoOpen = v;
          await this.save();
        })
      );
    new Setting(p)
      .setName("启动时自动弹灵感笔记")
      .setDesc("同上。灵感笔记随时可以按快捷键或用命令叫出来，不必开机就占屏幕。")
      .addToggle((tg) =>
        tg.setValue(this.s.floatAutoOpen === true).onChange(async (v) => {
          this.s.floatAutoOpen = v;
          await this.save();
        })
      );
  }

  /* 灵感背景：用户明确「只留两项：图片 + 透明度」。
     其余形态（纯色/纹理/渐变/玻璃/视频）在这里一律不出现。 */
  灵感背景(p) {
    const s = this.s;
    p.createEl("h4", { text: "灵感的背景" });
    p.createDiv({
      cls: "gd-set-hint",
      text: "灵感这一块只留两项：一张图片、一个透明度。默认不透明（100%）、背景跟主题走。",
    });

    new Setting(p).setName("背景图片")
      .setDesc(s.floatBg ? "当前：" + String(s.floatBg).split("/").pop() : "还没选图（跟主题底色）。")
      .addButton((b) => b.setButtonText("选图…").onClick(async () => {
        const got = await chooseImage(this.app, this.plugin, { title: "给灵感选张背景图", multiple: false });
        if (!got) return;
        s.floatBg = got.path;
        await this.save();
        if (this.plugin.float) this.plugin.float.render();
        this.display();
      }))
      .addExtraButton((b) => b.setIcon("eraser").setTooltip("清空（跟主题）").onClick(async () => {
        s.floatBg = "";
        await this.save();
        if (this.plugin.float) this.plugin.float.render();
        this.display();
      }));

    new Setting(p).setName("透明度")
      .setDesc("100% 完全不透明，最清楚；调低能透出后面的笔记。")
      .addSlider((sl) => sl.setLimits(20, 100, 1)
        .setValue(Math.round((s.floatBgOpacity == null ? 1 : s.floatBgOpacity) * 100))
        .setDynamicTooltip()
        .onChange(async (v) => {
          s.floatBgOpacity = v / 100;
          await this.save();
          if (this.plugin.float) this.plugin.float.render();
        }));
  }

  /* ---------- 日历 ---------- */
  calendar(p) {
    const s = this.s;
    /* 背景归这一处自己管（v3.14：从主题里拆出来，五处各一份） */
    this.bgPane(p, "cal", "日历");

    this.projectLook(p, "cal", "日历");
    p.createDiv({ cls: "gd-set-note", text: "日历 = 骨架 × 纹理。骨架决定日期怎么排（5 种），纹理决定底子怎么画（6 种），两者随意组合就是 30 种外观。农历、节气、节日都不联网，年份 1900–2100 全内置。" });

    p.createEl("h4", { text: "日历骨架（日期怎么排）" });
    new Setting(p).setName("骨架").addDropdown((d) => {
      for (const [v, n] of CAL_SKELETONS) d.addOption(v, n);
      d.setValue(this.s.calSkeleton).onChange(async (v) => { this.s.calSkeleton = v; await this.save(); this.calRefresh(); });
    });
    new Setting(p)
      .setName("日历的月视图形态")
      .setDesc("默认单月；想要两张月历并排（参考台历那种）就切双月。这是可选项，不影响界面其他部分。")
      .addDropdown((d) => {
        d.addOption("single", "单月");
        d.addOption("dual", "双月并排");
        d.setValue(this.s.calSkeleton === "dual" ? "dual" : "single").onChange(async (v) => {
          if (v === "dual") {
            if (this.s.calSkeleton !== "dual") this.s.calPrevSkeleton = this.s.calSkeleton || "grid";
            this.s.calSkeleton = "dual";
          } else {
            this.s.calSkeleton = (this.s.calPrevSkeleton && this.s.calPrevSkeleton !== "dual") ? this.s.calPrevSkeleton : "grid";
          }
          await this.save();
          this.calRefresh();
          this.refresh();
        });
      });

    new Setting(p).setName("一周从哪天开始").addDropdown((d) => {
      d.addOption("1", "周一"); d.addOption("0", "周日");
      d.setValue(String(this.s.calWeekStart)).onChange(async (v) => {
        this.s.calWeekStart = Number(v); await this.save(); this.calRefresh();
      });
    });

    p.createEl("h4", { text: "日历纹理（底子）" });
    new Setting(p).setName("纹理").addDropdown((d) => {
      for (const [v, n] of CAL_TEXTURES) d.addOption(v, n);
      d.setValue(this.s.calTexture).onChange(async (v) => { this.s.calTexture = v; await this.save(); this.calRefresh(); });
    });

    p.createEl("h4", { text: "日历的农历与节日" });
    new Setting(p).setName("日历的农历粒度").setDesc("「只显示初一十五」信息量最少，不会被小字塞满。").addDropdown((d) => {
      d.addOption("none", "不显示"); d.addOption("major", "只显示初一 / 十五"); d.addOption("full", "每天都显示");
      d.setValue(this.s.calLunarMode).onChange(async (v) => { this.s.calLunarMode = v; await this.save(); this.calRefresh(); });
    });
    new Setting(p).setName("节假日 / 工作日着色")
      .setDesc("按内置的 2025–2027 法定节假日表：节假日标红、调休上班标灰、周末淡蓝。")
      .addToggle((x) => x.setValue(s.calShowHoliday !== false).onChange(async (v) => {
        s.calShowHoliday = v; await this.save(); this.calRefresh();
      }));
    new Setting(p).setName("日历显示节气").addToggle((t2) => t2.setValue(this.s.calShowTerm).onChange(async (v) => { this.s.calShowTerm = v; await this.save(); this.calRefresh(); }));
    new Setting(p).setName("日历显示节日").setDesc("农历节日优先，其次公历节日，最后才是节气。").addToggle((t2) => t2.setValue(this.s.calShowFestival).onChange(async (v) => { this.s.calShowFestival = v; await this.save(); this.calRefresh(); }));

    p.createEl("h4", { text: "日历底图" });
    new Setting(p)
      .setName("日历底图")
      .setDesc("可以从电脑里选、从库里挑，也可以直接填一个网络图片地址。建议用浅色图，深色图会自动压一层蒙层保证字能看清。")
      .addButton((b) => b.setButtonText("裁剪…").onClick(() => this.plugin.cropCalWall()))
      .addButton((b) => b.setButtonText("从电脑选…").onClick(async () => { await this.plugin.pickCalWallpaper("file"); }))
      .addButton((b) => b.setButtonText("从库里挑…").onClick(() => this.plugin.pickCalWallpaper("vault")))
      .addButton((b) => b.setButtonText("用网络图…").onClick(() => this.plugin.pickCalWallpaper("url")));
    new Setting(p).setName("底图预览")
      .setDesc("设好之后这里会显示缩略图，方便确认到底有没有生效。")
      .addButton((b) => b.setButtonText("刷新预览").onClick(() => { this.plugin.showCalWallPreview(); this.refresh(); }));
    new Setting(p).setName("日历清理底图").addButton((b) => b.setButtonText("去掉").setWarning().onClick(async () => { this.s.calWallpaper = ""; await this.save(); this.calRefresh(); }));
    new Setting(p).setName("日历底图摆位").addDropdown((d) => {
      for (const [v, n] of CAL_WALL_POS) d.addOption(v, n);
      d.setValue(this.s.calWallpaperPos).onChange(async (v) => { this.s.calWallpaperPos = v; await this.save(); this.calRefresh(); });
    });
    new Setting(p).setName("日历底图透明度").addSlider((sl) => sl.setLimits(10, 100, 5).setValue(Math.round(this.s.calWallpaperOpacity * 100)).setDynamicTooltip().onChange(async (v) => { this.s.calWallpaperOpacity = v / 100; await this.save(); this.calRefresh(); }));
    new Setting(p).setName("日历底图模糊（px）").addSlider((sl) => sl.setLimits(0, 12, 1).setValue(this.s.calWallpaperBlur).setDynamicTooltip().onChange(async (v) => { this.s.calWallpaperBlur = v; await this.save(); this.calRefresh(); }));

    p.createEl("h4", { text: "日历的形态与位置" });
    new Setting(p).setName("日历的打开方式").setDesc("浮窗可以拖、可以贴边、Esc 关掉，位置会记住。").addDropdown((d) => {
      d.addOption("tab", "主区标签页"); d.addOption("float", "浮动面板");
      d.setValue(this.s.calPanel).onChange(async (v) => {
        this.s.calPanel = v; await this.save();
        if (v === "float") this.plugin.openCalendarFloat();
        else this.plugin.closeCalendarFloat();
      });
    });
    new Setting(p).setName("标签页位置").addDropdown((d) => {
      d.addOption("tab", "主区标签页"); d.addOption("right", "右侧栏");
      d.setValue(this.s.calendarPlacement).onChange(async (v) => { this.s.calendarPlacement = v; await this.save(); });
    });
    new Setting(p).setName("显示轴视图").setDesc("标签页顶部那条近 90 天的小圆点，按当天字数决定大小。").addToggle((t2) => t2.setValue(this.s.showCalendarAxis).onChange(async (v) => { this.s.showCalendarAxis = v; await this.save(); const c = this.plugin.calendar; if (c) c.rebuild(); }));
  }

  calRefresh() {
    if (this.plugin.calPanel && this.plugin.calPanel.el) this.plugin.calPanel.render();
    const c = this.plugin.calendar;
    if (c && c.panel && c.panel.el) c.panel.render();
  }

  /* ---------- 表格 ---------- */
  /* 表格皮肤已并入各项目的「线体」，这里不再单独出现。 */

  /* ---------- 模板 ---------- */
  template(p) {
    p.createDiv({ cls: "gd-set-note", text: "模板按种类分组显示，顺序是：主页 → 目录 → 日历 → 悬浮窗 → 格子 → 表格。同一类里可以用 ↑ ↓ 调整先后；新建日记用的是「默认模板」。种类只影响分组，不改格子的行为。" });
    new Setting(p).setName("默认模板").setDesc("新建日记时用它。").addDropdown((d) => {
      for (const t of sortTemplates(this.s.templates)) d.addOption(t.name, t.name);
      d.setValue(this.s.activeTemplate).onChange(async (v) => { this.s.activeTemplate = v; await this.save(); });
    });

    const nameOfKind = (k) => (TEMPLATE_KINDS.find((x) => x[0] === k) || ["", "格子"])[1];
    let lastKind = "";
    this.s.templates.forEach(() => {});
    const ordered = sortTemplates(this.s.templates);
    for (let oi = 0; oi < ordered.length; oi++) {
      const t = ordered[oi];
      const i = this.s.templates.indexOf(t);
      const k = templateKind(t);
      if (k !== lastKind) {
        lastKind = k;
        const kh = p.createDiv({ cls: "gd-set-kind" });
        kh.createSpan({ text: nameOfKind(k) });
        kh.createSpan({ cls: "gd-side-count", text: String(this.s.templates.filter((x) => templateKind(x) === k).length) });
      }
      const row = p.createDiv({ cls: "gd-set-tpl-row" });
      const info = row.createDiv();
      info.createEl("strong", { text: t.name });
      info.createDiv({ cls: "gd-tpl-sub", text: `${(t.cells || []).length} 格 · ${truncate((t.cells || []).map((c) => c.title).join(" / "), 70)}` });
      const acts = row.createDiv({ cls: "gd-set-row-acts" });
      const kindSel = acts.createEl("select", { cls: "gd-select gd-mini-select" });
      for (const [v, n] of TEMPLATE_KINDS) kindSel.createEl("option", { text: n, attr: { value: v } });
      kindSel.value = k;
      kindSel.onchange = async () => {
        t.kind = kindSel.value;
        await this.save(); this.display();
      };
      acts.createEl("button", { text: "↑", cls: "gd-mini-btn", attr: { title: "在这一类里往前排" } }).onclick = async () => {
        this.swapTemplate(t, -1);
        await this.save(); this.display();
      };
      acts.createEl("button", { text: "↓", cls: "gd-mini-btn", attr: { title: "在这一类里往后排" } }).onclick = async () => {
        this.swapTemplate(t, 1);
        await this.save(); this.display();
      };
      acts.createEl("button", { text: "编辑", cls: "gd-mini-btn" }).onclick = () => new TemplateEditorModal(this.app, this.plugin, t, false).open();
      acts.createEl("button", { text: "套用到今天", cls: "gd-mini-btn" }).onclick = () => new TemplateModal(this.app, this.plugin).open();
      acts.createEl("button", { text: "删除", cls: "gd-mini-btn gd-danger" }).onclick = () => new ConfirmModal(this.app, "删除模板？", `「${t.name}」会被移除，已写好的日记不受影响。`, async () => {
        const at = this.s.templates.indexOf(t);
        if (at >= 0) this.s.templates.splice(at, 1);
        if (!this.s.templates.length) this.s.templates.push(deepClone(DEFAULT_SETTINGS.templates[0]));
        if (!this.s.templates.some((x) => x.name === this.s.activeTemplate)) this.s.activeTemplate = this.s.templates[0].name;
        await this.save(); this.display();
      }).open();
    }
    const foot = p.createDiv({ cls: "gd-modal-actions" });
    foot.createEl("button", { text: "+ 新建模板", cls: "mod-cta" }).onclick = () => new TemplateEditorModal(this.app, this.plugin, null, true).open();
    foot.createEl("button", { text: "从当前日记布局生成模板" }).onclick = () => {
      const v = this.plugin.gridView();
      if (!v) { new Notice("请先打开日记"); return; }
      new PromptModal(this.app, "保存当前布局", "模板名称", `布局 ${todayStr()}`, async (name) => {
        this.s.templates.push({
          name: name.trim() || `布局 ${todayStr()}`,
          cells: v.cells.map((c) => ({ title: c.title, cs: c.cs, rs: c.rs, h: c.h, accent: c.accent, border: c.border, sticker: c.sticker })),
        });
        await this.save(); this.display(); new Notice("已保存");
      }).open();
    };
  }

  /* ---------- 粘贴 ---------- */
  paste(p) {
    this.pasteFilter(p);
    p.createDiv({ cls: "gd-set-note", text: "在格子视图的空白处直接 Ctrl+V，会弹出解析窗口；安卓上点工具栏「粘贴生成」再贴文本。所有拆分结果都能逐条改标题、调顺序、去掉不要的段落。" });
    new Setting(p).setName("默认识别方式").addDropdown((d) => {
      for (const [v, n] of PASTE_MODES) d.addOption(v, n);
      d.setValue(this.s.pasteMode).onChange(async (v) => { this.s.pasteMode = v; await this.save(); });
    });
    new Setting(p).setName("默认写入方式").addDropdown((d) => {
      for (const [v, n] of PASTE_TARGETS) d.addOption(v, n);
      d.setValue(this.s.pasteTarget).onChange(async (v) => { this.s.pasteTarget = v; await this.save(); });
    });
    new Setting(p).setName("空行分段时首行作标题").addToggle((t) => t.setValue(this.s.pasteFirstLineAsTitle).onChange(async (v) => { this.s.pasteFirstLineAsTitle = v; await this.save(); }));
    new Setting(p).setName("自定义分隔符").setDesc("例如填 --- 表示用单独一行的 --- 切段；留空关闭。").addText((t) => t.setValue(this.s.pasteSeparator).setPlaceholder("留空").onChange(async (v) => { this.s.pasteSeparator = v; await this.save(); }));
    p.createDiv({ cls: "gd-set-note", text: "自动识别顺序：Markdown 表格 → ## / 【】/ 标题： → 空行分段 → 整段一格。含冒号但带句号的正文行不会被误判成标题。" });
    p.createDiv({ cls: "gd-modal-actions" }).createEl("button", { text: "打开粘贴窗口试一下", cls: "mod-cta" }).onclick = () => new PasteModal(this.app, this.plugin, "").open();
  }

  /* ---------- 粘贴：过滤器 ---------- */
  pasteFilter(p) {
    p.createDiv({ cls: "gd-set-note", text: "这些过滤在「粘贴生成」弹窗里也会实时生效：先按你的规则过滤，再识别标题。留空表示不启用。" });
    new Setting(p).setName("从这一行开始").setDesc("填一个词（比如「今日事件」），它前面的寒暄、说明都会被丢掉。").addText((tx) => tx
      .setPlaceholder("例如：今日事件")
      .setValue(this.s.pasteKeepFrom || "")
      .onChange(async (v) => { this.s.pasteKeepFrom = v.trim(); await this.save(); }));
    new Setting(p).setName("只保留含这些词的分段").setDesc("逗号分隔；空 = 不启用。").addText((tx) => tx
      .setPlaceholder("例如：今日,反思")
      .setValue((this.s.pasteKeepKeywords || []).join(","))
      .onChange(async (v) => { this.s.pasteKeepKeywords = v.split(/[,，]/).map((x) => x.trim()).filter(Boolean); await this.save(); }));
    new Setting(p).setName("丢掉含这些词的分段").setDesc("逗号分隔；优先级高于「只保留」。").addText((tx) => tx
      .setPlaceholder("例如：广告,推广")
      .setValue((this.s.pasteDropKeywords || []).join(","))
      .onChange(async (v) => { this.s.pasteDropKeywords = v.split(/[,，]/).map((x) => x.trim()).filter(Boolean); await this.save(); }));
    new Setting(p).setName("格式过滤").setDesc("text = 去掉 Markdown 记号只留文字；plain = 再去掉图片与链接。").addDropdown((d) => {
      for (const [v, n] of [["all", "原样保留"], ["text", "去 Markdown 记号"], ["plain", "去图片与链接"]]) d.addOption(v, n);
      d.setValue(this.s.pasteFormatFilter || "all").onChange(async (v) => { this.s.pasteFormatFilter = v; await this.save(); });
    });
    new Setting(p).setName("只留标题行").setDesc("做模板骨架时用：正文全部丢掉，只留下标题。").addToggle((tg) => tg
      .setValue(!!this.s.pasteKeepHeadingOnly)
      .onChange(async (v) => { this.s.pasteKeepHeadingOnly = v; await this.save(); }));
  }

  /* 检测 Obsidian 自带「文件恢复」开没开：核心插件清单里 file-recovery 那一项。
     读不到就当没开（宁可多提示一句，也别让人以为有兜底其实没有）。 */
  async detectFileRecovery() {
    try {
      const base = this.app.vault.configDir || ".obsidian";
      const p = `${base}/core-plugins.json`;
      if (!(await this.app.vault.adapter.exists(p))) return false;
      const raw = await this.app.vault.adapter.read(p);
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j.includes("file-recovery");
      return !!j["file-recovery"];
    } catch (e) { return false; }
  }

  /* ---------- 历史 ---------- */
  history(p) {
    p.createDiv({ cls: "gd-set-note", text: `快照目录（在笔记库里）：.obsidian/plugins/${PLUGIN_ID}/history/<日期>/<时间戳>.md。存的是改动前的原文，随时能对比、恢复。` });
    new Setting(p).setName("自动留快照").setDesc("默认开着。关掉以后只有你手动点「立即备份」才留版本。").addToggle((t) => t.setValue(this.s.autoSnapshot !== false).onChange(async (v) => { this.s.autoSnapshot = v; await this.save(); }));

    /* 6.7：快照能交给 Obsidian 自带的「文件恢复」，不必重复存。
       这里只做检测与提示，不替用户改 Obsidian 的核心设置。 */
    const fr = p.createDiv({ cls: "gd-set-hint" });
    fr.setText("正在检测 Obsidian 自带的「文件恢复」…");
    this.detectFileRecovery().then((on) => {
      if (on) {
        fr.setText("Obsidian 自带的「文件恢复」开着，它自己也会按间隔留快照，两边不冲突但会各存一份。想省空间可以把上面的「自动留快照」关掉，只用它的。");
      } else {
        fr.setText("Obsidian 自带的「文件恢复」是关着的。关着的时候，误删/写错就只能靠这里的快照兜底 —— 建议至少留一个开着。");
        const b = fr.createEl("button", { text: "去打开文件恢复", cls: "gd-mini-btn" });
        b.style.marginLeft = "6px";
        b.onclick = () => {
          try {
            this.app.setting.open();
            this.app.setting.openTabById("file-recovery");
          } catch (e) {
            new Notice("请在「设置 → 文件恢复」里自己打开（这个版本没法自动跳转）");
          }
        };
      }
    });

    new Setting(p).setName("每篇保留版本数").addSlider((s) => s.setLimits(3, 200, 1).setValue(this.s.snapshotsPerDay).setDynamicTooltip().onChange(async (v) => { this.s.snapshotsPerDay = v; await this.save(); }));
    new Setting(p).setName("自动快照最小间隔（秒）").setDesc("连续打字时避免生成太多版本。").addSlider((s) => s.setLimits(5, 300, 5).setValue(this.s.snapshotThrottle).setDynamicTooltip().onChange(async (v) => { this.s.snapshotThrottle = v; await this.save(); }));
    const row = p.createDiv({ cls: "gd-modal-actions" });
    row.createEl("button", { text: "立即备份全部日记", cls: "mod-cta" }).onclick = () => this.plugin.history.backupAll();
    row.createEl("button", { text: "打开今天的历史" }).onclick = () => {
      const f = this.app.vault.getAbstractFileByPath(`${normalizePath(this.s.rootFolder || "日记")}/${todayStr()}.md`);
      if (f instanceof TFile) new SnapshotModal(this.app, this.plugin, f).open();
      else new Notice("今天还没有日记");
    };
    row.createEl("button", { text: "清空全部快照", cls: "gd-danger" }).onclick = () => new ConfirmModal(this.app, "清空全部快照？", "所有历史版本会被永久删除，当前日记不受影响。建议先做一次「立即备份全部日记」之外的人工备份。", async () => {
      const n = await this.plugin.history.clearAll();
      new Notice(`已清空 ${n} 个快照`);
    }).open();
  }
}
