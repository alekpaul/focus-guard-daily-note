// ============================================================
//  Notion-like Block Editor for Obsidian daily notes
// ============================================================

class BlockEditor {
  constructor(container, { onChange } = {}) {
    this.container = container;
    this.container.classList.add("editor");
    this.blocks = [];
    this.onChange = onChange || (() => {});
    this.slashMenu = null;
    this.slashMenuBlockId = null;
    this.slashMenuIndex = 0;
    this._uid = 0;
  }

  // --- Unique IDs ---
  _id() { return "b" + (++this._uid); }

  // --- Markdown ↔ Blocks ---
  parseMarkdown(md) {
    const lines = md.split("\n");
    const blocks = [];

    for (const line of lines) {
      const trimmed = line.trimEnd();

      // Heading
      const hMatch = trimmed.match(/^(#{1,3})\s+(.*)/);
      if (hMatch) {
        blocks.push({
          id: this._id(),
          type: "heading",
          level: hMatch[1].length,
          content: hMatch[2],
        });
        continue;
      }

      // Task
      const tMatch = trimmed.match(/^-\s+\[([ xX])\]\s*(.*)/);
      if (tMatch) {
        blocks.push({
          id: this._id(),
          type: "task",
          checked: tMatch[1] !== " ",
          content: tMatch[2],
        });
        continue;
      }

      // Bullet
      const bMatch = trimmed.match(/^-\s+(.*)/);
      if (bMatch) {
        blocks.push({
          id: this._id(),
          type: "bullet",
          content: bMatch[1],
        });
        continue;
      }

      // Empty line → skip but preserve spacing between sections
      if (trimmed === "") continue;

      // Paragraph
      blocks.push({
        id: this._id(),
        type: "paragraph",
        content: trimmed,
      });
    }

    // Ensure at least one block
    if (blocks.length === 0) {
      blocks.push({ id: this._id(), type: "paragraph", content: "" });
    }

    return blocks;
  }

  blocksToMarkdown() {
    const lines = [];
    let prevType = null;

    for (const block of this.blocks) {
      // Add blank line before headings (except the first block)
      if (block.type === "heading" && prevType !== null) {
        lines.push("");
      }

      switch (block.type) {
        case "heading":
          lines.push("#".repeat(block.level || 2) + " " + block.content);
          break;
        case "task":
          lines.push("- [" + (block.checked ? "x" : " ") + "] " + block.content);
          break;
        case "bullet":
          lines.push("- " + block.content);
          break;
        default:
          lines.push(block.content);
      }

      prevType = block.type;
    }

    return lines.join("\n") + "\n";
  }

  // --- Load content ---
  load(md) {
    this.blocks = this.parseMarkdown(md);
    this.render();
  }

  // --- Render all blocks ---
  render() {
    this.container.innerHTML = "";

    for (const block of this.blocks) {
      this.container.appendChild(this._createBlockEl(block));
    }

    // "Add block" button at the bottom
    const addBtn = document.createElement("button");
    addBtn.className = "add-block-btn";
    addBtn.innerHTML = '<span class="plus">+</span> Add a block';
    addBtn.addEventListener("click", () => {
      const newBlock = { id: this._id(), type: "paragraph", content: "" };
      this.blocks.push(newBlock);
      const el = this._createBlockEl(newBlock);
      this.container.insertBefore(el, addBtn);
      this._focusBlock(newBlock.id);
    });
    this.container.appendChild(addBtn);
  }

  // --- Create a single block DOM element ---
  _createBlockEl(block) {
    const row = document.createElement("div");
    row.className = "block" + (block.type === "task" && block.checked ? " checked" : "");
    row.dataset.type = block.type;
    row.dataset.id = block.id;

    // Drag handle
    const handle = document.createElement("div");
    handle.className = "block-handle";
    handle.textContent = "⠿";
    handle.draggable = true;
    handle.addEventListener("dragstart", (e) => this._onDragStart(e, block.id));
    handle.addEventListener("dragend", (e) => this._onDragEnd(e));
    row.appendChild(handle);

    // Drag events on the row itself
    row.addEventListener("dragover", (e) => this._onDragOver(e, row));
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over-top", "drag-over-bottom");
    });
    row.addEventListener("drop", (e) => this._onDrop(e, block.id));

    // Prefix: checkbox for tasks, bullet dot for bullets
    const prefix = document.createElement("div");
    prefix.className = "block-prefix";

    if (block.type === "task") {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = block.checked;
      cb.addEventListener("change", () => {
        block.checked = cb.checked;
        row.classList.toggle("checked", block.checked);
        this._emitChange();
      });
      prefix.appendChild(cb);
    } else if (block.type === "bullet") {
      const dot = document.createElement("div");
      dot.className = "bullet";
      prefix.appendChild(dot);
    }

    if (block.type === "task" || block.type === "bullet") {
      row.appendChild(prefix);
    }

    // Editable content
    const content = document.createElement("div");
    content.className = "block-content";
    content.contentEditable = "true";
    content.spellcheck = true;
    content.textContent = block.content;
    content.dataset.placeholder = this._getPlaceholder(block.type);

    content.addEventListener("input", () => {
      block.content = content.textContent;
      this._handleInlineConversion(block, content);
      this._emitChange();
    });

    content.addEventListener("keydown", (e) => this._onKeyDown(e, block));
    content.addEventListener("paste", (e) => this._onPaste(e, block));
    content.addEventListener("focus", () => row.classList.add("focused"));
    content.addEventListener("blur", () => row.classList.remove("focused"));

    row.appendChild(content);
    return row;
  }

  _getPlaceholder(type) {
    switch (type) {
      case "heading": return "Heading";
      case "task": return "Task";
      case "bullet": return "List item";
      default: return "Type '/' for commands";
    }
  }

  // --- Keyboard handling ---
  _onKeyDown(e, block) {
    // Slash menu navigation
    if (this.slashMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this._slashMenuNav(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this._slashMenuNav(-1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        this._slashMenuSelect();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this._closeSlashMenu();
        return;
      }
    }

    const contentEl = e.target;
    const text = contentEl.textContent;
    const sel = window.getSelection();
    const offset = this._getCaretOffset(contentEl);

    // ENTER: create new block
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      // Split content at cursor
      const before = text.slice(0, offset);
      const after = text.slice(offset);

      block.content = before;
      contentEl.textContent = before;

      // New block inherits type for task and bullet, otherwise paragraph
      const newType = (block.type === "task" || block.type === "bullet")
        ? block.type : "paragraph";

      // If task/bullet and current block is empty, convert to paragraph instead
      if ((block.type === "task" || block.type === "bullet") && text.trim() === "") {
        this._convertBlock(block, "paragraph");
        return;
      }

      const newBlock = {
        id: this._id(),
        type: newType,
        content: after,
        checked: false,
      };

      this._insertBlockAfter(block.id, newBlock);
      this._emitChange();
      return;
    }

    // BACKSPACE at start of block
    if (e.key === "Backspace" && offset === 0 && !sel.toString()) {
      const idx = this.blocks.findIndex((b) => b.id === block.id);

      // If block has a special type, first convert to paragraph
      if (block.type !== "paragraph") {
        e.preventDefault();
        this._convertBlock(block, "paragraph");
        return;
      }

      // Merge with previous block
      if (idx > 0) {
        e.preventDefault();
        const prev = this.blocks[idx - 1];
        const prevLen = prev.content.length;
        prev.content += block.content;

        this.blocks.splice(idx, 1);
        this._removeBlockEl(block.id);
        this._updateBlockEl(prev);
        this._focusBlock(prev.id, prevLen);
        this._emitChange();
      }
      return;
    }

    // DELETE at end — merge with next block
    if (e.key === "Delete" && offset === text.length && !sel.toString()) {
      const idx = this.blocks.findIndex((b) => b.id === block.id);
      if (idx < this.blocks.length - 1) {
        e.preventDefault();
        const next = this.blocks[idx + 1];
        const curLen = block.content.length;
        block.content += next.content;

        this.blocks.splice(idx + 1, 1);
        this._removeBlockEl(next.id);
        this._updateBlockEl(block);
        this._focusBlock(block.id, curLen);
        this._emitChange();
      }
      return;
    }

    // Arrow UP at start → focus previous block (end)
    if (e.key === "ArrowUp" && offset === 0) {
      const idx = this.blocks.findIndex((b) => b.id === block.id);
      if (idx > 0) {
        e.preventDefault();
        const prev = this.blocks[idx - 1];
        this._focusBlock(prev.id, prev.content.length);
      }
      return;
    }

    // Arrow DOWN at end → focus next block (start)
    if (e.key === "ArrowDown" && offset === text.length) {
      const idx = this.blocks.findIndex((b) => b.id === block.id);
      if (idx < this.blocks.length - 1) {
        e.preventDefault();
        this._focusBlock(this.blocks[idx + 1].id, 0);
      }
      return;
    }
  }

  // --- Inline conversion: "## ", "- ", "- [ ] ", "/" ---
  _handleInlineConversion(block, contentEl) {
    const text = contentEl.textContent;

    if (block.type === "paragraph") {
      // ## heading
      const headingMatch = text.match(/^(#{1,3})\s(.*)/);
      if (headingMatch) {
        block.content = headingMatch[2];
        block.level = headingMatch[1].length;
        this._convertBlock(block, "heading");
        return;
      }

      // - [ ] task
      if (text.startsWith("- [ ] ") || text.startsWith("- [] ")) {
        block.content = text.replace(/^-\s+\[\s*\]\s*/, "");
        block.checked = false;
        this._convertBlock(block, "task");
        return;
      }

      // - bullet
      if (text.startsWith("- ") && text.length > 2) {
        block.content = text.slice(2);
        this._convertBlock(block, "bullet");
        return;
      }

      // / slash command
      if (text === "/") {
        this._openSlashMenu(block);
        return;
      }
    }

    // Close slash menu if content changes away from "/"
    if (this.slashMenu && this.slashMenuBlockId === block.id && text !== "/") {
      this._closeSlashMenu();
    }
  }

  // --- Paste: insert as plain text ---
  _onPaste(e, block) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");

    const lines = text.split("\n");
    if (lines.length === 1) {
      // Single line: just insert at cursor
      document.execCommand("insertText", false, text);
      block.content = e.target.textContent;
      this._emitChange();
      return;
    }

    // Multi-line paste: create blocks for each line
    const contentEl = e.target;
    const offset = this._getCaretOffset(contentEl);
    const before = block.content.slice(0, offset);
    const after = block.content.slice(offset);

    block.content = before + lines[0];
    contentEl.textContent = block.content;

    let lastBlock = block;
    for (let i = 1; i < lines.length; i++) {
      const content = i === lines.length - 1 ? lines[i] + after : lines[i];
      const parsed = this.parseMarkdown(content);
      for (const pb of parsed) {
        this._insertBlockAfter(lastBlock.id, pb);
        lastBlock = pb;
      }
    }

    this._focusBlock(lastBlock.id, lastBlock.content.length);
    this._emitChange();
  }

  // --- Slash Menu ---
  _menuItems() {
    return [
      { type: "heading", icon: "H", label: "Heading", desc: "Section header" },
      { type: "task", icon: "☐", label: "Task", desc: "Checkbox item" },
      { type: "bullet", icon: "•", label: "Bullet", desc: "List item" },
      { type: "paragraph", icon: "¶", label: "Text", desc: "Plain paragraph" },
    ];
  }

  _openSlashMenu(block) {
    this._closeSlashMenu();
    this.slashMenuBlockId = block.id;
    this.slashMenuIndex = 0;

    const blockEl = this.container.querySelector(`[data-id="${block.id}"]`);
    const contentEl = blockEl.querySelector(".block-content");
    const rect = contentEl.getBoundingClientRect();

    const menu = document.createElement("div");
    menu.className = "slash-menu";
    menu.style.left = rect.left + "px";
    menu.style.top = rect.bottom + 4 + "px";

    const label = document.createElement("div");
    label.className = "slash-menu-label";
    label.textContent = "Turn into";
    menu.appendChild(label);

    const items = this._menuItems();
    items.forEach((item, i) => {
      const el = document.createElement("div");
      el.className = "slash-menu-item" + (i === 0 ? " active" : "");
      el.innerHTML = `<span class="icon">${item.icon}</span><span>${item.label}</span>`;
      el.addEventListener("click", () => {
        block.content = "";
        if (item.type === "heading") block.level = 2;
        if (item.type === "task") block.checked = false;
        this._convertBlock(block, item.type);
        this._closeSlashMenu();
        this._emitChange();
      });
      el.addEventListener("mouseenter", () => {
        menu.querySelectorAll(".slash-menu-item").forEach((el) => el.classList.remove("active"));
        el.classList.add("active");
        this.slashMenuIndex = i;
      });
      menu.appendChild(el);
    });

    document.body.appendChild(menu);
    this.slashMenu = menu;
  }

  _slashMenuNav(dir) {
    const items = this.slashMenu.querySelectorAll(".slash-menu-item");
    items[this.slashMenuIndex].classList.remove("active");
    this.slashMenuIndex = (this.slashMenuIndex + dir + items.length) % items.length;
    items[this.slashMenuIndex].classList.add("active");
  }

  _slashMenuSelect() {
    const items = this.slashMenu.querySelectorAll(".slash-menu-item");
    items[this.slashMenuIndex].click();
  }

  _closeSlashMenu() {
    if (this.slashMenu) {
      this.slashMenu.remove();
      this.slashMenu = null;
      this.slashMenuBlockId = null;
    }
  }

  // --- Block operations ---
  _convertBlock(block, newType) {
    block.type = newType;
    if (newType === "heading" && !block.level) block.level = 2;
    if (newType === "task" && block.checked === undefined) block.checked = false;

    const oldEl = this.container.querySelector(`[data-id="${block.id}"]`);
    const newEl = this._createBlockEl(block);
    oldEl.replaceWith(newEl);
    this._focusBlock(block.id, block.content.length);
    this._emitChange();
  }

  _insertBlockAfter(afterId, newBlock) {
    const idx = this.blocks.findIndex((b) => b.id === afterId);
    this.blocks.splice(idx + 1, 0, newBlock);

    const afterEl = this.container.querySelector(`[data-id="${afterId}"]`);
    const newEl = this._createBlockEl(newBlock);
    afterEl.after(newEl);

    // Focus the new block
    requestAnimationFrame(() => this._focusBlock(newBlock.id, 0));
  }

  _removeBlockEl(id) {
    const el = this.container.querySelector(`[data-id="${id}"]`);
    if (el) el.remove();
  }

  _updateBlockEl(block) {
    const oldEl = this.container.querySelector(`[data-id="${block.id}"]`);
    if (oldEl) {
      const newEl = this._createBlockEl(block);
      oldEl.replaceWith(newEl);
    }
  }

  _focusBlock(id, caretPos) {
    requestAnimationFrame(() => {
      const el = this.container.querySelector(`[data-id="${id}"] .block-content`);
      if (!el) return;
      el.focus();

      if (caretPos !== undefined) {
        const range = document.createRange();
        const sel = window.getSelection();
        const textNode = el.firstChild;

        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          const pos = Math.min(caretPos, textNode.length);
          range.setStart(textNode, pos);
          range.collapse(true);
        } else {
          range.selectNodeContents(el);
          range.collapse(caretPos === 0);
        }

        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  }

  _getCaretOffset(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(el);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    return range.toString().length;
  }

  // --- Drag & Drop ---
  _draggedBlockId = null;

  _onDragStart(e, blockId) {
    this._draggedBlockId = blockId;
    e.dataTransfer.effectAllowed = "move";
    const blockEl = this.container.querySelector(`[data-id="${blockId}"]`);
    blockEl.classList.add("dragging");
  }

  _onDragEnd(e) {
    this._draggedBlockId = null;
    this.container.querySelectorAll(".block").forEach((el) => {
      el.classList.remove("dragging", "drag-over-top", "drag-over-bottom");
    });
  }

  _onDragOver(e, rowEl) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const rect = rowEl.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    rowEl.classList.remove("drag-over-top", "drag-over-bottom");
    if (e.clientY < midY) {
      rowEl.classList.add("drag-over-top");
    } else {
      rowEl.classList.add("drag-over-bottom");
    }
  }

  _onDrop(e, targetBlockId) {
    e.preventDefault();
    if (!this._draggedBlockId || this._draggedBlockId === targetBlockId) return;

    const fromIdx = this.blocks.findIndex((b) => b.id === this._draggedBlockId);
    const toIdx = this.blocks.findIndex((b) => b.id === targetBlockId);
    if (fromIdx === -1 || toIdx === -1) return;

    const targetEl = this.container.querySelector(`[data-id="${targetBlockId}"]`);
    const isAbove = targetEl.classList.contains("drag-over-top");

    // Remove from old position
    const [moved] = this.blocks.splice(fromIdx, 1);

    // Insert at new position
    let newIdx = this.blocks.findIndex((b) => b.id === targetBlockId);
    if (!isAbove) newIdx++;
    this.blocks.splice(newIdx, 0, moved);

    this.render();
    this._emitChange();
  }

  // --- Change notification ---
  _emitChange() {
    this.onChange(this.blocksToMarkdown());
  }
}
