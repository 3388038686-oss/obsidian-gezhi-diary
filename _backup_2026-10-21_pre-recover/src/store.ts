import { App, Notice, TFile, normalizePath } from "obsidian";
import { ParsedDay, isTimelineTitle, parseDay, paragraphsFromSoftBreaks, plainText, reorderSection, replaceSectionBody, retitleDay } from "./sections";
import { hasSections } from "./template";

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function todayStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return todayStr(dt);
}

export function weekdayCn(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()];
}

export interface DayCell {
  title: string;
  preview: string;
  line: number;
  /** 该节正文长度（字符数，去空白） */
  size: number;
  hasContent: boolean;
  /** 原始正文（含 ![[图片]] 等标记），用于渲染 */
  body: string;
  /** 时间流笔记的时间标签（如 14:30），普通格子为空 */
  time?: string;
}

export interface DaySnapshot {
  date: string;
  file: TFile | null;
  h1: string;
  quote: string;
  /** 九宫格/模板格子 */
  cells: DayCell[];
  /** 带时间戳的追加笔记，单独展示 */
  timeline: DayCell[];
}

export class DayStore {
  constructor(private app: App, private getRoot: () => string) {}

  root(): string {
    return normalizePath(this.getRoot().trim() || "日记");
  }

  pathFor(date: string): string {
    return normalizePath(`${this.root()}/${date}.md`);
  }

  fileFor(date: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(this.pathFor(date));
    // 只存在于 vault 里的文件才有 path 属性；用鸭子判断兼容测试与未来 API 变更
    return f && typeof (f as TFile).path === "string" ? (f as TFile) : null;
  }

  async ensureFolder(): Promise<void> {
    const root = this.root();
    if (!this.app.vault.getAbstractFileByPath(root)) {
      try {
        await this.app.vault.createFolder(root);
      } catch (e) {
        /* already exists */
      }
    }
  }

  async createDayFile(date: string, templates: string[], templateText?: string): Promise<TFile> {
    await this.ensureFolder();
    const tpl = (templateText ?? "").trim();
    if (tpl) {
      // 有模板文件：优先用模板内容，日期变量已由调用方渲染
      let body = tpl;
      if (!hasSections(body)) {
        // 模板里没有 ## 小节：补上默认格子，保证能显示成格子
        const extra: string[] = [];
        for (const t of templates) extra.push(`## ${t}`, "", "");
        body = body.replace(/\s*$/, "") + "\n\n" + extra.join("\n");
      }
      return await this.app.vault.create(this.pathFor(date), body.replace(/\s*$/, "") + "\n");
    }
    const parts: string[] = [
      "---",
      `date: ${date}`,
      "source: 格间日记",
      "---",
      "",
      `# ${date}`,
      "",
    ];
    for (const t of templates) {
      parts.push(`## ${t}`, "", "");
    }
    return await this.app.vault.create(this.pathFor(date), parts.join("\n"));
  }

  async readDay(date: string): Promise<DaySnapshot> {
    const file = this.fileFor(date);
    if (!file) return { date, file: null, h1: "", quote: "", cells: [], timeline: [] };
    const text = await this.app.vault.cachedRead(file);
    return this.buildSnapshot(date, file, text);
  }

  buildSnapshot(date: string, file: TFile | null, text: string): DaySnapshot {
    const parsed: ParsedDay = parseDay(text, 2);
    const cells: DayCell[] = [];
    const timeline: DayCell[] = [];
    for (const s of parsed.sections) {
      const plain = plainText(s.body);
      const cell: DayCell = {
        title: s.title,
        preview: plain.slice(0, 220),
        line: s.startLine,
        size: plain.replace(/\s/g, "").length,
        hasContent: plain.length > 0 || /!\[\[/.test(s.body),
        body: s.body,
      };
      if (isTimelineTitle(s.title)) {
        const m = /^\s*(\d{1,2}\s*[:：]\s*\d{2})/.exec(s.title);
        cell.time = m ? m[1].replace("：", ":") : s.title;
        timeline.push(cell);
      } else {
        cells.push(cell);
      }
    }
    return { date, file, h1: parsed.h1, quote: parsed.quote, cells, timeline };
  }

  /** 追加一条时间流笔记：`## HH:mm 分笔记` + 正文 */
  async appendTimelineNote(date: string, body: string, label = "note"): Promise<boolean> {
    let file = this.fileFor(date);
    if (!file) {
      const titles = this.getDefaultTitles ? this.getDefaultTitles() : [];
      file = await this.createDayFile(date, titles);
    }
    const now = new Date();
    const hh = pad2(now.getHours());
    const mm = pad2(now.getMinutes());
    const title = `${hh}:${mm} ${label}`;
    await this.app.vault.process(file, (data) => {
      const base = data.replace(/\s*$/, "");
      return `${base}\n\n## ${title}\n\n${body.replace(/\s*$/, "")}\n`;
    });
    return true;
  }

  /** 修改某张图片在当天文件里的显示宽度（写回 ![[name|宽度]] 语法） */
  async setImageWidth(date: string, name: string, width: number): Promise<boolean> {
    const file = this.fileFor(date);
    if (!file) return false;
    const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const esc = escRe(name);
    const escBase = escRe(name.replace(/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i, ""));
    // 匹配 ![[name]] / ![[name|400]] / ![[sub/name|400]]
    const re = new RegExp(`!\\[\\[((?:[^\\]|/]*/)*)(${esc}|${escBase})(?:\\|[^\\]]*)?\\]\\]`, "i");
    let changed = false;
    await this.app.vault.process(file, (data) => {
      if (!re.test(data)) return data;
      changed = true;
      return data.replace(re, (_m, dir: string, hit: string) => `![[${dir}${hit}|${Math.round(width)}]]`);
    });
    return changed;
  }

  /** 由插件注入：取当前模板的格子标题，用于新建当天文件 */
  getDefaultTitles: (() => string[]) | null = null;

  /** 用模板补齐缺失的小节，返回新增标题 */
  async fillWithTemplate(date: string, titles: string[]): Promise<string[]> {
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
  async writeSection(date: string, title: string, body: string): Promise<boolean> {
    const file = this.fileFor(date);
    if (!file) {
      new Notice("No file for this day");
      return false;
    }
    const body2 = paragraphsFromSoftBreaks(body);
    await this.app.vault.process(file, (data) => replaceSectionBody(data, title, body2));
    return true;
  }

  /** 无损更换模板：保留每一节正文，未知标题归入「未分类内容」 */
  async retitleTemplate(date: string, titles: string[]): Promise<{ kept: number; orphans: string[] } | null> {
    const file = this.fileFor(date);
    if (!file) {
      new Notice("No file for this day");
      return null;
    }
    let result: { kept: number; orphans: string[] } = { kept: 0, orphans: [] };
    await this.app.vault.process(file, (data) => {
      const r = retitleDay(data, titles, 2);
      result = { kept: r.kept, orphans: r.orphans };
      return r.text;
    });
    return result;
  }

  /** 新增一个格子 */
  async addSection(date: string, title: string): Promise<boolean> {
    let file = this.fileFor(date);
    if (!file) {
      await this.ensureFolder();
      file = await this.app.vault.create(
        this.pathFor(date),
        `---\ndate: ${date}\nsource: 格间日记\n---\n\n# ${date}\n`
      );
    }
    const text = await this.app.vault.cachedRead(file);
    if (parseDay(text, 2).sections.some((s) => s.title === title)) {
      new Notice("A cell with this name already exists");
      return false;
    }
    await this.app.vault.process(file, (data) => replaceSectionBody(data, title, ""));
    return true;
  }

  /** 拖拽换位：把某节移到另一节之前/之后 */
  async moveSection(
    date: string,
    fromTitle: string,
    toTitle: string,
    placeBefore: boolean
  ): Promise<boolean> {
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
  async deleteSection(
    date: string,
    title: string
  ): Promise<{ title: string; body: string; index: number } | null> {
    const file = this.fileFor(date);
    if (!file) return null;
    const box: { v: { title: string; body: string; index: number } | null } = { v: null };
    await this.app.vault.process(file, (data) => {
      const parsed = parseDay(data, 2);
      const idx = parsed.sections.findIndex((s) => s.title === title);
      if (idx < 0) return data;
      const lines = data.replace(/\r\n/g, "\n").split("\n");
      const s = parsed.sections[idx];
      box.v = { title, body: s.body ?? "", index: idx };
      let end = s.contentEndExclusive;
      // 顺带吃掉标题后的空行，避免留下大片空白
      while (end < lines.length && lines[end].trim() === "") end++;
      lines.splice(s.startLine, end - s.startLine);
      return lines.join("\n").replace(/\n{3,}/g, "\n\n");
    });
    return box.v;
  }

  /** 撤销删除：把内容插回原来的位置 */
  async restoreSection(date: string, title: string, body: string, index: number): Promise<boolean> {
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
}
