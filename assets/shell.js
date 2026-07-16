/* ============================================================================
   Astrus Reprocess Workshop — shared engine (reprocess-only)
   No emails: a submission already exists, a follow-up dropped new attachments on
   the Communication, and the underwriter decides WHEN and WHAT to reprocess.
   Nothing fires automatically.

   Everything the Jul workshop asked for lives here so all three options inherit
   it identically:
     • Gated entry — the panel is hidden behind ONE "Reprocessing options" button.
     • Upload — drag-drop + browse + PASTE-TEXT (email body that isn't a file).
       New files sit at the top; every file shows a DATE RECEIVED.
     • Review — toggle off only exact/older versions; turning a doc off REMOVES IT
       FROM THE RECORD for this run (nothing is deleted).
     • Scope — per-LOB AND per-LOB-Quote checkboxes (RFC D6). "Entire submission"
       requires an explicit OVERWRITE-CONFIRM checkbox (delete-style friction).
       Unpicked lines stay LOCKED; hand-entered work is preserved.
     • Protected — Estimated / Proposed Bound Premium is never overwritten (D7).
     • Status — color-coded per-line aggregation (green / amber / red).
   Flow: Upload → Review → Scope → Reprocess, over a non-interactive SF page.
   ============================================================================ */
(function () {
  "use strict";

  const data = {
    com: "COM-0022689",
    sub: "SUB 022689",
    sul: "SUL-3212",
    account: "Cooper Engineering",
    subject: "2026-2027 Cooper Engineering GL Auto WC XS Submission",
    from: "mlettieri@astrusins.com",
    to: "submissions-uat@astrusins.com",
    messageDate: "7/13/2026, 3:37 PM",
    underwriter: "Karen Rivara",
    owner: "Astrus AI Integration User",
    protectedField: "Estimated / Proposed Bound Premium",
    // stat = color-coded line status (green ok / amber needs review / red error).
    // Submission is COMPLETED — every line is green; the underwriter reprocesses
    // on their own initiative, not because anything is flagged for review.
    lines: [
      { id: "sub", label: "Submission Details", kind: "sub", short: "Submission", stat: "green" },
      { id: "gl", label: "General Liability", kind: "lob", short: "GL", stat: "green" },
      { id: "ca", label: "Commercial Auto", kind: "lob", short: "Auto", stat: "green" },
      { id: "wc", label: "Workers' Compensation", kind: "lob", short: "WC", stat: "green" },
      { id: "xs", label: "Excess Liability", kind: "lob", short: "Excess", stat: "green" }
    ],
    // Documents already on the submission (received with the original email).
    baseFiles: [
      { name: "ACORD_125_Commercial_Application.pdf", type: "pdf", size: "1.2 MB", received: "5/2/2026" },
      { name: "Vehicle_Schedule_2024.xlsx", type: "xlsx", size: "88 KB", received: "5/2/2026" },
      { name: "GL_Loss_Runs_5yr.pdf", type: "pdf", size: "640 KB", received: "5/2/2026" },
      { name: "WC_Experience_Mod.pdf", type: "pdf", size: "210 KB", received: "5/2/2026" },
      { name: "Statement_of_Values.xlsx", type: "xlsx", size: "44 KB", received: "5/2/2026" }
    ],
    // Offered by "add sample files": the revised vehicle schedule from the follow-up.
    sampleAdditional: [{ name: "Vehicle_Schedule_REVISED.xlsx", type: "xlsx", size: "91 KB", received: "7/13/2026" }]
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function extType(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || "");
    const e = (m ? m[1] : "file").toLowerCase();
    return e === "xls" ? "xlsx" : e === "jpeg" ? "jpg" : e === "text" ? "txt" : e;
  }
  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  /* ---- scope --------------------------------------------------------------
     uploaded     : [{name,type,size,received}]  files dropped / sampled / pasted
     excludedDocs : Set(name)   review toggles turned off (removed from this run)
     whole        : bool        "entire submission" mode
     overwriteAck : bool        the explicit overwrite-confirm checkbox
     lob          : Set(lineId) lines whose RECORD (+children) will update
     quote        : Set(lobId)  LOBs whose LOB QUOTE will update
     _just        : Set(name)   just-added (checkmark animation) */
  function newScope() {
    return { uploaded: [], excludedDocs: new Set(), whole: false, overwriteAck: false, lob: new Set(), _just: new Set() };
  }
  function alreadyProcessed() { return data.baseFiles.slice(); }
  function sampleFiles() { return data.sampleAdditional.slice(); }
  function docsInPlay(scope) { return alreadyProcessed().concat(scope.uploaded); }
  function includedDocs(scope) { return docsInPlay(scope).filter((f) => !scope.excludedDocs.has(f.name)); }

  function selectedLines(scope) { return scope.whole ? data.lines.slice() : data.lines.filter((l) => scope.lob.has(l.id)); }
  function lockedLines(scope) { return scope.whole ? [] : data.lines.filter((l) => !scope.lob.has(l.id)); }
  function hasSelection(scope) { return scope.whole || scope.lob.size > 0; }
  function selectedCount(scope) { return scope.whole ? data.lines.length : scope.lob.size; }
  function hasUploads(scope) { return scope.uploaded.length > 0 || alreadyProcessed().length > 0; }
  // Reprocess needs a real selection; entire-submission also needs the overwrite ack.
  function canRun(scope) { return hasSelection(scope) && (!scope.whole || scope.overwriteAck); }

  const M = {
    finalLabel: "Reprocess",
    finalShort: "Reprocess",
    uploadTitle: "Upload additional attachments",
    offLabel: '<span class="lock-ic">🔒</span> Locked',
    verb: "Populate"
  };

  function moments() {
    return [
      { num: "01", label: "Upload" },
      { num: "02", label: "Review" },
      { num: "03", label: "Scope" },
      { num: "04", label: M.finalShort }
    ];
  }

  /* ---- badge + status strip (color-coded per-line aggregation) --------- */
  function statusBadge() {
    return '<span class="slds-badge badge-success">✓ Completed</span>';
  }
  function lineStatusRow() {
    const chips = data.lines
      .map((l) => '<span class="ls ls--' + l.stat + '" title="' + esc(l.label) + '"><span class="ls-dot"></span>' + esc(l.short) + "</span>")
      .join("");
    return (
      '<div class="cc-linestat"><span class="cc-linestat-lbl">Lines</span>' + chips +
      '<span class="cc-linestat-key">● complete&nbsp;&nbsp;● review&nbsp;&nbsp;● error</span></div>'
    );
  }
  function statusStripHTML() {
    return (
      '<div class="cc-status2" id="cc-status">' +
      '<div class="cc-status2-top">' +
      '<span class="slds-badge badge-success cc-status2-badge">Completed</span>' +
      '<span class="cc-stage"><span class="cc-stage-dot"></span>All lines processed</span>' +
      "</div>" +
      '<div class="cc-status2-metrics">' +
      '<div class="csm"><span class="csm-v">5 / 5</span><span class="csm-l">Preprocessed</span></div>' +
      '<div class="csm"><span class="csm-v">5 / 5</span><span class="csm-l">Extracted</span></div>' +
      '<div class="csm"><span class="csm-v">4:22 PM</span><span class="csm-l">Completed</span></div>' +
      "</div>" +
      lineStatusRow() +
      "</div>"
    );
  }

  /* ---- status banner (the "first tile") -------------------------------- */
  function bannerHTML() {
    return (
      '<div class="cc-banner"><span class="cc-banner-ic">✓</span>' +
      "<div><strong>Submission completed · " + esc(data.sub) + "</strong>" +
      "<span>This submission has finished processing. Upload attachments and reprocess specific lines below only when you need to.</span></div></div>"
    );
  }

  /* ---- upload step: drag-drop + browse + paste-text, dated rows -------- */
  function uploadRow(f, justNew) {
    return (
      '<div class="up-file' + (justNew ? " just-added" : "") + '">' +
      '<span class="file-ic file-ic--' + f.type + '">' + f.type.toUpperCase() + "</span>" +
      '<span class="up-file-name">' + esc(f.name) + "</span>" +
      '<span class="up-file-date">Rec’d ' + esc(f.received || "just now") + "</span>" +
      '<span class="up-file-size">' + esc(f.size || "") + "</span>" +
      '<span class="up-file-check" aria-label="Uploaded">✓</span>' +
      '<button class="up-file-x" data-up-remove="' + esc(f.name) + '" aria-label="Remove ' + esc(f.name) + '">✕</button>' +
      "</div>"
    );
  }
  function renderUploadStep(scope, opts) {
    opts = opts || {};
    const list = scope.uploaded.length
      ? '<div class="up-list"><div class="up-list-head">New — just added</div>' +
        scope.uploaded.map((f) => uploadRow(f, scope._just.has(f.name))).join("") + "</div>"
      : "";
    return (
      (opts.hideTitle ? "" : '<p class="cc-section-title">' + M.uploadTitle + "</p>") +
      '<p class="up-note">' + alreadyProcessed().length + " already on this submission — drag in anything new.</p>" +
      '<div class="up-zone" id="up-zone" tabindex="0" role="button" aria-label="Drag and drop attachments">' +
      '<div class="up-zone-ic">⬆</div>' +
      '<div class="up-zone-title">Drag &amp; drop attachments here</div>' +
      '<div class="up-zone-sub"><button class="up-link" data-up-browse type="button">browse</button> · ' +
      '<button class="up-link" data-up-sample type="button">add sample files</button></div>' +
      "</div>" +
      // paste-text: for tabular data that arrived in the email body, not as a file
      '<div class="up-paste">' +
      '<button class="up-link up-paste-toggle" data-paste-toggle type="button">＋ or paste text from an email</button>' +
      '<div class="up-paste-box" id="up-paste-box" hidden>' +
      '<textarea class="up-paste-ta" id="up-paste-ta" rows="4" placeholder="Paste text or a table from the email body — e.g. a workers’ comp payroll table that came in the message, not as an attachment."></textarea>' +
      '<div class="up-paste-actions"><button class="slds-btn slds-btn--brand up-paste-add" data-paste-add type="button">Add as attachment</button></div>' +
      "</div></div>" +
      list +
      '<input type="file" id="up-input" multiple style="display:none" />'
    );
  }
  function bindUploadStep(root, scope, rerender) {
    function addFiles(files) {
      const names = new Set(scope.uploaded.map((f) => f.name));
      scope._just = new Set();
      files.forEach((f) => {
        if (names.has(f.name)) return;
        names.add(f.name);
        scope.uploaded.push(f);
        scope._just.add(f.name);
      });
      rerender();
      setTimeout(() => { scope._just = new Set(); }, 900);
    }
    const zone = root.querySelector("#up-zone");
    const input = root.querySelector("#up-input");
    if (zone) {
      zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("drag-over");
        const dropped = Array.from((e.dataTransfer && e.dataTransfer.files) || []).map((file) => ({
          name: file.name, type: extType(file.name), size: fmtSize(file.size), received: "just now"
        }));
        if (dropped.length) addFiles(dropped);
      });
    }
    const browse = root.querySelector("[data-up-browse]");
    if (browse && input) {
      browse.onclick = () => input.click();
      input.onchange = () => {
        const picked = Array.from(input.files || []).map((file) => ({ name: file.name, type: extType(file.name), size: fmtSize(file.size), received: "just now" }));
        if (picked.length) addFiles(picked);
      };
    }
    const sample = root.querySelector("[data-up-sample]");
    if (sample) sample.onclick = () => addFiles(sampleFiles().map((f) => ({ ...f })));
    // paste-text box
    const pToggle = root.querySelector("[data-paste-toggle]");
    const pBox = root.querySelector("#up-paste-box");
    if (pToggle && pBox) pToggle.onclick = () => { pBox.hidden = !pBox.hidden; if (!pBox.hidden) { const ta = root.querySelector("#up-paste-ta"); if (ta) ta.focus(); } };
    const pAdd = root.querySelector("[data-paste-add]");
    if (pAdd) pAdd.onclick = () => {
      const ta = root.querySelector("#up-paste-ta");
      const txt = ta ? ta.value.trim() : "";
      if (!txt) { if (ta) ta.focus(); return; }
      let n = 1, name = "Pasted_email_text.txt";
      const existing = new Set(scope.uploaded.map((f) => f.name));
      while (existing.has(name)) { n += 1; name = "Pasted_email_text_" + n + ".txt"; }
      addFiles([{ name: name, type: "txt", size: fmtSize(txt.length), received: "just now", pasted: true }]);
    };
    root.querySelectorAll("[data-up-remove]").forEach((b) => {
      b.onclick = () => {
        const nm = b.dataset.upRemove;
        scope.uploaded = scope.uploaded.filter((f) => f.name !== nm);
        rerender();
      };
    });
  }

  /* ---- review step: dated rows, remove-from-record clarity ------------- */
  function reviewRow(f, scope) {
    const on = !scope.excludedDocs.has(f.name);
    return (
      '<div class="doc-row' + (on ? " is-in" : " is-out") + '">' +
      '<button class="doc-toggle sw sw--sm' + (on ? " on" : "") + '" data-doc="' + esc(f.name) +
      '" role="switch" aria-checked="' + on + '" aria-label="Include ' + esc(f.name) + '"></button>' +
      '<span class="file-ic file-ic--' + f.type + '">' + f.type.toUpperCase() + "</span>" +
      '<span class="doc-name">' + esc(f.name) + "</span>" +
      '<span class="doc-date">Rec’d ' + esc(f.received || "just now") + "</span>" +
      '<span class="doc-size">' + esc(f.size || "") + "</span></div>"
    );
  }
  // Review note — grounded in Josh's Jul-15 QA-findings guidance: full set required,
  // turn off only newer-version/duplicate, AI can't tell what changed (date received
  // is the only signal), and edit-by-hand for tiny changes.
  const REVIEW_NOTE =
    "The engine reads the <strong>whole set</strong> at once and cross-checks fields across every document — and it can’t tell which file is newest. " +
    "Turn a document off <strong>only</strong> if you’ve uploaded a newer version of it, or it’s an exact duplicate (check the <strong>date received</strong>). " +
    "Leaving an old file on, or dropping one that’s still needed, produces wrong results.";
  function renderReview(scope, opts) {
    opts = opts || {};
    const already = alreadyProcessed();
    const uploaded = scope.uploaded;
    const inCount = includedDocs(scope).length;
    const total = docsInPlay(scope).length;
    function group(title, arr) {
      if (!arr.length) return "";
      return (
        '<div class="doc-group"><div class="doc-group-head">' + title + " (" + arr.length + ")</div>" +
        arr.map((f) => reviewRow(f, scope)).join("") + "</div>"
      );
    }
    if (!total) {
      return '<div class="docs-block"><p class="docs-empty">No attachments yet — go back and upload some.</p></div>';
    }
    const head = opts.hideTitle
      ? '<div class="docs-head"><span class="docs-count">' + inCount + " of " + total + " included</span></div>"
      : '<div class="docs-head"><strong>Review attachments</strong><span class="docs-count">' + inCount + " of " + total + " included</span></div>";
    return (
      '<div class="docs-note"><span class="docs-note-ic">⚠️</span><span>' + REVIEW_NOTE + "</span></div>" +
      '<div class="docs-block">' + head +
      group("New — uploaded", uploaded) +
      group("Already processed", already) +
      "</div>"
    );
  }

  /* ---- scope picker: per-LOB + per-LOB-Quote, overwrite-confirm -------- */
  function countChip(scope) {
    const n = selectedCount(scope);
    return '<span class="cc-count' + (n === 0 ? " none" : "") + '">' + n + " of " + data.lines.length + " lines</span>";
  }
  function forcedRow(l) {
    const tag = l.kind === "sub" ? '<span class="line-sub-tag">Submission-level</span>' : "";
    return '<div class="line-row forced' + (l.kind === "sub" ? " is-sub" : "") + '"><span class="line-name">' + esc(l.label) + tag + '</span><span class="line-state">Will populate ✓</span></div>';
  }
  function lineRowHTML(scope, l) {
    const tag = l.kind === "sub" ? '<span class="line-sub-tag">Submission-level</span>' : "";
    const on = scope.lob.has(l.id);
    return (
      '<div class="line-row ' + (on ? "on" : "locked") + (l.kind === "sub" ? " is-sub" : "") + '">' +
      '<button class="ck-check' + (on ? " on" : "") + '" data-line="' + l.id + '" aria-pressed="' + on + '" aria-label="Update ' + esc(l.label) + '">' + (on ? "✓" : "") + "</button>" +
      '<span class="line-name">' + esc(l.label) + tag + "</span>" +
      '<span class="line-state">' + (on ? "Will populate" : M.offLabel) + "</span></div>"
    );
  }
  function renderScopePicker(scope, opts) {
    opts = opts || {};
    const titleRow = opts.hideTitle
      ? '<div class="cc-title-row"><span></span>' + countChip(scope) + "</div>"
      : '<div class="cc-title-row"><p class="cc-section-title">Choose what to reprocess</p>' + countChip(scope) + "</div>";
    const list = scope.whole
      ? '<div class="line-list">' + data.lines.map(forcedRow).join("") + "</div>"
      : '<div class="line-list">' + data.lines.map((l) => lineRowHTML(scope, l)).join("") + "</div>";
    return (
      titleRow +
      '<div class="cc-mode">' +
      '<div class="cc-mode-opt' + (scope.whole ? " on" : "") + '" data-mode="whole"><span class="cc-mode-radio"></span><div class="cc-mode-title">Entire submission (' + data.lines.length + ")</div></div>" +
      (scope.whole
        ? '<label class="ovr-ack' + (scope.overwriteAck ? " on" : "") + '" data-ovr><span class="ovr-box">' + (scope.overwriteAck ? "✓" : "") + "</span>" +
          "<span>Yes — overwrite all " + data.lines.length + " lines. Hand-entered values will be replaced.</span></label>"
        : "") +
      '<div class="cc-mode-opt' + (!scope.whole ? " on" : "") + '" data-mode="selected"><span class="cc-mode-radio"></span><div class="cc-mode-title">Only the lines I choose</div></div>' +
      "</div>" +
      list
    );
  }
  function bindScopePicker(root, scope, rerender) {
    root.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => {
      const whole = b.dataset.mode === "whole";
      scope.whole = whole;
      if (!whole) scope.overwriteAck = false;
      rerender();
    }));
    const ovr = root.querySelector("[data-ovr]");
    if (ovr) ovr.onclick = (e) => { e.preventDefault(); scope.overwriteAck = !scope.overwriteAck; rerender(); };
    root.querySelectorAll("[data-line]").forEach((b) => (b.onclick = () => {
      const id = b.dataset.line;
      scope.lob.has(id) ? scope.lob.delete(id) : scope.lob.add(id);
      rerender();
    }));
  }

  /* ---- run summary ----------------------------------------------------- */
  function computeRunSummary(scope) {
    const inDocs = includedDocs(scope);
    const lines = [];
    lines.push({ kind: "docs", text: "Reads " + inDocs.length + " of " + docsInPlay(scope).length + " attachments." });
    if (scope.whole) {
      lines.push({ kind: "populate", text: "Overwrites all " + data.lines.length + " lines." });
    } else {
      const recs = selectedLines(scope);
      const locked = lockedLines(scope);
      if (recs.length) lines.push({ kind: "populate", text: "Populates " + recs.map((l) => l.label).join(", ") + "." });
      if (locked.length) lines.push({ kind: "lock", text: "Locked (untouched): " + locked.map((l) => l.label).join(", ") + "." });
    }
    lines.push({ kind: "protect", text: data.protectedField + " is never overwritten." });
    return { lines: lines, selectedCount: selectedCount(scope), total: data.lines.length, whole: scope.whole, includedDocs: inDocs.length };
  }

  /* ---- toast + confirm modal ------------------------------------------- */
  function toast(variant, title, message, ms) {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    const t = document.createElement("div");
    t.className = "toast toast--" + variant;
    t.innerHTML = '<div class="ic" aria-hidden="true">' + (variant === "success" ? "✓" : variant === "warning" ? "⚠" : "✕") +
      "</div><div><strong>" + esc(title) + "</strong><span>" + esc(message) + '</span></div><div class="x" role="button" aria-label="Close">✕</div>';
    t.querySelector(".x").onclick = () => t.remove();
    wrap.appendChild(t);
    setTimeout(() => t.remove(), ms || 5200);
  }
  function confirmModal(opts) {
    return new Promise((resolve) => {
      const back = document.createElement("div");
      back.className = "modal-backdrop";
      back.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '"><header>' + esc(opts.title) +
        '</header><div class="modal-body">' + opts.body + '</div><footer><button class="slds-btn" data-x="cancel">' + esc(opts.cancelLabel || "Cancel") +
        '</button><button class="slds-btn ' + (opts.destructive ? "slds-btn--destructive" : "slds-btn--brand") + '" data-x="ok">' + esc(opts.confirmLabel || "Confirm") + "</button></footer></div>";
      function close(v) { back.remove(); document.removeEventListener("keydown", onKey); resolve(v); }
      function onKey(e) { if (e.key === "Escape") close(false); }
      back.querySelector('[data-x="cancel"]').onclick = () => close(false);
      back.querySelector('[data-x="ok"]').onclick = () => close(true);
      back.onclick = (e) => { if (e.target === back) close(false); };
      document.addEventListener("keydown", onKey);
      document.body.appendChild(back);
      back.querySelector('[data-x="ok"]').focus();
    });
  }
  async function runProcess(scope) {
    if (!canRun(scope)) {
      toast("warning", scope.whole ? "Confirm the overwrite" : "Nothing selected",
        scope.whole ? "Check the overwrite box to reprocess the entire submission." : "Pick at least one line or quote to reprocess.");
      return false;
    }
    const inDocs = includedDocs(scope);
    const recs = selectedLines(scope);
    let body;
    if (scope.whole) {
      body = "<p>Reads the <strong>" + inDocs.length + " included attachment" + (inDocs.length === 1 ? "" : "s") +
        "</strong> and <strong>overwrites all " + data.lines.length + " lines</strong>.</p>" +
        "<p>Hand-entered values on every line will be replaced.</p>";
    } else {
      const recTxt = recs.length ? esc(recs.map((l) => l.label).join(", ")) : "the selected lines";
      body = "<p>Reads the <strong>" + inDocs.length + " included attachment" + (inDocs.length === 1 ? "" : "s") +
        "</strong> and populates <strong>" + recTxt + "</strong>.</p>" +
        "<p>Every other line stays locked.</p>";
    }
    body += "<p><strong>" + esc(data.protectedField) + "</strong> is protected and won’t be overwritten. This can’t be undone.</p>";
    const ok = await confirmModal({
      title: scope.whole ? "Reprocess the entire submission?" : "Reprocess " + selectedCount(scope) + " of " + data.lines.length + " lines?",
      body: body,
      confirmLabel: scope.whole ? "Overwrite & reprocess" : "Reprocess",
      destructive: true
    });
    if (!ok) return false;
    toast("success", "Reprocess started", scope.whole ? "The whole submission will repopulate when it finishes." : "Only the lines and quotes you chose will populate.");
    return true;
  }

  /* ---- moment stepper (leading 'Submission' tile + 4 steps) ------------ */
  function momentStepper(current, onNav, maxReached) {
    if (maxReached == null) maxReached = current;
    const bar = document.createElement("div");
    bar.className = "cc-stepper";
    bar.setAttribute("role", "tablist");
    const s = document.createElement("div");
    s.className = "cc-step is-done cc-step--status";
    s.innerHTML = '<span class="cc-step-num">✓</span><span class="cc-step-label">Submission</span>';
    bar.appendChild(s);
    moments().forEach((m, i) => {
      const reached = i <= maxReached;
      const b = document.createElement("button");
      b.className = "cc-step" + (i === current ? " is-current" : "") + (i < current ? " is-done" : "") + (reached ? "" : " is-locked");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", i === current ? "true" : "false");
      b.innerHTML = '<span class="cc-step-num">' + (i < current ? "✓" : m.num) + '</span><span class="cc-step-label">' + m.label + "</span>";
      if (reached) b.onclick = () => onNav(i);
      else b.disabled = true;
      bar.appendChild(b);
    });
    return bar;
  }

  // Free navigation — no gate blocks moving between steps.
  function uploadError() { return null; }
  function lineError() { return null; }

  /* ---- static Salesforce chrome ---------------------------------------- */
  function sideCardsHTML() {
    return (
      '<section class="sf-card side-card"><header><span class="side-ic">🗂</span> Submission Update Logs (1)</header>' +
      '<div class="sf-card-body side-log">' +
      '<div class="side-log-row"><a>' + data.sul + "</a><span>Last Modified 7/13/2026 4:22 PM</span></div>" +
      '<div class="side-log-row muted">Submission #: <a>' + data.sub + "</a></div></div></section>" +
      '<section class="sf-card side-card"><header><span class="side-ic">📇</span> Activity</header>' +
      '<div class="sf-card-body side-activity"><div class="side-tabs"><span class="on">Log a Call</span><span>New Task</span><span>Email</span></div>' +
      '<div class="side-empty">No upcoming activities.</div></div></section>'
    );
  }
  /* ---- reviewer focus annotation (red box lives in CSS on #cc) --------- */
  function focusCalloutHTML() {
    return (
      '<div class="focus-callout" role="note" aria-label="Reviewer focus note">' +
      '<div class="focus-callout-box">This is the part to focus on — the red-highlighted card is what we changed.</div>' +
      '<svg class="focus-arrow" viewBox="0 0 96 96" fill="none" aria-hidden="true">' +
      '<defs><marker id="focusArrowHead" markerWidth="7" markerHeight="7" refX="5" refY="3.2" orient="auto">' +
      '<path d="M0,0 L7,3.2 L0,6.4 Z" fill="#e11d1d"></path></marker></defs>' +
      '<path d="M4,10 C46,6 60,52 90,80" stroke="#e11d1d" stroke-width="5" stroke-linecap="round" marker-end="url(#focusArrowHead)"></path>' +
      "</svg></div>"
    );
  }

  function chromeHTML(conceptName) {
    const d = data;
    return (
      '<a class="wk-back" href="../../index.html" aria-label="Back to home">← Back to Home</a>' +
      '<div class="proto-ribbon"><span>Astrus prototype</span><span class="dot">•</span>' +
      "<span><strong>" + esc(conceptName) + " · Reprocess</strong></span><span class=\"dot\">•</span>" +
      '<a href="../../index.html">← All options</a><span class="dot">•</span>' +
      "<span>Salesforce chrome is a non-clickable mock; only the AI Engine Status card responds.</span></div>" +
      '<div class="sf-globalnav">' +
      '<div class="sf-waffle"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '<span class="sf-appname">Astrus</span>' +
      '<nav class="sf-tabs">' +
      '<span class="sf-tab">Home</span>' +
      '<span class="sf-tab active">Astrus Submissions Commu… <span class="caret">▾</span></span>' +
      '<span class="sf-tab">Astrus Submissions <span class="caret">▾</span></span>' +
      '<span class="sf-tab">Astrus Submission Update … <span class="caret">▾</span></span>' +
      '<span class="sf-tab">Reports <span class="caret">▾</span></span>' +
      '<span class="sf-tab">Dashboards <span class="caret">▾</span></span>' +
      '<span class="sf-tab">Astrus Brokers <span class="caret">▾</span></span>' +
      '<span class="sf-tab">More <span class="caret">▾</span></span></nav>' +
      '<div class="sf-search">🔎 Search…</div>' +
      '<span class="sf-iconbtn">🔔<span class="bell-dot"></span></span><span class="sf-iconbtn">✎</span></div>' +
      '<div class="sf-record-head"><div class="sf-record-topline"><div class="sf-record-icon">✉</div><div>' +
      '<div class="sf-record-eyebrow">Submission Communication</div>' +
      '<h1 class="sf-record-title">' + esc(d.com) + "</h1></div>" +
      '<div class="sf-record-actions"><button class="slds-btn" tabindex="-1">Edit</button>' +
      '<button class="slds-btn" tabindex="-1">Change Owner</button></div></div>' +
      '<dl class="sf-highlights">' +
      '<div class="sf-hl"><dt>Related Submission</dt><dd><a>' + esc(d.sub) + "</a></dd></div>" +
      '<div class="sf-hl"><dt>Status</dt><dd><span class="slds-badge badge-success">Success</span></dd></div>' +
      '<div class="sf-hl"><dt>Assigned Underwriter</dt><dd>' + esc(d.underwriter) + "</dd></div>" +
      '<div class="sf-hl"><dt>Type</dt><dd>Communication</dd></div>' +
      '<div class="sf-hl"><dt>Files</dt><dd>' + d.baseFiles.length + "</dd></div></dl>" +
      '<div class="sf-subnav"><span class="item active">Details</span><span class="item">Related</span><span class="item">Files</span></div></div>' +
      '<div class="sf-body"><div class="sf-col-left">' +
      '<section class="sf-card"><header><span class="ic">▾</span> Details</header><div class="sf-card-body"><div class="sf-fieldgrid">' +
      '<div class="sf-field"><div class="lbl">From Address</div><div class="val"><a>' + esc(d.from) + "</a></div></div>" +
      '<div class="sf-field"><div class="lbl">Owner</div><div class="val"><a>' + esc(d.owner) + "</a></div></div>" +
      '<div class="sf-field"><div class="lbl">To Address</div><div class="val"><a>' + esc(d.to) + "</a></div></div>" +
      '<div class="sf-field"><div class="lbl">Status</div><div class="val">Success</div></div>' +
      '<div class="sf-field"><div class="lbl">CC Address</div><div class="val">&nbsp;</div></div>' +
      '<div class="sf-field"><div class="lbl">Related Submission</div><div class="val"><a>' + esc(d.sub) + "</a></div></div>" +
      '<div class="sf-field full"><div class="lbl">Subject</div><div class="val">' + esc(d.subject) + "</div></div>" +
      '<div class="sf-field"><div class="lbl">Type</div><div class="val">Communication</div></div>' +
      '<div class="sf-field"><div class="lbl">Message Date</div><div class="val">' + esc(d.messageDate) + "</div></div>" +
      "</div></div></section>" +
      '<section class="sf-card"><header><span class="ic">▾</span> System Information</header><div class="sf-card-body"><div class="sf-fieldgrid">' +
      '<div class="sf-field"><div class="lbl">Created By</div><div class="val"><a>' + esc(d.owner) + "</a>, 7/13/2026 3:37 PM</div></div>" +
      '<div class="sf-field"><div class="lbl">Last Modified By</div><div class="val"><a>Automated Process</a>, 7/13/2026 4:22 PM</div></div>' +
      '</div><p class="static-note">Details, System Information and the record header are a static mock of the live Salesforce page.</p></div></section>' +
      "</div>" +
      '<div class="sf-col-right">' +
      focusCalloutHTML() +
      '<section class="cc is-focus" id="cc"><div class="cc-head">' +
      '<div class="cc-head-title"><span class="cc-bolt">⚡</span> Submissions AI Engine Status</div>' +
      '<span class="cc-badge-mount"></span></div>' +
      statusStripHTML() +
      '<div class="cc-body" id="cc-body"></div></section>' +
      sideCardsHTML() + "</div></div>"
    );
  }

  /* ---- gated entry: nothing shows until "Reprocessing options" -------- */
  function renderGate(mount, onOpen) {
    mount.innerHTML =
      '<div class="cc-gate">' +
      '<div class="cc-gate-head"><span class="cc-gate-ic">✓</span>' +
      "<div><strong>Submission completed</strong>" +
      "<span>This submission has finished processing. You can upload attachments and reprocess specific lines whenever you need to — nothing runs until you choose.</span></div></div>" +
      '<button class="slds-btn slds-btn--brand cc-gate-btn" id="cc-open" type="button">Reprocessing options →</button>' +
      '<p class="cc-gate-foot">Opens the guided reprocess panel. No line is touched until you review the files, choose the scope, and confirm.</p>' +
      "</div>";
    const b = mount.querySelector("#cc-open");
    const clearBtnCallout = placeButtonCallout(b);
    if (b) b.onclick = function () { if (clearBtnCallout) clearBtnCallout(); onOpen(); };
  }

  /* ---- "Click this button" pointer, anchored to the live gate button ---- */
  /* Lives only on the entry view; it clears itself the moment the button is
     clicked (the button is gone once you're inside the flow). */
  function placeButtonCallout(btn) {
    const col = document.querySelector(".sf-col-right");
    if (!col || !btn) return null;
    const old = col.querySelector(".btn-callout");
    if (old) old.remove();
    const wrap = document.createElement("div");
    wrap.className = "btn-callout";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="btn-callout-box">Click this button</div>' +
      '<svg class="btn-callout-arrow" width="76" height="44" viewBox="0 0 76 44" fill="none">' +
      '<defs><marker id="btnArrowHead" markerWidth="7" markerHeight="7" refX="5" refY="3.2" orient="auto">' +
      '<path d="M0,0 L7,3.2 L0,6.4 Z" fill="#e11d1d"></path></marker></defs>' +
      '<path d="M4,22 C34,22 44,22 68,22" stroke="#e11d1d" stroke-width="5" stroke-linecap="round" marker-end="url(#btnArrowHead)"></path>' +
      "</svg>";
    col.appendChild(wrap);
    const BOX_W = 150, GAP = 76;
    function reposition() {
      if (!window.matchMedia("(min-width: 941px)").matches) { wrap.style.display = "none"; return; }
      wrap.style.display = "";
      const cr = col.getBoundingClientRect();
      const br = btn.getBoundingClientRect();
      wrap.style.width = BOX_W + "px";
      wrap.style.left = br.left - cr.left - BOX_W - GAP + "px";
      wrap.style.top = br.top - cr.top + br.height / 2 - 22 + "px";
      const arrow = wrap.querySelector(".btn-callout-arrow");
      arrow.style.left = BOX_W + "px";
    }
    reposition();
    window.addEventListener("resize", reposition);
    return function clear() {
      window.removeEventListener("resize", reposition);
      wrap.remove();
    };
  }

  /* ---- guided tour: red step notes -------------------------------------
       • Concept 1 (Checklist) & Concept 2 (Timeline) WALK one step at a time —
         a single note follows whichever step is currently on screen.
       • Concept 3 (Guided Rail) shows the whole flow at once — all four notes
         are there together, each arrow pinned to its numbered rail dot. */
  function initGuidedTour() {
    const col = document.querySelector(".sf-col-right");
    const card = document.getElementById("cc");
    const body = document.getElementById("cc-body");
    if (!col || !card || !body) return;

    const HTML = [
      "<strong>Step 1 · Upload.</strong> Here’s where underwriters add the extra attachments the broker sent. Go ahead and add one with “add sample files” — it’s a mock, nothing really uploads.",
      "<strong>Step 2 · Review.</strong> You’ll see the attachment you just added next to the files already processed with the original submission. Turn a file off only if it’s a newer version or an exact duplicate.",
      "<strong>Step 3 · Scope (the checklist).</strong> Choose which lines of business or sections to reprocess — pick only what you want updated so you don’t overwrite the values you already entered by hand.",
      "<strong>Step 4 · Reprocess.</strong> Review the summary and run it. Locked lines stay untouched and the protected premium field is never overwritten."
    ];

    function firstMatch(sels) {
      for (let i = 0; i < sels.length; i++) {
        const e = body.querySelector(sels[i]);
        if (e) return e;
      }
      return null;
    }
    function resolveItems() {
      // Guided Rail: all four at once; arrow stops just LEFT of each numbered
      // dot so it points at the number without covering it.
      if (body.querySelector(".gr-rail")) {
        return Array.prototype.slice
          .call(body.querySelectorAll(".gr-node .gr-dot"))
          .filter((d) => /^[1-4]$/.test((d.textContent || "").trim()))
          .slice(0, 4)
          .map((d, i) => ({ html: HTML[i], el: d, kind: "dot" }));
      }
      // Timeline: one note on the active node. Point at its numbered DOT and
      // stop LEFT of it (kind:"dot") — the title sits right of the dot, so
      // aiming at the title would drag the line straight across the dot.
      if (body.querySelector(".tl-rail")) {
        const active = body.querySelector(".tl-node--active");
        if (!active) return [];
        const btn = active.querySelector("[data-node]");
        const idx = btn ? Number(btn.dataset.node) : 0;
        const dot = active.querySelector(".tl-dot") || active;
        return [{ html: HTML[idx], el: dot, kind: "dot" }];
      }
      // Checklist: one note on the current step; point at its SECTION HEADER
      // (the "Review attachments" / "Choose what to reprocess" title) — never at
      // a document toggle inside the list, which would read as "turn this off".
      const STEP_REGION = [["#up-zone"], [".docs-block", ".docs-note"], [".cc-mode", ".line-list"], [".run-summary"]];
      for (let i = 0; i < STEP_REGION.length; i++) {
        if (firstMatch(STEP_REGION[i])) {
          const head =
            body.querySelector(".docs-head") ||
            body.querySelector(".cc-section-title") ||
            firstMatch(STEP_REGION[i]);
          return [{ html: HTML[i], el: head, kind: "header" }];
        }
      }
      return [];
    }

    function clearOverlay() {
      col.querySelectorAll(".tour-note, .tour-arrows").forEach((n) => n.remove());
    }

    function update() {
      clearOverlay();
      const focus = col.querySelector(".focus-callout");
      if (!window.matchMedia("(min-width: 941px)").matches) {
        if (focus) focus.style.display = "";
        return;
      }
      const items = resolveItems().filter((x) => x.el);
      // Guided Rail's four notes carry the story → hide the overarching callout.
      // Sequential concepts keep it (the approved Concept 1 look).
      const gr = !!body.querySelector(".gr-rail");
      if (focus) focus.style.display = gr && items.length ? "none" : "";
      if (!items.length) return;

      const NS = "http://www.w3.org/2000/svg";
      const cr = col.getBoundingClientRect();
      const kr = card.getBoundingClientRect();
      const BOX_W = 244, GAP = 60, VGAP = 12;
      const left = kr.left - cr.left - BOX_W - GAP;

      // One SVG overlay behind the boxes carries every arrow, so each can reach
      // its target wherever it sits (a stacked rail, a section, a stepper tile).
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("class", "tour-arrows");
      svg.style.cssText = "position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:58;";
      svg.setAttribute("width", col.clientWidth);
      svg.setAttribute("height", col.scrollHeight);
      // userSpaceOnUse → arrowhead is a fixed ~15px, NOT scaled 5x by stroke-width
      // (which was making a giant triangle that overhung the dots).
      svg.innerHTML =
        '<defs><marker id="tourArrowHead" markerUnits="userSpaceOnUse" markerWidth="15" markerHeight="13" refX="13" refY="6.5" orient="auto">' +
        '<path d="M0,0 L15,6.5 L0,13 Z" fill="#e11d1d"></path></marker></defs>';
      col.appendChild(svg);

      const built = items
        .map((it) => {
          const note = document.createElement("div");
          note.className = "tour-note";
          note.setAttribute("aria-hidden", "true");
          note.innerHTML = '<div class="tour-note-box">' + it.html + "</div>";
          note.style.width = BOX_W + "px";
          note.style.left = left + "px";
          note.style.top = "0px";
          col.appendChild(note);
          const ar = it.el.getBoundingClientRect();
          return {
            note: note,
            bh: note.firstChild.offsetHeight || 80,
            // Dots: path ends 12px left of the dot; arrowhead tip (end+2) lands
            // ~10px clear of the number. Headers: land at the title edge.
            tx: ar.left - cr.left + (it.kind === "dot" ? -12 : 4),
            ty: ar.top + ar.height / 2 - cr.top
          };
        })
        .sort((a, b) => a.ty - b.ty || a.tx - b.tx);

      let prevBottom = -Infinity;
      built.forEach((b) => {
        let top = b.ty - b.bh / 2;
        if (built.length === 1) {
          top = Math.max(kr.top - cr.top + 6, Math.min(kr.bottom - cr.top - b.bh - 6, top));
        } else {
          top = Math.max(Math.max(6, top), prevBottom + VGAP);
        }
        prevBottom = top + b.bh;
        b.note.style.top = top + "px";
        const sx = left + BOX_W;
        const sy = top + b.bh / 2;
        const c1 = sx + (b.tx - sx) * 0.45;
        const c2 = sx + (b.tx - sx) * 0.62;
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", "M" + sx + "," + sy + " C" + c1 + "," + sy + " " + c2 + "," + b.ty + " " + b.tx + "," + b.ty);
        path.setAttribute("stroke", "#e11d1d");
        path.setAttribute("stroke-width", "5");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("fill", "none");
        path.setAttribute("marker-end", "url(#tourArrowHead)");
        svg.appendChild(path);
      });
    }
    let raf = 0;
    function schedule() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    }
    new MutationObserver(schedule).observe(body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    schedule();
  }

  function boot(concept) {
    const conceptName = concept.name || "Concept";
    document.body.innerHTML = chromeHTML(conceptName);
    const badgeMount = document.querySelector(".cc-badge-mount");
    if (badgeMount) badgeMount.innerHTML = statusBadge();
    const mount = document.getElementById("cc-body");
    const ctx = {
      mode: "additional",
      data: data,
      esc: esc,
      toast: toast,
      confirmModal: confirmModal,
      moments: moments,
      finalLabel: M.finalLabel,
      finalShort: M.finalShort,
      offLabel: M.offLabel,
      verb: M.verb,
      newScope: newScope,
      alreadyProcessed: alreadyProcessed,
      sampleFiles: sampleFiles,
      docsInPlay: docsInPlay,
      includedDocs: includedDocs,
      selectedLines: selectedLines,
      lockedLines: lockedLines,
      selectedCount: selectedCount,
      countChip: countChip,
      hasSelection: hasSelection,
      hasUploads: hasUploads,
      canRun: canRun,
      uploadError: uploadError,
      lineError: lineError,
      bannerHTML: bannerHTML,
      renderUploadStep: renderUploadStep,
      bindUploadStep: bindUploadStep,
      renderReview: renderReview,
      renderFiles: renderReview,
      renderScopePicker: renderScopePicker,
      bindScopePicker: bindScopePicker,
      computeRunSummary: computeRunSummary,
      runProcess: runProcess,
      runReprocess: runProcess,
      momentStepper: momentStepper,
      statusBadge: statusBadge
    };
    function openFlow() { concept.render(mount, ctx); }
    // Deep-link straight into the panel with ?open=1 (skips the entry gate).
    if (/[?&]open=1/.test(location.search)) openFlow();
    else renderGate(mount, openFlow);
    initGuidedTour();
    document.title = "Astrus Reprocess · " + conceptName;
  }

  window.ASTRUS = { data: data, mode: "additional", esc: esc, toast: toast, confirmModal: confirmModal, newScope: newScope, boot: boot };
})();
