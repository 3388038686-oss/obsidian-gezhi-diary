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
}
