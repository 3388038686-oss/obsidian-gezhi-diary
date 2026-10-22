import { ItemView, WorkspaceLeaf } from "obsidian";
import type GridDiaryPlugin from "./main";
import { renderLeftPanel } from "./leftpanel";

/** 左侧原生 dock 里的目录标签页（File Tree Alternative 同形态，与官方文件列表同侧并排） */
export const VIEW_TYPE_EXPLORER = "grid-diary-explorer";

export class ExplorerView extends ItemView {
  private plugin: GridDiaryPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: GridDiaryPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_EXPLORER;
  }

  getDisplayText(): string {
    return "目录";
  }

  getIcon(): string {
    return "folder";
  }

  async onOpen(): Promise<void> {
    const el = this.contentEl;
    el.empty();
    el.addClass("gd-left-panel");
    el.addClass("gd-dock-explorer");
    renderLeftPanel(el, this.plugin);
    // 宽度交给 dock 自身，覆盖面板的固定宽度
    el.style.width = "";
    el.style.height = "100%";
    el.style.overflow = "auto";
    // dock 语境下 ✕ = 关掉本标签页（而非隐藏视图内嵌左栏）
    const close = el.querySelector(".gd-left-close") as HTMLElement | null;
    if (close) {
      close.onclick = () => {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_EXPLORER);
      };
    }
  }

  /** 配置变化后重绘 */
  async refreshPanel(): Promise<void> {
    await this.onOpen();
  }
}
