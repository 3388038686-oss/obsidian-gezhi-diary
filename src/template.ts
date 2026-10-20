import { moment } from "obsidian";

// moment 在 Obsidian 里是全局对象，类型上不可调用，这里做一次放宽
const m = moment as unknown as (input?: string, format?: string) => any;

/**
 * 极简模板渲染：不依赖 Templater 插件，自己替换常见变量。
 * 支持：
 *   <% tp.date.now("YYYY-MM-DD") %> / tp.date.now("ddd", -1)
 *   <% tp.date.today(...) %> / tp.date.tomorrow(...) / tp.date.yesterday(...)
 *   <% tp.file.title %>
 *   {{date}} {{date:YYYY-MM-DD}} {{time}} {{time:HH:mm}} {{title}}
 */
export function renderTemplate(text: string, date: string): string {
  if (!text) return text;
  const base = m(date, "YYYY-MM-DD");
  const DAY = 86400000;

  // <%. tp.date.xxx("fmt", offset) .%>
  let out = text.replace(
    /<%[-_]?\s*tp\.date\.(now|today|tomorrow|yesterday)\(\s*(?:["']([^"']*)["'])?\s*(?:,\s*(-?\d+))?[^)]*\)\s*[-_]?%>/g,
    (_m, kind: string, fmt?: string, offset?: string) => {
      let delta = kind === "tomorrow" ? 1 : kind === "yesterday" ? -1 : 0;
      if (offset) delta += Number(offset) || 0;
      return base.clone().add(delta, "day").format(fmt && fmt.trim() ? fmt : "YYYY-MM-DD");
    },
  );

  // <% tp.file.title %>
  out = out.replace(/<%[-_]?\s*tp\.file\.title\s*[-_]?%>/g, date);
  // <% tp.date.now() %> 无格式
  out = out.replace(/<%[-_]?\s*tp\.date\.now\(\s*\)\s*[-_]?%>/g, date);

  // {{date}} / {{date:fmt}} / {{time}} / {{time:fmt}} / {{title}}
  out = out.replace(/\{\{\s*(date|time|title)\s*(?::([^}]*))?\}\}/g, (_m, key: string, fmt?: string) => {
    if (key === "title") return date;
    const isTime = key === "time";
    const format = fmt && fmt.trim() ? fmt.trim() : isTime ? "HH:mm" : "YYYY-MM-DD";
    return m().format(format);
  });

  return out;
}

/** 模板文本里是否已经有 ## 小节 */
export function hasSections(text: string): boolean {
  return /^##\s+\S/m.test(text);
}

export const DAY_MS = 86400000;
