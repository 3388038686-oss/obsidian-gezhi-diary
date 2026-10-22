"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => GridDiaryPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian8 = require("obsidian");

// src/settings.ts
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  rootFolder: "\u65E5\u8BB0",
  background: "",
  cardOpacity: 0.85,
  fontFamily: '"LXGW WenKai", "Kaiti SC", "STKaiti", "\u6977\u4F53", serif',
  fontWeight: 300,
  customCss: "",
  showEmptyHint: true,
  columns: 2,
  cellHeight: 200,
  splitRatio: 0.6,
  listLineStyle: "vertical",
  skipPermanentConfirm: false,
  fontDataUrl: "",
  fontFileName: "",
  fontDirFile: "",
  autoCreateToday: true,
  dailyTemplatePath: "",
  leftWidth: 190,
  showRecentFiles: false,
  showTreeLines: true,
  iconFile: "\u{1F4C4}",
  iconFolder: "\u{1F4C1}",
  iconFolderOpen: "\u{1F4C2}",
  treeDefaultOpen: true,
  hoverGlow: true,
  showLeftPanel: true,
  pluginFontSize: 15,
  contentPad: 18,
  gridGap: 14,
  rightDockWidth: 0,
  activePreset: "\u7D27\u51D1",
  layoutPresets: [
    { name: "\u7D27\u51D1", leftWidth: 190, contentPad: 18, gridGap: 14, columns: 2, cellHeight: 200, rightDockWidth: 0, pluginFontSize: 15 },
    { name: "\u5BBD\u677E", leftWidth: 280, contentPad: 44, gridGap: 26, columns: 2, cellHeight: 240, rightDockWidth: 380, pluginFontSize: 17 }
  ],
  defaultTemplate: "\u683C\u95F4\u516D\u683C",
  templates: [
    {
      name: "\u683C\u95F4\u516D\u683C",
      titles: ["\u4ECA\u65E5\u4E8B\u4EF6", "\u4ECA\u65E5\u4E66\u8D26", "\u4ECA\u65E5\u65B0\u77E5", "\u4ECA\u65E5\u788E\u8BB0", "\u4ECA\u65E5\u7F8E\u98DF", "\u4ECA\u65E5\u53CD\u601D"]
    },
    {
      name: "\u4E5D\u5BAB\u683C\u6668\u95F4",
      titles: [
        "\u4ECA\u5929\u7684\u5929\u6C14",
        "\u6628\u5929\u6700\u96BE\u5FD8\u7684\u4E8B",
        "\u4ECA\u5929\u6700\u91CD\u8981\u7684\u4E00\u4EF6\u4E8B",
        "\u60F3\u611F\u8C22\u7684\u4EBA",
        "\u4ECA\u5929\u7684\u60C5\u7EEA",
        "\u8EAB\u4F53\u72B6\u6001",
        "\u4ECA\u5929\u7684\u671F\u5F85",
        "\u4ECA\u65E5\u53CD\u601D",
        "\u660E\u65E5\u8BA1\u5212"
      ]
    },
    {
      name: "\u590D\u76D8",
      titles: ["\u505A\u6210\u4E86\u4EC0\u4E48", "\u54EA\u91CC\u5361\u4F4F", "\u5B66\u5230\u4E86\u4EC0\u4E48", "\u4E0B\u6B21\u600E\u4E48\u505A"]
    }
  ]
};
var GridDiarySettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.tab = "general";
    this.panelEl = null;
    this.tabBtns = /* @__PURE__ */ new Map();
    this.dirDropdown = null;
    this.plugin = plugin;
  }
  async scanFontDir() {
    try {
      const listed = await this.app.vault.adapter.list(".obsidian/fonts");
      return (listed.files || []).filter((p) => /\.(ttf|otf)$/i.test(p)).map((p) => p.split("/").pop() || "").filter(Boolean);
    } catch (e) {
      return [];
    }
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("gd-settings");
    containerEl.createEl("h2", { text: "\u683C\u95F4\u65E5\u8BB0\u8BBE\u7F6E" });
    const tabs = containerEl.createDiv({ cls: "gd-set-tabs" });
    const defs = [
      ["general", "\u5E38\u89C4\u8BBE\u7F6E"],
      ["style", "\u6837\u5F0F\u8BBE\u7F6E"]
    ];
    this.tabBtns.clear();
    for (const [key, label] of defs) {
      const b = tabs.createEl("button", {
        text: label,
        cls: "gd-set-tab" + (this.tab === key ? " is-on" : "")
      });
      b.addEventListener("click", () => {
        this.tab = key;
        for (const [k, el] of this.tabBtns) el.toggleClass("is-on", k === key);
        this.renderPanel();
      });
      this.tabBtns.set(key, b);
    }
    this.panelEl = containerEl.createDiv({ cls: "gd-set-panel" });
    this.renderPanel();
  }
  renderPanel() {
    const panel = this.panelEl;
    if (!panel) return;
    panel.empty();
    if (this.tab === "general") this.renderGeneral(panel);
    else this.renderStyle(panel);
  }
  // ---------- 常规 ----------
  renderGeneral(panel) {
    var _a;
    new import_obsidian.Setting(panel).setName("\u65E5\u8BB0\u76EE\u5F55").setDesc("\u4E00\u5929\u4E00\u4E2A md \u6587\u4EF6\uFF0C\u6587\u4EF6\u540D\u6309 YYYY-MM-DD\u3002\u9ED8\u8BA4\u8BFB\u4F60\u73B0\u6709\u7684\u300C\u65E5\u8BB0\u300D\u76EE\u5F55\u3002").addText(
      (t) => t.setPlaceholder("\u65E5\u8BB0").setValue(this.plugin.settings.rootFolder).onChange(async (v) => {
        this.plugin.settings.rootFolder = v.trim() || "\u65E5\u8BB0";
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u4E00\u683C = \u4E00\u4E2A\u4E8C\u7EA7\u6807\u9898").setDesc("\u63D2\u4EF6\u6309 md \u91CC\u7684 \u300C## \u6807\u9898\u300D\u5207\u5206\u683C\u5B50\uFF0C\u5185\u5BB9\u548C\u539F\u672C\u7684\u6587\u4EF6\u5B8C\u5168\u5171\u7528\uFF0C\u4E0D\u6539\u683C\u5F0F\u3002").setDisabled(true).addText((t) => t.setValue("## \u6807\u9898").setDisabled(true));
    new import_obsidian.Setting(panel).setName("\u6253\u5F00\u65F6\u81EA\u52A8\u8865\u5F53\u5929\u6587\u4EF6").setDesc("\u6253\u5F00\u89C6\u56FE\u6216\u70B9\u300C\u4ECA\u5929\u300D\u65F6\uFF0C\u5F53\u5929\u6587\u4EF6\u4E0D\u5B58\u5728\u5C31\u9759\u9ED8\u521B\u5EFA\u3002").addToggle(
      (t) => t.setValue(this.plugin.settings.autoCreateToday).onChange(async (v) => {
        this.plugin.settings.autoCreateToday = v;
        await this.plugin.saveSettings();
      })
    );
    const tplFiles = this.app.vault.getMarkdownFiles().map((f) => f.path).sort();
    const tplFileSetting = new import_obsidian.Setting(panel).setName("\u65B0\u5EFA\u65E5\u8BB0\u65F6\u81EA\u52A8\u5E94\u7528\u7684\u6A21\u677F").setDesc(
      "\u7559\u7A7A = \u65B0\u5EFA\u5B8C\u5168\u7A7A\u767D\u7684\u6587\u4EF6\uFF08\u4E0D\u5199\u5C5E\u6027\u3001\u6807\u9898\u3001\u683C\u5B50\uFF09\u3002\u586B\u8DEF\u5F84\u5C31\u7528\u4F60\u7684\u6A21\u677F\uFF0C\u4F8B\u5982 05template\u6A21\u677F/\u6211\u7684\u65E5\u8BB0\u6A21\u677F.md\u3002\u65B0\u5EFA\u65F6\u53EA\u505A\u4E09\u7C7B\u7EAF\u6587\u672C\u66FF\u6362\uFF1A{{date}} / {{date:YYYY-MM-DD}} \u2192 \u5F53\u5929\u65E5\u671F\uFF0C{{time}} / {{time:HH:mm}} \u2192 \u5F53\u524D\u65F6\u95F4\uFF0C{{title}} \u2192 \u6587\u4EF6\u540D\uFF08YYYY-MM-DD\uFF09\u3002\u5176\u4F59\u5185\u5BB9\u539F\u6837\u5199\u5165\uFF0C\u4E0D\u505A\u4EFB\u4F55\u89E3\u6790\u3002"
    ).addText(
      (t) => t.setPlaceholder("05template\u6A21\u677F/\u65E5\u8BB0\u6A21\u677F.md").setValue(this.plugin.settings.dailyTemplatePath).onChange(async (v) => {
        this.plugin.settings.dailyTemplatePath = v.trim();
        await this.plugin.saveSettings();
      })
    );
    tplFileSetting.addDropdown((d) => {
      d.addOption("", "\uFF08\u7A7A\u767D\u6587\u4EF6\uFF09");
      for (const p of tplFiles) d.addOption(p, p);
      const cur = this.plugin.settings.dailyTemplatePath;
      d.setValue(tplFiles.includes(cur) ? cur : "");
      d.onChange(async (v) => {
        this.plugin.settings.dailyTemplatePath = v;
        await this.plugin.saveSettings();
        const input = tplFileSetting.controlEl.querySelector("input");
        if (input) input.value = v;
      });
    });
    new import_obsidian.Setting(panel).setName("\u5217\u6570").setDesc("\u683C\u5B50\u5899\u6BCF\u884C\u663E\u793A\u51E0\u4E2A\u683C\u5B50\u3002").addSlider(
      (s) => s.setLimits(1, 4, 1).setValue(this.plugin.settings.columns).setDynamicTooltip().onChange(async (v) => {
        this.plugin.settings.columns = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u683C\u5B50\u5185\u5BB9\u9AD8\u5EA6").setDesc("\u6BCF\u4E2A\u683C\u5B50\u6B63\u6587\u533A\u56FA\u5B9A\u9AD8\u5EA6\uFF08px\uFF09\uFF0C\u8D85\u51FA\u5C31\u5728\u683C\u5B50\u5185\u6EDA\u52A8\u3002").addSlider(
      (s) => s.setLimits(80, 400, 10).setValue(this.plugin.settings.cellHeight).setDynamicTooltip().onChange(async (v) => {
        this.plugin.settings.cellHeight = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u5E03\u5C40").setHeading();
    new import_obsidian.Setting(panel).setName("\u63D2\u4EF6\u6B63\u6587\u5B57\u53F7").setDesc("\u53EA\u5F71\u54CD\u683C\u95F4\u65E5\u8BB0\u754C\u9762\uFF08\u683C\u5B50\u3001\u65F6\u95F4\u6D41\u3001\u76EE\u5F55\u3001\u65E5\u5386\uFF09\uFF0C\u4E0D\u6539 Obsidian \u5B98\u65B9\u5B57\u53F7\u3002").addSlider(
      (s) => {
        var _a2;
        return s.setLimits(10, 24, 1).setValue((_a2 = this.plugin.settings.pluginFontSize) != null ? _a2 : 15).setDynamicTooltip().onChange(async (v) => {
          this.plugin.settings.pluginFontSize = v;
          await this.plugin.saveSettings();
          this.plugin.applyLayout();
          this.plugin.refreshViews();
        });
      }
    );
    new import_obsidian.Setting(panel).setName("\u5185\u5BB9\u533A\u5DE6\u53F3\u8FB9\u8DDD").setDesc("\u4E5D\u5BAB\u683C\u533A\u57DF\u7684\u7559\u767D\uFF08px\uFF09\uFF0C\u50CF\u9605\u8BFB\u5DE5\u5177\u90A3\u6837\u8C03\u3002").addSlider(
      (s) => {
        var _a2;
        return s.setLimits(0, 60, 2).setValue((_a2 = this.plugin.settings.contentPad) != null ? _a2 : 18).setDynamicTooltip().onChange(async (v) => {
          this.plugin.settings.contentPad = v;
          await this.plugin.saveSettings();
          this.plugin.applyLayout();
        });
      }
    );
    new import_obsidian.Setting(panel).setName("\u683C\u5B50\u95F4\u8DDD").setDesc("\u683C\u5B50\u4E4B\u95F4\u7684\u7A7A\u9699\uFF08px\uFF09\u3002").addSlider(
      (s) => {
        var _a2;
        return s.setLimits(4, 40, 2).setValue((_a2 = this.plugin.settings.gridGap) != null ? _a2 : 14).setDynamicTooltip().onChange(async (v) => {
          this.plugin.settings.gridGap = v;
          await this.plugin.saveSettings();
          this.plugin.applyLayout();
        });
      }
    );
    new import_obsidian.Setting(panel).setName("\u53F3\u4FA7\u680F\u5BBD\u5EA6").setDesc("\u63A5\u7BA1 Obsidian \u53F3\u4FA7 dock \u7684\u5BBD\u5EA6\uFF1B0 = \u4E0D\u63A5\u7BA1\uFF08\u81EA\u5DF1\u62D6\uFF09\u3002\u8BBE\u4E3A\u975E 0 \u540E\u5199\u5165\u5E03\u5C40\u6A21\u677F\u53EF\u4E00\u952E\u6062\u590D\uFF0C\u4F46\u4E3B\u9898\u5347\u7EA7\u53EF\u80FD\u8BA9\u5B83\u5931\u6548\u3002").addSlider(
      (s) => {
        var _a2;
        return s.setLimits(0, 640, 20).setValue((_a2 = this.plugin.settings.rightDockWidth) != null ? _a2 : 0).setDynamicTooltip().onChange(async (v) => {
          this.plugin.settings.rightDockWidth = v;
          await this.plugin.saveSettings();
          this.plugin.applyLayout();
        });
      }
    );
    new import_obsidian.Setting(panel).setName("\u5E03\u5C40\u6A21\u677F").setHeading();
    let presetNameInput = null;
    new import_obsidian.Setting(panel).setName("\u4FDD\u5B58\u5F53\u524D\u5E03\u5C40").setDesc("\u628A\u5DE6\u680F\u5BBD\u3001\u8FB9\u8DDD\u3001\u95F4\u8DDD\u3001\u5217\u6570\u3001\u683C\u5B50\u9AD8\u3001\u5B57\u53F7\u3001\u53F3\u680F\u5BBD\u5B58\u6210\u4E00\u4E2A\u6A21\u677F\u3002").addText((t) => {
      t.setPlaceholder("\u6A21\u677F\u540D\uFF0C\u5982\uFF1A\u9605\u8BFB\u6A21\u5F0F");
      presetNameInput = t.inputEl;
    }).addButton(
      (b) => b.setButtonText("\u4FDD\u5B58").onClick(async () => {
        var _a2, _b, _c, _d;
        const name = ((presetNameInput == null ? void 0 : presetNameInput.value) || "").trim();
        if (!name) {
          new import_obsidian.Notice("\u5148\u7ED9\u6A21\u677F\u8D77\u4E2A\u540D\u5B57");
          return;
        }
        const s = this.plugin.settings;
        const idx = s.layoutPresets.findIndex((p) => p.name === name);
        const preset = {
          name,
          leftWidth: s.leftWidth,
          contentPad: (_a2 = s.contentPad) != null ? _a2 : 18,
          gridGap: (_b = s.gridGap) != null ? _b : 14,
          columns: s.columns,
          cellHeight: s.cellHeight,
          rightDockWidth: (_c = s.rightDockWidth) != null ? _c : 0,
          pluginFontSize: (_d = s.pluginFontSize) != null ? _d : 15
        };
        if (idx >= 0) s.layoutPresets[idx] = preset;
        else s.layoutPresets.push(preset);
        s.activePreset = name;
        await this.plugin.saveSettings();
        new import_obsidian.Notice(`\u5E03\u5C40\u6A21\u677F\u300C${name}\u300D\u5DF2\u4FDD\u5B58`);
        this.display();
      })
    );
    for (const preset of [...(_a = this.plugin.settings.layoutPresets) != null ? _a : []]) {
      new import_obsidian.Setting(panel).setName(preset.name).setDesc(
        `\u5DE6\u680F ${preset.leftWidth}px \xB7 \u8FB9\u8DDD ${preset.contentPad} \xB7 \u95F4\u8DDD ${preset.gridGap} \xB7 ${preset.columns} \u5217 \xB7 \u683C\u9AD8 ${preset.cellHeight}${preset.rightDockWidth ? ` \xB7 \u53F3\u680F ${preset.rightDockWidth}px` : ""} \xB7 \u5B57\u53F7 ${preset.pluginFontSize}`
      ).addButton(
        (b) => b.setButtonText("\u5E94\u7528").onClick(async () => {
          const s = this.plugin.settings;
          s.leftWidth = preset.leftWidth;
          s.contentPad = preset.contentPad;
          s.gridGap = preset.gridGap;
          s.columns = preset.columns;
          s.cellHeight = preset.cellHeight;
          s.rightDockWidth = preset.rightDockWidth;
          s.pluginFontSize = preset.pluginFontSize;
          s.activePreset = preset.name;
          await this.plugin.saveSettings();
          this.plugin.applyLayout();
          this.plugin.refreshViews();
          new import_obsidian.Notice(`\u5DF2\u5E94\u7528\u5E03\u5C40\u6A21\u677F\u300C${preset.name}\u300D`);
        })
      ).addButton(
        (b) => b.setButtonText("\u6539\u540D").onClick(async () => {
          const input = createEl("input");
          input.type = "text";
          input.value = preset.name;
          const modal = new import_obsidian.Modal(this.app);
          modal.titleEl.setText("\u6539\u540D");
          modal.contentEl.appendChild(input);
          input.focus();
          modal.contentEl.createEl("div", { cls: "setting-item-description", text: "\u56DE\u8F66\u786E\u8BA4" });
          input.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") {
              const newName = input.value.trim();
              if (newName) {
                preset.name = newName;
                await this.plugin.saveSettings();
                modal.close();
                this.display();
              }
            }
          });
          modal.open();
        })
      ).addButton(
        (b) => b.setButtonText("\u5220\u9664").setWarning().onClick(async () => {
          var _a2;
          const s = this.plugin.settings;
          s.layoutPresets = ((_a2 = s.layoutPresets) != null ? _a2 : []).filter((p) => p.name !== preset.name);
          if (s.activePreset === preset.name) s.activePreset = void 0;
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
    new import_obsidian.Setting(panel).setName("\u76EE\u5F55\u8FDE\u7EBF\u6837\u5F0F").setDesc("\u53F3\u4FA7\u65E5\u8BB0\u5217\u8868\u7684\u8FDE\u7EBF\u98CE\u683C\u3002\u6298\u7EBF\u661F\u56FE = \u8282\u70B9 + \u6A2A\u5411\u6298\u7EBF\u8FDE\u63A5\u5230\u53F3\u4FA7\u65E5\u671F\uFF0C\u9F20\u6807\u60AC\u505C\u65F6\u8BE5\u884C\u8FDE\u7EBF\u53D8\u4EAE\u3002").addDropdown((d) => {
      var _a2;
      d.addOption("vertical", "\u6807\u51C6\u5782\u76F4\uFF08\u666E\u901A\u6A21\u5F0F\uFF09");
      d.addOption("polyline", "\u6298\u7EBF\u661F\u56FE\uFF08Polyline\uFF09");
      d.setValue((_a2 = this.plugin.settings.listLineStyle) != null ? _a2 : "vertical");
      d.onChange(async (v) => {
        this.plugin.settings.listLineStyle = v === "polyline" ? "polyline" : "vertical";
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      });
    });
    new import_obsidian.Setting(panel).setName("\u663E\u793A\u5DE6\u4FA7\u76EE\u5F55\u9762\u677F").setDesc("\u5DE6\u4FA7\uFF1D\u300C\u6700\u8FD1\u6587\u4EF6 + \u6587\u4EF6\u5939\u6811\u300D\uFF0C\u53F3\u4FA7\uFF1D\u4E5D\u5BAB\u683C\u4E0E\u65F6\u95F4\u6D41\uFF1B\u4E2D\u95F4\u5206\u9694\u6761\u53EF\u62D6\u52A8\u6539\u5BBD\u5EA6\u3002").addToggle(
      (t) => t.setValue(this.plugin.settings.showLeftPanel).onChange(async (v) => {
        this.plugin.settings.showLeftPanel = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u663E\u793A\u300C\u6700\u8FD1\u6587\u4EF6\u300D").setDesc("\u5DE6\u4FA7\u4E0A\u534A\u533A\uFF1A\u6309\u4FEE\u6539\u65F6\u95F4\u6392\u5E8F\u5217\u51FA\u6700\u8FD1 12 \u7BC7 md\u3002").addToggle(
      (t) => t.setValue(this.plugin.settings.showRecentFiles).onChange(async (v) => {
        this.plugin.settings.showRecentFiles = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u6587\u4EF6\u5939\u6811\u663E\u793A\u6298\u7EBF\u8FDE\u63A5\u7EBF").setDesc("\u4E0B\u534A\u533A\u6587\u4EF6\u5939\u5C42\u7EA7\u5DE6\u4FA7\u7684\u7AD6\u7EBF + \u6A2A\u7EBF\uFF0C\u7528\u6765\u6807\u793A\u5C42\u7EA7\u3002").addToggle(
      (t) => t.setValue(this.plugin.settings.showTreeLines).onChange(async (v) => {
        this.plugin.settings.showTreeLines = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u6587\u4EF6\u5939\u9ED8\u8BA4\u5C55\u5F00").setDesc("\u6253\u5F00\u65F6\u6587\u4EF6\u5939\u6811\u662F\u5426\u9ED8\u8BA4\u5168\u90E8\u5C55\u5F00\uFF08\u4F60\u624B\u52A8\u6298\u53E0\u8FC7\u7684\u4F1A\u8BB0\u4F4F\uFF09\u3002").addToggle(
      (t) => t.setValue(this.plugin.settings.treeDefaultOpen).onChange(async (v) => {
        this.plugin.settings.treeDefaultOpen = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u60AC\u505C\u9AD8\u4EAE / \u6D41\u661F\u6ED1\u8FC7").setDesc("\u9F20\u6807\u5212\u8FC7\u5DE6\u4FA7\u6761\u76EE\u65F6\u7684\u9AD8\u4EAE\u4E0E\u659C\u5411\u6D41\u5149\u52A8\u6548\u3002").addToggle(
      (t) => t.setValue(this.plugin.settings.hoverGlow).onChange(async (v) => {
        this.plugin.settings.hoverGlow = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u6587\u4EF6\u56FE\u6807").setDesc("\u53EF\u586B emoji \u6216\u7559\u7A7A\u7528 CSS \u53D8\u91CF --gd-icon-file \u63A7\u5236\u3002").addText(
      (x) => x.setValue(this.plugin.settings.iconFile).onChange(async (v) => {
        this.plugin.settings.iconFile = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u6587\u4EF6\u5939\u56FE\u6807\uFF08\u6536\u8D77 / \u5C55\u5F00\uFF09").setDesc("\u4E24\u4E2A\u8F93\u5165\u6846\uFF1A\u6536\u8D77\u65F6\u3001\u5C55\u5F00\u65F6\u3002\u60F3\u7528\u81EA\u5B9A\u4E49 SVG \u5C31\u7559\u7A7A\uFF0C\u6539 CSS \u53D8\u91CF --gd-icon-folder / --gd-icon-folder-open\u3002").addText(
      (x) => x.setPlaceholder("\u{1F4C1}").setValue(this.plugin.settings.iconFolder).onChange(async (v) => {
        this.plugin.settings.iconFolder = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    ).addText(
      (x) => x.setPlaceholder("\u{1F4C2}").setValue(this.plugin.settings.iconFolderOpen).onChange(async (v) => {
        this.plugin.settings.iconFolderOpen = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u5F53\u524D\u6A21\u677F").setDesc("\u65B0\u5EFA\u5F53\u5929\u6587\u4EF6\u3001\u81EA\u52A8\u8865\u9F50\u65F6\u7528\u54EA\u4E2A\u6A21\u677F\u3002\u968F\u65F6\u53EF\u6362\u3002").addDropdown((d) => {
      for (const tpl of this.plugin.settings.templates) d.addOption(tpl.name, tpl.name);
      d.setValue(this.plugin.settings.defaultTemplate);
      d.onChange(async (v) => {
        this.plugin.settings.defaultTemplate = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      });
    });
    new import_obsidian.Setting(panel).setName("\u6C38\u4E45\u5220\u9664\u65F6\u4E0D\u518D\u786E\u8BA4").setDesc("\u5F00\u542F\u540E\uFF0C\u300C\u6C38\u4E45\u5220\u9664\u300D\u76F4\u63A5\u6267\u884C\u4E0D\u5F39\u7A97\uFF08\u79FB\u5165\u56DE\u6536\u7AD9\u59CB\u7EC8\u79D2\u5220\u3001\u59CB\u7EC8\u53EF\u6062\u590D\uFF09\u3002\u968F\u65F6\u53EF\u5728\u8FD9\u91CC\u5173\u56DE\u6765\u3002").addToggle(
      (t) => t.setValue(this.plugin.settings.skipPermanentConfirm).onChange(async (v) => {
        this.plugin.settings.skipPermanentConfirm = v;
        await this.plugin.saveSettings();
      })
    );
    const tplSetting = new import_obsidian.Setting(panel).setName("\u6A21\u677F\u5E93").setDesc(
      "\u70B9\u300C+ \u65B0\u589E\u6A21\u677F\u300D\u6DFB\u52A0\uFF1B\u4E5F\u53EF\u76F4\u63A5\u5728\u4E0B\u9762\u6309\u300C\u6A21\u677F\u540D | \u683C\u5B501 ; \u683C\u5B502\u300D\u9010\u884C\u7F16\u8F91\u3002\u65B0\u589E\u540E\u7ACB\u523B\u51FA\u73B0\u5728\u300C\u5F53\u524D\u6A21\u677F\u300D\u91CC\u3002"
    ).addButton(
      (b) => b.setButtonText("+ \u65B0\u589E\u6A21\u677F").setCta().onClick(() => {
        new TemplateModal(this.app, async (name, titles) => {
          if (this.plugin.settings.templates.some((t) => t.name === name)) {
            new import_obsidian.Notice("\u5DF2\u6709\u540C\u540D\u6A21\u677F\uFF0C\u6362\u4E2A\u540D\u5B57");
            return false;
          }
          this.plugin.settings.templates.push({ name, titles });
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
          this.display();
          new import_obsidian.Notice(`\u5DF2\u6DFB\u52A0\u6A21\u677F\uFF1A${name}`);
          return true;
        }).open();
      })
    );
    tplSetting.addTextArea((a) => {
      a.inputEl.rows = 7;
      a.inputEl.style.width = "100%";
      a.setValue(
        this.plugin.settings.templates.map((tpl) => `${tpl.name} | ${tpl.titles.join(" ; ")}`).join("\n")
      ).onChange(async (v) => {
        const parsed = [];
        for (const line of v.split("\n")) {
          const raw = line.trim();
          if (!raw) continue;
          const [name, rest] = raw.split("|");
          if (!rest) continue;
          const titles = rest.split(";").map((q) => q.trim()).filter(Boolean);
          if (titles.length) parsed.push({ name: name.trim(), titles });
        }
        if (parsed.length) {
          this.plugin.settings.templates = parsed;
          if (!parsed.find((p) => p.name === this.plugin.settings.defaultTemplate)) {
            this.plugin.settings.defaultTemplate = parsed[0].name;
          }
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
        }
      });
    });
    for (const tpl of [...this.plugin.settings.templates]) {
      new import_obsidian.Setting(panel).setName(tpl.name).setDesc(`${tpl.titles.length} \u683C\uFF1A${tpl.titles.join(" / ")}`).addExtraButton(
        (b) => b.setIcon("trash").setTooltip("\u5220\u9664\u8FD9\u4E2A\u6A21\u677F").onClick(async () => {
          var _a2, _b;
          this.plugin.settings.templates = this.plugin.settings.templates.filter(
            (t) => t.name !== tpl.name
          );
          if (this.plugin.settings.defaultTemplate === tpl.name) {
            this.plugin.settings.defaultTemplate = (_b = (_a2 = this.plugin.settings.templates[0]) == null ? void 0 : _a2.name) != null ? _b : "";
          }
          await this.plugin.saveSettings();
          this.plugin.refreshViews();
          this.display();
          new import_obsidian.Notice(`\u5DF2\u5220\u9664\u6A21\u677F\uFF1A${tpl.name}`);
        })
      );
    }
  }
  // ---------- 样式 ----------
  renderStyle(panel) {
    new import_obsidian.Setting(panel).setName("\u80CC\u666F\u56FE").setDesc("\u7559\u7A7A\u5219\u65E0\u80CC\u666F\u3002\u53EF\u586B vault \u5185\u56FE\u7247\u8DEF\u5F84\uFF08\u5982 \u9644\u4EF6/bg.jpg\uFF09\u6216 http \u94FE\u63A5\u3002").addText(
      (t) => t.setPlaceholder("\u9644\u4EF6/bg.jpg").setValue(this.plugin.settings.background).onChange(async (v) => {
        this.plugin.settings.background = v.trim();
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u683C\u5B50\u900F\u660E\u5EA6").setDesc("0.3 ~ 1\uFF0C\u8D8A\u5C0F\u8D8A\u901A\u900F\u3002").addSlider(
      (s) => s.setLimits(0.3, 1, 0.02).setValue(this.plugin.settings.cardOpacity).setDynamicTooltip().onChange(async (v) => {
        this.plugin.settings.cardOpacity = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u5B57\u4F53").setDesc("CSS font-family\uFF0C\u9ED8\u8BA4\u6977\u4F53\uFF0C\u88C5\u4E86\u971E\u9E5C\u6587\u6977\u4F1A\u66F4\u50CF\u624B\u5199\u3002").addText(
      (t) => t.setValue(this.plugin.settings.fontFamily).onChange(async (v) => {
        this.plugin.settings.fontFamily = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    new import_obsidian.Setting(panel).setName("\u5BFC\u5165\u672C\u5730\u5B57\u4F53").setDesc(
      `\u652F\u6301 .ttf / .otf\uFF0C\u5BFC\u5165\u540E\u7ACB\u523B\u5E94\u7528\u5230\u683C\u5B50\u548C\u65E5\u5386\uFF1B\u5EFA\u8BAE\u5C0F\u4E8E 4MB\u3002${this.plugin.settings.fontFileName ? `\u5F53\u524D\u5DF2\u5BFC\u5165\uFF1A${this.plugin.settings.fontFileName}` : "\u5F53\u524D\u672A\u5BFC\u5165\u5B57\u4F53\u6587\u4EF6\u3002"}`
    ).addButton(
      (b) => b.setButtonText("\u4E0A\u4F20\u5B57\u4F53\u6587\u4EF6").onClick(() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".ttf,.otf,font/ttf,font/otf,application/x-font-ttf";
        input.onchange = () => {
          var _a;
          const f = (_a = input.files) == null ? void 0 : _a[0];
          if (!f) return;
          if (f.size > 4 * 1024 * 1024) {
            new import_obsidian.Notice("\u5B57\u4F53\u6587\u4EF6\u8D85\u8FC7 4MB\uFF0C\u5EFA\u8BAE\u6539\u7528 CSS \u5B57\u4F53\u540D\u65B9\u5F0F\uFF0C\u6216\u6362\u66F4\u5C0F\u7684\u5B50\u96C6\u5B57\u4F53");
            return;
          }
          const reader = new FileReader();
          reader.onload = async () => {
            this.plugin.settings.fontDataUrl = String(reader.result || "");
            this.plugin.settings.fontFileName = f.name;
            await this.plugin.saveSettings();
            this.plugin.applyCustomCss();
            this.plugin.refreshViews();
            this.display();
            new import_obsidian.Notice(`\u5DF2\u5E94\u7528\u5B57\u4F53\uFF1A${f.name}`);
          };
          reader.onerror = () => new import_obsidian.Notice("\u8BFB\u53D6\u5B57\u4F53\u6587\u4EF6\u5931\u8D25");
          reader.readAsDataURL(f);
        };
        input.click();
      })
    ).addExtraButton(
      (b) => b.setIcon("trash").setTooltip("\u79FB\u9664\u5DF2\u5BFC\u5165\u7684\u5B57\u4F53").onClick(async () => {
        this.plugin.settings.fontDataUrl = "";
        this.plugin.settings.fontFileName = "";
        await this.plugin.saveSettings();
        this.plugin.applyCustomCss();
        this.plugin.refreshViews();
        this.display();
      })
    );
    new import_obsidian.Setting(panel).setName("\u4ECE .obsidian/fonts \u8BFB\u53D6\uFF08\u5927\u5B57\u4F53\u5907\u9009\uFF09").setDesc(
      "\u628A .ttf/.otf \u653E\u8FDB vault \u7684 .obsidian/fonts \u76EE\u5F55\uFF0C\u70B9\u300C\u626B\u63CF\u76EE\u5F55\u300D\uFF0C\u518D\u5728\u4E0B\u62C9\u91CC\u9009\u3002\u9002\u5408\u8D85\u8FC7 4MB \u7684\u5B57\u4F53\u3002"
    ).addDropdown((d) => {
      d.addOption("", "\uFF08\u672A\u9009\u62E9\uFF09");
      if (this.plugin.settings.fontDirFile) {
        d.addOption(this.plugin.settings.fontDirFile, this.plugin.settings.fontDirFile);
      }
      d.setValue(this.plugin.settings.fontDirFile || "");
      d.onChange(async (v) => {
        this.plugin.settings.fontDirFile = v;
        if (v) {
          this.plugin.settings.fontDataUrl = "";
          this.plugin.settings.fontFileName = "";
        }
        await this.plugin.saveSettings();
        this.plugin.applyCustomCss();
        this.plugin.refreshViews();
        new import_obsidian.Notice(v ? `\u5DF2\u5E94\u7528\u76EE\u5F55\u5B57\u4F53\uFF1A${v}` : "\u5DF2\u53D6\u6D88\u76EE\u5F55\u5B57\u4F53");
      });
      this.dirDropdown = d;
    }).addButton(
      (b) => b.setButtonText("\u626B\u63CF\u76EE\u5F55").onClick(async () => {
        const files = await this.scanFontDir();
        if (!files.length) {
          new import_obsidian.Notice("\u6CA1\u627E\u5230 .ttf/.otf\u3002\u8BF7\u5148\u5728 vault \u7684 .obsidian/fonts \u91CC\u653E\u5B57\u4F53\u6587\u4EF6");
          return;
        }
        const dd = this.dirDropdown;
        if (dd) {
          const have = new Set(Array.from(dd.selectEl.options).map((o) => o.value));
          for (const f of files) if (!have.has(f)) dd.addOption(f, f);
          dd.setValue(files[0]);
        }
        this.plugin.settings.fontDirFile = files[0];
        this.plugin.settings.fontDataUrl = "";
        this.plugin.settings.fontFileName = "";
        await this.plugin.saveSettings();
        this.plugin.applyCustomCss();
        this.plugin.refreshViews();
        new import_obsidian.Notice(`\u627E\u5230 ${files.length} \u4E2A\u5B57\u4F53\uFF0C\u5DF2\u5E94\u7528\uFF1A${files[0]}`);
      })
    );
    new import_obsidian.Setting(panel).setName("\u5B57\u91CD").setDesc("\u6570\u5B57\u8D8A\u5C0F\u8D8A\u7EC6\u3002300 \u7EC6\u4F53\u3001400 \u5E38\u89C4\u3001500 \u7A0D\u7C97\u3002").addSlider(
      (s) => s.setLimits(200, 600, 100).setValue(this.plugin.settings.fontWeight).setDynamicTooltip().onChange(async (v) => {
        this.plugin.settings.fontWeight = v;
        await this.plugin.saveSettings();
        this.plugin.refreshViews();
      })
    );
    const wrap = new import_obsidian.Setting(panel).setName("\u81EA\u5B9A\u4E49 CSS").setDesc("\u5199\u5728\u8FD9\u91CC\u7684\u6837\u5F0F\u4F1A\u6CE8\u5165\u5230\u6574\u4E2A\u5E93\uFF0C\u4FDD\u5B58\u540E\u7ACB\u5373\u751F\u6548\uFF08\u4E0D\u7528\u91CD\u542F\uFF09\u3002").setClass("gd-set-css");
    wrap.addTextArea((a) => {
      a.inputEl.rows = 14;
      a.inputEl.style.width = "100%";
      a.inputEl.spellcheck = false;
      a.setPlaceholder(".grid-diary-view .gd-cell { border: none; }");
      a.setValue(this.plugin.settings.customCss).onChange(async (v) => {
        this.plugin.settings.customCss = v;
        await this.plugin.saveSettings();
        this.plugin.applyCustomCss();
      });
    });
  }
};
var TemplateModal = class extends import_obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "\u65B0\u589E\u6A21\u677F" });
    let name = "";
    let titles = "";
    new import_obsidian.Setting(contentEl).setName("\u6A21\u677F\u540D\u79F0").addText((t) => {
      t.setPlaceholder("\u4E94\u884C\u65E5\u8BB0");
      t.onChange((v) => name = v);
      window.setTimeout(() => t.inputEl.focus(), 40);
    });
    new import_obsidian.Setting(contentEl).setName("\u683C\u5B50\u540D\u79F0").setDesc("\u7528\u9017\u53F7\u6216\u5206\u53F7\u9694\u5F00\uFF0C\u4F8B\u5982\uFF1A\u4E8B\u4EF6\u3001\u4E66\u8D26\u3001\u65B0\u77E5\u3001\u788E\u8BB0\u3001\u5F85\u529E").addText((t) => {
      t.setPlaceholder("\u4E8B\u4EF6\u3001\u4E66\u8D26\u3001\u65B0\u77E5\u3001\u788E\u8BB0\u3001\u5F85\u529E");
      t.inputEl.style.width = "100%";
      t.onChange((v) => titles = v);
    });
    new import_obsidian.Setting(contentEl).addButton((b) => b.setButtonText("\u53D6\u6D88").onClick(() => this.close())).addButton(
      (b) => b.setButtonText("\u4FDD\u5B58").setCta().onClick(async () => {
        const n = name.trim();
        const list = titles.split(/[,，;；]/).map((s) => s.trim()).filter(Boolean);
        if (!n) {
          new import_obsidian.Notice("\u8BF7\u586B\u6A21\u677F\u540D\u79F0");
          return;
        }
        if (!list.length) {
          new import_obsidian.Notice("\u8BF7\u586B\u81F3\u5C11\u4E00\u4E2A\u683C\u5B50\u540D\u79F0");
          return;
        }
        const ok = await this.onSubmit(n, list);
        if (ok) this.close();
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/store.ts
var import_obsidian3 = require("obsidian");

// src/sections.ts
function splitLines(text) {
  return text.replace(/\r\n/g, "\n").split("\n");
}
function headingOf(line) {
  const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
  if (!m) return null;
  return { level: m[1].length, text: m[2] };
}
function isTimelineTitle(title) {
  return /^\s*\d{1,2}\s*[:：]\s*\d{2}/.test(title);
}
function stripEmptyHeadings(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const keep = new Array(lines.length).fill(true);
  let i = 0;
  while (i < lines.length) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const level = m[1].length;
    let j = i + 1;
    let hasContent = false;
    for (; j < lines.length; j++) {
      const h = /^(#{1,6})\s+/.exec(lines[j]);
      if (h && h[1].length <= level) break;
      if (lines[j].trim() && !/^#{1,6}\s+/.test(lines[j])) {
        hasContent = true;
        break;
      }
    }
    if (!hasContent) keep[i] = false;
    i++;
  }
  return lines.filter((_l, idx) => keep[idx]).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function mirrorSections(md, map) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(lines[i]);
    if (!m) {
      out.push(lines[i++]);
      continue;
    }
    const level = m[1].length;
    const title = m[2];
    let j = i + 1;
    while (j < lines.length) {
      const h = /^(#{1,6})\s+/.exec(lines[j]);
      if (h && h[1].length <= level) break;
      j++;
    }
    out.push(lines[i]);
    const live = map[title];
    if (live !== void 0) {
      const body = live.trim();
      if (body) out.push("", ...body.split("\n"), "");
    } else {
      out.push(...lines.slice(i + 1, j));
    }
    i = j;
  }
  return out.join("\n");
}
function trimBlank(lines, from, to) {
  let a = from;
  let b = to;
  while (a < b && lines[a].trim() === "") a++;
  while (b > a && lines[b - 1].trim() === "") b--;
  return lines.slice(a, b).join("\n");
}
function parseDay(text, level = 2) {
  var _a;
  const lines = splitLines(text);
  const result = { h1: "", quote: "", frontmatter: "", sections: [] };
  let bodyStart = 0;
  if (((_a = lines[0]) == null ? void 0 : _a.trim()) === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        result.frontmatter = lines.slice(1, i).join("\n");
        bodyStart = i + 1;
        break;
      }
    }
  }
  const headings = [];
  for (let i = bodyStart; i < lines.length; i++) {
    const h = headingOf(lines[i]);
    if (h) headings.push({ line: i, level: h.level, text: h.text });
  }
  for (let i = bodyStart; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!result.h1 && t.startsWith("# ") && !t.startsWith("## ")) {
      result.h1 = t.slice(2).trim();
    }
    if (!result.quote && t.startsWith(">")) {
      result.quote = t.replace(/^>\s*/, "").trim();
    }
    if (result.h1 && result.quote) break;
  }
  const marks = headings.filter((h) => h.level === level);
  for (let k = 0; k < marks.length; k++) {
    const cur = marks[k];
    let end = lines.length;
    for (let j = cur.line + 1; j < lines.length; j++) {
      const h = headingOf(lines[j]);
      if (h && h.level <= level) {
        end = j;
        break;
      }
    }
    result.sections.push({
      title: cur.text,
      startLine: cur.line,
      contentStart: cur.line + 1,
      contentEndExclusive: end,
      body: trimBlank(lines, cur.line + 1, end)
    });
  }
  return result;
}
function replaceSectionBody(text, title, newBody, level = 2) {
  const lines = splitLines(text);
  const parsed = parseDay(text, level);
  const target = parsed.sections.find((s) => s.title === title);
  const clean = newBody.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
  if (!target) {
    const hashes = "#".repeat(level);
    let out = text.replace(/\s+$/, "");
    out += `

${hashes} ${title}

${clean}
`;
    return out;
  }
  const before = lines.slice(0, target.contentStart);
  const after = lines.slice(target.contentEndExclusive);
  const middle = clean ? ["", ...clean.split("\n"), ""] : [""];
  return [...before, ...middle, ...after].join("\n");
}
function reorderSection(text, fromTitle, toTitle, placeBefore, level = 2) {
  if (fromTitle === toTitle) return text;
  const parsed = parseDay(text, level);
  const n = parsed.sections.length;
  if (n < 2) return text;
  const from = parsed.sections.findIndex((s) => s.title === fromTitle);
  const to = parsed.sections.findIndex((s) => s.title === toTitle);
  if (from < 0 || to < 0) return text;
  const lines = splitLines(text);
  const items = parsed.sections.map((s, i) => ({
    title: s.title,
    lines: lines.slice(s.startLine, i + 1 < n ? parsed.sections[i + 1].startLine : lines.length)
  }));
  const head = lines.slice(0, parsed.sections[0].startLine);
  const [moved] = items.splice(from, 1);
  let idx = items.findIndex((it) => it.title === toTitle);
  if (idx < 0) return text;
  if (!placeBefore) idx += 1;
  items.splice(idx, 0, moved);
  const out = [...head, ...items.flatMap((it) => it.lines)].join("\n");
  return out === text ? text : out;
}
function paragraphsFromSoftBreaks(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const out = [];
  let inFence = false;
  const isListItem = (s) => /^\s*([-*+]|\d+[.)])\s+\S/.test(s);
  const isStructural = (s) => /^\s*(#{1,6}\s|>|---\s*$|\|)/.test(s);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    out.push(line);
    const next = i + 1 < lines.length ? lines[i + 1] : void 0;
    if (inFence || next === void 0) continue;
    if (line.trim() === "" || next.trim() === "") continue;
    if (/ {2}$/.test(line) || /\\$/.test(line)) continue;
    if (isListItem(line) || isListItem(next)) continue;
    if (isStructural(line) || isStructural(next)) continue;
    out.push("");
  }
  return out.join("\n");
}
function plainText(s) {
  return s.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/^>\s?/gm, "").replace(/[*_`~]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}
function retitleDay(text, newTitles, level = 2) {
  const nl = text.replace(/\r\n/g, "\n");
  const lines = nl.split("\n");
  const h = "#".repeat(level) + " ";
  const hh = "#".repeat(level + 1) + " ";
  let first = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(lines[i]);
    if (m && m[1].length === level) {
      first = i;
      break;
    }
  }
  const preamble = first >= 0 ? lines.slice(0, first) : lines.slice();
  const secs = [];
  let cur = null;
  for (let i = first >= 0 ? first : lines.length; i < lines.length; i++) {
    const line = lines[i];
    const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (m && m[1].length === level) {
      if (cur) secs.push(cur);
      cur = { title: m[2], body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  if (cur) secs.push(cur);
  const trimBody = (arr) => {
    let a = arr.slice();
    while (a.length && !a[0].trim()) a.shift();
    while (a.length && !a[a.length - 1].trim()) a.pop();
    return a;
  };
  const byTitle = /* @__PURE__ */ new Map();
  const timelines = [];
  const orphans = [];
  for (const s of secs) {
    if (isTimelineTitle(s.title)) {
      timelines.push({ title: s.title, body: trimBody(s.body) });
      continue;
    }
    if (!byTitle.has(s.title)) byTitle.set(s.title, trimBody(s.body));
  }
  for (const s of secs) {
    if (!isTimelineTitle(s.title) && !newTitles.includes(s.title)) {
      orphans.push({ title: s.title, body: trimBody(s.body) });
    }
  }
  const out = preamble.slice();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  if (out.length) out.push("");
  let kept = 0;
  for (const t of newTitles) {
    out.push(`${h}${t}`, "");
    const body = byTitle.get(t);
    if (body && body.length) {
      out.push(...body, "");
      kept++;
    }
  }
  if (orphans.length) {
    out.push(`${h}\u672A\u5206\u7C7B\u5185\u5BB9`, "");
    for (const o of orphans) {
      out.push(`${hh}${o.title}`, "");
      if (o.body.length) out.push(...o.body, "");
    }
  }
  for (const t of timelines) {
    out.push(`${h}${t.title}`, "");
    if (t.body.length) out.push(...t.body, "");
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return { text: out.join("\n") + "\n", orphans: orphans.map((o) => o.title), kept };
}

// src/template.ts
var import_obsidian2 = require("obsidian");

// src/attrs.ts
var ALIASES = {
  // 标题
  \u6807\u9898: "title",
  \u9898\u76EE: "title",
  title: "title",
  // 内容
  \u5185\u5BB9: "content",
  content: "content",
  // 日期
  \u65E5\u671F: "date",
  \u65F6\u95F4: "date",
  date: "date",
  // 用途
  \u7528\u9014: "usage",
  usage: "usage",
  // 评价
  \u8BC4\u4EF7: "rating",
  \u8BC4\u5206: "rating",
  rating: "rating",
  // 标签
  \u6807\u7B7E: "tag",
  tag: "tag",
  tags: "tag",
  // 网址
  \u7F51\u5740: "url",
  \u94FE\u63A5: "url",
  url: "url",
  // 合集
  \u5408\u96C6: "collection",
  \u5408\u8F91: "collection",
  collection: "collection"
};
var CANON = {
  title: "title",
  content: "content",
  date: "date",
  usage: "usage",
  rating: "rating",
  tag: "tag",
  url: "url",
  collection: "collection"
};
var ORDER = ["title", "content", "date", "usage", "rating", "tag", "url", "collection"];
function keyOf(raw) {
  var _a;
  const k = raw.trim();
  if (!k) return null;
  const direct = (_a = ALIASES[k]) != null ? _a : ALIASES[k.toLowerCase()];
  return direct != null ? direct : null;
}
function splitFrontmatter(text) {
  var _a;
  const lines = text.split(/\r?\n/);
  if (((_a = lines[0]) == null ? void 0 : _a.trim()) !== "---") return { fm: null, body: text };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return { fm: lines.slice(1, i), body: lines.slice(i + 1).join("\n") };
    }
  }
  return { fm: null, body: text };
}
function scanBodyAttrs(text) {
  const out = /* @__PURE__ */ new Map();
  const { body } = splitFrontmatter(text);
  const lines = body.split(/\r?\n/);
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    let s = line.replace(/^\s*[-*+]\s+/, "").replace(/^\s*>\s*/, "").replace(/^\s*#{1,6}\s*/, "").replace(/\*\*/g, "").trim();
    const m = /^([^\s：:]{1,8})\s*[：:]\s*(.+)$/.exec(s);
    if (!m) continue;
    const key = keyOf(m[1]);
    if (!key) continue;
    let value = m[2].trim();
    value = value.replace(/^["'「『]/, "").replace(/["'」』]$/, "").trim();
    if (!value) continue;
    out.set(key, value);
  }
  return out;
}
function yamlValue(v) {
  const needsQuote = /[:#]/.test(v) || /^[\s"']/.test(v) || /\s$/.test(v) || v === "";
  if (!needsQuote) return v;
  return `"${v.replace(/"/g, '\\"')}"`;
}
function syncAttrsToFrontmatter(text, attrs) {
  if (!attrs.size) return text;
  const { fm, body } = splitFrontmatter(text);
  const fmLines = fm ? [...fm] : [];
  const handled = /* @__PURE__ */ new Set();
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    const m = /^(\s*)([^\s:：][^:：]*?)\s*[：:]\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = keyOf(m[2]);
    if (!key || !attrs.has(key)) continue;
    const value = attrs.get(key);
    fmLines[i] = `${m[1]}${m[2]}: ${yamlValue(value)}`;
    handled.add(key);
  }
  for (const key of ORDER) {
    if (!attrs.has(key) || handled.has(key)) continue;
    fmLines.push(`${CANON[key]}: ${yamlValue(attrs.get(key))}`);
  }
  const head = ["---", ...fmLines, "---"].join("\n");
  const tail = body.replace(/^\n+/, "");
  return tail ? `${head}
${tail}` : `${head}
`;
}
function applyBodyAttrs(text) {
  const attrs = scanBodyAttrs(text);
  if (!attrs.size) return text;
  return syncAttrsToFrontmatter(text, attrs);
}

// src/store.ts
function pad2(n) {
  return String(n).padStart(2, "0");
}
function todayStr(d = /* @__PURE__ */ new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayStr(dt);
}
function weekdayCn(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"][dt.getDay()];
}
var DayStore = class {
  constructor(app, getRoot) {
    this.app = app;
    this.getRoot = getRoot;
    /** 由插件注入：取当前模板的格子标题，用于新建当天文件 */
    this.getDefaultTitles = null;
    /** 由插件注入：统一的新建当天文件流程（模板 → 空白） */
    this.ensureDayFile = null;
  }
  root() {
    return (0, import_obsidian3.normalizePath)(this.getRoot().trim() || "\u65E5\u8BB0");
  }
  pathFor(date) {
    return (0, import_obsidian3.normalizePath)(`${this.root()}/${date}.md`);
  }
  fileFor(date) {
    const f = this.app.vault.getAbstractFileByPath(this.pathFor(date));
    return f && typeof f.path === "string" ? f : null;
  }
  async ensureFolder() {
    const root = this.root();
    if (!this.app.vault.getAbstractFileByPath(root)) {
      try {
        await this.app.vault.createFolder(root);
      } catch (e) {
      }
    }
  }
  /** 正文里写了 `标签：x` 这类行时，回填到 YAML；没写就不动原值 */
  async syncAttrs(file) {
    try {
      const text = await this.app.vault.cachedRead(file);
      const next = applyBodyAttrs(text);
      if (next !== text) {
        await this.app.vault.process(file, () => next);
      }
    } catch (e) {
      console.error("[grid-diary] \u56DE\u586B\u5C5E\u6027\u5931\u8D25", e);
    }
  }
  async createDayFile(date, templates, templateText) {
    await this.ensureFolder();
    const tpl = (templateText != null ? templateText : "").trim();
    let file;
    if (tpl) {
      file = await this.app.vault.create(this.pathFor(date), tpl.replace(/\s*$/, "") + "\n");
    } else {
      file = await this.app.vault.create(this.pathFor(date), "");
    }
    await this.syncAttrs(file);
    return file;
  }
  async readDay(date) {
    const file = this.fileFor(date);
    if (!file) return { date, file: null, h1: "", quote: "", cells: [], timeline: [] };
    const text = await this.app.vault.cachedRead(file);
    return this.buildSnapshot(date, file, text);
  }
  buildSnapshot(date, file, text) {
    const parsed = parseDay(text, 2);
    const cells = [];
    const timeline = [];
    for (const s of parsed.sections) {
      const plain = plainText(s.body);
      const cell = {
        title: s.title,
        preview: plain.slice(0, 220),
        line: s.startLine,
        size: plain.replace(/\s/g, "").length,
        hasContent: plain.length > 0 || /!\[\[/.test(s.body),
        body: s.body
      };
      if (isTimelineTitle(s.title)) {
        const m = /^\s*(\d{1,2}\s*[:：]\s*\d{2})/.exec(s.title);
        cell.time = m ? m[1].replace("\uFF1A", ":") : s.title;
        timeline.push(cell);
      } else {
        cells.push(cell);
      }
    }
    return { date, file, h1: parsed.h1, quote: parsed.quote, cells, timeline };
  }
  /** 追加一条时间流笔记：`## HH:mm 分笔记` + 正文 */
  async appendTimelineNote(date, body, label = "\u5206\u7B14\u8BB0") {
    var _a;
    let file = this.fileFor(date);
    if (!file) {
      if (this.ensureDayFile) await this.ensureDayFile(date);
      file = (_a = this.fileFor(date)) != null ? _a : await this.createDayFile(date, []);
    }
    const now = /* @__PURE__ */ new Date();
    const hh = pad2(now.getHours());
    const mm = pad2(now.getMinutes());
    const title = `${hh}:${mm} ${label}`;
    await this.app.vault.process(file, (data) => {
      const base = data.replace(/\s*$/, "");
      return `${base}

## ${title}

${body.replace(/\s*$/, "")}
`;
    });
    await this.syncAttrs(file);
    return true;
  }
  /** 修改某张图片在当天文件里的显示宽度（写回 ![[name|宽度]] 语法） */
  async setImageWidth(date, name, width) {
    const file = this.fileFor(date);
    if (!file) return false;
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const esc = escRe(name);
    const escBase = escRe(name.replace(/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i, ""));
    const re = new RegExp(`!\\[\\[((?:[^\\]|/]*/)*)(${esc}|${escBase})(?:\\|[^\\]]*)?\\]\\]`, "i");
    let changed = false;
    await this.app.vault.process(file, (data) => {
      if (!re.test(data)) return data;
      changed = true;
      return data.replace(re, (_m, dir, hit) => `![[${dir}${hit}|${Math.round(width)}]]`);
    });
    return changed;
  }
  /** 用模板补齐缺失的小节，返回新增标题 */
  async fillWithTemplate(date, titles) {
    const file = this.fileFor(date);
    if (!file) {
      await this.createDayFile(date, titles);
      return [...titles];
    }
    const text = await this.app.vault.cachedRead(file);
    const existing = new Set(parseDay(text, 2).sections.map((s) => s.title));
    const missing = titles.filter((t) => !existing.has(t));
    if (!missing.length) return [];
    await this.app.vault.process(file, (data) => {
      let out = data;
      for (const t of missing) out = replaceSectionBody(out, t, "");
      return out;
    });
    return missing;
  }
  /** 改某节正文（写回时把单回车升级为段落空行） */
  async writeSection(date, title, body) {
    const file = this.fileFor(date);
    if (!file) {
      new import_obsidian3.Notice("\u8FD9\u4E00\u5929\u7684\u6587\u4EF6\u4E0D\u5B58\u5728");
      return false;
    }
    const body2 = paragraphsFromSoftBreaks(body);
    await this.app.vault.process(file, (data) => replaceSectionBody(data, title, body2));
    await this.syncAttrs(file);
    return true;
  }
  /** 无损更换模板：保留每一节正文，未知标题归入「未分类内容」 */
  async retitleTemplate(date, titles) {
    const file = this.fileFor(date);
    if (!file) {
      new import_obsidian3.Notice("\u8FD9\u4E00\u5929\u7684\u6587\u4EF6\u4E0D\u5B58\u5728");
      return null;
    }
    let result = { kept: 0, orphans: [] };
    await this.app.vault.process(file, (data) => {
      const r = retitleDay(data, titles, 2);
      result = { kept: r.kept, orphans: r.orphans };
      return r.text;
    });
    return result;
  }
  /** 新增一个格子 */
  async addSection(date, title) {
    let file = this.fileFor(date);
    if (!file) {
      await this.ensureFolder();
      file = await this.app.vault.create(this.pathFor(date), "");
    }
    const text = await this.app.vault.cachedRead(file);
    if (parseDay(text, 2).sections.some((s) => s.title === title)) {
      new import_obsidian3.Notice("\u5DF2\u6709\u540C\u540D\u683C\u5B50");
      return false;
    }
    await this.app.vault.process(file, (data) => replaceSectionBody(data, title, ""));
    return true;
  }
  /** 拖拽换位：把某节移到另一节之前/之后 */
  async moveSection(date, fromTitle, toTitle, placeBefore) {
    const file = this.fileFor(date);
    if (!file) return false;
    if (fromTitle === toTitle) return false;
    let changed = false;
    await this.app.vault.process(file, (data) => {
      const out = reorderSection(data, fromTitle, toTitle, placeBefore, 2);
      if (out !== data) changed = true;
      return out;
    });
    return changed;
  }
  /** 删除某节，返回被删内容（供撤销） */
  async deleteSection(date, title) {
    const file = this.fileFor(date);
    if (!file) return null;
    const box = { v: null };
    await this.app.vault.process(file, (data) => {
      var _a;
      const parsed = parseDay(data, 2);
      const idx = parsed.sections.findIndex((s2) => s2.title === title);
      if (idx < 0) return data;
      const lines = data.replace(/\r\n/g, "\n").split("\n");
      const s = parsed.sections[idx];
      box.v = { title, body: (_a = s.body) != null ? _a : "", index: idx };
      let end = s.contentEndExclusive;
      while (end < lines.length && lines[end].trim() === "") end++;
      lines.splice(s.startLine, end - s.startLine);
      return lines.join("\n").replace(/\n{3,}/g, "\n\n");
    });
    return box.v;
  }
  /** 撤销删除：把内容插回原来的位置 */
  async restoreSection(date, title, body, index) {
    const file = this.fileFor(date);
    if (!file) return false;
    await this.app.vault.process(file, (data) => {
      const parsed = parseDay(data, 2);
      if (parsed.sections.some((s) => s.title === title)) return data;
      const lines = data.replace(/\r\n/g, "\n").split("\n");
      const anchor = parsed.sections[Math.min(index, parsed.sections.length)];
      const block = [`## ${title}`, "", ...body.replace(/\r\n/g, "\n").split("\n")];
      if (anchor) {
        lines.splice(anchor.startLine, 0, ...block, "");
      } else {
        while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
        lines.push("", ...block, "");
      }
      return lines.join("\n").replace(/\n{4,}/g, "\n\n\n");
    });
    return true;
  }
};

// src/view.ts
var import_obsidian6 = require("obsidian");

// src/modals.ts
var import_obsidian4 = require("obsidian");
var PromptModal = class extends import_obsidian4.Modal {
  constructor(app, opts) {
    var _a, _b, _c;
    super(app);
    this.title = opts.title;
    this.desc = (_a = opts.desc) != null ? _a : "";
    this.placeholder = (_b = opts.placeholder) != null ? _b : "";
    this.value = (_c = opts.initial) != null ? _c : "";
    this.onSubmit = opts.onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.title });
    if (this.desc) contentEl.createEl("p", { text: this.desc, cls: "grid-diary-modal-desc" });
    new import_obsidian4.Setting(contentEl).addText((t) => {
      t.setValue(this.value);
      t.setPlaceholder(this.placeholder);
      t.inputEl.style.width = "100%";
      t.onChange((v) => this.value = v);
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submit();
        }
      });
      window.setTimeout(() => t.inputEl.focus(), 10);
    });
    new import_obsidian4.Setting(contentEl).addButton(
      (b) => b.setButtonText("\u786E\u5B9A").setCta().onClick(() => this.submit())
    );
  }
  submit() {
    const v = this.value.trim();
    this.close();
    if (v) this.onSubmit(v);
  }
  onClose() {
    this.contentEl.empty();
  }
};
var QuickNoteModal = class extends import_obsidian4.Modal {
  constructor(app, date, onSubmit) {
    super(app);
    this.ta = null;
    this.date = date;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("grid-diary-edit-modal");
    modalEl.style.width = "min(620px, 92vw)";
    contentEl.empty();
    contentEl.createEl("h3", { text: `\u5FEB\u901F\u7B14\u8BB0 \xB7 ${this.date}`, cls: "grid-diary-edit-title" });
    const ta = contentEl.createEl("textarea", { cls: "grid-diary-edit-area gd-quick-area" });
    ta.placeholder = "\u968F\u624B\u5199\u70B9\u4EC0\u4E48\u2026\uFF08\u4F1A\u81EA\u52A8\u8FFD\u52A0\u4E3A\u4E00\u6761\u5E26\u65F6\u95F4\u7684\u7B14\u8BB0\uFF0C\u4E0D\u5F71\u54CD\u4E5D\u5BAB\u683C\uFF09";
    ta.style.height = "150px";
    this.ta = ta;
    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void this.save();
      }
    });
    window.setTimeout(() => ta.focus(), 10);
    const bar = contentEl.createDiv({ cls: "grid-diary-edit-bar" });
    bar.createEl("span", { text: "Ctrl+Enter \u4FDD\u5B58", cls: "grid-diary-edit-hint" });
    const cancel = bar.createEl("button", { text: "\u53D6\u6D88", cls: "mod-cta-alt" });
    cancel.addEventListener("click", () => this.close());
    const ok = bar.createEl("button", { text: "\u6DFB\u52A0", cls: "mod-cta" });
    ok.addEventListener("click", () => void this.save());
  }
  async save() {
    var _a, _b;
    const text = ((_b = (_a = this.ta) == null ? void 0 : _a.value) != null ? _b : "").trim();
    if (!text) {
      this.close();
      return;
    }
    await this.onSubmit(text);
    this.close();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var TemplatePickModal = class extends import_obsidian4.Modal {
  constructor(app, options, onPick, onSetDefault) {
    super(app);
    this.options = options;
    this.onPick = onPick;
    this.onSetDefault = onSetDefault;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "\u9009\u62E9\u4E00\u4E2A\u6A21\u677F" });
    for (const tpl of this.options) {
      const row = contentEl.createDiv({ cls: "grid-diary-tpl-row" });
      const main = row.createDiv({ cls: "grid-diary-tpl-main" });
      main.createEl("div", { text: tpl.name, cls: "grid-diary-tpl-name" });
      main.createEl("div", { text: tpl.titles.join(" \xB7 "), cls: "grid-diary-tpl-desc" });
      main.addEventListener("click", () => {
        this.close();
        void this.onPick(tpl);
      });
      if (this.onSetDefault) {
        const btn = row.createEl("button", { text: "\u8BBE\u4E3A\u5F53\u524D", cls: "grid-diary-tpl-set" });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          void this.onSetDefault(tpl);
          this.close();
        });
      }
    }
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ConfirmModal = class extends import_obsidian4.Modal {
  constructor(app, opts) {
    super(app);
    this.opts = opts;
  }
  onOpen() {
    this.titleEl.setText(this.opts.title);
    if (this.opts.desc) this.contentEl.createEl("p", { text: this.opts.desc });
    let box = null;
    if (this.opts.checkboxLabel) {
      const row = this.contentEl.createDiv({ cls: "gd-check-row" });
      box = row.createEl("input");
      box.type = "checkbox";
      box.id = "gd-confirm-check";
      const lb = row.createEl("label", { text: this.opts.checkboxLabel });
      lb.setAttribute("for", "gd-confirm-check");
    }
    const btns = this.contentEl.createDiv({ cls: "gd-modal-row" });
    const cancel = btns.createEl("button", { text: "\u53D6\u6D88", cls: "gd-btn" });
    cancel.addEventListener("click", () => this.close());
    const ok = btns.createEl("button", {
      text: this.opts.okText || "\u786E\u5B9A",
      cls: this.opts.danger ? "gd-btn gd-btn-danger" : "gd-btn gd-btn-primary"
    });
    ok.addEventListener("click", () => {
      const checked = box ? box.checked : false;
      void Promise.resolve(this.opts.onOk(checked)).finally(() => this.close());
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/datecolor.ts
function appendColoredDate(parent, dateStr, opts = {}) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wrap = parent.createEl("span", {
    cls: "gd-cdate" + (opts.cls ? " " + opts.cls : "")
  });
  if (opts.year !== false) {
    wrap.createEl("span", { text: String(y), cls: "gd-cy" });
    wrap.createEl("span", { text: "\u5E74", cls: "gd-csep" });
  }
  wrap.createEl("span", { text: String(m).padStart(2, "0"), cls: "gd-cm" });
  wrap.createEl("span", { text: "\u6708", cls: "gd-csep" });
  wrap.createEl("span", { text: String(d).padStart(2, "0"), cls: "gd-cd" });
  wrap.createEl("span", { text: "\u65E5", cls: "gd-csep" });
  if (opts.weekday) {
    wrap.createEl("span", { text: " " + weekdayCn(dateStr), cls: "gd-cweek" });
  }
  return wrap;
}
function appendColoredMonth(parent, y, m) {
  const wrap = parent.createEl("span", { cls: "gd-cdate" });
  wrap.createEl("span", { text: String(y), cls: "gd-cy" });
  wrap.createEl("span", { text: "\u5E74", cls: "gd-csep" });
  wrap.createEl("span", { text: String(m).padStart(2, "0"), cls: "gd-cm" });
  wrap.createEl("span", { text: "\u6708", cls: "gd-csep" });
  return wrap;
}

// src/leftpanel.ts
var import_obsidian5 = require("obsidian");
var SKIP = /* @__PURE__ */ new Set([".obsidian", ".trash", ".git", ".github", "node_modules"]);
var openState = /* @__PURE__ */ new Map();
var DATE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
function decorate(row, depth, hoverGlow) {
  row.style.setProperty("--indent", `${depth * 10}px`);
  if (hoverGlow) row.createDiv({ cls: "gd-meteor" });
}
function polyline(row) {
  row.createDiv({ cls: "gd-row-line" });
}
function countFiles(item) {
  if (item instanceof import_obsidian5.TFile) return 1;
  if (item instanceof import_obsidian5.TFolder) {
    let n = 0;
    for (const c of item.children) n += countFiles(c);
    return n;
  }
  return 0;
}
function renderLeftPanel(el, plugin) {
  const s = plugin.settings;
  el.empty();
  el.style.width = `${Math.max(150, Math.min(480, s.leftWidth || 240))}px`;
  el.style.setProperty("--gd-icon-file", `"${s.iconFile || ""}"`);
  el.style.setProperty("--gd-icon-folder", `"${s.iconFolder || ""}"`);
  el.style.setProperty("--gd-icon-folder-open", `"${s.iconFolderOpen || ""}"`);
  el.toggleClass("gd-with-lines", s.showTreeLines);
  el.toggleClass("gd-hover-glow", s.hoverGlow);
  if (s.showRecentFiles) renderRecents(el, plugin);
  renderTree(el, plugin);
}
function openSmart(plugin, file) {
  const m = DATE_RE.exec(file.name);
  if (m && plugin.store.fileFor(m[1])) {
    void plugin.activateView(m[1]);
    return;
  }
  void plugin.app.workspace.getLeaf("tab").openFile(file);
}
function fileMenu(menu, plugin, file) {
  menu.addItem(
    (item) => item.setTitle("\u5728\u65B0\u6807\u7B7E\u9875\u4E2D\u6253\u5F00").setIcon("file-input").onClick(() => void plugin.app.workspace.getLeaf("tab").openFile(file))
  );
  menu.addSeparator();
  menu.addItem(
    (item) => item.setTitle("\u91CD\u547D\u540D").setIcon("pencil").onClick(() => {
      var _a;
      const next = window.prompt("\u91CD\u547D\u540D", file.basename);
      if (next === null || !next.trim() || next.trim() === file.basename) return;
      void plugin.app.fileManager.renameFile(file, `${((_a = file.parent) == null ? void 0 : _a.path) ? file.parent.path + "/" : ""}${next.trim()}.${file.extension}`);
    })
  );
  menu.addItem(
    (item) => item.setTitle("\u5220\u9664").setIcon("trash").onClick(async () => {
      if (!window.confirm(`\u628A\u300C${file.path}\u300D\u79FB\u5165\u56DE\u6536\u7AD9\uFF1F`)) return;
      try {
        await plugin.app.vault.trash(file, true);
      } catch (e) {
        try {
          await plugin.app.vault.trash(file, false);
        } catch (e2) {
          new import_obsidian5.Notice(`\u5220\u9664\u5931\u8D25\uFF1A${String(e2)}`);
        }
      }
    })
  );
  menu.addItem(
    (item) => item.setTitle("\u590D\u5236\u8DEF\u5F84").setIcon("link").onClick(() => {
      void navigator.clipboard.writeText(file.path);
      new import_obsidian5.Notice("\u5DF2\u590D\u5236\u8DEF\u5F84");
    })
  );
}
function folderMenu(menu, plugin, folder) {
  menu.addItem(
    (item) => item.setTitle("\u65B0\u5EFA\u7B14\u8BB0").setIcon("file-plus").onClick(() => {
      const name = window.prompt("\u65B0\u7B14\u8BB0\u540D\u79F0", "\u672A\u547D\u540D");
      if (!(name == null ? void 0 : name.trim())) return;
      const path = `${folder.path ? folder.path + "/" : ""}${name.trim()}.md`;
      void plugin.app.vault.create(path, "").catch(() => new import_obsidian5.Notice("\u521B\u5EFA\u5931\u8D25\uFF1A\u6587\u4EF6\u5DF2\u5B58\u5728"));
    })
  );
  menu.addSeparator();
  menu.addItem(
    (item) => item.setTitle("\u91CD\u547D\u540D").setIcon("pencil").onClick(() => {
      var _a;
      const next = window.prompt("\u91CD\u547D\u540D\u6587\u4EF6\u5939", folder.name);
      if (next === null || !next.trim() || next.trim() === folder.name) return;
      void plugin.app.fileManager.renameFile(folder, `${((_a = folder.parent) == null ? void 0 : _a.path) ? folder.parent.path + "/" : ""}${next.trim()}`);
    })
  );
  menu.addItem(
    (item) => item.setTitle("\u5220\u9664").setIcon("trash").onClick(async () => {
      if (!window.confirm(`\u628A\u300C${folder.path}\u300D\u53CA\u5176\u5185\u5BB9\u79FB\u5165\u56DE\u6536\u7AD9\uFF1F`)) return;
      try {
        await plugin.app.vault.trash(folder, true);
      } catch (e) {
        new import_obsidian5.Notice(`\u5220\u9664\u5931\u8D25\uFF1A${String(e)}`);
      }
    })
  );
  menu.addItem(
    (item) => item.setTitle("\u590D\u5236\u8DEF\u5F84").setIcon("link").onClick(() => {
      void navigator.clipboard.writeText(folder.path);
      new import_obsidian5.Notice("\u5DF2\u590D\u5236\u8DEF\u5F84");
    })
  );
}
function renderRecents(el, plugin) {
  const s = plugin.settings;
  const box = el.createDiv({ cls: "gd-left-section gd-left-recent" });
  const head = box.createDiv({ cls: "gd-left-head" });
  head.createSpan({ cls: "gd-left-title", text: "\u6700\u8FD1\u6587\u4EF6" });
  const files = plugin.app.vault.getMarkdownFiles().slice().sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 12);
  if (!files.length) {
    box.createDiv({ cls: "gd-left-empty", text: "\u8FD8\u6CA1\u6709\u7B14\u8BB0" });
    return;
  }
  const list = box.createDiv({ cls: "gd-left-list" });
  for (const f of files) {
    const row = list.createDiv({ cls: "gd-left-row" });
    decorate(row, 0, s.hoverGlow);
    const isDiary = DATE_RE.test(f.name);
    if (isDiary && f.basename === plugin.activeDate) row.addClass("active");
    polyline(row);
    row.createSpan({ cls: "gd-row-icon gd-icon-file" });
    const name = row.createSpan({ cls: "gd-row-name", text: f.basename });
    name.setAttribute("title", f.path);
    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSmart(plugin, f);
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const menu = new import_obsidian5.Menu();
      fileMenu(menu, plugin, f);
      menu.showAtMouseEvent(e);
    });
  }
}
function renderTree(el, plugin) {
  const box = el.createDiv({ cls: "gd-left-section gd-left-tree" });
  const head = box.createDiv({ cls: "gd-left-head" });
  head.createSpan({ cls: "gd-left-title", text: "\u6587\u4EF6\u5939" });
  const root = plugin.app.vault.getRoot();
  const rootRow = box.createDiv({ cls: "gd-tree-row gd-tree-folder gd-vault-row" });
  decorate(rootRow, 0, plugin.settings.hoverGlow);
  const rootOpen = openState.has("__vault__") ? openState.get("__vault__") : true;
  if (rootOpen) rootRow.addClass("is-open");
  rootRow.createSpan({ cls: "gd-row-icon gd-icon-folder" });
  rootRow.createSpan({ cls: "gd-row-name", text: plugin.app.vault.getName() });
  rootRow.createSpan({ cls: "gd-tree-caret", text: rootOpen ? "\u25BE" : "\u25B8" });
  rootRow.createSpan({ cls: "gd-tree-count", text: String(countFiles(root)) });
  const kids = box.createDiv({ cls: "gd-tree-kids" });
  if (!rootOpen) kids.addClass("is-collapsed");
  renderFolderChildren(kids, plugin, root, 1);
  rootRow.addEventListener("click", () => {
    const next = !(openState.has("__vault__") ? openState.get("__vault__") : true);
    openState.set("__vault__", next);
    rootRow.toggleClass("is-open", next);
    kids.toggleClass("is-collapsed", !next);
    const caret = rootRow.querySelector(".gd-tree-caret");
    if (caret) caret.setText(next ? "\u25BE" : "\u25B8");
  });
  if (!kids.childElementCount) {
    kids.createDiv({ cls: "gd-left-empty", text: "\u6CA1\u6709\u53EF\u663E\u793A\u7684\u6587\u4EF6" });
  }
}
function renderFolderChildren(box, plugin, folder, depth) {
  const s = plugin.settings;
  const items = [...folder.children].sort((a, b) => {
    const af = a instanceof import_obsidian5.TFolder ? 0 : 1;
    const bf = b instanceof import_obsidian5.TFolder ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.name.localeCompare(b.name, "zh");
  });
  for (const child of items) {
    if (child instanceof import_obsidian5.TFolder) {
      if (SKIP.has(child.name)) continue;
      const key = child.path;
      const open = openState.has(key) ? openState.get(key) : s.treeDefaultOpen;
      const row2 = box.createDiv({ cls: "gd-tree-row gd-tree-folder" });
      decorate(row2, depth, s.hoverGlow);
      row2.dataset.depth = String(depth);
      if (open) row2.addClass("is-open");
      row2.createSpan({ cls: "gd-row-icon gd-icon-folder" });
      row2.createSpan({ cls: "gd-row-name", text: child.name });
      row2.createSpan({ cls: "gd-tree-caret", text: open ? "\u25BE" : "\u25B8" });
      row2.createSpan({ cls: "gd-tree-count", text: String(countFiles(child)) });
      const kids = box.createDiv({ cls: "gd-tree-kids" });
      if (!open) kids.addClass("is-collapsed");
      renderFolderChildren(kids, plugin, child, depth + 1);
      row2.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !(openState.has(key) ? openState.get(key) : s.treeDefaultOpen);
        openState.set(key, next);
        row2.toggleClass("is-open", next);
        kids.toggleClass("is-collapsed", !next);
        const caret = row2.querySelector(".gd-tree-caret");
        if (caret) caret.setText(next ? "\u25BE" : "\u25B8");
      });
      row2.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const menu = new import_obsidian5.Menu();
        folderMenu(menu, plugin, child);
        menu.showAtMouseEvent(e);
      });
      continue;
    }
    if (!(child instanceof import_obsidian5.TFile)) continue;
    if (child.extension !== "md") continue;
    const row = box.createDiv({ cls: "gd-tree-row gd-tree-file" });
    decorate(row, depth, s.hoverGlow);
    row.dataset.depth = String(depth);
    const m = DATE_RE.exec(child.name);
    if (m && m[1] === plugin.activeDate) row.addClass("active");
    polyline(row);
    row.createSpan({ cls: "gd-row-icon gd-icon-file" });
    row.createSpan({ cls: "gd-row-name", text: m ? m[1] : child.basename });
    row.setAttribute("title", child.path);
    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSmart(plugin, child);
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const menu = new import_obsidian5.Menu();
      fileMenu(menu, plugin, child);
      menu.showAtMouseEvent(e);
    });
  }
}

// src/view.ts
var VIEW_TYPE_GRID_DIARY = "grid-diary-view";
var GridDiaryView = class extends import_obsidian6.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.renderTimer = null;
    this.snapshot = null;
    this.rawCache = /* @__PURE__ */ new Map();
    /** 自动保存期间抑制自身触发的重渲染，避免光标丢失 */
    this.suppressRenderUntil = 0;
    /** 自己写文件的窗口期：期间忽略 vault modify，避免自激重建 */
    this.selfWriteUntil = 0;
    /** 已在监听的图片框（避免重复绑定 / 反复 disconnect） */
    this.imgBound = /* @__PURE__ */ new WeakSet();
    /** 正在拖拽的格子标题 */
    this.draggingTitle = null;
    /** 页面滚动位置（切日期后保持不跳） */
    this.lastScrollTop = 0;
    /** 手动保存节点的增量基线：key = 日期|格子标题 → 上次记录时的正文 */
    this.lastRecorded = /* @__PURE__ */ new Map();
    /** 正在写入导航历史，防止自激 */
    this.pushingHistory = false;
    /** 每个格子的撤销/重做历史（按标题存，最多 100 步） */
    this.cellHist = /* @__PURE__ */ new Map();
    /** 最近一次操作的格子标题，撤销/重做按钮作用的对象 */
    this.lastCellTitle = null;
    /** 每个格子当前的编辑内容，用于撤销前补记最后一步 */
    this.cellValues = /* @__PURE__ */ new Map();
    /** 把撤销结果写回界面的回调（按标题注册） */
    this.cellAppliers = /* @__PURE__ */ new Map();
    this.histTimer = null;
    /** 时间流容器（只重绘它，避免整页重建） */
    this.timelineSlot = null;
    this.tlTimer = null;
    this.imgRos = [];
    /** 当天文件最后修改时间（HH:mm），给没有时间戳的卡片兜底显示 */
    this.fileMtime = "";
    /** 未保存的格子内容提交函数（title → commit），用于定时兜底与关闭前刷写 */
    this.pendingSaves = /* @__PURE__ */ new Map();
    /** 时间流数据：格子镜像 + 时间戳笔记，签名未变就不重绘（避免打字时闪烁） */
    this.tlSig = "";
    this.plugin = plugin;
    this.currentDate = this.plugin.activeDate || todayStr();
  }
  getViewType() {
    return VIEW_TYPE_GRID_DIARY;
  }
  getDisplayText() {
    return "\u683C\u95F4\u65E5\u8BB0";
  }
  getIcon() {
    return "layout-grid";
  }
  /** 把当前日期写进页面状态，供 Obsidian 前进/后退记录 */
  getState() {
    return { date: this.currentDate };
  }
  /** 前进/后退时由 Obsidian 调回来，里面只负责切到对应日期并重新渲染 */
  async setState(state, result) {
    const s = state || {};
    const d = typeof s.date === "string" ? s.date : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d !== this.currentDate) {
      this.currentDate = d;
      this.plugin.setActiveDate(d, this);
      try {
        await this.render();
      } catch (e) {
        console.error("[grid-diary] \u6E32\u67D3\u5931\u8D25", e);
      }
      result.history = true;
    } else {
      result.history = false;
    }
    await super.setState(state, result);
  }
  /**
   * 把日期变化推入 Obsidian 原生导航历史，
   * 这样左上角的 ← → 就能像浏览器一样回到之前看过的日期。
   */
  pushHistory(date) {
    if (this.pushingHistory) return;
    this.pushingHistory = true;
    this.leaf.setViewState({ type: VIEW_TYPE_GRID_DIARY, state: { date } }).catch((e) => console.error("[grid-diary] \u8BB0\u5F55\u5386\u53F2\u5931\u8D25", e)).finally(() => {
      window.setTimeout(() => this.pushingHistory = false, 80);
    });
  }
  async onOpen() {
    this.contentEl.addClass("grid-diary-view");
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
    this.registerInterval(
      window.setInterval(() => {
        if (!this.pendingSaves.size) return;
        for (const fn of Array.from(this.pendingSaves.values())) void fn();
      }, 1500)
    );
    await this.ensureDayFile(this.currentDate, true);
    await this.render();
  }
  async onClose() {
    if (this.renderTimer) window.clearTimeout(this.renderTimer);
    for (const fn of Array.from(this.pendingSaves.values())) void fn();
    this.pendingSaves.clear();
    this.contentEl.empty();
  }
  /** 正在格子里打字时不重建 DOM */
  isTyping() {
    const active = document.activeElement;
    return !!active && this.contentEl.contains(active);
  }
  scheduleRender() {
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
  backgroundUrl() {
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
  async refreshRawCache() {
    this.rawCache.clear();
    const file = this.plugin.store.fileFor(this.currentDate);
    if (!file) return;
    const text = await this.app.vault.cachedRead(file);
    for (const s of parseDay(text, 2).sections) {
      this.rawCache.set(s.title, s.body);
      const k = `${this.currentDate}|${s.title}`;
      if (!this.lastRecorded.has(k)) this.lastRecorded.set(k, s.body);
    }
  }
  async render() {
    const root = this.contentEl;
    const prevSc = root.querySelector(".gd-scroll");
    const savedTop = prevSc ? prevSc.scrollTop : this.lastScrollTop;
    this.timelineSlot = null;
    this.cellAppliers.clear();
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
    {
      const f = this.plugin.store.fileFor(this.currentDate);
      if (f) {
        const dt = new Date(f.stat.mtime);
        const p2 = (n) => String(n).padStart(2, "0");
        this.fileMtime = `${p2(dt.getHours())}:${p2(dt.getMinutes())}`;
      } else {
        this.fileMtime = "";
      }
    }
    await this.refreshRawCache();
    const shell = root.createDiv({ cls: "gd-shell" });
    if (this.plugin.settings.showLeftPanel !== false) {
      const left = shell.createDiv({ cls: "gd-left-panel" });
      try {
        renderLeftPanel(left, this.plugin);
      } catch (e) {
        console.error("[grid-diary] \u5DE6\u4FA7\u76EE\u5F55\u6E32\u67D3\u5931\u8D25", e);
        left.createDiv({ cls: "gd-left-empty", text: "\u76EE\u5F55\u6E32\u67D3\u5931\u8D25\uFF0C\u8BE6\u89C1\u63A7\u5236\u53F0" });
      }
      const rz = shell.createDiv({ cls: "gd-resizer" });
      rz.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        const startX = ev.clientX;
        const startW = left.getBoundingClientRect().width;
        const onMove = (e) => {
          const w = Math.max(150, Math.min(480, startW + (e.clientX - startX)));
          left.style.width = `${w}px`;
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          const w = Math.round(left.getBoundingClientRect().width);
          this.plugin.settings.leftWidth = w;
          void this.plugin.saveSettings();
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }
    const scroll = shell.createDiv({ cls: "gd-scroll" });
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
      const now = /* @__PURE__ */ new Date();
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
      text: weekdayCn(this.currentDate) + (this.currentDate === todayStr() ? " \xB7 \u4ECA\u5929" : ""),
      cls: "gd-datemeta-line"
    });
    if (snap.quote) meta.createEl("span", { text: snap.quote, cls: "gd-datemeta-line gd-quote" });
    const actions = header.createDiv({ cls: "gd-actions" });
    const mkBtn = (label, cb) => {
      const b = actions.createEl("button", { text: label, cls: "gd-btn" });
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        cb();
      });
      return b;
    };
    mkBtn("+", () => this.addCell());
    const undoBtn = actions.createEl("button", { text: "\u21B6", cls: "gd-btn gd-hist-btn" });
    undoBtn.setAttribute("aria-label", "\u64A4\u9500\uFF08\u6700\u8FD1\u6539\u52A8\u7684\u683C\u5B50\uFF09");
    undoBtn.title = "\u64A4\u9500";
    undoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.stepHist(-1);
    });
    const redoBtn = actions.createEl("button", { text: "\u21B7", cls: "gd-btn gd-hist-btn" });
    redoBtn.setAttribute("aria-label", "\u91CD\u505A\uFF08\u6700\u8FD1\u6539\u52A8\u7684\u683C\u5B50\uFF09");
    redoBtn.title = "\u91CD\u505A";
    redoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.stepHist(1);
    });
    const more = actions.createEl("button", { text: "\xB7\xB7\xB7", cls: "gd-btn" });
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openHeaderMenu(e);
    });
    mkBtn("\xD7", () => this.leaf.detach());
    const nav = scroll.createDiv({ cls: "gd-nav" });
    const prev = nav.createEl("button", { text: "\u2039 \u524D\u4E00\u5929", cls: "gd-nav-btn" });
    prev.addEventListener("click", () => this.goDate(shiftDate(this.currentDate, -1)));
    const today = nav.createEl("button", { text: "\u4ECA\u5929", cls: "gd-nav-btn" });
    today.addEventListener("click", () => this.goDate(todayStr()));
    const next = nav.createEl("button", { text: "\u540E\u4E00\u5929 \u203A", cls: "gd-nav-btn" });
    next.addEventListener("click", () => this.goDate(shiftDate(this.currentDate, 1)));
    if (snap.file) {
      const open = nav.createEl("button", { text: "\u6253\u5F00\u6574\u7BC7", cls: "gd-nav-btn gd-nav-right" });
      open.addEventListener("click", () => void this.openWholeFile());
    }
    const saved = nav.createEl("span", { text: "\u81EA\u52A8\u4FDD\u5B58", cls: "gd-save-hint" });
    const grid = scroll.createDiv({ cls: "gd-grid" });
    if (!snap.file) {
      this.renderEmpty(grid, "\u8FD9\u4E00\u5929\u8FD8\u6CA1\u6709\u6587\u4EF6\u3002", "\u7528\u6A21\u677F\u751F\u6210");
      restoreScroll();
      return;
    }
    if (!snap.cells.length) {
      this.renderEmpty(grid, "\u6587\u4EF6\u91CC\u8FD8\u6CA1\u6709 ## \u5C0F\u8282\u3002", "\u7528\u6A21\u677F\u751F\u6210");
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
  /** 手动保存节点：把「这次新增/修改的段落」写成时间流独立一条（只记增量，不重复全文） */
  async recordDelta(title, value) {
    const key = `${this.currentDate}|${title}`;
    const now = (value != null ? value : "").replace(/\s*$/, "");
    const prev = this.lastRecorded.get(key);
    if (prev === void 0 || prev === now) return;
    const splitParas = (s) => s.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const norm = (s) => s.replace(/\s+/g, "");
    const prevSet = new Set(splitParas(prev).map(norm));
    const addedParas = splitParas(now).filter((p) => !prevSet.has(norm(p)));
    this.lastRecorded.set(key, now);
    if (!addedParas.length) return;
    this.suppressRenderUntil = Date.now() + 2e3;
    this.selfWriteUntil = Date.now() + 1500;
    try {
      await this.plugin.store.appendTimelineNote(this.currentDate, addedParas.join("\n\n"), title);
      window.setTimeout(() => this.refreshTimeline(), 200);
    } catch (err) {
      console.error("[grid-diary] \u589E\u91CF\u8BB0\u5F55\u5931\u8D25", err);
    }
  }
  /** 把正在输入的内容同步进快照（供时间流镜像使用） */
  syncCellToSnapshot(title, value) {
    var _a;
    const cell = (_a = this.snapshot) == null ? void 0 : _a.cells.find((c) => c.title === title);
    if (cell) cell.body = value;
    this.scheduleTimelineRefresh();
  }
  scheduleTimelineRefresh() {
    if (this.tlTimer) window.clearTimeout(this.tlTimer);
    this.tlTimer = window.setTimeout(() => this.refreshTimeline(), 120);
  }
  buildCards(snap) {
    var _a, _b;
    const cellMap = {};
    for (const c of snap.cells) cellMap[c.title] = (_a = c.body) != null ? _a : "";
    const cards = [];
    for (const it of snap.timeline) {
      const body = stripEmptyHeadings(mirrorSections(it.body || "", cellMap));
      if (!body.trim()) continue;
      cards.push({ title: it.title, body, raw: it.body || "", time: (_b = it.time) != null ? _b : "", kind: "note" });
    }
    return cards;
  }
  /** 只重绘时间流区域，不动格子墙，避免光标丢失 */
  refreshTimeline() {
    if (!this.timelineSlot || !this.snapshot) return;
    if (!this.timelineSlot.isConnected) return;
    const active = document.activeElement;
    if (active && this.timelineSlot.contains(active)) return;
    const sig = this.buildCards(this.snapshot).map((c) => `${c.title}${c.body}`).join("");
    if (sig === this.tlSig) return;
    const sc = this.contentEl.querySelector(".gd-scroll");
    const top = sc ? sc.scrollTop : 0;
    this.timelineSlot.empty();
    this.renderTimeline(this.timelineSlot, this.snapshot);
    if (sc) sc.scrollTop = top;
  }
  /** 时间流：格子内容镜像 + 带时间戳的追加笔记，两者都可就地改、可删 */
  renderTimeline(parent, snap) {
    parent.empty();
    const cards = this.buildCards(snap);
    this.tlSig = cards.map((c) => `${c.title}${c.body}`).join("");
    if (!cards.length) {
      const empty = parent.createDiv({ cls: "gd-tl-empty", text: "\u4ECA\u5929\u8FD8\u6CA1\u6709\u5185\u5BB9\uFF0C\u5728\u4E0A\u65B9\u683C\u5B50\u91CC\u5199\u70B9\u4EC0\u4E48\u8BD5\u8BD5" });
      return;
    }
    const wrap = parent.createDiv({ cls: "gd-timeline" });
    const head = wrap.createDiv({ cls: "gd-tl-head" });
    head.createEl("span", { text: "\u65F6\u95F4\u6D41", cls: "gd-tl-title" });
    head.createEl("span", { text: `${cards.length} \u6761`, cls: "gd-tl-count" });
    const src = this.plugin.store.pathFor(this.currentDate);
    for (const card of cards) {
      const row = wrap.createDiv({ cls: "gd-tl-item" });
      if (card.kind === "cell") row.addClass("is-cell");
      const bar = row.createDiv({ cls: "gd-tl-bar gd-tl-toggle" });
      bar.setAttribute("aria-label", "\u70B9\u51FB\u6298\u53E0/\u5C55\u5F00");
      const label = card.kind === "cell" ? card.title : card.title.replace(/^\s*\d{1,2}\s*[:：]\s*\d{2}\s*/, "");
      bar.createEl("span", {
        text: card.time || this.fileMtime || "--:--",
        cls: "gd-tl-time"
      });
      bar.createEl("span", { text: label, cls: "gd-tl-label" });
      bar.createEl("span", { text: "\u25BE", cls: "gd-tl-caret" });
      bar.addEventListener("click", (e) => {
        e.stopPropagation();
        row.toggleClass("is-collapsed", !row.hasClass("is-collapsed"));
      });
      const bubble = row.createDiv({ cls: "gd-tl-bubble" });
      const body = bubble.createDiv({ cls: "gd-tl-body markdown-rendered gd-cell-text" });
      body.setAttribute("title", "\u53CC\u51FB\u4FEE\u6539");
      void import_obsidian6.MarkdownRenderer.render(this.app, card.body, body, src, this).then(() => this.bindImages(body)).catch(() => body.setText(card.body));
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
          var _a, _b;
          if (saved) return;
          saved = true;
          const next = ta.value;
          this.selfWriteUntil = Date.now() + 1200;
          const ok = await this.plugin.store.writeSection(this.currentDate, card.title, next);
          if (ok) {
            if (card.kind === "cell") this.rawCache.set(card.title, paragraphsFromSoftBreaks(next));
            const c = (_a = this.snapshot) == null ? void 0 : _a.cells.find((x) => x.title === card.title);
            if (c) c.body = paragraphsFromSoftBreaks(next);
            const t = (_b = this.snapshot) == null ? void 0 : _b.timeline.find((x) => x.title === card.title);
            if (t) t.body = next;
            new import_obsidian6.Notice(`\u5DF2\u4FDD\u5B58\u300C${card.title}\u300D`);
          } else {
            new import_obsidian6.Notice("\u4FDD\u5B58\u5931\u8D25");
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
      const del = row.createEl("button", { text: "\xD7", cls: "gd-tl-del" });
      del.setAttribute("aria-label", "\u5220\u9664\u8FD9\u4E00\u6761");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = new import_obsidian6.Menu();
        menu.addItem(
          (i) => i.setTitle("\u5220\u9664\u8FD9\u4E00\u8282\uFF085 \u79D2\u53EF\u64A4\u9500\uFF09").setIcon("undo-2").onClick(() => void this.removeSection(card, false))
        );
        menu.addItem(
          (i) => i.setTitle("\u5220\u9664\u8FD9\u4E00\u8282\uFF08\u9700\u786E\u8BA4\uFF09").setIcon("trash").onClick(() => void this.removeSection(card, true))
        );
        menu.showAtMouseEvent(e);
      });
      const open = row.createEl("button", { text: "\u2197", cls: "gd-cell-more gd-tl-open" });
      open.setAttribute("aria-label", "\u5728\u6587\u4EF6\u91CC\u5B9A\u4F4D");
      open.addEventListener("click", async (e) => {
        var _a, _b, _c;
        e.stopPropagation();
        const c = (_c = (_a = this.snapshot) == null ? void 0 : _a.cells.find((x) => x.title === card.title)) != null ? _c : (_b = this.snapshot) == null ? void 0 : _b.timeline.find((x) => x.title === card.title);
        if (c) await this.openAtSection(c);
      });
    }
  }
  /** 重新从磁盘读一遍原文缓存（时间流里改完后同步格子墙数据） */
  async refreshRawFromDisk() {
    try {
      await this.refreshRawCache();
    } catch (e) {
      console.error("[grid-diary] \u91CD\u8BFB\u5931\u8D25", e);
    }
  }
  /** 给渲染出来的图片套一层可缩放的框（手动拖拽，不依赖 CSS resize），拖完写回 md */
  bindImages(root) {
    var _a;
    this.imgRos = this.imgRos.filter((x) => x.box.isConnected);
    for (const img of Array.from(root.querySelectorAll("img"))) {
      if ((_a = img.parentElement) == null ? void 0 : _a.classList.contains("gd-imgbox")) continue;
      const doc = root.ownerDocument;
      const box = doc.createElement("div");
      box.className = "gd-imgbox";
      img.replaceWith(box);
      box.appendChild(img);
      const attrW = Number.parseInt(img.getAttribute("width") || "", 10);
      if (Number.isFinite(attrW) && attrW > 0) {
        box.style.width = `${attrW}px`;
      } else {
        box.style.width = "400px";
      }
      img.style.width = "100%";
      const handle = doc.createElement("span");
      handle.className = "gd-img-handle";
      handle.setAttribute("aria-label", "\u62D6\u52A8\u8C03\u6574\u56FE\u7247\u5927\u5C0F");
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
        var _a2, _b;
        if (!dragging) return;
        ev.preventDefault();
        const parentW = ((_b = (_a2 = box.parentElement) == null ? void 0 : _a2.clientWidth) != null ? _b : 800) || 800;
        const next = Math.max(60, Math.min(parentW, Math.round(startW + (ev.clientX - startX))));
        if (Math.abs(next - startW) > 2) moved = true;
        box.style.width = `${next}px`;
      });
      handle.addEventListener("pointerup", (ev) => {
        if (!dragging) return;
        dragging = false;
        try {
          handle.releasePointerCapture(ev.pointerId);
        } catch (e) {
        }
        if (!moved) return;
        const w = Math.round(box.getBoundingClientRect().width);
        if (w >= 60) void this.persistImageWidth(img, w);
      });
      handle.addEventListener("pointercancel", () => {
        dragging = false;
      });
      const ro = new ResizeObserver(() => {
      });
      ro.observe(box);
      this.imgRos.push({ ro, box });
    }
  }
  /** 把图片宽度写回 Markdown：![[图片名|宽度]] */
  async persistImageWidth(img, width) {
    let name = "";
    const src = img.getAttribute("src") || "";
    if (src) {
      try {
        const clean = decodeURIComponent(src.split("?")[0].split("#")[0]);
        name = clean.split(/[\\/]/).pop() || "";
      } catch (e) {
        name = "";
      }
    }
    if (!name) name = img.getAttribute("alt") || "";
    if (!name || !/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name)) return;
    try {
      this.selfWriteUntil = Date.now() + 1500;
      await this.plugin.store.setImageWidth(this.currentDate, name, width);
    } catch (e) {
      console.error("[grid-diary] \u4FDD\u5B58\u56FE\u7247\u5BBD\u5EA6\u5931\u8D25", e);
    }
  }
  renderEmpty(grid, text, btnText) {
    const empty = grid.createDiv({ cls: "gd-empty" });
    empty.createEl("p", { text });
    const btn = empty.createEl("button", { text: btnText, cls: "gd-btn gd-btn-primary" });
    btn.addEventListener("click", () => this.pickTemplate());
  }
  renderCell(cell) {
    var _a;
    const el = document.createElement("div");
    el.className = "gd-cell";
    const head = el.createDiv({ cls: "gd-cell-head" });
    head.createEl("div", { text: cell.title, cls: "gd-cell-title" });
    const tools = head.createDiv({ cls: "gd-cell-tools" });
    const handle = tools.createEl("span", { text: "\u283F", cls: "gd-cell-handle" });
    handle.setAttribute("aria-label", "\u6309\u4F4F\u62D6\u52A8\uFF0C\u6362\u683C\u5B50\u987A\u5E8F");
    handle.setAttribute("draggable", "true");
    const status = tools.createEl("span", { text: "", cls: "gd-cell-status" });
    const jump = tools.createEl("button", { text: "\u2197", cls: "gd-cell-more" });
    jump.setAttribute("aria-label", "\u5728\u6587\u4EF6\u91CC\u5B9A\u4F4D");
    jump.addEventListener("click", (e) => {
      e.stopPropagation();
      void this.openAtSection(cell);
    });
    const moreBtn = tools.createEl("button", { text: "\xB7\xB7\xB7", cls: "gd-cell-more" });
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openCellMenu(e, cell);
    });
    const fmt = el.createDiv({ cls: "gd-cell-fmt" });
    const body = el.createDiv({ cls: "gd-cell-body" });
    const preview = body.createDiv({ cls: "gd-cell-preview markdown-rendered gd-cell-text" });
    const ta = body.createEl("textarea", { cls: "gd-cell-editor gd-cell-text is-hidden" });
    ta.value = (_a = this.rawCache.get(cell.title)) != null ? _a : "";
    ta.spellcheck = false;
    ta.setAttribute("placeholder", "\u5728\u8FD9\u91CC\u5199\u2026");
    const renderPreview = async () => {
      var _a2;
      const text = (_a2 = this.rawCache.get(cell.title)) != null ? _a2 : "";
      preview.empty();
      if (!text.trim()) {
        preview.createDiv({ cls: "gd-cell-placeholder", text: "\u70B9\u51FB\u8FD9\u91CC\u5F00\u59CB\u5199\u2026" });
        return;
      }
      try {
        await import_obsidian6.MarkdownRenderer.render(
          this.app,
          text,
          preview,
          this.plugin.store.pathFor(this.currentDate),
          this
        );
      } catch (e) {
        preview.setText(text);
      }
    };
    void renderPreview();
    let editing = false;
    const enterEdit = () => {
      var _a2;
      if (editing) return;
      editing = true;
      preview.addClass("is-hidden");
      ta.removeClass("is-hidden");
      ta.value = (_a2 = this.rawCache.get(cell.title)) != null ? _a2 : "";
      this.autoGrow(ta);
      ta.focus();
      const end = ta.value.length;
      ta.setSelectionRange(end, end);
      this.lastCellTitle = cell.title;
      this.cellValues.set(cell.title, ta.value);
      if (!this.cellHist.has(cell.title)) {
        this.cellHist.set(cell.title, { stack: [ta.value], idx: 0 });
      }
    };
    this.cellAppliers.set(cell.title, (value) => {
      if (ta.classList.contains("is-hidden")) {
        editing = false;
        enterEdit();
      }
      ta.value = value;
      this.autoGrow(ta);
      this.cellValues.set(cell.title, value);
      this.syncCellToSnapshot(cell.title, value);
      this.pendingSaves.set(cell.title, commit);
      void commit();
    });
    preview.addEventListener("click", (e) => {
      e.stopPropagation();
      enterEdit();
    });
    let lastSel = { start: 0, end: 0 };
    const readSel = () => {
      var _a2, _b;
      const v = ta.value;
      let start = (_a2 = ta.selectionStart) != null ? _a2 : v.length;
      let end = (_b = ta.selectionEnd) != null ? _b : v.length;
      const focused = document.activeElement === ta;
      if (!focused && start === end && lastSel.start !== lastSel.end) {
        start = Math.min(lastSel.start, v.length);
        end = Math.min(lastSel.end, v.length);
      }
      if (start > end) [start, end] = [end, start];
      return { start, end };
    };
    const saveSel = () => {
      var _a2, _b;
      lastSel = { start: (_a2 = ta.selectionStart) != null ? _a2 : 0, end: (_b = ta.selectionEnd) != null ? _b : 0 };
    };
    ta.addEventListener("select", saveSel);
    ta.addEventListener("keyup", saveSel);
    ta.addEventListener("mouseup", saveSel);
    ta.addEventListener("blur", saveSel);
    const applyFormat = (before, after) => {
      const { start, end } = readSel();
      const v = ta.value;
      const sel = v.slice(start, end) || "\u6587\u5B57";
      ta.value = v.slice(0, start) + before + sel + after + v.slice(end);
      const caret = start + before.length + sel.length;
      lastSel = { start: caret, end: caret };
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(caret, caret);
      ta.dispatchEvent(new Event("input"));
    };
    const addFmt = (label, tip, before, after) => {
      const b = fmt.createEl("button", { text: label, cls: "gd-fmt-btn" });
      b.type = "button";
      b.setAttribute("aria-label", tip);
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (ta.classList.contains("is-hidden")) {
          editing = false;
          enterEdit();
          lastSel = { start: ta.value.length, end: ta.value.length };
        }
        applyFormat(before, after);
      });
    };
    addFmt("B", "\u7C97\u4F53 **\u6587\u5B57**", "**", "**");
    addFmt("I", "\u659C\u4F53 *\u6587\u5B57*", "*", "*");
    addFmt("S", "\u5220\u9664\u7EBF ~~\u6587\u5B57~~", "~~", "~~");
    addFmt("H", "\u9AD8\u4EAE ==\u6587\u5B57==", "==", "==");
    const insertAt = (text) => {
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
    const COLORS = [
      ["#e05555", "\u80ED\u8102"],
      ["#d97706", "\u7425\u73C0"],
      ["#c2a20a", "\u82A5\u672B"],
      ["#4d9e6a", "\u8584\u8377"],
      ["#3d9b8f", "\u9752\u74F7"],
      ["#4a86c5", "\u96FE\u84DD"],
      ["#6a6fc4", "\u975B\u9752"],
      ["#9a6bbd", "\u6D45\u7D2B"],
      ["#c76ba0", "\u6A31\u82B1"],
      ["#a8766b", "\u9676\u571F"],
      ["#8a8f98", "\u77F3\u7070"],
      ["#5a5f66", "\u58A8\u7070"]
    ];
    const paletteBtn = fmt.createEl("button", { text: "\u{1F3A8}", cls: "gd-fmt-btn gd-fmt-color" });
    paletteBtn.type = "button";
    paletteBtn.setAttribute("aria-label", "\u6587\u5B57\u989C\u8272");
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
      custom.createSpan({ text: "\u81EA\u5B9A\u4E49" });
      const picker = custom.createEl("input");
      picker.type = "color";
      picker.value = "#e05555";
      picker.addEventListener("input", () => {
        if (ta.classList.contains("is-hidden")) {
          editing = false;
          enterEdit();
          lastSel = { start: ta.value.length, end: ta.value.length };
        }
        const v = ta.value;
        const hex = picker.value;
        const last = picker.dataset.lastColor || "";
        let { start, end } = readSel();
        if (last && end - start > 0) {
        }
        const sel = v.slice(start, end) || "\u6587\u5B57";
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
      const close = (ev) => {
        if (!pop.contains(ev.target)) {
          pop.remove();
          document.removeEventListener("mousedown", close, true);
        }
      };
      window.setTimeout(() => document.addEventListener("mousedown", close, true), 0);
    });
    const pickAndInsert = (accept, asImage) => {
      const input = document.createElement("input");
      input.type = "file";
      if (accept) input.accept = accept;
      input.addEventListener("change", () => {
        var _a2;
        const f = (_a2 = input.files) == null ? void 0 : _a2[0];
        if (!f) return;
        void (async () => {
          try {
            const ext = (f.name.split(".").pop() || "bin").toLowerCase();
            const name = await this.plugin.saveAttachment(this.currentDate, f, ext);
            insertAt(asImage ? `![[${name}|400]]` : `![[${name}]]`);
            new import_obsidian6.Notice(`\u5DF2\u63D2\u5165 ${f.name}`);
          } catch (err) {
            console.error("[grid-diary] \u63D2\u5165\u9644\u4EF6\u5931\u8D25", err);
            new import_obsidian6.Notice("\u63D2\u5165\u5931\u8D25");
          }
        })();
      });
      input.click();
    };
    const addMedia = (label, tip, cb) => {
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
        if (ta.classList.contains("is-hidden")) {
          editing = false;
          enterEdit();
          lastSel = { start: ta.value.length, end: ta.value.length };
        }
        cb();
      });
    };
    addMedia("\u{1F5BC}", "\u63D2\u5165\u56FE\u7247", () => pickAndInsert("image/*", true));
    addMedia("\u{1F4CE}", "\u63D2\u5165\u9644\u4EF6\uFF08PDF / \u97F3\u9891 / \u4EFB\u610F\u6587\u4EF6\uFF09", () => pickAndInsert("", false));
    let recorder = null;
    let chunks = [];
    const mic = fmt.createEl("button", { text: "\u{1F399}", cls: "gd-fmt-btn gd-fmt-media" });
    mic.type = "button";
    mic.setAttribute("aria-label", "\u5F55\u97F3");
    mic.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    mic.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void (async () => {
        if (recorder && recorder.state === "recording") {
          recorder.stop();
          mic.removeClass("is-recording");
          mic.setText("\u{1F399}");
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
                new import_obsidian6.Notice("\u5F55\u97F3\u5DF2\u63D2\u5165");
              } catch (err) {
                console.error("[grid-diary] \u4FDD\u5B58\u5F55\u97F3\u5931\u8D25", err);
                new import_obsidian6.Notice("\u5F55\u97F3\u4FDD\u5B58\u5931\u8D25");
              }
            })();
          });
          rec.start();
          mic.addClass("is-recording");
          mic.setText("\u25A0");
          new import_obsidian6.Notice("\u5F00\u59CB\u5F55\u97F3\uFF0C\u518D\u70B9\u4E00\u6B21\u505C\u6B62");
        } catch (err) {
          console.error("[grid-diary] \u65E0\u6CD5\u5F55\u97F3", err);
          new import_obsidian6.Notice("\u65E0\u6CD5\u8BBF\u95EE\u9EA6\u514B\u98CE");
        }
      })();
    });
    let timer = null;
    const commit = async () => {
      var _a2;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
      const value = ta.value;
      if (value === ((_a2 = this.rawCache.get(cell.title)) != null ? _a2 : "")) {
        this.pendingSaves.delete(cell.title);
        return;
      }
      status.setText("\u4FDD\u5B58\u4E2D");
      this.suppressRenderUntil = Date.now() + 2e3;
      this.selfWriteUntil = Date.now() + 1500;
      const ok = await this.plugin.store.writeSection(this.currentDate, cell.title, value);
      this.pendingSaves.delete(cell.title);
      if (ok) {
        this.rawCache.set(cell.title, paragraphsFromSoftBreaks(value));
        status.setText("\u5DF2\u4FDD\u5B58");
        window.setTimeout(() => {
          if (status.isConnected && status.getText() === "\u5DF2\u4FDD\u5B58") status.setText("");
        }, 1600);
      } else {
        status.setText("\u4FDD\u5B58\u5931\u8D25");
      }
    };
    const exitEdit = async () => {
      var _a2;
      await commit();
      editing = false;
      ta.addClass("is-hidden");
      preview.removeClass("is-hidden");
      await renderPreview();
      await this.recordDelta(cell.title, (_a2 = this.rawCache.get(cell.title)) != null ? _a2 : ta.value);
    };
    ta.addEventListener("input", () => {
      this.autoGrow(ta);
      status.setText("\u7F16\u8F91\u4E2D");
      this.pendingSaves.set(cell.title, commit);
      this.lastCellTitle = cell.title;
      this.cellValues.set(cell.title, ta.value);
      if (this.histTimer) window.clearTimeout(this.histTimer);
      this.histTimer = window.setTimeout(() => this.recordHist(cell.title, ta.value), 400);
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
      if (!el.contains(e.relatedTarget)) {
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
          new import_obsidian6.Notice(`\u5DF2\u79FB\u52A8\u5230\u300C${cell.title}\u300D${before ? "\u4E4B\u524D" : "\u4E4B\u540E"}`);
          await this.render();
        } else {
          new import_obsidian6.Notice("\u6362\u4F4D\u5931\u8D25");
        }
      })();
    });
    return el;
  }
  autoGrow(ta) {
    ta.style.height = "100%";
    ta.style.overflowY = "auto";
  }
  async openAtSection(cell) {
    const file = this.plugin.store.fileFor(this.currentDate);
    if (!file) return;
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { eState: { line: cell.line } });
  }
  async openWholeFile() {
    const file = this.plugin.store.fileFor(this.currentDate);
    if (!file) return;
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file, { active: true });
  }
  goDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (date === this.currentDate) return;
    this.currentDate = date;
    this.plugin.setActiveDate(date, this);
    this.pushHistory(date);
    void (async () => {
      try {
        await this.ensureDayFile(date, true);
      } catch (e) {
        console.error("[grid-diary] \u5EFA\u6587\u4EF6\u5931\u8D25", e);
      }
      try {
        await this.render();
      } catch (e) {
        console.error("[grid-diary] \u6E32\u67D3\u5931\u8D25", e);
        new import_obsidian6.Notice("\u8FD9\u4E00\u5929\u6E32\u67D3\u5931\u8D25\uFF0C\u8BF7\u770B\u63A7\u5236\u53F0");
      }
    })();
  }
  /** 当天文件缺失时按模板静默创建（onlyToday=true 时只对今天生效） */
  async ensureDayFile(date, onlyToday = false) {
    if (!this.plugin.settings.autoCreateToday) return;
    if (onlyToday && date !== todayStr()) return;
    if (this.plugin.store.fileFor(date)) return;
    try {
      await this.plugin.createDayFileFor(date);
    } catch (e) {
      console.error("[grid-diary] \u81EA\u52A8\u521B\u5EFA\u5931\u8D25", e);
    }
  }
  /** 侧栏日历点了日期：主视图跟着跳 */
  jumpTo(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (date === this.currentDate) return;
    this.currentDate = date;
    this.pushHistory(date);
    void this.render().catch((e) => console.error("[grid-diary] \u6E32\u67D3\u5931\u8D25", e));
  }
  /** 记录一步历史（同一内容不重复记） */
  recordHist(title, value) {
    var _a;
    let h = this.cellHist.get(title);
    if (!h) {
      h = { stack: [(_a = this.rawCache.get(title)) != null ? _a : ""], idx: 0 };
      this.cellHist.set(title, h);
    }
    h.stack = h.stack.slice(0, h.idx + 1);
    if (h.stack[h.stack.length - 1] === value) return;
    h.stack.push(value);
    if (h.stack.length > 100) h.stack.shift();
    h.idx = h.stack.length - 1;
  }
  /** 撤销 / 重做：dir = -1 撤销，1 重做 */
  stepHist(dir) {
    const title = this.lastCellTitle;
    if (!title) {
      new import_obsidian6.Notice("\u5148\u70B9\u8FDB\u4E00\u4E2A\u683C\u5B50\uFF0C\u518D\u70B9\u64A4\u9500/\u91CD\u505A");
      return;
    }
    const live = this.cellValues.get(title);
    if (typeof live === "string") this.recordHist(title, live);
    const h = this.cellHist.get(title);
    if (!h || h.stack.length < 2) {
      new import_obsidian6.Notice("\u8FD9\u4E2A\u683C\u5B50\u8FD8\u6CA1\u6709\u53EF\u64A4\u9500\u7684\u6539\u52A8");
      return;
    }
    const next = h.idx + dir;
    if (next < 0) {
      new import_obsidian6.Notice("\u5DF2\u7ECF\u5230\u6700\u65E9\u4E00\u6B65");
      return;
    }
    if (next >= h.stack.length) {
      new import_obsidian6.Notice("\u5DF2\u7ECF\u662F\u6700\u65B0\u4E00\u6B65");
      return;
    }
    h.idx = next;
    const value = h.stack[next];
    this.cellValues.set(title, value);
    const apply = this.cellAppliers.get(title);
    if (apply) {
      apply(value);
    } else {
      this.rawCache.set(title, value);
      this.selfWriteUntil = Date.now() + 1500;
      void this.plugin.store.writeSection(this.currentDate, title, value).then(() => this.scheduleRender());
    }
    new import_obsidian6.Notice(dir < 0 ? `\u5DF2\u64A4\u9500\uFF1A${title}` : `\u5DF2\u91CD\u505A\uFF1A${title}`);
  }
  addCell() {
    new PromptModal(this.app, {
      title: "\u65B0\u683C\u5B50",
      desc: "\u5199\u5728\u6587\u4EF6\u91CC\u7684\u4E8C\u7EA7\u6807\u9898\uFF08## \u540E\u9762\u7684\u5B57\uFF09\uFF1A",
      placeholder: "\u4F8B\u5982\uFF1A\u4ECA\u65E5\u996E\u98DF",
      onSubmit: async (title) => {
        const ok = await this.plugin.store.addSection(this.currentDate, title);
        if (ok) new import_obsidian6.Notice(`\u5DF2\u6DFB\u52A0\uFF1A${title}`);
        await this.render();
      }
    }).open();
  }
  pickTemplate() {
    new TemplatePickModal(
      this.app,
      this.plugin.settings.templates,
      async (tpl) => {
        const added = await this.plugin.store.fillWithTemplate(this.currentDate, tpl.titles);
        new import_obsidian6.Notice(added.length ? `\u5DF2\u8865\u9F50 ${added.length} \u4E2A\u683C\u5B50` : "\u8FD9\u4E2A\u6A21\u677F\u7684\u683C\u5B50\u5DF2\u7ECF\u6709\u4E86");
        await this.render();
      },
      async (tpl) => {
        this.plugin.settings.defaultTemplate = tpl.name;
        await this.plugin.saveSettings();
        new import_obsidian6.Notice(`\u5DF2\u628A\u300C${tpl.name}\u300D\u8BBE\u4E3A\u5F53\u524D\u6A21\u677F`);
        await this.render();
      }
    ).open();
  }
  pickRetitleTemplate() {
    new TemplatePickModal(
      this.app,
      this.plugin.settings.templates,
      async (tpl) => {
        const r = await this.plugin.store.retitleTemplate(this.currentDate, tpl.titles);
        if (!r) return;
        const parts = [`\u5DF2\u6309\u300C${tpl.name}\u300D\u91CD\u6392\uFF0C\u4FDD\u7559 ${r.kept} \u8282\u5185\u5BB9`];
        if (r.orphans.length) parts.push(`${r.orphans.length} \u8282\u5F52\u5165\u300C\u672A\u5206\u7C7B\u5185\u5BB9\u300D`);
        new import_obsidian6.Notice(parts.join("\uFF0C"));
        await this.render();
      },
      async (tpl) => {
        this.plugin.settings.defaultTemplate = tpl.name;
        await this.plugin.saveSettings();
        new import_obsidian6.Notice(`\u5DF2\u628A\u300C${tpl.name}\u300D\u8BBE\u4E3A\u5F53\u524D\u6A21\u677F`);
        await this.render();
      }
    ).open();
  }
  /** 删除时间流里的一节：需确认时先弹窗 */
  async removeSection(card, needConfirm) {
    const doDelete = async () => {
      this.selfWriteUntil = Date.now() + 1200;
      const removed = await this.plugin.store.deleteSection(this.currentDate, card.title);
      if (!removed) {
        new import_obsidian6.Notice("\u5220\u9664\u5931\u8D25");
        return;
      }
      const notice = new import_obsidian6.Notice(`\u5DF2\u5220\u9664\u300C${card.title}\u300D`, 5e3);
      let done = false;
      const btn = notice.noticeEl.createEl("button", { text: "\u64A4\u9500", cls: "gd-undo-btn" });
      btn.addEventListener("click", async () => {
        if (done) return;
        done = true;
        this.selfWriteUntil = Date.now() + 1200;
        await this.plugin.store.restoreSection(this.currentDate, removed.title, removed.body, removed.index);
        notice.hide();
        await this.render();
      });
      await this.render();
    };
    if (!needConfirm) {
      await doDelete();
      return;
    }
    new ConfirmModal(this.app, {
      title: "\u5220\u9664\u8FD9\u4E00\u8282\uFF1F",
      desc: `\u300C## ${card.title}\u300D\u4F1A\u4ECE\u6587\u4EF6\u4E2D\u79FB\u9664\uFF0C\u5176\u4ED6\u5185\u5BB9\u4E0D\u52A8\u3002\u8FD9\u4E00\u64CD\u4F5C\u4E0D\u7ECF\u8FC7\u56DE\u6536\u7AD9\u3002`,
      okText: "\u5220\u9664",
      danger: true,
      checkboxLabel: "\u4EE5\u540E\u4E0D\u518D\u63D0\u793A",
      onOk: async (checked) => {
        if (checked) {
          this.plugin.settings.skipPermanentConfirm = true;
          await this.plugin.saveSettings();
        }
        await doDelete();
      }
    }).open();
  }
  openHeaderMenu(evt) {
    const menu = new import_obsidian6.Menu();
    menu.addItem(
      (i) => i.setTitle("\u9009\u62E9\u65E5\u671F\u2026").setIcon("calendar").onClick(() => {
        var _a;
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
        (_a = input.showPicker) == null ? void 0 : _a.call(input);
      })
    );
    menu.addItem(
      (i) => i.setTitle("\u7528\u6A21\u677F\u8865\u9F50\u683C\u5B50").setIcon("layout-template").onClick(() => this.pickTemplate())
    );
    menu.addItem(
      (i) => i.setTitle("\u66F4\u6362\u6A21\u677F\uFF08\u4FDD\u7559\u65E7\u5185\u5BB9\uFF09").setIcon("replace").onClick(() => this.pickRetitleTemplate())
    );
    menu.addItem(
      (i) => i.setTitle("\u6253\u5F00\u8FD9\u4E00\u5929\u7684\u6587\u4EF6").setIcon("file-text").onClick(() => void this.openWholeFile())
    );
    menu.addItem(
      (i) => i.setTitle("\u65B0\u5EFA\u8FD9\u4E00\u5929\u7684\u6587\u4EF6").setIcon("file-plus").onClick(async () => {
        if (this.plugin.store.fileFor(this.currentDate)) {
          new import_obsidian6.Notice("\u6587\u4EF6\u5DF2\u5B58\u5728");
          return;
        }
        const tpl = this.plugin.getDefaultTemplate();
        await this.plugin.store.createDayFile(this.currentDate, tpl ? tpl.titles : []);
        await this.render();
      })
    );
    menu.showAtMouseEvent(evt);
  }
  openCellMenu(evt, cell) {
    const menu = new import_obsidian6.Menu();
    menu.addItem(
      (i) => i.setTitle("\u5728\u6587\u4EF6\u91CC\u5B9A\u4F4D").setIcon("file-symlink").onClick(() => void this.openAtSection(cell))
    );
    menu.addSeparator();
    menu.addItem(
      (i) => i.setTitle("\u5220\u9664\u8FD9\u4E00\u683C").setIcon("trash").onClick(async () => {
        const date = this.currentDate;
        const removed = await this.plugin.store.deleteSection(date, cell.title);
        await this.render();
        if (!removed) return;
        const notice = new import_obsidian6.Notice(`\u5DF2\u5220\u9664\u300C${cell.title}\u300D`, 5e3);
        let done = false;
        const btn = notice.noticeEl.createEl("button", { text: "\u64A4\u9500", cls: "gd-undo-btn" });
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
          new import_obsidian6.Notice(`\u5DF2\u6062\u590D\u300C${removed.title}\u300D`);
        });
      })
    );
    menu.showAtMouseEvent(evt);
  }
};

// src/calendar.ts
var import_obsidian7 = require("obsidian");
var VIEW_TYPE_CAL = "grid-diary-calendar";
function bodyText(raw) {
  let t = raw.replace(/^\uFEFF/, "");
  const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(t);
  if (fm) t = t.slice(fm[0].length);
  return t.split(/\r?\n/).filter((l) => !/^#{1,6}\s/.test(l)).join(" ").replace(/\s+/g, " ").trim();
}
function summarize(raw, n = 50) {
  const s = bodyText(raw);
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "\u2026" : s;
}
var CalendarSidebarView = class extends import_obsidian7.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.calY = 0;
    this.calM = 0;
    this.calDay = 1;
    this.calMode = "month";
    this.bodyEl = null;
    this.dayLimit = 200;
    this.listEl = null;
    this.calEl = null;
    this.splitTopEl = null;
    this.splitRatio = 0.6;
    this.refreshTimer = null;
    /** 折叠面板展开状态（key = 分组标题） */
    this.openState = /* @__PURE__ */ new Map();
    const [y, m, d] = (this.plugin.activeDate || todayStr()).split("-").map(Number);
    this.calY = y;
    this.calM = m;
    this.calDay = d || 1;
  }
  getViewType() {
    return VIEW_TYPE_CAL;
  }
  getDisplayText() {
    return "\u65E5\u8BB0\u65E5\u5386";
  }
  getIcon() {
    return "calendar";
  }
  async onOpen() {
    this.contentEl.addClass("gd-cal-side");
    this.register(
      this.plugin.onDateChange((date, from) => {
        if (from === this) return;
        this.refreshHighlight(date);
      })
    );
    this.renderCal();
  }
  async onClose() {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
  }
  /** 插件级刷新入口（vault 变动 / 设置变更） */
  refreshCal() {
    this.scheduleRefresh();
  }
  scheduleRefresh() {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.renderCal();
    }, 120);
  }
  /** 主视图切日期 → 高亮与锚点同步过来 */
  refreshHighlight(date) {
    const [y, m, d] = date.split("-").map(Number);
    this.calY = y;
    this.calM = m;
    this.calDay = d || 1;
    this.renderCal();
  }
  shiftCalDays(delta) {
    const d = new Date(this.calY, this.calM - 1, this.calDay);
    d.setDate(d.getDate() + delta);
    this.calY = d.getFullYear();
    this.calM = d.getMonth() + 1;
    this.calDay = d.getDate();
    this.renderCal();
  }
  shiftMonth(delta) {
    const dt = new Date(this.calY, this.calM - 1 + delta, 1);
    this.calY = dt.getFullYear();
    this.calM = dt.getMonth() + 1;
    const max = new Date(this.calY, this.calM, 0).getDate();
    if (this.calDay > max) this.calDay = max;
    this.renderCal();
  }
  /** 点日期 → 通知插件：主视图跳转 + 各处高亮刷新 */
  pick(date, broadcast = true) {
    const [y, m, d] = date.split("-").map(Number);
    this.calY = y;
    this.calM = m;
    this.calDay = d || 1;
    this.renderCal();
    if (broadcast) this.plugin.setActiveDate(date, this);
  }
  renderCal() {
    var _a;
    const el = this.contentEl;
    if (!el) return;
    el.empty();
    el.addClass("gd-cal-side");
    el.style.setProperty("--gd-weight", String(this.plugin.settings.fontWeight));
    el.style.setProperty("--gd-font", this.plugin.fontStack());
    const bar = el.createDiv({ cls: "gd-cal-bar" });
    const seg = bar.createDiv({ cls: "gd-cal-seg" });
    const modes = [
      ["day", "\u6309\u65E5"],
      ["month", "\u6309\u6708"]
    ];
    for (const [key, label] of modes) {
      const b = seg.createEl("button", {
        text: label,
        cls: "gd-cal-seg-btn" + (this.calMode === key ? " is-on" : "")
      });
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.calMode === key) return;
        this.calMode = key;
        this.renderCal();
      });
    }
    if (this.calMode === "month") this.buildPicker(bar);
    const resetBtn = seg.createEl("button", { text: "\u21D5", cls: "gd-cal-reset" });
    resetBtn.setAttribute("aria-label", "\u6062\u590D\u9ED8\u8BA4\u6BD4\u4F8B 60/40");
    resetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.splitRatio = 0.6;
      this.applySplit();
      this.plugin.settings.splitRatio = 0.6;
      void this.plugin.saveSettings();
      new import_obsidian7.Notice("\u5DF2\u6062\u590D\u9ED8\u8BA4\u6BD4\u4F8B 60/40");
    });
    this.splitRatio = (_a = this.plugin.settings.splitRatio) != null ? _a : 0.6;
    const split = el.createDiv({ cls: "gd-split" });
    this.splitTopEl = split.createDiv({ cls: "gd-split-top" });
    this.listEl = this.splitTopEl.createDiv({ cls: "gd-cal-list-pane" });
    const grip = split.createDiv({ cls: "gd-split-grip" });
    const bottom = split.createDiv({ cls: "gd-split-bottom" });
    this.calEl = bottom.createDiv({ cls: "gd-cal-cal-pane" });
    this.applySplit();
    grip.addEventListener("mousedown", (e) => {
      e.preventDefault();
      document.body.classList.add("gd-split-resizing");
      const move = (ev) => {
        const rect = split.getBoundingClientRect();
        if (!rect.height) return;
        const r = (ev.clientY - rect.top) / rect.height;
        this.splitRatio = Math.min(0.85, Math.max(0.15, r));
        this.applySplit();
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.body.classList.remove("gd-split-resizing");
        this.plugin.settings.splitRatio = this.splitRatio;
        void this.plugin.saveSettings();
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      this.register(() => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      });
    });
    this.renderBody();
  }
  applySplit() {
    if (this.splitTopEl) this.splitTopEl.style.flex = `0 0 ${(this.splitRatio * 100).toFixed(1)}%`;
  }
  // ---------- 下拉选择框（仅按月） ----------
  monthValue(y, m) {
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  buildPicker(bar) {
    const wrap = bar.createDiv({ cls: "gd-cal-dd" });
    const dd = new import_obsidian7.DropdownComponent(wrap);
    const now = new Date(this.calY, this.calM - 1, 1);
    for (let i = -12; i <= 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      dd.addOption(
        this.monthValue(d.getFullYear(), d.getMonth() + 1),
        `${d.getFullYear()}\u5E74${d.getMonth() + 1}\u6708`
      );
    }
    dd.setValue(this.monthValue(this.calY, this.calM));
    dd.onChange((v) => {
      if (!v) return;
      const [y, m] = v.split("-").map(Number);
      this.calY = y;
      this.calM = m;
      const max = new Date(y, m, 0).getDate();
      if (this.calDay > max) this.calDay = max;
      this.renderCal();
    });
  }
  // ---------- 主体 ----------
  renderBody() {
    const list = this.listEl;
    const cal = this.calEl;
    if (!list || !cal) return;
    list.empty();
    cal.empty();
    this.renderCalMonth(cal);
    void this.renderList(list);
  }
  /** 按月：完整月历 */
  renderCalMonth(el) {
    const head = el.createDiv({ cls: "gd-cal-head" });
    const prevM = head.createEl("button", { text: "\u2039", cls: "gd-cal-nav" });
    prevM.addEventListener("click", (e) => {
      e.stopPropagation();
      this.shiftMonth(-1);
    });
    const title = head.createEl("span", { cls: "gd-cal-title" });
    appendColoredMonth(title, this.calY, this.calM);
    const nextM = head.createEl("button", { text: "\u203A", cls: "gd-cal-nav" });
    nextM.addEventListener("click", (e) => {
      e.stopPropagation();
      this.shiftMonth(1);
    });
    const week = el.createDiv({ cls: "gd-cal-week" });
    for (const w of ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"]) week.createEl("div", { text: w });
    const grid = el.createDiv({ cls: "gd-cal-grid" });
    const lead = new Date(this.calY, this.calM - 1, 1).getDay();
    const days = new Date(this.calY, this.calM, 0).getDate();
    for (let i = 0; i < lead; i++) grid.createDiv({ cls: "gd-cal-day empty" });
    const mm = String(this.calM).padStart(2, "0");
    const active = this.plugin.activeDate;
    for (let d = 1; d <= days; d++) {
      const ds = `${this.calY}-${mm}-${String(d).padStart(2, "0")}`;
      const cell = grid.createDiv({ cls: "gd-cal-day" });
      cell.setText(String(d));
      if (this.plugin.store.fileFor(ds)) cell.addClass("has");
      if (ds === todayStr()) cell.addClass("today");
      if (ds === active) cell.addClass("active");
      cell.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showDayMenu(ds, e);
      });
    }
  }
  // ---------- 底部：摘要列表 ----------
  allDiaryDates() {
    const root = this.plugin.store.root() + "/";
    const out = [];
    for (const f of this.app.vault.getFiles()) {
      if (!f.path.startsWith(root)) continue;
      const m = /^(\d{4})-(\d{2})-(\d{2})\.md$/.exec(f.name);
      if (m) out.push(`${m[1]}-${m[2]}-${m[3]}`);
    }
    out.sort();
    return out;
  }
  datesInMonth(y, m) {
    const days = new Date(y, m, 0).getDate();
    const out = [];
    for (let d = 1; d <= days; d++)
      out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    return out;
  }
  countFiles(dates) {
    return dates.filter((ds) => this.plugin.store.fileFor(ds)).length;
  }
  isOpen(title, fallback) {
    const v = this.openState.get(title);
    return v === void 0 ? fallback : v;
  }
  async renderList(el) {
    var _a;
    const wrap = el.createDiv({ cls: "gd-cal-list" });
    if (((_a = this.plugin.settings.listLineStyle) != null ? _a : "vertical") === "polyline") {
      wrap.addClass("is-polyline");
    }
    if (this.calMode === "day") {
      const all = this.allDiaryDates().reverse();
      if (!all.length) {
        wrap.createDiv({ cls: "gd-cal-item-sum is-empty", text: "\u8FD8\u6CA1\u6709\u5199\u8FC7\u65E5\u8BB0" });
        return;
      }
      const shown = all.slice(0, this.dayLimit);
      await this.fillEntries(wrap, shown, true);
      const rest = all.length - shown.length;
      if (rest > 0) {
        const btn = wrap.createEl("button", {
          text: `\u52A0\u8F7D\u66F4\u591A\uFF08\u8FD8\u6709 ${rest} \u7BC7\uFF09`,
          cls: "gd-cal-more"
        });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.dayLimit += 200;
          this.renderBody();
        });
      }
      return;
    }
    let any = false;
    for (let i = -6; i <= 6; i++) {
      const d = new Date(this.calY, this.calM - 1 + i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const dates = this.datesInMonth(y, m);
      const cnt = this.countFiles(dates);
      const isCur = y === this.calY && m === this.calM;
      if (!isCur && cnt === 0) continue;
      any = true;
      const title = `${y}\u5E74${String(m).padStart(2, "0")}\u6708`;
      const g = this.groupEl(wrap, title, cnt, this.isOpen(title, isCur), y, m);
      await this.fillEntries(g, dates.filter((ds) => this.plugin.store.fileFor(ds)));
    }
    if (!any) wrap.createDiv({ cls: "gd-cal-item-sum is-empty", text: "\u8FD9\u9644\u8FD1\u8FD8\u6CA1\u6709\u65E5\u8BB0" });
  }
  groupEl(parent, title, count, expand, y, m) {
    const d = parent.createEl("details", { cls: "gd-cal-group" });
    d.open = expand;
    d.addEventListener("toggle", () => this.openState.set(title, d.open));
    const s = d.createEl("summary", { cls: "gd-cal-summary" });
    appendColoredMonth(s, y, m);
    s.createEl("span", { text: `${count} \u7BC7`, cls: "gd-cal-count" });
    return d;
  }
  /** 折线星图：左侧节点 + 横向折线，纯 SVG 绘制，随行高自适应 */
  addPolylineNode(item) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "gd-node-svg");
    svg.setAttribute("viewBox", "0 0 44 36");
    svg.setAttribute("width", "44");
    svg.setAttribute("height", "36");
    svg.setAttribute("aria-hidden", "true");
    const line = document.createElementNS(NS, "polyline");
    line.setAttribute("points", "5,12 15,12 26,24 42,24");
    line.setAttribute("class", "gd-node-line");
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", "5");
    dot.setAttribute("cy", "12");
    dot.setAttribute("r", "2.6");
    dot.setAttribute("class", "gd-node-dot");
    svg.appendChild(line);
    svg.appendChild(dot);
    item.appendChild(svg);
  }
  /** 逐条：彩色日期标题 + 两行摘要 */
  async fillEntries(box, dates, showYear = false) {
    var _a;
    const active = this.plugin.activeDate;
    const polyline2 = ((_a = this.plugin.settings.listLineStyle) != null ? _a : "vertical") === "polyline";
    for (const ds of dates) {
      const file = this.plugin.store.fileFor(ds);
      const item = box.createDiv({ cls: "gd-cal-item" });
      if (ds === active) item.addClass("active");
      if (polyline2) this.addPolylineNode(item);
      const headEl = item.createDiv({ cls: "gd-cal-item-head" });
      appendColoredDate(headEl, ds, {
        year: showYear,
        weekday: true,
        cls: "gd-cal-item-date"
      });
      item.addClass("is-clickable");
      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void this.plugin.activateView(ds);
      });
      if (file) {
        const del = headEl.createEl("button", { cls: "gd-cal-del" });
        del.type = "button";
        del.setText("\u{1F5D1}");
        del.setAttribute("aria-label", "\u5220\u9664\u8FD9\u7BC7\u65E5\u8BB0");
        del.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const menu = new import_obsidian7.Menu();
          menu.addItem(
            (i) => i.setTitle("\u79FB\u5165\u56DE\u6536\u7AD9\uFF08\u79D2\u5220\uFF0C\u53EF\u6062\u590D\uFF09").setIcon("trash").onClick(() => void this.trashFile(file, false))
          );
          menu.addItem(
            (i) => i.setTitle("\u6C38\u4E45\u5220\u9664\u2026").setIcon("x-circle").onClick(() => void this.trashFile(file, true))
          );
          menu.showAtMouseEvent(e);
        });
      }
      if (!file) {
        headEl.createEl("span", { text: "\u7A7A", cls: "gd-cal-item-badge" });
        item.createDiv({ cls: "gd-cal-item-sum is-empty", text: "\u8FD9\u5929\u8FD8\u6CA1\u6709\u65E5\u8BB0\uFF0C\u70B9\u8FD9\u91CC\u53BB\u5199" });
        continue;
      }
      let raw = "";
      try {
        raw = await this.app.vault.cachedRead(file);
      } catch (e) {
        raw = "";
      }
      const thumb = this.firstImageThumb(raw, file.path);
      if (thumb) {
        const box2 = item.createDiv({ cls: "gd-cal-item-thumb" });
        const img = box2.createEl("img");
        img.src = thumb;
        img.loading = "lazy";
        img.alt = "";
      }
      item.createDiv({ cls: "gd-cal-item-sum", text: summarize(raw, 50) || "\uFF08\u8FD9\u5929\u6CA1\u6709\u6B63\u6587\uFF09" });
    }
  }
  /** 删除一篇日记：false = 移入回收站（秒删，可恢复）；true = 永久删除（需确认） */
  async trashFile(file, permanent) {
    const toTrash = async () => {
      try {
        await this.app.vault.trash(file, true);
        new import_obsidian7.Notice(`\u5DF2\u79FB\u5165\u7CFB\u7EDF\u56DE\u6536\u7AD9\uFF1A${file.name}`);
      } catch (err) {
        console.error("[grid-diary] \u7CFB\u7EDF\u56DE\u6536\u7AD9\u5931\u8D25\uFF0C\u6539\u7528 .trash", err);
        try {
          await this.app.vault.trash(file, false);
          new import_obsidian7.Notice(`\u5DF2\u79FB\u5165 .trash\uFF1A${file.name}`);
        } catch (err2) {
          console.error("[grid-diary] \u79FB\u5165\u56DE\u6536\u7AD9\u5931\u8D25", err2);
          new import_obsidian7.Notice("\u79FB\u5165\u56DE\u6536\u7AD9\u5931\u8D25\uFF0C\u6587\u4EF6\u672A\u6539\u52A8");
          return;
        }
      }
      this.plugin.refreshAll();
    };
    if (!permanent) {
      await toTrash();
      return;
    }
    const show = () => new ConfirmModal(this.app, {
      title: "\u6C38\u4E45\u5220\u9664\u8FD9\u7BC7\u65E5\u8BB0\uFF1F",
      desc: `${file.path}
\u4E0D\u4F1A\u8FDB\u5165\u56DE\u6536\u7AD9\uFF0C\u5220\u9664\u540E\u65E0\u6CD5\u901A\u8FC7 Obsidian \u627E\u56DE\u3002`,
      okText: "\u6C38\u4E45\u5220\u9664",
      danger: true,
      checkboxLabel: "\u4EE5\u540E\u4E0D\u518D\u63D0\u793A\u6C38\u4E45\u5220\u9664",
      onOk: async (checked) => {
        if (checked) {
          this.plugin.settings.skipPermanentConfirm = true;
          await this.plugin.saveSettings();
        }
        try {
          await this.app.vault.delete(file);
          new import_obsidian7.Notice(`\u5DF2\u6C38\u4E45\u5220\u9664\uFF1A${file.name}`);
        } catch (err) {
          console.error("[grid-diary] \u6C38\u4E45\u5220\u9664\u5931\u8D25", err);
          new import_obsidian7.Notice("\u5220\u9664\u5931\u8D25\uFF0C\u6587\u4EF6\u672A\u6539\u52A8");
          return;
        }
        this.plugin.refreshAll();
      }
    }).open();
    if (this.plugin.settings.skipPermanentConfirm) {
      try {
        await this.app.vault.delete(file);
        new import_obsidian7.Notice(`\u5DF2\u6C38\u4E45\u5220\u9664\uFF1A${file.name}`);
      } catch (err) {
        console.error("[grid-diary] \u6C38\u4E45\u5220\u9664\u5931\u8D25", err);
        new import_obsidian7.Notice("\u5220\u9664\u5931\u8D25\uFF0C\u6587\u4EF6\u672A\u6539\u52A8");
        return;
      }
      this.plugin.refreshAll();
      return;
    }
    show();
  }
  /** 日期快捷菜单：打开 / 快速笔记 / 插入图片 */
  showDayMenu(date, evt) {
    const menu = new import_obsidian7.Menu();
    menu.addItem(
      (i) => i.setTitle("\u6253\u5F00\u8FD9\u5929\u7684\u683C\u95F4\u65E5\u8BB0").setIcon("layout-grid").onClick(() => void this.plugin.activateView(date))
    );
    menu.addItem(
      (i) => i.setTitle("\u63D2\u5165\u6A21\u677F\u7B14\u8BB0").setIcon("layout-template").onClick(() => this.plugin.pickTemplateNote(date, evt))
    );
    menu.addItem(
      (i) => i.setTitle("\u63D2\u5165\u56FE\u7247").setIcon("image").onClick(() => void this.plugin.insertImage(date))
    );
    menu.showAtMouseEvent(evt);
  }
  /** 找出正文里第一张图片，返回可用的资源 URL */
  firstImageThumb(raw, sourcePath) {
    var _a, _b;
    const wiki = /!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/.exec(raw);
    const md = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/.exec(raw);
    const target = ((_a = wiki == null ? void 0 : wiki[1]) == null ? void 0 : _a.trim()) || ((_b = md == null ? void 0 : md[1]) == null ? void 0 : _b.trim());
    if (!target) return null;
    if (/^(https?:)?\/\//.test(target)) return target;
    if (!/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(target)) return null;
    const file = this.app.metadataCache.getFirstLinkpathDest(target, sourcePath);
    if (file) return this.app.vault.getResourcePath(file);
    return null;
  }
};

// src/main.ts
var GridDiaryPlugin = class extends import_obsidian8.Plugin {
  constructor() {
    super(...arguments);
    /** 当前选中的日期，主视图与右侧日历共用 */
    this.activeDate = todayStr();
    // ---------- 模板命令 / 兼容导出 ----------
    this.templateCommandIds = [];
    this.templateSig = "";
    // ---------- 自定义 CSS ----------
    this.cssEl = null;
    // ---------- 全局刷新 ----------
    this.refreshTimer = null;
    /** 日期变化订阅者（主视图 / 侧栏日历都挂在这里，避免依赖 leaf 遍历） */
    this.dateListeners = /* @__PURE__ */ new Set();
  }
  async onload() {
    await this.loadSettings();
    this.applyCustomCss();
    this.applyLayout();
    this.store = new DayStore(this.app, () => this.settings.rootFolder);
    this.store.getDefaultTitles = () => {
      var _a, _b;
      return (_b = (_a = this.getDefaultTemplate()) == null ? void 0 : _a.titles) != null ? _b : [];
    };
    this.store.ensureDayFile = (date) => this.createDayFileFor(date);
    this.registerView(VIEW_TYPE_GRID_DIARY, (leaf) => new GridDiaryView(leaf, this));
    this.registerView(VIEW_TYPE_CAL, (leaf) => new CalendarSidebarView(leaf, this));
    this.addCommand({
      id: "open-calendar-sidebar",
      name: "\u6253\u5F00\u65E5\u8BB0\u65E5\u5386\u4FA7\u680F",
      callback: () => void this.activateCalendar()
    });
    this.addRibbonIcon("layout-grid", "\u6253\u5F00\u683C\u95F4\u65E5\u8BB0", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open-grid-diary",
      name: "\u6253\u5F00\u683C\u95F4\u65E5\u8BB0",
      callback: () => void this.activateView()
    });
    this.addCommand({
      id: "open-today-grid",
      name: "\u6253\u5F00\u4ECA\u5929\u7684\u683C\u5B50",
      callback: () => void this.activateView(todayStr())
    });
    this.addCommand({
      id: "fill-today-with-template",
      name: "\u7528\u9ED8\u8BA4\u6A21\u677F\u8865\u9F50\u4ECA\u5929\u7684\u683C\u5B50",
      callback: async () => {
        const tpl = this.getDefaultTemplate();
        if (!tpl) {
          new import_obsidian8.Notice("\u8FD8\u6CA1\u6709\u914D\u7F6E\u6A21\u677F");
          return;
        }
        const added = await this.store.fillWithTemplate(todayStr(), tpl.titles);
        new import_obsidian8.Notice(added.length ? `\u5DF2\u8865\u9F50 ${added.length} \u4E2A\u683C\u5B50` : "\u4ECA\u5929\u7684\u683C\u5B50\u5DF2\u7ECF\u9F50\u4E86");
        await this.activateView(todayStr());
      }
    });
    this.addCommand({
      id: "create-today-file",
      name: "\u65B0\u5EFA\u4ECA\u5929\u7684\u65E5\u8BB0\u6587\u4EF6",
      callback: async () => {
        if (this.store.fileFor(todayStr())) {
          new import_obsidian8.Notice("\u4ECA\u5929\u5DF2\u7ECF\u6709\u6587\u4EF6\u4E86");
          return;
        }
        const tpl = this.getDefaultTemplate();
        await this.createDayFileFor(todayStr());
        new import_obsidian8.Notice("\u5DF2\u521B\u5EFA\u4ECA\u5929\u7684\u65E5\u8BB0");
        await this.activateView(todayStr());
      }
    });
    this.addCommand({
      id: "images-to-html",
      name: "\u628A\u5F53\u524D\u6587\u4EF6\u7684\u56FE\u7247\u8F6C\u6210\u901A\u7528 <img>\uFF08\u5BFC\u51FA\u7528\uFF09",
      checkCallback: () => {
        const f = this.app.workspace.getActiveFile();
        if (!f) return false;
        void (async () => {
          const n = await this.convertImagesToHtml(f);
          new import_obsidian8.Notice(n ? `\u5DF2\u8F6C\u6362 ${n} \u5F20\u56FE\u7247` : "\u6CA1\u6709\u9700\u8981\u8F6C\u6362\u7684\u56FE\u7247");
        })();
        return true;
      }
    });
    this.addCommand({
      id: "images-to-wiki",
      name: "\u628A\u5F53\u524D\u6587\u4EF6\u7684 <img> \u8FD8\u539F\u6210 Obsidian \u5185\u94FE",
      checkCallback: () => {
        const f = this.app.workspace.getActiveFile();
        if (!f) return false;
        void (async () => {
          const n = await this.convertImagesToWiki(f);
          new import_obsidian8.Notice(n ? `\u5DF2\u8FD8\u539F ${n} \u5F20\u56FE\u7247` : "\u6CA1\u6709\u9700\u8981\u8FD8\u539F\u7684\u56FE\u7247");
        })();
        return true;
      }
    });
    this.registerTemplateCommands();
    this.addSettingTab(new GridDiarySettingTab(this.app, this));
    const onVaultChange = () => this.scheduleGlobalRefresh();
    this.registerEvent(this.app.vault.on("modify", onVaultChange));
    this.registerEvent(this.app.vault.on("create", onVaultChange));
    this.registerEvent(this.app.vault.on("delete", onVaultChange));
    this.registerEvent(this.app.vault.on("rename", onVaultChange));
  }
  /** 为每个模板注册一条命令：命令面板搜索「插入模板：xxx」直接插到当天文件末尾 */
  registerTemplateCommands() {
    var _a;
    const sig = this.settings.templates.map((t) => `${t.name}:${t.titles.join(",")}`).join("|");
    if (sig === this.templateSig) return;
    this.templateSig = sig;
    for (const id of this.templateCommandIds) {
      try {
        (_a = this.removeCommand) == null ? void 0 : _a.call(this, id);
      } catch (e) {
      }
    }
    this.templateCommandIds = [];
    for (const tpl of this.settings.templates) {
      const id = `insert-template-${tpl.name.replace(/[^\w\u4e00-\u9fa5]+/g, "-")}`;
      this.addCommand({
        id,
        name: `\u63D2\u5165\u6A21\u677F\uFF1A${tpl.name}`,
        callback: async () => {
          const date = todayStr();
          if (!this.store.fileFor(date)) await this.createDayFileFor(date);
          await this.insertTemplateNote(date, tpl);
          new import_obsidian8.Notice(`\u5DF2\u63D2\u5165\u6A21\u677F\u300C${tpl.name}\u300D`);
          this.setActiveDate(date);
          this.refreshAll();
        }
      });
      this.templateCommandIds.push(id);
    }
  }
  /** 把当前文件的 ![[图|宽]] 转成 <img src width>，方便导出到别的 Markdown 软件 */
  async convertImagesToHtml(file) {
    let count = 0;
    await this.app.vault.process(file, (data) => {
      const out = data.replace(/!\[\[([^\]|#]+?)(?:\|(\d+))?\]\]/g, (_m, name, w) => {
        const src = (0, import_obsidian8.normalizePath)(`${this.settings.rootFolder || "\u65E5\u8BB0"}/attachments/${name.trim()}`);
        count++;
        return `<img src="${src}"${w ? ` width="${w}"` : ""}>`;
      });
      return out;
    });
    return count;
  }
  /** 反向：把 <img src width> 还原成 ![[图|宽]] */
  async convertImagesToWiki(file) {
    let count = 0;
    await this.app.vault.process(file, (data) => {
      const out = data.replace(/<img\s+[^>]*src="([^"]+)"[^>]*?(?:width="(\d+)")?[^>]*>/g, (_m, src, w) => {
        const base = src.split("/").pop() || src;
        count++;
        return `![[${base}${w ? `|${w}` : ""}]]`;
      });
      return out;
    });
    return count;
  }
  /** 把设置里的自定义 CSS 注入到文档，改完立即生效 */
  applyCustomCss() {
    if (!this.cssEl) {
      this.cssEl = document.createElement("style");
      this.cssEl.id = "grid-diary-custom-css";
      document.head.appendChild(this.cssEl);
      this.register(() => {
        var _a;
        return (_a = this.cssEl) == null ? void 0 : _a.remove();
      });
    }
    let src = "";
    if (this.settings.fontDataUrl) {
      src = `url("${this.settings.fontDataUrl}")`;
    } else if (this.settings.fontDirFile) {
      try {
        const p = this.app.vault.adapter.getResourcePath(
          `.obsidian/fonts/${this.settings.fontDirFile}`
        );
        src = `url("${p}")`;
      } catch (e) {
        src = "";
      }
    }
    const face = src ? `@font-face{font-family:"GD-Custom";src:${src};font-display:swap;}` : "";
    this.cssEl.textContent = face + "\n" + (this.settings.customCss || "");
  }
  /** 字体栈：导入过字体时优先用它 */
  fontStack() {
    const custom = this.settings.fontDataUrl || this.settings.fontDirFile;
    return custom ? `"GD-Custom", ${this.settings.fontFamily}` : this.settings.fontFamily;
  }
  scheduleGlobalRefresh() {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refreshAll();
    }, 350);
  }
  /** 所有开着的格间日记视图 + 侧栏日历一起刷新 */
  refreshAll() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GRID_DIARY)) {
      const view = leaf.view;
      if (view instanceof GridDiaryView) view.scheduleRender();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CAL)) {
      const view = leaf.view;
      if (view instanceof CalendarSidebarView) view.refreshCal();
    }
  }
  onunload() {
  }
  getDefaultTemplate() {
    var _a;
    return (_a = this.settings.templates.find((t) => t.name === this.settings.defaultTemplate)) != null ? _a : this.settings.templates[0];
  }
  onDateChange(fn) {
    this.dateListeners.add(fn);
    return () => {
      this.dateListeners.delete(fn);
    };
  }
  /** 任一视图选了日期：广播给所有订阅者（主视图跳转 + 侧栏高亮） */
  setActiveDate(date, from) {
    this.activeDate = date;
    for (const fn of Array.from(this.dateListeners)) {
      try {
        fn(date, from);
      } catch (err) {
        console.error("[grid-diary] date listener failed", err);
      }
    }
  }
  /** 在右侧边栏打开日历（随右栏一起折叠） */
  async activateCalendar() {
    var _a;
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_CAL)[0];
    if (!leaf) {
      leaf = (_a = workspace.getRightLeaf(false)) != null ? _a : workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_CAL, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
  /** 选择模板插入：列出设置里的所有模板，选一个追加为时间流笔记 */
  pickTemplateNote(date, evt) {
    var _a;
    const templates = (_a = this.settings.templates) != null ? _a : [];
    const menu = new import_obsidian8.Menu();
    if (!templates.length) {
      menu.addItem((i) => i.setTitle("\u8FD8\u6CA1\u6709\u6A21\u677F\uFF0C\u8BF7\u5230\u8BBE\u7F6E\u91CC\u6DFB\u52A0").setDisabled(true));
    }
    for (const tpl of templates) {
      menu.addItem(
        (i) => i.setTitle(`${tpl.name}\uFF08${tpl.titles.length} \u683C\uFF09`).setIcon("layout-template").onClick(() => void this.insertTemplateNote(date, tpl))
      );
    }
    if (evt) menu.showAtMouseEvent(evt);
    else menu.showAtPosition({ x: window.innerWidth - 240, y: 160 });
  }
  /** 把模板的格子标题作为内容，追加到当天末尾的时间戳小节下 */
  async insertTemplateNote(date, tpl) {
    const body = tpl.titles.map((t) => `### ${t}
`).join("\n").replace(/\s*$/, "");
    try {
      await this.store.appendTimelineNote(date, body || "\uFF08\u7A7A\u6A21\u677F\uFF09", tpl.name);
      new import_obsidian8.Notice(`\u5DF2\u63D2\u5165\u6A21\u677F\uFF1A${tpl.name}`);
      this.setActiveDate(date);
      this.refreshAll();
    } catch (e) {
      console.error("[grid-diary] \u63D2\u5165\u6A21\u677F\u5931\u8D25", e);
      new import_obsidian8.Notice("\u63D2\u5165\u6A21\u677F\u5931\u8D25\uFF0C\u8BF7\u770B\u63A7\u5236\u53F0");
    }
  }
  /** 快速笔记：追加一条带时间戳的笔记，不碰九宫格 */
  quickNote(date) {
    new QuickNoteModal(this.app, date, async (text) => {
      try {
        await this.store.appendTimelineNote(date, text);
        new import_obsidian8.Notice("\u5DF2\u6DFB\u52A0\u4E00\u6761\u7B14\u8BB0");
        this.setActiveDate(date);
        this.refreshAll();
      } catch (e) {
        console.error("[grid-diary] \u8FFD\u52A0\u7B14\u8BB0\u5931\u8D25", e);
        new import_obsidian8.Notice("\u6DFB\u52A0\u5931\u8D25\uFF0C\u8BF7\u770B\u63A7\u5236\u53F0");
      }
    }).open();
  }
  /** 把任意文件写进 attachments 目录，返回文件名（不含目录） */
  async saveAttachment(date, data, ext, prefix = "") {
    const dir = (0, import_obsidian8.normalizePath)(`${this.settings.rootFolder || "\u65E5\u8BB0"}/attachments`);
    if (!this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir).catch(() => void 0);
    }
    const clean = (ext || "bin").replace(/^\./, "").toLowerCase();
    const name = `${date}-${prefix}${Date.now().toString(36)}.${clean}`;
    const buf = data instanceof Blob ? await data.arrayBuffer() : data;
    await this.app.vault.createBinary((0, import_obsidian8.normalizePath)(`${dir}/${name}`), buf);
    return name;
  }
  /** 插入图片：写入 attachments，并在当天文件追加 ![[文件名]] */
  async insertImage(date) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      var _a;
      const f = (_a = input.files) == null ? void 0 : _a[0];
      if (!f) return;
      void (async () => {
        try {
          const ext = (f.name.split(".").pop() || "png").toLowerCase();
          const name = await this.saveAttachment(date, f, ext);
          await this.store.appendTimelineNote(date, `![[${name}|400]]`, "\u56FE\u7247");
          new import_obsidian8.Notice("\u5DF2\u63D2\u5165\u56FE\u7247");
          this.setActiveDate(date);
          this.refreshAll();
        } catch (e) {
          console.error("[grid-diary] \u63D2\u5165\u56FE\u7247\u5931\u8D25", e);
          new import_obsidian8.Notice("\u63D2\u5165\u56FE\u7247\u5931\u8D25");
        }
      })();
    });
    input.click();
  }
  /** 极简变量替换：{{date}} {{date:格式}} {{time}} {{time:格式}} {{title}} */
  applyVars(text, date) {
    const m = import_obsidian8.moment;
    return text.replace(
      /\{\{\s*(date|time|title)\s*(?::([^}]*))?\}\}/g,
      (_all, key, fmt) => {
        if (key === "title") return date;
        const format = (fmt != null ? fmt : "").trim() || (key === "time" ? "HH:mm" : "YYYY-MM-DD");
        return key === "date" ? m(date, "YYYY-MM-DD").format(format) : m().format(format);
      }
    );
  }
  /**
   * 新建当天文件：路径固定为 <日记目录>/YYYY-MM-DD.md
   * 已存在就直接用，不新建；有模板就读纯文本做 {{ }} 替换后写入。
   */
  async createDayFileFor(date) {
    const dir = (this.settings.rootFolder || "").trim().replace(/^\/+|\/+$/g, "") || "\u65E5\u8BB0";
    const path = (0, import_obsidian8.normalizePath)(`${dir}/${date}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian8.TFile) return;
    await this.store.ensureFolder();
    let text = "";
    const tplPath = (this.settings.dailyTemplatePath || "").trim();
    if (tplPath) {
      const tpl = this.app.vault.getAbstractFileByPath((0, import_obsidian8.normalizePath)(tplPath));
      if (tpl instanceof import_obsidian8.TFile) {
        try {
          text = this.applyVars(await this.app.vault.read(tpl), date);
        } catch (e) {
          console.error("[grid-diary] \u8BFB\u53D6\u6A21\u677F\u5931\u8D25", e);
        }
      } else {
        new import_obsidian8.Notice(`\u6A21\u677F\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${tplPath}`);
      }
    }
    const body = text ? text.replace(/\s*$/, "") + "\n" : "";
    const file = await this.app.vault.create(path, body);
    await this.store.syncAttrs(file);
  }
  async activateView(date) {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_GRID_DIARY)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE_GRID_DIARY, active: true });
    }
    await workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof GridDiaryView) {
      if (date) {
        view.jumpTo(date);
        this.setActiveDate(date, view);
      }
      await view.render();
    }
  }
  refreshViews() {
    this.refreshAll();
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!this.settings.leftPanelMigrated) {
      this.settings.showRecentFiles = false;
      this.settings.leftPanelMigrated = true;
      await this.saveSettings();
    }
    if (this.settings.cellHeight === 150) this.settings.cellHeight = 200;
    for (const tpl of this.settings.templates) {
      if (!tpl.titles && tpl.questions) tpl.titles = tpl.questions;
    }
    this.settings.templates = this.settings.templates.filter(
      (t) => Array.isArray(t.titles) && t.titles.length
    );
    if (!this.settings.templates.length) this.settings.templates = DEFAULT_SETTINGS.templates;
    if (typeof this.settings.showLeftPanel !== "boolean") this.settings.showLeftPanel = true;
    if (typeof this.settings.showRecentFiles !== "boolean") this.settings.showRecentFiles = true;
    if (typeof this.settings.showTreeLines !== "boolean") this.settings.showTreeLines = true;
    if (typeof this.settings.treeDefaultOpen !== "boolean") this.settings.treeDefaultOpen = true;
    if (typeof this.settings.hoverGlow !== "boolean") this.settings.hoverGlow = true;
    if (!this.settings.iconFile) this.settings.iconFile = DEFAULT_SETTINGS.iconFile;
    if (!this.settings.iconFolder) this.settings.iconFolder = DEFAULT_SETTINGS.iconFolder;
    if (!this.settings.iconFolderOpen) this.settings.iconFolderOpen = DEFAULT_SETTINGS.iconFolderOpen;
    if (!this.settings.leftWidth || this.settings.leftWidth < 120) this.settings.leftWidth = 190;
    if (!this.settings.layoutMigrated) {
      if (this.settings.leftWidth === 240) this.settings.leftWidth = 190;
      this.settings.layoutMigrated = true;
      await this.saveSettings();
    }
    if (!Array.isArray(this.settings.layoutPresets)) this.settings.layoutPresets = DEFAULT_SETTINGS.layoutPresets;
    if (typeof this.settings.pluginFontSize !== "number") this.settings.pluginFontSize = 15;
    if (typeof this.settings.contentPad !== "number") this.settings.contentPad = 18;
    if (typeof this.settings.gridGap !== "number") this.settings.gridGap = 14;
    if (typeof this.settings.rightDockWidth !== "number") this.settings.rightDockWidth = 0;
  }
  /** 应用布局：字号/边距/间距 CSS 变量 + 右栏宽度接管（全部只作用于本插件界面） */
  applyLayout() {
    var _a, _b, _c, _d;
    const s = this.settings;
    const root = document.documentElement;
    root.style.setProperty("--gd-font-size", `${(_a = s.pluginFontSize) != null ? _a : 15}px`);
    root.style.setProperty("--gd-pad", `${(_b = s.contentPad) != null ? _b : 18}px`);
    root.style.setProperty("--gd-gap", `${(_c = s.gridGap) != null ? _c : 14}px`);
    const w = (_d = s.rightDockWidth) != null ? _d : 0;
    let tag = document.getElementById("gd-right-dock-style");
    if (w > 0) {
      if (!tag) {
        tag = document.createElement("style");
        tag.id = "gd-right-dock-style";
        document.head.appendChild(tag);
      }
      tag.textContent = `.workspace-split.mod-right-split{width:${w}px !important;}`;
    } else if (tag) {
      tag.remove();
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
    this.registerTemplateCommands();
  }
};
