import { Menu, Notice, TAbstractFile, TFile, TFolder } from "obsidian";
import type GridDiaryPlugin from "./main";

/** 不展示的目录 */
const SKIP = new Set([".obsidian", ".trash", ".git", ".github", "node_modules"]);

/** 折叠状态（按路径记忆，跨重渲染保留） */
const openState = new Map<string, boolean>();

const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;

/** 行装饰：缩进变量 + 流星层 */
function decorate(row: HTMLElement, depth: number, hoverGlow: boolean): void {
  row.style.setProperty("--indent", `${depth * 10}px`);
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
  el.style.setProperty("--gd-icon-file", `"${s.iconFile || ""}"`);
  el.style.setProperty("--gd-icon-folder", `"${s.iconFolder || ""}"`);
  el.style.setProperty("--gd-icon-folder-open", `"${s.iconFolderOpen || ""}"`);
  el.toggleClass("gd-with-lines", s.showTreeLines);
  el.toggleClass("gd-hover-glow", s.hoverGlow);

  if (s.showRecentFiles) renderRecents(el, plugin);
  renderTree(el, plugin);
}

/** 日期文件 → 切换到九宫格视图；其它文件 → 原生打开 */
export function openSmart(plugin: GridDiaryPlugin, file: TFile): void {
  const m = DATE_RE.exec(file.name);
  if (m && plugin.store.fileFor(m[1])) {
    void plugin.activateView(m[1]);
    return;
  }
  void plugin.app.workspace.getLeaf("tab").openFile(file);
}

/* ------------------------------------------------------------------ 右键菜单 */

function fileMenu(menu: Menu, plugin: GridDiaryPlugin, file: TFile): void {
  menu.addItem((item) =>
    item
      .setTitle("Open in new tab")
      .setIcon("file-input")
      .onClick(() => void plugin.app.workspace.getLeaf("tab").openFile(file))
  );
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("Rename")
      .setIcon("pencil")
      .onClick(() => {
        const next = window.prompt("Rename", file.basename);
        if (next === null || !next.trim() || next.trim() === file.basename) return;
        void plugin.app.fileManager.renameFile(file, `${file.parent?.path ? file.parent.path + "/" : ""}${next.trim()}.${file.extension}`);
      })
  );
  menu.addItem((item) =>
    item
      .setTitle("Delete")
      .setIcon("trash")
      .onClick(async () => {
        if (!window.confirm(`Move "${file.path}" to the trash?`)) return;
        try {
          await plugin.app.vault.trash(file, true);
        } catch {
          try {
            await plugin.app.vault.trash(file, false);
          } catch (e) {
            new Notice(`Failed to delete: ${String(e)}`);
          }
        }
      })
  );
  menu.addItem((item) =>
    item
      .setTitle("Copy path")
      .setIcon("link")
      .onClick(() => {
        void navigator.clipboard.writeText(file.path);
        new Notice("Path copied");
      })
  );
}

function folderMenu(menu: Menu, plugin: GridDiaryPlugin, folder: TFolder): void {
  menu.addItem((item) =>
    item
      .setTitle("New note")
      .setIcon("file-plus")
      .onClick(() => {
        const name = window.prompt("New note name", "Untitled");
        if (!name?.trim()) return;
        const path = `${folder.path ? folder.path + "/" : ""}${name.trim()}.md`;
        void plugin.app.vault.create(path, "").catch(() => new Notice("Failed to create. File already exists."));
      })
  );
  menu.addSeparator();
  menu.addItem((item) =>
    item
      .setTitle("Rename")
      .setIcon("pencil")
      .onClick(() => {
        const next = window.prompt("Rename folder", folder.name);
        if (next === null || !next.trim() || next.trim() === folder.name) return;
        void plugin.app.fileManager.renameFile(folder, `${folder.parent?.path ? folder.parent.path + "/" : ""}${next.trim()}`);
      })
  );
  menu.addItem((item) =>
    item
      .setTitle("Delete")
      .setIcon("trash")
      .onClick(async () => {
        if (!window.confirm(`Move "${folder.path}" and its contents to the trash?`)) return;
        try {
          await plugin.app.vault.trash(folder, true);
        } catch (e) {
          new Notice(`Failed to delete: ${String(e)}`);
        }
      })
  );
  menu.addItem((item) =>
    item
      .setTitle("Copy path")
      .setIcon("link")
      .onClick(() => {
        void navigator.clipboard.writeText(folder.path);
        new Notice("Path copied");
      })
  );
}

/* ------------------------------------------------------------------ Recent files */

function renderRecents(el: HTMLElement, plugin: GridDiaryPlugin): void {
  const s = plugin.settings;
  const box = el.createDiv({ cls: "gd-left-section gd-left-recent" });
  const head = box.createDiv({ cls: "gd-left-head" });
  head.createSpan({ cls: "gd-left-title", text: "Recent files" });

  const files = plugin.app.vault
    .getMarkdownFiles()
    .slice()
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, 12);

  if (!files.length) {
    box.createDiv({ cls: "gd-left-empty", text: "No notes yet" });
    return;
  }

  const list = box.createDiv({ cls: "gd-left-list" });
  for (const f of files) {
    const row = list.createDiv({ cls: "gd-left-row" });
    decorate(row, 0, s.hoverGlow);
    const isDiary = DATE_RE.test(f.name);
    if (isDiary && f.basename === plugin.activeDate) row.addClass("active");
    polyline(row);
    row.createSpan({ cls: "gd-row-icon gd-icon-file" });
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
  head.createSpan({ cls: "gd-left-title", text: "Folders" });

  const root = plugin.app.vault.getRoot();

  // vault 根行（仿 file-tree-alternative：根名称 + 总数）
  const rootRow = box.createDiv({ cls: "gd-tree-row gd-tree-folder gd-vault-row" });
  decorate(rootRow, 0, plugin.settings.hoverGlow);
  const rootOpen = openState.has("__vault__") ? (openState.get("__vault__") as boolean) : true;
  if (rootOpen) rootRow.addClass("is-open");
  rootRow.createSpan({ cls: "gd-row-icon gd-icon-folder" });
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
    kids.createDiv({ cls: "gd-left-empty", text: "No files to display" });
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
      if (open) row.addClass("is-open");
      row.createSpan({ cls: "gd-row-icon gd-icon-folder" });
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
    const m = DATE_RE.exec(child.name);
    if (m && m[1] === plugin.activeDate) row.addClass("active");
    polyline(row);
    row.createSpan({ cls: "gd-row-icon gd-icon-file" });
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
