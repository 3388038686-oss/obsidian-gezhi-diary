export interface Section {
  /** 标题文字，如「今日事件」 */
  title: string;
  /** 标题行号（0 起） */
  startLine: number;
  /** 内容区间 [contentStart, contentEndExclusive) */
  contentStart: number;
  contentEndExclusive: number;
  /** 原始正文（已去掉首尾空行） */
  body: string;
}

export interface ParsedDay {
  /** 文件里的一级标题，如「2026-06-22」 */
  h1: string;
  /** `> 来自：xxx` 这类引言 */
  quote: string;
  /** frontmatter 原文（不含分隔线） */
  frontmatter: string;
  sections: Section[];
}

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function headingOf(line: string): { level: number; text: string } | null {
  const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
  if (!m) return null;
  return { level: m[1].length, text: m[2] };
}

/** 时间流标题：`14:30 分笔记`、`9:05` 等 */
export function isTimelineTitle(title: string): boolean {
  return /^\s*\d{1,2}\s*[:：]\s*\d{2}/.test(title);
}

/**
 * 去掉「光杆标题」：某个标题下面（直到同级或更高级标题前）没有任何正文，就整行删除。
 * 用于模板插入的时间流笔记，避免一堆空的 ### 今日事件。
 */
export function stripEmptyHeadings(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const keep: boolean[] = new Array(lines.length).fill(true);
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
  return lines
    .filter((_l, idx) => keep[idx])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 镜像：把 `### 今日事件` 这类子标题的正文，替换成当天同名格子的最新内容。
 * 这样在格子墙里改了字，时间流里对应卡片会跟着同步。
 */
export function mirrorSections(md: string, map: Record<string, string>): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
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
    if (live !== undefined) {
      const body = live.trim();
      if (body) out.push("", ...body.split("\n"), "");
    } else {
      out.push(...lines.slice(i + 1, j));
    }
    i = j;
  }
  return out.join("\n");
}

/** 去掉开头 frontmatter 与结尾空行，只留正文 */
function trimBlank(lines: string[], from: number, to: number): string {
  let a = from;
  let b = to;
  while (a < b && lines[a].trim() === "") a++;
  while (b > a && lines[b - 1].trim() === "") b--;
  return lines.slice(a, b).join("\n");
}

export function parseDay(text: string, level = 2): ParsedDay {
  const lines = splitLines(text);
  const result: ParsedDay = { h1: "", quote: "", frontmatter: "", sections: [] };

  // frontmatter
  let bodyStart = 0;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        result.frontmatter = lines.slice(1, i).join("\n");
        bodyStart = i + 1;
        break;
      }
    }
  }

  // 收集所有标题
  const headings: { line: number; level: number; text: string }[] = [];
  for (let i = bodyStart; i < lines.length; i++) {
    const h = headingOf(lines[i]);
    if (h) headings.push({ line: i, level: h.level, text: h.text });
  }

  // 一级标题与引言
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

  // 二级标题切格
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
      body: trimBlank(lines, cur.line + 1, end),
    });
  }
  return result;
}

/** 替换（或追加）同名小节内容，返回新全文 */
export function replaceSectionBody(text: string, title: string, newBody: string, level = 2): string {
  const lines = splitLines(text);
  const parsed = parseDay(text, level);
  const target = parsed.sections.find((s) => s.title === title);
  const clean = newBody.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");

  if (!target) {
    const hashes = "#".repeat(level);
    let out = text.replace(/\s+$/, "");
    out += `\n\n${hashes} ${title}\n\n${clean}\n`;
    return out;
  }

  const before = lines.slice(0, target.contentStart);
  const after = lines.slice(target.contentEndExclusive);
  const middle = clean ? ["", ...clean.split("\n"), ""] : [""];
  return [...before, ...middle, ...after].join("\n");
}

/** 在文件末尾追加一个新小节 */
export function appendSection(text: string, title: string, body = "", level = 2): string {
  const hashes = "#".repeat(level);
  let out = text.replace(/\s+$/, "");
  out += `\n\n${hashes} ${title}\n`;
  if (body.trim()) out += `\n${body.trim()}\n`;
  return out + "\n";
}

/**
 * 拖拽换位：把 fromTitle 那一整块（标题行到下一标题前的原始行）剪切，
 * 插到 toTitle 之前或之后。块内内容逐字保留，只调整顺序。
 */
export function reorderSection(
  text: string,
  fromTitle: string,
  toTitle: string,
  placeBefore: boolean,
  level = 2
): string {
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
    lines: lines.slice(s.startLine, i + 1 < n ? parsed.sections[i + 1].startLine : lines.length),
  }));
  const head = lines.slice(0, parsed.sections[0].startLine);

  const [moved] = items.splice(from, 1);
  // from 在 to 之前时，删除后 to 的下标左移一位
  let idx = items.findIndex((it) => it.title === toTitle);
  if (idx < 0) return text;
  if (!placeBefore) idx += 1;
  items.splice(idx, 0, moved);

  const out = [...head, ...items.flatMap((it) => it.lines)].join("\n");
  return out === text ? text : out;
}

/**
 * 回车 = 新段落：把单个换行升级为空行分段，这样阅读视图里直接分行，
 * 不用手动补空格。规则保守，不碰：
 *  - 代码块内部
 *  - 列表项之间（- a / - b 之间不插）
 *  - 行尾已有两个空格或反斜杠（本来就是硬换行）
 *  - 标题、引用、表格行
 * 幂等：已有空行的地方不会再插。
 */
export function paragraphsFromSoftBreaks(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const out: string[] = [];
  let inFence = false;

  const isListItem = (s: string) => /^\s*([-*+]|\d+[.)])\s+\S/.test(s);
  const isStructural = (s: string) => /^\s*(#{1,6}\s|>|---\s*$|\|)/.test(s);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    out.push(line);
    const next = i + 1 < lines.length ? lines[i + 1] : undefined;
    if (inFence || next === undefined) continue;
    if (line.trim() === "" || next.trim() === "") continue;
    if (/ {2}$/.test(line) || /\\$/.test(line)) continue;
    if (isListItem(line) || isListItem(next)) continue;
    if (isStructural(line) || isStructural(next)) continue;
    out.push("");
  }
  return out.join("\n");
}

/** 供设置页预览：把 md 粗略转纯文本 */
export function plainText(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
