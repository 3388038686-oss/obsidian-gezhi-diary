/* ============ 日历视图（宿主）============
 * 真正的画法在 07-calendar-panel.js 的 CalendarPanel 里：
 *   5 种骨架（月网格 / 周条 / 纵向年历 / 大日期 / 双栏月历）×
 *   6 种纹理（无 / 方格纸 / 点点阵 / 细横线 / 纸纹 / 渐变）
 * 这个类只做三件事：占住 Obsidian 的一个标签页、把面板挂上去、把轴视图开关接好。
 * ============================================================ */

const WEEK_HEAD = ["一", "二", "三", "四", "五", "六", "日"];

class CalendarView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.anchor = todayStr();
    this.filter = "all";
    this.index = null;
    this.sumCache = new Map();
    this.refreshTimer = debounce(() => this.rebuild(), 260);
  }
  get sx() { return this.plugin.settings; }
  getViewType() { return VIEW_CALENDAR; }
  getDisplayText() { return "日记日历"; }
  getIcon() { return ICON_CALENDAR; }
  getState() { return { anchor: this.anchor, filter: this.filter }; }
  async setState(state) {
    if (state && state.anchor) this.anchor = state.anchor;
    if (state && state.filter) this.filter = state.filter;
  }
  async onOpen() {
    this.contentEl.addClass("gd-root");
    this.contentEl.addClass("gd-cal-root");
    if (IS_MOBILE) this.contentEl.addClass("is-mobile");
    this.build();
  }
  onClose() { this.refreshTimer.cancel(); if (this.panel) this.panel.close(); }

  build() {
    const el = this.contentEl;
    el.empty();
    this.scrollEl = el.createDiv({ cls: "gd-cal-scroll" });

    /* 轴视图：跟面板共用数据，只在本视图里额外画一条横轴 */
    if (this.sx.showCalendarAxis) {
      this.axisEl = this.scrollEl.createDiv({ cls: "gd-cal-axis-bar" });
      this.renderAxis();
    }
    this.panelHost = this.scrollEl.createDiv({ cls: "gd-cal-panel-host" });
    this.mount();
  }

  mount() {
    if (!this.panel) this.panel = new CalendarPanel(this.plugin);
    this.panel.inFloat = false;
    this.panel.openInPane(this.panelHost);
  }

  rebuild() {
    this.contentEl.empty();
    this.build();
  }

  /* 轴视图：近 90 天，节点大小按字数分四档 */
  async renderAxis() {
    const box = this.axisEl;
    if (!box) return;
    box.empty();
    box.createDiv({ cls: "gd-cal-axis-label", text: "近 90 天" });
    const track = box.createDiv({ cls: "gd-cal-axis-track" });
    const today = todayStr();
    for (let i = 89; i >= 0; i--) {
      const date = shiftDate(today, -i);
      const n = this.panel ? this.panel.info(date).count : 0;
      const dot = track.createDiv({ cls: "gd-cal-axis-dot" + (n ? " has" : "") });
      dot.dataset.date = date;
      dot.setAttr("title", date);
      dot.onclick = () => { if (n) this.plugin.openDay(this.panel.info(date).files[0].basename); };
      if (n) {
        const sz = clamp(5 + n * 3, 6, 16);
        dot.style.width = sz + "px";
        dot.style.height = sz + "px";
      }
    }
  }
}
