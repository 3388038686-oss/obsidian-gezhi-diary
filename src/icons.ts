/** Lucide 风格内联 SVG（stroke 1.5，灰随主题，悬停用 currentColor 变主色） */
const SVG_ATTR = `xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;

export const ICONS: Record<string, string> = {
  palette: `<svg ${SVG_ATTR}><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.83-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6.01 17.46 2 12 2z"/><circle cx="13.5" cy="6.5" r=".7"/><circle cx="17.5" cy="10.5" r=".7"/><circle cx="8.5" cy="7.5" r=".7"/><circle cx="6.5" cy="12.5" r=".7"/></svg>`,
  image: `<svg ${SVG_ATTR}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/></svg>`,
  paperclip: `<svg ${SVG_ATTR}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
  mic: `<svg ${SVG_ATTR}><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>`,
  plus: `<svg ${SVG_ATTR}><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  undo: `<svg ${SVG_ATTR}><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`,
  trash: `<svg ${SVG_ATTR}><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  calendar: `<svg ${SVG_ATTR}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>`,
  x: `<svg ${SVG_ATTR}><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

/** 往元素里放一个线条图标（替换其内容），保留调用方挂的 class/事件 */
export function elIcon(el: HTMLElement, name: keyof typeof ICONS | string): void {
  el.innerHTML = ICONS[name] ?? "";
}
