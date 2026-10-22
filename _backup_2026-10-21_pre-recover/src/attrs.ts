/**
 * 中英双语正文属性 → YAML frontmatter 回填
 *
 * 规则（按用户要求）：
 * 1. 只认正文里**明确写了**的属性行，形如 `标签：生活` / `tag: life`（中英文冒号都行）。
 * 2. 正文没写的属性，YAML 里原有值一律不动（包括 Templater 生成的日期、合集）。
 * 3. 属性名中英互通：标签 = tag、标题 = title ……
 */

export type AttrKey =
  | "title"
  | "content"
  | "date"
  | "usage"
  | "rating"
  | "tag"
  | "url"
  | "collection";

/** 中文名 / 英文名 → 标准键 */
const ALIASES: Record<string, AttrKey> = {
  // 标题
  标题: "title",
  题目: "title",
  title: "title",
  // 内容
  内容: "content",
  content: "content",
  // 日期
  日期: "date",
  时间: "date",
  date: "date",
  // 用途
  用途: "usage",
  usage: "usage",
  // 评价
  评价: "rating",
  评分: "rating",
  rating: "rating",
  // 标签
  标签: "tag",
  tag: "tag",
  tags: "tag",
  // 网址
  网址: "url",
  链接: "url",
  url: "url",
  // 合集
  合集: "collection",
  合辑: "collection",
  collection: "collection",
};

/** 标准键的默认写入形式（YAML 里没有该属性时用它） */
const CANON: Record<AttrKey, string> = {
  title: "title",
  content: "content",
  date: "date",
  usage: "usage",
  rating: "rating",
  tag: "tag",
  url: "url",
  collection: "collection",
};

const ORDER: AttrKey[] = ["title", "content", "date", "usage", "rating", "tag", "url", "collection"];

function keyOf(raw: string): AttrKey | null {
  const k = raw.trim();
  if (!k) return null;
  const direct = ALIASES[k] ?? ALIASES[k.toLowerCase()];
  return direct ?? null;
}

/** 拆出 frontmatter 与正文 */
function splitFrontmatter(text: string): { fm: string[] | null; body: string } {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { fm: null, body: text };
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      return { fm: lines.slice(1, i), body: lines.slice(i + 1).join("\n") };
    }
  }
  return { fm: null, body: text };
}

/**
 * 扫描正文里的属性行，返回标准键 → 值。
 * 容错：允许 `- 标签：x`、`**标签**：x`、`> 标签:x`、`### 标签：x` 等写法；
 * 代码块内不扫描；同名属性以最后一次出现为准。
 */
export function scanBodyAttrs(text: string): Map<AttrKey, string> {
  const out = new Map<AttrKey, string>();
  const { body } = splitFrontmatter(text);
  const lines = body.split(/\r?\n/);
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // 去掉常见前缀：列表符、引用符、粗体、标题井号
    let s = line
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/^\s*>\s*/, "")
      .replace(/^\s*#{1,6}\s*/, "")
      .replace(/\*\*/g, "")
      .trim();

    const m = /^([^\s：:]{1,8})\s*[：:]\s*(.+)$/.exec(s);
    if (!m) continue;
    const key = keyOf(m[1]);
    if (!key) continue;
    let value = m[2].trim();
    // 去掉行尾多余空白与包裹的引号
    value = value.replace(/^["'「『]/, "").replace(/["'」』]$/, "").trim();
    if (!value) continue; // 空值不算写入
    out.set(key, value);
  }
  return out;
}

function yamlValue(v: string): string {
  const needsQuote = /[:#]/.test(v) || /^[\s"']/.test(v) || /\s$/.test(v) || v === "";
  if (!needsQuote) return v;
  return `"${v.replace(/"/g, '\\"')}"`;
}

/**
 * 把正文属性合并进 YAML：
 * - YAML 已有同名键（中文或英文写法之一）→ 原地更新该行的值，保留它原来的写法；
 * - YAML 没有 → 用标准英文键追加到 frontmatter 末尾；
 * - 正文没提到的键 → 一个字节都不动。
 */
export function syncAttrsToFrontmatter(text: string, attrs: Map<AttrKey, string>): string {
  if (!attrs.size) return text;
  const { fm, body } = splitFrontmatter(text);
  const fmLines = fm ? [...fm] : [];
  const handled = new Set<AttrKey>();

  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    const m = /^(\s*)([^\s:：][^:：]*?)\s*[：:]\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = keyOf(m[2]);
    if (!key || !attrs.has(key)) continue;
    const value = attrs.get(key) as string;
    fmLines[i] = `${m[1]}${m[2]}: ${yamlValue(value)}`;
    handled.add(key);
  }

  for (const key of ORDER) {
    if (!attrs.has(key) || handled.has(key)) continue;
    fmLines.push(`${CANON[key]}: ${yamlValue(attrs.get(key) as string)}`);
  }

  const head = ["---", ...fmLines, "---"].join("\n");
  const tail = body.replace(/^\n+/, "");
  return tail ? `${head}\n${tail}` : `${head}\n`;
}

/** 一步到位：扫描正文 → 回填 YAML，返回新全文 */
export function applyBodyAttrs(text: string): string {
  const attrs = scanBodyAttrs(text);
  if (!attrs.size) return text;
  return syncAttrsToFrontmatter(text, attrs);
}
