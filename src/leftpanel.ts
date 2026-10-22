import { Menu, Notice, TAbstractFile, TFile, TFolder } from "obsidian";
import type GridDiaryPlugin from "./main";

/** 不展示的目录 */
const SKIP = new Set([".obsidian", ".trash", ".git", ".github", "node_modules"]);

/** 折叠状态（按路径记忆，跨重渲染保留） */
const openState = new Map<string, boolean>();

const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;

/** 搜索词（跨重渲染保留） */
let filterText = "";

/** 默认图标判定（与设置默认值一致时改用内联 SVG；用户自定义字符照旧） */
const isDefIcon = (kind: "file" | "folder", v: string): boolean =>
  !v || v === (kind === "file" ? "📄" : "📁");

/** 行装饰：缩进变量 + 流星层 */
function decorate(row: HTMLElement, depth: number, hoverGlow: boolean): void {
  row.style.setProperty("--indent", `${depth * 8}px`);
  if (hoverGlow) row.createDiv({ cls: "gd-meteor" });
}

/** 文件行折线：CSS 伪元素画一条折线 + 圆点（像 file-tree-alternative 的连接线） */
function polyline(row: HTMLElement): void {
  row.createDiv({ cls: "gd-row-line" });
}

/** 递归统计后代文件数（含所有扩展名） */
function countFiles(item: TAbstractFile): number {
  if (item instanceof TFile) return 1;
  if (item instanceof TFolder) {
    let n = 0;
    for (const c of item.children) n += countFiles(c);
    return n;
  }
  return 0;
}

/** 左侧目录面板：vault 根 → 文件夹树（仿 file-tree-alternative） */
export function renderLeftPanel(el: HTMLElement, plugin: GridDiaryPlugin): void {
  const s = plugin.settings;
  el.empty();
  el.style.width = `${Math.max(150, Math.min(480, s.leftWidth || 240))}px`;
  /** 默认图标（与设置默认值一致时改用内联 SVG，用户自定义的照旧用字符） */
  const isDefIcon = (kind: "file" | "folder", v: string): boolean =>
    !v || v === (kind === "file" ? "📄" : "📁");
  el.style.setProperty("--gd-icon-file", `"${s.iconFile || ""}"`);
  el.style.setProperty("--gd-icon-folder", `"${s.iconFolder || ""}"`);
  el.style.setProperty("--gd-icon-folder-open", `"${s.iconFolderOpen || ""}"`);
  el.toggleClass("gd-with-lines", s.showTreeLines);
  el.toggleClass("gd-hover-glow", s.hoverGlow);

  renderToolbar(el, plugin);
  if (s.showRecentFiles) renderRecents(el, plugin);
  renderTree(el, plugin);
  applyFilter(el);
}

/* ------------------------------------------------------------------ 工具栏：关闭 / 搜索 / 排序 / 全展开·全收起 */

function renderToolbar(el: HTMLElement, plugin: GridDiaryPlugin): void {
  const s = plugin.settings;
  const bar = el.createDiv({ cls: "gd-left-toolbar" });
  bar.createSpan({ cls: "gd-left-toolbar-title", text: "目录" });
  const close = bar.createEl("button", { cls: "gd-left-mini gd-left-close", text: "✕" });
  close.setAttribute("aria-label", "关闭目录面板");
  close.setAttribute("title", "关闭目录面板");
  close.addEventListener("click", async () => {
    s.showLeftPanel = false;
    await plugin.saveSettings();
    plugin.refreshViews();
  });

  const bar2 = el.createDiv({ cls: "gd-left-toolbar gd-left-toolbar-2" });
  const search = bar2.createEl("input", { cls: "gd-left-search", type: "text" });
  search.placeholder = "搜索文件…";
  search.value = filterText;
  search.addEventListener("input", () => {
    filterText = search.value;
    applyFilter(el);
  });

  const sort = bar2.createEl("select", { cls: "gd-left-sort" });
  ([["folders", "文件夹优先"], ["name", "名称"], ["mtime", "时间"]] as const).forEach(([v, t]) => {
    const o = sort.createEl("option", { text: t });
    o.value = v;
    if (v === s.treeSort) o.selected = true;
  });
  sort.addEventListener("change", () => {
    void (async () => {
      s.treeSort = sort.value as typeof s.treeSort;
      await plugin.saveSettings();
      renderLeftPanel(el, plugin);
    })();
  });

  const expand = bar2.createEl("button", { cls: "gd-left-mini", text: "⊞" });
  expand.setAttribute("aria-label", "全部展开");
  expand.setAttribute("title", "全部展开");
  expand.addEventListener("click", () => {
    plugin.app.vault.getAllLoadedFiles().forEach((f) => {
      if (f instanceof TFolder) openState.set(f.path, true);
    });
    openState.set("__vault__", true);
    renderLeftPanel(el, plugin);
  });
  const collapse = bar2.createEl("button", { cls: "gd-left-mini", text: "⊟" });
  collapse.setAttribute("aria-label", "全部收起");
  collapse.setAttribute("title", "全部收起");
  collapse.addEventListener("click", () => {
    plugin.app.vault.getAllLoadedFiles().forEach((f) => {
      if (f instanceof TFolder) openState.set(f.path, false);
    });
    openState.set("__vault__", false);
    renderLeftPanel(el, plugin);
  });
}

/** 搜索过滤：文件/最近行按名字；文件夹行按「子树是否命中」保留 */
function applyFilter(el: HTMLElement): void {
  const q = filterText.trim().toLowerCase();
  const leaves = Array.from(el.querySelectorAll<HTMLElement>(".gd-tree-file, .gd-left-row"));
  const folders = Array.from(el.querySelectorAll<HTMLElement>(".gd-tree-folder"));
  if (!q) {
    leaves.forEach((r) => (r.style.display = ""));
    folders.forEach((r) => (r.style.display = ""));
    return;
  }
  const leafHit = (r: HTMLElement): boolean => (r.dataset.search || r.textContent || "").toLowerCase().includes(q);
  const leafFlag = new Map<HTMLElement, boolean>();
  leaves.forEach((r) => leafFlag.set(r, leafHit(r)));
  // 文件夹：从后往前（子先于父）判子树
  const flag = new Map<HTMLElement, boolean>();
  [...folders].reverse().forEach((r) => {
    const own = (r.dataset.search || r.textContent || "").toLowerCase().includes(q);
    const kids = r.nextElementSibling as HTMLElement | null;
    const sub = kids ? Array.from(kids.querySelectorAll<HTMLElement>(".gd-tree-file, .gd-tree-folder")).some((k) => flag.get(k) ?? false) : false;
    flag.set(r, own || sub);
  });
  leaves.forEach((r) => (r.style.display = leafFlag.get(r) ? "" : "none"));
  folders.forEach((r) => (r.style.display = flag.get(r) ? "" : "none"));
}

/** 日期文件 → 切换到九宫格视图；其它文件 → 后台开标签，焦点留在原地不跳转 */
export function openSmart(plugin: GridDiaryPlugin, file: TFile): void {
  const m = DATE_RE.exec(file.name);
  if (m && plugin.store.fileFor(m[1])) {
    void plugin.activateView(m[1]);
    return;
  }
  // 记住当前视图，开完标签把焦点还回去——点了不跑
  const current = plugin.app.workspace.activeLeaf;
  void plugin.app.workspace
    .getLeaf("tab")
    .openFile(file)
    .then(() => {
      if (current) plugin.app.workspace.setActiveLeaf(current, { focus: true });
    });
}

/* ------------------------------------------------------------------ 右键菜单 */

function fileMenu(menu: Menu, plugin: GridDiaryPlugin, file: TFile): void {
  menu.addItem((item) =>
    item
      .setTitle("在新标签页打开")
      .setIcon("file-input")
      .onClick(() => void plugin.app.workspace.getLeaf("tab").openFile(file))
  );
  menu.addItem((item) =>
    item
      .setTitle("在新窗口打开")
      .setIcon("box")
      .onClick(() => {
        try {
          const leaf = plugin.app.workspace.openPopoutLeaf();
          void leaf?.openFile(file);
        } catch {
          new Notice("新窗口需要桌面版 Obsidian");
        }
      })
  );
  menu.addItem((item) =>
    item
      .setTitle("创建副本")
      .setIcon("copy")
      .onClick(() => {
        const dir = file.parent?.path ? file.parent.path + "/" : "";
        const m = /^(.*?)(\.[^.]+)$/.exec(file.name);
        const base = m ? m[1] : file.name;
        const ext = m ? m[2] : "";
        let i = 1;
        const make = () => `${dir}${base} ${i}${ext}`;
        const path = i === 1 && file.name.includes(" 1") ? make() : `${dir}${base} 1${ext}`;
        void plugin.app.vault
          .create(path, "")
          .then(async (nf) => {
            const data = await plugin.app.vault.read(file);
            await plugin.app.vault.modify(nf, data);
          })
          .catch(() => new Notice("副本已存在"));
      })
  );
  menu.addItem((item) =>
    item
      .setTitle("移动到…")
      .setIcon("folder-input")
      .onClick(() => {
        const target = window.prompt("移动到（目录路径，留空=根目录）", file.parent?.path ?? "");
        if (target === null) return;
        const newPath = `${target.replace(/\/+$/, "") ? target.replace(/\/+$/, "") + "/" : ""}${file.name}`;
        void plugin.app.fileManager.renameFile(file, newPath).catch(() => new Notice("移动失败：路径无效"));
      })
  );
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("重命名")
      .setIcon("pencil")
      .onClick(() => {
        const next = window.prompt("重命名", file.basename);
        if (next === null || !next.trim() || next.trim() === file.basename) return;
        void plugin.app.fileManager.renameFile(file, `${file.parent?.path ? file.parent.path + "/" : ""}${next.trim()}.${file.extension}`);
      })
  );
  menu.addItem((item) =>
    item
      .setTitle("删除")
      .setIcon("trash")
      .onClick(async () => {
        if (!window.confirm(`把「${file.path}」移到回收站？`)) return;
        try {
          await plugin.app.vault.trash(file, true);
        } catch {
          try {
            await plugin.app.vault.trash(file, false);
          } catch (e) {
            new Notice(`删除失败：${String(e)}`);
          }
        }
      })
  );
  menu.addItem((item) =>
    item
      .setTitle("复制路径")
      .setIcon("link")
      .onClick(() => {
        void navigator.clipboard.writeText(file.path);
        new Notice("路径已复制");
      })
  );
  // 让其它插件（Git / Iconize / Hover Editor 等）把它们的菜单项也挂上来
  menu.addSeparator();
  plugin.app.workspace.trigger("file-menu", menu, file, "grid-diary");
}

function folderMenu(menu: Menu, plugin: GridDiaryPlugin, folder: TFolder): void {
  menu.addItem((item) =>
    item
      .setTitle("新建笔记")
      .setIcon("file-plus")
      .onClick(() => {
        const name = window.prompt("新建笔记名称", "未命名");
        if (!name?.trim()) return;
        const path = `${folder.path ? folder.path + "/" : ""}${name.trim()}.md`;
        void plugin.app.vault.create(path, "").catch(() => new Notice("创建失败：文件已存在"));
      })
  );
  menu.addItem((item) =>
    item
      .setTitle("新建文件夹")
      .setIcon("folder-plus")
      .onClick(() => {
        const name = window.prompt("新建文件夹名称", "新文件夹");
        if (!name?.trim()) return;
        const path = `${folder.path ? folder.path + "/" : ""}${name.trim()}`;
        void plugin.app.vault.createFolder(path).catch(() => new Notice("创建失败：文件夹已存在"));
      })
  );
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("重命名")
      .setIcon("pencil")
      .onClick(() => {
        const next = window.prompt("重命名文件夹", folder.name);
        if (next === null || !next.trim() || next.trim() === folder.name) return;
        void plugin.app.fileManager.renameFile(folder, `${folder.parent?.path ? folder.parent.path + "/" : ""}${next.trim()}`);
      })
  );
  menu.addItem((item) =>
    item
      .setTitle("删除")
      .setIcon("trash")
      .onClick(async () => {
        if (!window.confirm(`把「${folder.path}」及其内容移到回收站？`)) return;
        try {
          await plugin.app.vault.trash(folder, true);
        } catch (e) {
          new Notice(`删除失败：${String(e)}`);
        }
      })
  );
  menu.addItem((item) =>
    item
      .setTitle("复制路径")
      .setIcon("link")
      .onClick(() => {
        void navigator.clipboard.writeText(folder.path);
        new Notice("路径已复制");
      })
  );
  menu.addSeparator();
  plugin.app.workspace.trigger("file-menu", menu, folder, "grid-diary");
}

/* ------------------------------------------------------------------ Recent files */

function renderRecents(el: HTMLElement, plugin: GridDiaryPlugin): void {
  const s = plugin.settings;
  const box = el.createDiv({ cls: "gd-left-section gd-left-recent" });
  const head = box.createDiv({ cls: "gd-left-head" });
  head.createSpan({ cls: "gd-left-title", text: "最近文件" });

  const files = plugin.app.vault
    .getMarkdownFiles()
    .slice()
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, 12);

  if (!files.length) {
    box.createDiv({ cls: "gd-left-empty", text: "还没有笔记" });
    return;
  }

  const list = box.createDiv({ cls: "gd-left-list" });
  for (const f of files) {
    const row = list.createDiv({ cls: "gd-left-row" });
    decorate(row, 0, s.hoverGlow);
    const isDiary = DATE_RE.test(f.name);
    if ((isDiary && f.basename === plugin.activeDate) || f.path === plugin.openFilePath) row.addClass("active");
    row.dataset.search = f.basename.toLowerCase();
    row.dataset.path = f.path;
    polyline(row);
    row.createSpan({ cls: "gd-row-icon gd-icon-file" + (isDefIcon("file", s.iconFile) ? " gd-icon-svg gd-ico-file" : "") });
    const name = row.createSpan({ cls: "gd-row-name", text: f.basename });
    name.setAttribute("title", f.path);
    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSmart(plugin, f);
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const menu = new Menu();
      fileMenu(menu, plugin, f);
      menu.showAtMouseEvent(e);
    });
  }
}

/* ------------------------------------------------------------------ 文件夹树 */

function renderTree(el: HTMLElement, plugin: GridDiaryPlugin): void {
  const box = el.createDiv({ cls: "gd-left-section gd-left-tree" });
  const head = box.createDiv({ cls: "gd-left-head" });
  head.createSpan({ cls: "gd-left-title", text: "文件夹" });

  const root = plugin.app.vault.getRoot();

  // vault 根行（仿 file-tree-alternative：根名称 + 总数）
  const rootRow = box.createDiv({ cls: "gd-tree-row gd-tree-folder gd-vault-row" });
  decorate(rootRow, 0, plugin.settings.hoverGlow);
  const rootOpen = openState.has("__vault__") ? (openState.get("__vault__") as boolean) : true;
  if (rootOpen) rootRow.addClass("is-open");
  rootRow.createSpan({ cls: "gd-row-icon gd-icon-folder" + (isDefIcon("folder", plugin.settings.iconFolder) ? " gd-icon-svg gd-ico-folder" : "") });
  rootRow.createSpan({ cls: "gd-row-name", text: plugin.app.vault.getName() });
  rootRow.createSpan({ cls: "gd-tree-caret", text: rootOpen ? "▾" : "▸" });
  rootRow.createSpan({ cls: "gd-tree-count", text: String(countFiles(root)) });

  const kids = box.createDiv({ cls: "gd-tree-kids" });
  if (!rootOpen) kids.addClass("is-collapsed");
  renderFolderChildren(kids, plugin, root, 1);

  rootRow.addEventListener("click", () => {
    const next = !(openState.has("__vault__") ? openState.get("__vault__") : true);
    openState.set("__vault__", next);
    rootRow.toggleClass("is-open", next);
    kids.toggleClass("is-collapsed", !next);
    const caret = rootRow.querySelector(".gd-tree-caret");
    if (caret) caret.setText(next ? "▾" : "▸");
  });

  if (!kids.childElementCount) {
    kids.createDiv({ cls: "gd-left-empty", text: "没有可显示的文件" });
  }
}

function renderFolderChildren(
  box: HTMLElement,
  plugin: GridDiaryPlugin,
  folder: TFolder,
  depth: number
): void {
  const s = plugin.settings;
  const items = [...folder.children].sort((a, b) => {
    if (s.treeSort === "mtime") {
      const af = a instanceof TFolder ? 0 : 1;
      const bf = b instanceof TFolder ? 0 : 1;
      if (af !== bf) return af - bf;
      const am = a instanceof TFile ? a.stat.mtime : 0;
      const bm = b instanceof TFile ? b.stat.mtime : 0;
      if (am !== bm) return bm - am;
      return a.name.localeCompare(b.name, "zh");
    }
    if (s.treeSort === "name") return a.name.localeCompare(b.name, "zh");
    const af = a instanceof TFolder ? 0 : 1;
    const bf = b instanceof TFolder ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.name.localeCompare(b.name, "zh");
  });

  for (const child of items) {
    if (child instanceof TFolder) {
      if (SKIP.has(child.name)) continue;
      const key = child.path;
      const open = openState.has(key) ? (openState.get(key) as boolean) : s.treeDefaultOpen;
      const row = box.createDiv({ cls: "gd-tree-row gd-tree-folder" });
      decorate(row, depth, s.hoverGlow);
      row.dataset.depth = String(depth);
      row.dataset.search = child.name.toLowerCase();
      if (open) row.addClass("is-open");
      row.createSpan({ cls: "gd-row-icon gd-icon-folder" + (isDefIcon("folder", s.iconFolder) ? " gd-icon-svg gd-ico-folder" : "") });
      row.createSpan({ cls: "gd-row-name", text: child.name });
      row.createSpan({ cls: "gd-tree-caret", text: open ? "▾" : "▸" });
      row.createSpan({ cls: "gd-tree-count", text: String(countFiles(child)) });

      const kids = box.createDiv({ cls: "gd-tree-kids" });
      if (!open) kids.addClass("is-collapsed");
      renderFolderChildren(kids, plugin, child, depth + 1);

      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !(openState.has(key) ? openState.get(key) : s.treeDefaultOpen);
        openState.set(key, next);
        row.toggleClass("is-open", next);
        kids.toggleClass("is-collapsed", !next);
        const caret = row.querySelector(".gd-tree-caret");
        if (caret) caret.setText(next ? "▾" : "▸");
      });
      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const menu = new Menu();
        folderMenu(menu, plugin, child);
        menu.showAtMouseEvent(e);
      });
      continue;
    }

    if (!(child instanceof TFile)) continue;
    if (child.extension !== "md") continue;

    const row = box.createDiv({ cls: "gd-tree-row gd-tree-file" });
    decorate(row, depth, s.hoverGlow);
    row.dataset.depth = String(depth);
    row.dataset.search = child.basename.toLowerCase();
    row.dataset.path = child.path;
    const m = DATE_RE.exec(child.name);
    if ((m && m[1] === plugin.activeDate) || child.path === plugin.openFilePath) row.addClass("active");
    polyline(row);
    row.createSpan({ cls: "gd-row-icon gd-icon-file" + (isDefIcon("file", s.iconFile) ? " gd-icon-svg gd-ico-file" : "") });
    row.createSpan({ cls: "gd-row-name", text: m ? m[1] : child.basename });
    row.setAttribute("title", child.path);
    row.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSmart(plugin, child);
    });
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const menu = new Menu();
      fileMenu(menu, plugin, child);
      menu.showAtMouseEvent(e);
    });
  }
}

/** 供外部（如设置变更）清空折叠记忆 */
export function resetTreeState(): void {
  openState.clear();
}

/** 当前打开的文件在树中高亮（不重渲染，由 file-open 事件驱动） */
export function highlightOpenFile(path: string | null): void {
  document.querySelectorAll<HTMLElement>(".gd-left-panel [data-path]").forEach((r) => r.classList.remove("is-open-file"));
  if (!path) return;
  document.querySelectorAll<HTMLElement>(".gd-left-panel [data-path]").forEach((r) => {
    if (r.dataset.path === path) r.classList.add("is-open-file");
  });
}
