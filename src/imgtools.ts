/** 图片 <img> 标签工具：构建 / 解析 / 按名替换（兼容旧 ![[...]] 内链升级） */

export interface ImgAttrs {
  src: string;
  width?: number;
  height?: number;
  float?: "left" | "right" | "none";
  border?: string;
  radius?: number;
  shadow?: boolean;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildImgTag(a: ImgAttrs): string {
  const styles: string[] = [];
  if (a.float && a.float !== "none") styles.push(`float:${a.float}`);
  if (a.border && a.border !== "none") styles.push(`border:${a.border}`);
  if (a.radius) styles.push(`border-radius:${a.radius}px`);
  if (a.shadow) styles.push("box-shadow:0 2px 10px rgba(0,0,0,.18)");
  const style = styles.length ? ` style="${styles.join(";")}"` : "";
  const w = a.width ? ` width="${Math.round(a.width)}"` : "";
  const h = a.height ? ` height="${Math.round(a.height)}"` : "";
  return `<img src="${a.src}"${w}${h}${style}>`;
}

export function parseImgTag(tag: string): ImgAttrs | null {
  const m = /<img\s[^>]*src="([^"]+)"[^>]*>/.exec(tag);
  if (!m) return null;
  const w = /width="(\d+)"/.exec(tag)?.[1];
  const h = /height="(\d+)"/.exec(tag)?.[1];
  const fl = /float:\s*(left|right)/.exec(tag)?.[1];
  const br = /border:\s*([^;"]+)/.exec(tag)?.[1];
  const ra = /border-radius:\s*(\d+)px/.exec(tag)?.[1];
  const sh = /box-shadow/.test(tag);
  return {
    src: m[1],
    width: w ? +w : undefined,
    height: h ? +h : undefined,
    float: (fl as "left" | "right" | undefined) ?? "none",
    border: br,
    radius: ra ? +ra : undefined,
    shadow: sh,
  };
}

/** 按文件名替换 <img>（路径随意）；未命中则把旧 ![[名]] 内链升级为 <img> */
export function updateTagBySrc(data: string, src: string, a: ImgAttrs): string {
  const base = escRe((src.split(/[\\/]/).pop() ?? src).replace(/\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i, ""));
  const re = new RegExp(
    `<img\\s[^>]*src="(?:[^"]*/)?(${base}\\.(?:png|jpe?g|gif|webp|svg|bmp|avif))"[^>]*>`,
    "i"
  );
  if (re.test(data)) return data.replace(re, buildImgTag(a));
  const leg = new RegExp(`!\\[\\[((?:[^\\]|/]*/)*)(${base})(?:\\|[^\\]]*)?\\]\\]`, "i");
  if (leg.test(data))
    return data.replace(leg, (_m, dir: string, hit: string) =>
      buildImgTag({ ...a, src: `${dir}${hit}` })
    );
  return data;
}
