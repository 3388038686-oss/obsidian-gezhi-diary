import { weekdayCn } from "./store";

/** 年：浅蓝 / 月：浅紫 / 日：浅橙 —— 全局统一配色 */
export function appendColoredDate(
  parent: HTMLElement,
  dateStr: string,
  opts: { year?: boolean; weekday?: boolean; cls?: string } = {}
): HTMLElement {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wrap = parent.createEl("span", {
    cls: "gd-cdate" + (opts.cls ? " " + opts.cls : ""),
  });
  if (opts.year !== false) {
    wrap.createEl("span", { text: String(y), cls: "gd-cy" });
    wrap.createEl("span", { text: "year", cls: "gd-csep" });
  }
  wrap.createEl("span", { text: String(m).padStart(2, "0"), cls: "gd-cm" });
  wrap.createEl("span", { text: "month", cls: "gd-csep" });
  wrap.createEl("span", { text: String(d).padStart(2, "0"), cls: "gd-cd" });
  wrap.createEl("span", { text: "day", cls: "gd-csep" });
  if (opts.weekday) {
    wrap.createEl("span", { text: " " + weekdayCn(dateStr), cls: "gd-cweek" });
  }
  return wrap;
}

/** 「2026年8月」 */
export function appendColoredMonth(parent: HTMLElement, y: number, m: number): HTMLElement {
  const wrap = parent.createEl("span", { cls: "gd-cdate" });
  wrap.createEl("span", { text: String(y), cls: "gd-cy" });
  wrap.createEl("span", { text: "year", cls: "gd-csep" });
  wrap.createEl("span", { text: String(m).padStart(2, "0"), cls: "gd-cm" });
  wrap.createEl("span", { text: "month", cls: "gd-csep" });
  return wrap;
}
