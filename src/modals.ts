import { App, Modal, Setting } from "obsidian";

export class PromptModal extends Modal {
  private value: string;
  private onSubmit: (value: string) => void;
  private title: string;
  private desc: string;
  private placeholder: string;

  constructor(
    app: App,
    opts: {
      title: string;
      desc?: string;
      initial?: string;
      placeholder?: string;
      onSubmit: (value: string) => void;
    }
  ) {
    super(app);
    this.title = opts.title;
    this.desc = opts.desc ?? "";
    this.placeholder = opts.placeholder ?? "";
    this.value = opts.initial ?? "";
    this.onSubmit = opts.onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.title });
    if (this.desc) contentEl.createEl("p", { text: this.desc, cls: "grid-diary-modal-desc" });

    new Setting(contentEl).addText((t) => {
      t.setValue(this.value);
      t.setPlaceholder(this.placeholder);
      t.inputEl.style.width = "100%";
      t.onChange((v) => (this.value = v));
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submit();
        }
      });
      window.setTimeout(() => t.inputEl.focus(), 10);
    });

    new Setting(contentEl).addButton((b) =>
      b.setButtonText("确定").setCta().onClick(() => this.submit())
    );
  }

  private submit(): void {
    const v = this.value.trim();
    this.close();
    if (v) this.onSubmit(v);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** 单个格子的大编辑层 —— 点格子就进这里，只改这一节 */
export class SectionEditModal extends Modal {
  private title: string;
  private value: string;
  private onSave: (value: string) => Promise<void> | void;
  private saving = false;

  constructor(
    app: App,
    opts: { title: string; initial: string; onSave: (value: string) => Promise<void> | void }
  ) {
    super(app);
    this.title = opts.title;
    this.value = opts.initial;
    this.onSave = opts.onSave;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("grid-diary-edit-modal");
    modalEl.style.width = "min(860px, 92vw)";
    contentEl.empty();
    contentEl.createEl("h3", { text: this.title, cls: "grid-diary-edit-title" });

    const ta = contentEl.createEl("textarea", { cls: "grid-diary-edit-area" });
    ta.value = this.value;
    ta.placeholder = "写点什么…";
    ta.addEventListener("input", () => (this.value = ta.value));
    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void this.save();
      }
    });
    window.setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }, 10);

    const bar = contentEl.createDiv({ cls: "grid-diary-edit-bar" });
    bar.createEl("span", {
      text: "Ctrl+Enter 保存 · 只修改这一格",
      cls: "grid-diary-edit-hint",
    });
    const cancel = bar.createEl("button", { text: "取消", cls: "mod-cta-alt" });
    cancel.addEventListener("click", () => this.close());
    const ok = bar.createEl("button", { text: "保存", cls: "mod-cta" });
    ok.addEventListener("click", () => void this.save());
  }

  private async save(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      await this.onSave(this.value);
      this.close();
    } finally {
      this.saving = false;
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** 快速添加一条时间流笔记 */
export class QuickNoteModal extends Modal {
  private date: string;
  private onSubmit: (text: string) => Promise<void> | void;
  private ta: HTMLTextAreaElement | null = null;

  constructor(app: App, date: string, onSubmit: (text: string) => Promise<void> | void) {
    super(app);
    this.date = date;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("grid-diary-edit-modal");
    modalEl.style.width = "min(620px, 92vw)";
    contentEl.empty();
    contentEl.createEl("h3", { text: `快速笔记 · ${this.date}`, cls: "grid-diary-edit-title" });

    const ta = contentEl.createEl("textarea", { cls: "grid-diary-edit-area gd-quick-area" });
    ta.placeholder = "随手写点什么…（会自动追加为一条带时间的笔记，不影响九宫格）";
    ta.style.height = "150px";
    this.ta = ta;
    ta.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void this.save();
      }
    });
    window.setTimeout(() => ta.focus(), 10);

    const bar = contentEl.createDiv({ cls: "grid-diary-edit-bar" });
    bar.createEl("span", { text: "Ctrl+Enter 保存", cls: "grid-diary-edit-hint" });
    const cancel = bar.createEl("button", { text: "取消", cls: "mod-cta-alt" });
    cancel.addEventListener("click", () => this.close());
    const ok = bar.createEl("button", { text: "添加", cls: "mod-cta" });
    ok.addEventListener("click", () => void this.save());
  }

  private async save(): Promise<void> {
    const text = (this.ta?.value ?? "").trim();
    if (!text) {
      this.close();
      return;
    }
    await this.onSubmit(text);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class TemplatePickModal extends Modal {
  private options: { name: string; titles: string[] }[];
  private onPick: (tpl: { name: string; titles: string[] }) => void;
  private onSetDefault?: (tpl: { name: string; titles: string[] }) => void;

  constructor(
    app: App,
    options: { name: string; titles: string[] }[],
    onPick: (tpl: { name: string; titles: string[] }) => void,
    onSetDefault?: (tpl: { name: string; titles: string[] }) => void
  ) {
    super(app);
    this.options = options;
    this.onPick = onPick;
    this.onSetDefault = onSetDefault;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "选择一个模板" });
    for (const tpl of this.options) {
      const row = contentEl.createDiv({ cls: "grid-diary-tpl-row" });
      const main = row.createDiv({ cls: "grid-diary-tpl-main" });
      main.createEl("div", { text: tpl.name, cls: "grid-diary-tpl-name" });
      main.createEl("div", { text: tpl.titles.join(" · "), cls: "grid-diary-tpl-desc" });
      main.addEventListener("click", () => {
        this.close();
        void this.onPick(tpl);
      });
      if (this.onSetDefault) {
        const btn = row.createEl("button", { text: "设为当前", cls: "grid-diary-tpl-set" });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          void this.onSetDefault!(tpl);
          this.close();
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
