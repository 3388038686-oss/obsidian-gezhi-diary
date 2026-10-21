export interface DiaryTemplate {
  name: string;
  /** 格子标题（对应 md 里的二级标题） */
  titles: string[];
}

export interface GridDiarySettings {
  rootFolder: string;
  background: string;
  cardOpacity: number;
  fontFamily: string;
  /** 界面字重（300 细 / 400 常规） */
  fontWeight: number;
  /** 自定义 CSS，保存后立即全局生效 */
  customCss: string;
  templates: DiaryTemplate[];
  defaultTemplate: string;
  showEmptyHint: boolean;
  columns: number;
  /** 格子内容区固定高度（px） */
  cellHeight: number;
  splitRatio: number;
  /** 右侧列表的连线样式：vertical = 标准垂直；polyline = 折线星图 */
  listLineStyle: "vertical" | "polyline";
  /** 永久删除时不再弹确认（元数据偏好） */
  skipPermanentConfirm: boolean;
  /** 自定义导入字体的 base64 dataURL（.ttf/.otf） */
  fontDataUrl: string;
  fontFileName: string;
  /** .obsidian/fonts 下的字体文件名（大字体备选方案） */
  fontDirFile: string;
  /** 每次打开视图时，若当天文件缺失则按默认模板自动创建 */
  autoCreateToday: boolean;
  /** 新建日记时使用的模板文件路径（可留空；留空则用内置模板） */
  dailyTemplatePath: string;
  // —— 左侧目录面板 ——
  /** 左侧面板宽度（px） */
  leftWidth: number;
  /** 显示「最近文件」上半区 */
  showRecentFiles: boolean;
  leftPanelMigrated?: boolean;
  /** 文件夹树显示折线连接线 */
  showTreeLines: boolean;
  /** 文件图标（emoji 或留空） */
  iconFile: string;
  /** 文件夹图标（收起） */
  iconFolder: string;
  /** 文件夹图标（展开） */
  iconFolderOpen: string;
  /** 文件夹默认展开 */
  treeDefaultOpen: boolean;
  /** 悬停高亮 + 流星滑过效果 */
  hoverGlow: boolean;
  /** 左侧面板整体显示 */
  showLeftPanel: boolean;
  // —— 布局与字号（不与 Obsidian 官方全局设置冲突）——
  /** 插件正文字号（px），只影响格间日记自己的界面 */
  pluginFontSize: number;
  /** 内容区左右边距（px） */
  contentPad: number;
  /** 格子间距（px） */
  gridGap: number;
  /** 右侧原生 dock 宽度（px）；0 = 不接管 */
  rightDockWidth: number;
  /** 布局模板（一键套用的尺寸组合） */
  layoutPresets: LayoutPreset[];
  /** 当前激活的布局模板名（仅记录，不强制） */
  activePreset?: string;
  /** 布局迁移标记（旧 240 → 190 只跑一次） */
  layoutMigrated?: boolean;
}

export interface LayoutPreset {
  name: string;
  leftWidth: number;
  contentPad: number;
  gridGap: number;
  columns: number;
  cellHeight: number;
  rightDockWidth: number;
  pluginFontSize: number;
}
