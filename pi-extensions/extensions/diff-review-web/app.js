const review = window.__PI_DIFF_REVIEW__;
const comments = new Map();
let activeEditor = null;
let activeSelection = null;
let statusText = "Review in progress";

const app = document.getElementById("app");

function lineKey(filePath, blockHeader, oldLineNumber, newLineNumber, content) {
  return [filePath, blockHeader, oldLineNumber ?? "_", newLineNumber ?? "_", content].join("::");
}

function rangeKey() {
  return `range::${Math.random().toString(36).slice(2, 10)}::${Date.now().toString(36)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSingleRef(comment) {
  return [
    `file=${comment.filePath}`,
    comment.oldLineNumber != null ? `old=${comment.oldLineNumber}` : null,
    comment.newLineNumber != null ? `new=${comment.newLineNumber}` : null,
    `kind=${comment.lineKind}`,
  ].filter(Boolean).join(", ");
}

function formatRangeRef(comment) {
  return [
    `file=${comment.filePath}`,
    comment.startOldLineNumber != null ? `old_start=${comment.startOldLineNumber}` : null,
    comment.endOldLineNumber != null ? `old_end=${comment.endOldLineNumber}` : null,
    comment.startNewLineNumber != null ? `new_start=${comment.startNewLineNumber}` : null,
    comment.endNewLineNumber != null ? `new_end=${comment.endNewLineNumber}` : null,
    "kind=range",
  ].filter(Boolean).join(", ");
}

function formatRangeHeader(comment) {
  const oldRange = comment.startOldLineNumber != null && comment.endOldLineNumber != null
    ? `old ${comment.startOldLineNumber}-${comment.endOldLineNumber}`
    : null;
  const newRange = comment.startNewLineNumber != null && comment.endNewLineNumber != null
    ? `new ${comment.startNewLineNumber}-${comment.endNewLineNumber}`
    : null;
  return [oldRange, newRange].filter(Boolean).join(" • ");
}

function summaryHtml() {
  const list = Array.from(comments.entries());
  if (list.length === 0) {
    return '<div class="empty">No comments yet.</div>';
  }
  return list.map(([key, comment], index) => {
    const ref = comment.lineKind === "range" ? formatRangeRef(comment) : formatSingleRef(comment);
    return `<div class="summary-item"><strong>${index + 1}.</strong> ${escapeHtml(ref)}<br/><span class="subtle">block:</span> ${escapeHtml(comment.blockHeader)}<br/>${escapeHtml(comment.text)}<div style="margin-top:8px;display:flex;gap:6px;"><button class="secondary-btn" type="button" data-edit-summary="${escapeHtml(key)}">Edit</button><button class="secondary-btn" type="button" data-delete-summary="${escapeHtml(key)}">Delete</button></div></div>`;
  }).join("");
}

function lineLabel(line, index) {
  const oldRef = line.oldLineNumber == null ? "-" : line.oldLineNumber;
  const newRef = line.newLineNumber == null ? "-" : line.newLineNumber;
  const sign = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
  return `${index + 1}. old ${oldRef} • new ${newRef} • ${sign} ${line.content}`;
}

function getRangeComments(filePath, blockHeader) {
  return Array.from(comments.entries()).filter(([, comment]) => comment.lineKind === "range" && comment.filePath === filePath && comment.blockHeader === blockHeader);
}

function getRangeBounds(lines, comment) {
  const startIndex = lines.findIndex((line) => line.oldLineNumber === comment.startOldLineNumber && line.newLineNumber === comment.startNewLineNumber);
  const endIndex = lines.findIndex((line) => line.oldLineNumber === comment.endOldLineNumber && line.newLineNumber === comment.endNewLineNumber);
  if (startIndex < 0 || endIndex < 0) {
    return null;
  }
  return {
    startIndex: Math.min(startIndex, endIndex),
    endIndex: Math.max(startIndex, endIndex),
  };
}

function openLineEditor(key) {
  activeEditor = { mode: "line", key };
  render();
  document.getElementById("comment-input")?.focus();
}

function openRangeEditor(file, hunk, lines, commentKey = null, selectedRange = null) {
  const existing = commentKey ? comments.get(commentKey) : null;
  const defaultEndIndex = Math.max(0, lines.length - 1);
  const startIndex = selectedRange?.startIndex ?? (existing
    ? lines.findIndex((line) => line.oldLineNumber === existing.startOldLineNumber && line.newLineNumber === existing.startNewLineNumber)
    : 0);
  const endIndex = selectedRange?.endIndex ?? (existing
    ? lines.findIndex((line) => line.oldLineNumber === existing.endOldLineNumber && line.newLineNumber === existing.endNewLineNumber)
    : defaultEndIndex);
  activeSelection = null;
  activeEditor = {
    mode: "range",
    commentKey,
    filePath: file.displayPath,
    blockHeader: hunk.header,
    startIndex: startIndex >= 0 ? startIndex : 0,
    endIndex: endIndex >= 0 ? endIndex : defaultEndIndex,
    text: existing?.text ?? "",
  };
  render();
  document.getElementById("range-comment-input")?.focus();
}

function openRangeSelection(filePath, blockHeader) {
  activeEditor = null;
  activeSelection = { filePath, blockHeader, startIndex: null, endIndex: null };
  render();
}

function updateRangeSelection(filePath, blockHeader, lineIndex) {
  if (!activeSelection || activeSelection.filePath !== filePath || activeSelection.blockHeader !== blockHeader) {
    activeSelection = { filePath, blockHeader, startIndex: lineIndex, endIndex: lineIndex };
    render();
    return;
  }

  if (activeSelection.startIndex == null) {
    activeSelection = { filePath, blockHeader, startIndex: lineIndex, endIndex: lineIndex };
    render();
    return;
  }

  const startIndex = Math.min(activeSelection.startIndex, lineIndex);
  const endIndex = Math.max(activeSelection.startIndex, lineIndex);
  const block = findBlock(filePath, blockHeader);
  if (!block) {
    activeSelection = null;
    render();
    return;
  }
  openRangeEditor(block.file, block.hunk, block.hunk.lines, null, { startIndex, endIndex });
}

function closeEditor() {
  activeEditor = null;
  activeSelection = null;
  render();
}

function findLineByKey(key) {
  for (const file of review.files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        const candidate = lineKey(file.displayPath, hunk.header, line.oldLineNumber, line.newLineNumber, line.content);
        if (candidate === key) {
          return { file, hunk, line };
        }
      }
    }
  }
  return null;
}

function findBlock(filePath, blockHeader) {
  for (const file of review.files) {
    if (file.displayPath !== filePath) continue;
    for (const hunk of file.hunks) {
      if (hunk.header === blockHeader) {
        return { file, hunk };
      }
    }
  }
  return null;
}

function renderRangeEditor(file, hunk, lines) {
  if (!activeEditor || activeEditor.mode !== "range" || activeEditor.filePath !== file.displayPath || activeEditor.blockHeader !== hunk.header) {
    return "";
  }
  const startLine = lines[activeEditor.startIndex];
  const endLine = lines[activeEditor.endIndex];
  return `
    <div class="comment-box">
      <div class="comment-meta">Range comment • ${escapeHtml(file.displayPath)} • ${escapeHtml(hunk.header)}</div>
      <div class="comment-meta">Selected lines: ${escapeHtml(lineLabel(startLine, activeEditor.startIndex))} → ${escapeHtml(lineLabel(endLine, activeEditor.endIndex))}</div>
      <textarea id="range-comment-input">${escapeHtml(activeEditor.text ?? "")}</textarea>
      <div class="comment-actions">
        <button class="primary-btn" type="button" data-save-range="1">Save range comment</button>
        <button class="secondary-btn" type="button" data-cancel-range="1">Cancel</button>
        <button class="secondary-btn" type="button" data-reselect-range="1" data-file-path="${escapeHtml(file.displayPath)}" data-block-header="${escapeHtml(hunk.header)}">Reselect lines</button>
        ${activeEditor.commentKey ? `<button class="secondary-btn" type="button" data-delete-range="${escapeHtml(activeEditor.commentKey)}">Delete</button>` : ""}
      </div>
    </div>
  `;
}

function render() {
  app.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="title">Diff review</div>
        <div class="subtle">${escapeHtml(review.diffLabel)}</div>
        <div class="summary">
          <div class="pill">${comments.size} comment(s)</div>
        </div>
        <div class="summary" id="files-nav"></div>
        <div class="summary">
          <div class="title" style="font-size:14px;margin-bottom:8px;">Captured comments</div>
          ${summaryHtml()}
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <div>
            <div class="title">GitHub-style web review</div>
            <div class="status">${escapeHtml(statusText)}</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="secondary-btn" id="cancel-btn" type="button">Close tab</button>
            <button class="primary-btn" id="end-review-btn" type="button">End review</button>
          </div>
        </div>
        <div class="content" id="files-content"></div>
      </main>
    </div>
  `;

  const nav = document.getElementById("files-nav");
  const content = document.getElementById("files-content");

  nav.innerHTML = review.files.map((file, fileIndex) => `
    <button class="file-link" type="button" data-target="file-${fileIndex}">${escapeHtml(file.displayPath)} <span class="subtle">+${file.additions} -${file.removals}</span></button>
    ${file.hunks.map((_, hunkIndex) => `<button class="block-link" type="button" data-target="file-${fileIndex}-block-${hunkIndex}">block ${hunkIndex + 1}</button>`).join("")}
  `).join("");

  content.innerHTML = review.files.map((file, fileIndex) => {
    if (file.binary || file.hunks.length === 0) {
      return `<section id="file-${fileIndex}" class="file-card"><div class="file-header"><div>${escapeHtml(file.displayPath)}</div></div><div class="empty">Binary or metadata-only diff. Inline comments unavailable.</div></section>`;
    }
    const blocks = file.hunks.map((hunk, hunkIndex) => {
      const rangeComments = getRangeComments(file.displayPath, hunk.header);
      const rangeAnchors = rangeComments
        .map(([rangeCommentKey, rangeComment], index) => {
          const bounds = getRangeBounds(hunk.lines, rangeComment);
          if (!bounds) {
            return null;
          }
          return { key: rangeCommentKey, comment: rangeComment, index, bounds };
        })
        .filter(Boolean);
      const lines = hunk.lines.map((line, lineIndex) => {
        const key = lineKey(file.displayPath, hunk.header, line.oldLineNumber, line.newLineNumber, line.content);
        const existing = comments.get(key);
        const oldValue = line.oldLineNumber == null ? "" : line.oldLineNumber;
        const newValue = line.newLineNumber == null ? "" : line.newLineNumber;
        const sign = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
        const isSelectingThisBlock = activeSelection && activeSelection.filePath === file.displayPath && activeSelection.blockHeader === hunk.header;
        const selectedStart = isSelectingThisBlock && activeSelection.startIndex != null ? Math.min(activeSelection.startIndex, activeSelection.endIndex ?? activeSelection.startIndex) : null;
        const selectedEnd = isSelectingThisBlock && activeSelection.startIndex != null ? Math.max(activeSelection.startIndex, activeSelection.endIndex ?? activeSelection.startIndex) : null;
        const inSelectedRange = selectedStart != null && selectedEnd != null && lineIndex >= selectedStart && lineIndex <= selectedEnd;
        const endingRangeComments = rangeAnchors.filter((entry) => lineIndex === entry.bounds.endIndex);
        return `
          <div class="line ${line.kind} ${activeEditor?.mode === "line" && activeEditor.key === key ? "selected" : ""} ${inSelectedRange ? "selected" : ""}" data-select-line="1" data-file-path="${escapeHtml(file.displayPath)}" data-block-header="${escapeHtml(hunk.header)}" data-line-index="${lineIndex}" style="cursor:${isSelectingThisBlock ? "crosshair" : "default"};">
            <div class="num">${oldValue}</div>
            <div class="num">${newValue}</div>
            <div class="code">${escapeHtml(sign + " " + line.content)}</div>
            <div class="actions" style="gap:6px;">
              <button class="comment-btn" type="button" data-comment-line="${escapeHtml(key)}">${existing ? "Edit" : "Comment"}</button>
            </div>
          </div>
          ${endingRangeComments.map((entry) => `
            <div class="comment-box" style="border-top:0;border-left:4px solid #58a6ff; margin-left:128px;">
              <div class="comment-meta">${escapeHtml(formatRangeHeader(entry.comment))}</div>
              <div style="margin-bottom:8px;">${escapeHtml(entry.comment.text)}</div>
              <div class="comment-actions">
                <button class="secondary-btn" type="button" data-edit-range="${escapeHtml(entry.key)}">Edit</button>
                <button class="secondary-btn" type="button" data-delete-range="${escapeHtml(entry.key)}">Delete</button>
              </div>
            </div>
          `).join("")}
          ${activeEditor?.mode === "line" && activeEditor.key === key ? `
            <div class="comment-box">
              <div class="comment-meta">${escapeHtml(file.displayPath)} • block ${hunkIndex + 1} • ${escapeHtml(hunk.header)}</div>
              <textarea id="comment-input">${escapeHtml(existing?.text ?? "")}</textarea>
              <div class="comment-actions">
                <button class="primary-btn" type="button" data-save-comment="${escapeHtml(key)}">Save comment</button>
                <button class="secondary-btn" type="button" data-cancel-comment="${escapeHtml(key)}">Cancel</button>
                ${existing ? `<button class="secondary-btn" type="button" data-delete-comment="${escapeHtml(key)}">Delete</button>` : ""}
              </div>
            </div>
          ` : ""}
        `;
      }).join("");

      return `
        <div id="file-${fileIndex}-block-${hunkIndex}">
          <div class="block-header" style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
            <span>${escapeHtml(hunk.header)}</span>
            <button class="comment-btn" type="button" data-add-range="1" data-file-path="${escapeHtml(file.displayPath)}" data-block-header="${escapeHtml(hunk.header)}">${activeSelection && activeSelection.filePath === file.displayPath && activeSelection.blockHeader === hunk.header ? "Cancel range selection" : "Add range comment"}</button>
          </div>
          ${activeSelection && activeSelection.filePath === file.displayPath && activeSelection.blockHeader === hunk.header ? `<div class="comment-box"><div class="comment-meta">Click the first line, then the last line, to select a range.</div></div>` : ""}
          ${renderRangeEditor(file, hunk, hunk.lines)}
          ${lines}
        </div>
      `;
    }).join("");

    return `<section id="file-${fileIndex}" class="file-card"><div class="file-header"><div><strong>${escapeHtml(file.displayPath)}</strong></div><div class="subtle">+${file.additions} -${file.removals}</div></div>${blocks}</section>`;
  }).join("");

  document.querySelectorAll("[data-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-target");
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  document.querySelectorAll("[data-comment-line]").forEach((button) => {
    button.addEventListener("click", () => openLineEditor(button.getAttribute("data-comment-line")));
  });

  document.querySelectorAll("[data-add-range]").forEach((button) => {
    button.addEventListener("click", () => {
      const filePath = button.getAttribute("data-file-path");
      const blockHeader = button.getAttribute("data-block-header");
      if (!filePath || !blockHeader) {
        return;
      }
      if (activeSelection && activeSelection.filePath === filePath && activeSelection.blockHeader === blockHeader) {
        activeSelection = null;
        render();
        return;
      }
      openRangeSelection(filePath, blockHeader);
    });
  });

  document.querySelectorAll("[data-select-line]").forEach((row) => {
    row.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("button")) {
        return;
      }
      const filePath = row.getAttribute("data-file-path");
      const blockHeader = row.getAttribute("data-block-header");
      const lineIndexRaw = row.getAttribute("data-line-index");
      if (!filePath || !blockHeader || !lineIndexRaw) {
        return;
      }
      if (!activeSelection || activeSelection.filePath !== filePath || activeSelection.blockHeader !== blockHeader) {
        return;
      }
      updateRangeSelection(filePath, blockHeader, Number.parseInt(lineIndexRaw, 10));
    });
  });

  document.querySelectorAll("[data-edit-range]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-edit-range");
      const comment = comments.get(key);
      if (!comment) return;
      const block = findBlock(comment.filePath, comment.blockHeader);
      if (block) {
        openRangeEditor(block.file, block.hunk, block.hunk.lines, key);
      }
    });
  });

  document.querySelectorAll("[data-cancel-comment], [data-cancel-range]").forEach((button) => {
    button.addEventListener("click", closeEditor);
  });

  document.querySelectorAll("[data-save-comment]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-save-comment");
      const text = document.getElementById("comment-input")?.value.trim() ?? "";
      const found = findLineByKey(key);
      if (!found) return;
      if (text) {
        comments.set(key, {
          filePath: found.file.displayPath,
          blockHeader: found.hunk.header,
          lineKind: found.line.kind,
          oldLineNumber: found.line.oldLineNumber,
          newLineNumber: found.line.newLineNumber,
          text,
        });
      } else {
        comments.delete(key);
      }
      closeEditor();
    });
  });

  document.querySelectorAll("[data-save-range]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!activeEditor || activeEditor.mode !== "range") return;
      const block = findBlock(activeEditor.filePath, activeEditor.blockHeader);
      if (!block) return;
      const text = document.getElementById("range-comment-input")?.value.trim() ?? "";
      const startIndex = Math.min(activeEditor.startIndex, activeEditor.endIndex);
      const endIndex = Math.max(activeEditor.startIndex, activeEditor.endIndex);
      const startLine = block.hunk.lines[startIndex];
      const endLine = block.hunk.lines[endIndex];
      const key = activeEditor.commentKey ?? rangeKey();
      if (text) {
        comments.set(key, {
          filePath: block.file.displayPath,
          blockHeader: block.hunk.header,
          lineKind: "range",
          startOldLineNumber: startLine?.oldLineNumber,
          startNewLineNumber: startLine?.newLineNumber,
          endOldLineNumber: endLine?.oldLineNumber,
          endNewLineNumber: endLine?.newLineNumber,
          text,
        });
      } else {
        comments.delete(key);
      }
      closeEditor();
    });
  });

  document.querySelectorAll("[data-reselect-range]").forEach((button) => {
    button.addEventListener("click", () => {
      const filePath = button.getAttribute("data-file-path");
      const blockHeader = button.getAttribute("data-block-header");
      if (!filePath || !blockHeader) {
        return;
      }
      openRangeSelection(filePath, blockHeader);
    });
  });

  document.querySelectorAll("[data-delete-comment], [data-delete-range], [data-delete-summary]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-delete-comment") || button.getAttribute("data-delete-range") || button.getAttribute("data-delete-summary");
      comments.delete(key);
      closeEditor();
    });
  });

  document.querySelectorAll("[data-edit-summary]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-edit-summary");
      const comment = comments.get(key);
      if (!comment) return;
      if (comment.lineKind === "range") {
        const block = findBlock(comment.filePath, comment.blockHeader);
        if (block) openRangeEditor(block.file, block.hunk, block.hunk.lines, key);
      } else {
        openLineEditor(key);
      }
    });
  });

  document.getElementById("cancel-btn")?.addEventListener("click", () => window.close());
  document.getElementById("end-review-btn")?.addEventListener("click", async () => {
    statusText = "Sending review back to pi...";
    render();
    const response = await fetch(`/api/review/${review.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comments: Array.from(comments.values()) }),
    });
    const payload = await response.json();
    if (!response.ok) {
      statusText = payload.error || "Failed to return review to pi";
      render();
      return;
    }
    statusText = payload.message;
    render();
  });
}

render();
