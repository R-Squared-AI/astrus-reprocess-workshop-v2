/* ============================================================================
   Astrus Reprocess Workshop — shared engine (Round 7: upload flow, dual mode)
   No more emails: underwriters drag-and-drop attachments into the Communication.
   Two modes (from ?mode=):
     initial    — Communication just created, no submission yet → Process submission
     additional — Submission exists → upload more, review, Reprocess
   Flow (both): Upload → Review → Lines → Process/Reprocess, over a faithful,
   non-interactive Salesforce page. Drag-drop is a demo (checkmark animation, no
   real upload). Pre-extraction: only file names + which are new are known.
   ============================================================================ */
(function () {
  "use strict";

  let MODE = /mode=additional/.test(location.search) ? "additional" : "initial";

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
    lines: [
      { id: "sub", label: "Submission Details", kind: "sub" },
      { id: "gl", label: "General Liability", kind: "lob" },
      { id: "ca", label: "Commercial Auto", kind: "lob" },
      { id: "wc", label: "Workers' Compensation", kind: "lob" },
      { id: "xs", label: "Excess Liability", kind: "lob" }
    ],
    // The base submission's documents (already processed in `additional` mode).
    baseFiles: [
      { name: "ACORD_125_Commercial_Application.pdf", type: "pdf", size: "1.2 MB" },
      { name: "Vehicle_Schedule_2024.xlsx", type: "xlsx", size: "88 KB" },
      { name: "GL_Loss_Runs_5yr.pdf", type: "pdf", size: "640 KB" },
      { name: "WC_Experience_Mod.pdf", type: "pdf", size: "210 KB" },
      { name: "Statement_of_Values.xlsx", type: "xlsx", size: "44 KB" }
    ],
    // Sample files offered by "add sample files": all of them on initial, the
    // revised vehicle schedule on additional.
    sampleAdditional: [{ name: "Vehicle_Schedule_REVISED.xlsx", type: "xlsx", size: "91 KB" }]
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function extType(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name || "");
    const e = (m ? m[1] : "file").toLowerCase();
    return e === "xls" ? "xlsx" : e === "jpeg" ? "jpg" : e;
  }

  /* ---- scope --------------------------------------------------------------
     scope.uploaded  : [{name,type,size}]  files the user dropped / sampled
     scope.excludedDocs : Set(name)        review toggles turned off
     scope.whole : bool ; scope.lob : Set(lineIds)
     scope._just : Set(name)               just-added (for checkmark animation) */
  function newScope() {
    return { uploaded: [], excludedDocs: new Set(), whole: false, lob: new Set(), _just: new Set() };
  }
  function alreadyProcessed() {
    return MODE === "additional" ? data.baseFiles.slice() : [];
  }
  function sampleFiles() {
    return MODE === "additional" ? data.sampleAdditional.slice() : data.baseFiles.slice();
  }
  function docsInPlay(scope) {
    // already-processed (additional) + uploaded
    return alreadyProcessed().concat(scope.uploaded);
  }
  function includedDocs(scope) {
    return docsInPlay(scope).filter((f) => !scope.excludedDocs.has(f.name));
  }
  function selectedLines(scope) {
    return scope.whole ? data.lines.slice() : data.lines.filter((l) => scope.lob.has(l.id));
  }
  function lockedLines(scope) {
    return scope.whole ? [] : data.lines.filter((l) => !scope.lob.has(l.id));
  }
  function hasSelection(scope) {
    return scope.whole || scope.lob.size > 0;
  }
  function selectedCount(scope) {
    return scope.whole ? data.lines.length : scope.lob.size;
  }
  function hasUploads(scope) {
    return scope.uploaded.length > 0 || alreadyProcessed().length > 0;
  }

  /* ---- mode-derived labels --------------------------------------------- */
  const M = {
    get finalLabel() { return MODE === "additional" ? "Reprocess" : "Process submission"; },
    get finalShort() { return MODE === "additional" ? "Reprocess" : "Process"; },
    get uploadTitle() { return MODE === "additional" ? "Upload additional attachments" : "Upload attachments"; },
    get offLabel() { return MODE === "additional" ? '<span class="lock-ic">🔒</span> Locked' : "Not included"; },
    get verb() { return MODE === "additional" ? "Populate" : "Create"; }
  };

  function moments() {
    return [
      { num: "01", label: "Upload" },
      { num: "02", label: "Review" },
      { num: "03", label: "Lines" },
      { num: "04", label: M.finalShort }
    ];
  }

  /* ---- badge + status strip (mode-aware) ------------------------------- */
  function statusBadge() {
    return MODE === "additional"
      ? '<span class="slds-badge badge-attn">📎 New attachments received</span>'
      : '<span class="slds-badge badge-draft">📄 Communication created</span>';
  }
  function statusStripHTML() {
    if (MODE === "additional") {
      return (
        '<div class="cc-status2" id="cc-status">' +
        '<div class="cc-status2-top">' +
        '<span class="slds-badge badge-warning cc-status2-badge">Requires Review</span>' +
        '<span class="cc-stage"><span class="cc-stage-dot"></span>Complete</span>' +
        "</div>" +
        '<div class="cc-status2-metrics">' +
        '<div class="csm"><span class="csm-v">5 / 5</span><span class="csm-l">Preprocessed</span></div>' +
        '<div class="csm"><span class="csm-v">5 / 5</span><span class="csm-l">Extracted</span></div>' +
        '<div class="csm"><span class="csm-v">4:22 PM</span><span class="csm-l">Completed</span></div>' +
        "</div></div>"
      );
    }
    return (
      '<div class="cc-status2" id="cc-status">' +
      '<div class="cc-status2-top">' +
      '<span class="slds-badge badge-neutral cc-status2-badge">Not processed</span>' +
      '<span class="cc-stage cc-stage--draft">Draft</span>' +
      "</div>" +
      '<div class="cc-status2-hint">Awaiting attachments — upload to create the submission.</div>' +
      "</div>"
    );
  }

  /* ---- status banner (the "first tile") -------------------------------- */
  function bannerHTML() {
    if (MODE === "additional") {
      return (
        '<div class="cc-banner"><span class="cc-banner-ic">✓</span>' +
        "<div><strong>Submission created · " + esc(data.sub) + "</strong>" +
        "<span>Upload any additional attachments, then reprocess.</span></div></div>"
      );
    }
    return (
      '<div class="cc-banner"><span class="cc-banner-ic">✓</span>' +
      "<div><strong>Communication record created</strong>" +
      "<span>Upload the attachments to process this submission.</span></div></div>"
    );
  }

  /* ---- upload step (drag-drop demo) ------------------------------------ */
  function uploadRow(f, justNew) {
    return (
      '<div class="up-file' + (justNew ? " just-added" : "") + '">' +
      '<span class="file-ic file-ic--' + f.type + '">' + f.type.toUpperCase() + "</span>" +
      '<span class="up-file-name">' + esc(f.name) + "</span>" +
      '<span class="up-file-size">' + esc(f.size || "") + "</span>" +
      '<span class="up-file-check" aria-label="Uploaded">✓</span>' +
      '<button class="up-file-x" data-up-remove="' + esc(f.name) + '" aria-label="Remove ' + esc(f.name) + '">✕</button>' +
      "</div>"
    );
  }
  function renderUploadStep(scope) {
    const list = scope.uploaded.length
      ? '<div class="up-list">' + scope.uploaded.map((f) => uploadRow(f, scope._just.has(f.name))).join("") + "</div>"
      : "";
    const alreadyNote =
      MODE === "additional"
        ? '<p class="up-note">' + alreadyProcessed().length + " document(s) already on this submission. Add anything new below.</p>"
        : "";
    return (
      '<p class="cc-section-title">' + M.uploadTitle + "</p>" +
      alreadyNote +
      '<div class="up-zone" id="up-zone" tabindex="0" role="button" aria-label="Drag and drop attachments">' +
      '<div class="up-zone-ic">⬆</div>' +
      '<div class="up-zone-title">Drag &amp; drop attachments here</div>' +
      '<div class="up-zone-sub"><button class="up-link" data-up-browse type="button">browse</button> · ' +
      '<button class="up-link" data-up-sample type="button">add sample files</button></div>' +
      "</div>" +
      list +
      '<input type="file" id="up-input" multiple style="display:none" />'
    );
  }
  // Wire the upload interactions. rerender() should re-render the whole card.
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
          name: file.name,
          type: extType(file.name),
          size: fmtSize(file.size)
        }));
        if (dropped.length) addFiles(dropped);
      });
    }
    const browse = root.querySelector("[data-up-browse]");
    if (browse && input) {
      browse.onclick = () => input.click();
      input.onchange = () => {
        const picked = Array.from(input.files || []).map((file) => ({ name: file.name, type: extType(file.name), size: fmtSize(file.size) }));
        if (picked.length) addFiles(picked);
      };
    }
    const sample = root.querySelector("[data-up-sample]");
    if (sample) sample.onclick = () => addFiles(sampleFiles().map((f) => ({ ...f })));
    root.querySelectorAll("[data-up-remove]").forEach((b) => {
      b.onclick = () => {
        const n = b.dataset.upRemove;
        scope.uploaded = scope.uploaded.filter((f) => f.name !== n);
        rerender();
      };
    });
  }
  function fmtSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  /* ---- review step (toggle attachments) -------------------------------- */
  function reviewRow(f, scope) {
    const on = !scope.excludedDocs.has(f.name);
    return (
      '<div class="doc-row' + (on ? " is-in" : " is-out") + '">' +
      '<button class="doc-toggle sw sw--sm' + (on ? " on" : "") + '" data-doc="' + esc(f.name) +
      '" role="switch" aria-checked="' + on + '" aria-label="Include ' + esc(f.name) + '"></button>' +
      '<span class="file-ic file-ic--' + f.type + '">' + f.type.toUpperCase() + "</span>" +
      '<span class="doc-name">' + esc(f.name) + "</span>" +
      '<span class="doc-size">' + esc(f.size || "") + "</span></div>"
    );
  }
  function renderReview(scope) {
    const already = alreadyProcessed().filter((f) => docNotRemoved(scope, f));
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
    return (
      '<div class="docs-note"><span class="docs-note-ic">⚠️</span><span>Only turn off documents that are <strong>exact or older versions</strong> of the newly uploaded ones. Every other document is needed to cross-reference, calculate and produce all fields.</span></div>' +
      '<div class="docs-block">' +
      '<div class="docs-head"><strong>Review attachments</strong><span class="docs-count">' + inCount + " of " + total + " included</span></div>" +
      group(MODE === "additional" ? "New — uploaded" : "Uploaded", uploaded) +
      group("Already processed", already) +
      "</div>"
    );
  }
  function docNotRemoved() { return true; }

  /* ---- run summary (mode-aware) ---------------------------------------- */
  function computeRunSummary(scope) {
    const inDocs = includedDocs(scope);
    const sel = selectedLines(scope);
    const locked = lockedLines(scope);
    const lines = [];
    lines.push({ kind: "docs", text: "Reads " + inDocs.length + " of " + docsInPlay(scope).length + " attachments." });
    if (sel.length) lines.push({ kind: "populate", text: M.verb + "s " + sel.map((l) => l.label).join(", ") + "." });
    if (locked.length) {
      lines.push({
        kind: "lock",
        text: (MODE === "additional" ? "Locked: " : "Not included: ") + locked.map((l) => l.label).join(", ") + "."
      });
    }
    lines.push({ kind: "protect", text: data.protectedField + " protected." });
    return { lines: lines, selectedCount: selectedCount(scope), total: data.lines.length, whole: scope.whole, includedDocs: inDocs.length };
  }

  /* ---- process / reprocess (guard + confirm + toast) ------------------- */
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
    if (!hasUploads(scope)) {
      toast("warning", "Upload attachments first", "Drag & drop at least one attachment before processing.");
      return false;
    }
    if (MODE === "additional" && !hasSelection(scope)) {
      toast("warning", "Choose lines", "Pick at least one line, or the entire submission.");
      return false;
    }
    const sel = selectedLines(scope);
    const inDocs = includedDocs(scope);
    if (MODE === "additional") {
      const ok = await confirmModal({
        title: scope.whole ? "Reprocess the entire submission?" : "Reprocess " + sel.length + " of " + data.lines.length + " lines?",
        body: "<p>Reads the <strong>" + inDocs.length + " included attachment" + (inDocs.length === 1 ? "" : "s") +
          "</strong> and populates <strong>" + esc(sel.map((l) => l.label).join(", ")) + "</strong>.</p>" +
          (scope.whole ? "" : "<p>Every other line stays locked.</p>") +
          "<p><strong>" + esc(data.protectedField) + "</strong> is protected. This can’t be undone.</p>",
        confirmLabel: scope.whole ? "Reprocess submission" : "Reprocess " + sel.length + " line" + (sel.length === 1 ? "" : "s"),
        destructive: true
      });
      if (!ok) return false;
      toast("success", "Reprocess started", "Only the lines you chose will populate when it finishes.");
      return true;
    }
    const ok = await confirmModal({
      title: "Process this submission?",
      body: "<p>Astrus reads all <strong>" + inDocs.length + " attachment" + (inDocs.length === 1 ? "" : "s") +
        "</strong> and creates the submission — <strong>all lines of business</strong>.</p>" +
        "<p>A submission number will be assigned when processing completes.</p>",
      confirmLabel: "Process submission",
      destructive: false
    });
    if (!ok) return false;
    toast("success", "Submission processing started", "A submission number will be created when the engine finishes.");
    return true;
  }

  /* ---- moment stepper (leading 'Created' status tile + 4 steps) -------- */
  function momentStepper(current, onNav, maxReached) {
    if (maxReached == null) maxReached = current;
    const bar = document.createElement("div");
    bar.className = "cc-stepper";
    bar.setAttribute("role", "tablist");
    // leading status tile (non-navigable)
    const s = document.createElement("div");
    s.className = "cc-step is-done cc-step--status";
    s.innerHTML = '<span class="cc-step-num">✓</span><span class="cc-step-label">' + (MODE === "additional" ? "Submission" : "Created") + "</span>";
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

  // gate helpers — return an error string, or null if the step is satisfied
  function uploadError(scope) {
    return scope.uploaded.length ? null : MODE === "additional" ? "Please upload additional attachments." : "Please upload attachments.";
  }
  function lineError(scope) {
    return hasSelection(scope) ? null : "Please select at least one line of business.";
  }

  /* ---- static Salesforce chrome ---------------------------------------- */
  function sideCardsHTML() {
    if (MODE !== "additional") {
      return (
        '<section class="sf-card side-card"><header><span class="side-ic">📇</span> Activity</header>' +
        '<div class="sf-card-body side-activity"><div class="side-tabs"><span class="on">Log a Call</span><span>New Task</span><span>Email</span></div>' +
        '<div class="side-empty">No upcoming activities.</div></div></section>'
      );
    }
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
  function chromeHTML(conceptName) {
    const d = data;
    const relatedSub = MODE === "additional"
      ? '<div class="sf-hl"><dt>Related Submission</dt><dd><a>' + esc(d.sub) + "</a></dd></div>"
      : '<div class="sf-hl"><dt>Related Submission</dt><dd>—</dd></div>';
    const filesCount = MODE === "additional" ? d.baseFiles.length : 0;
    return (
      '<div class="proto-ribbon"><span>Astrus prototype</span><span class="dot">•</span>' +
      "<span><strong>" + esc(conceptName) + " · " + (MODE === "additional" ? "Reprocess" : "New submission") + "</strong></span><span class=\"dot\">•</span>" +
      '<a href="../../index.html">← All concepts</a><span class="dot">•</span>' +
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
      relatedSub +
      '<div class="sf-hl"><dt>Status</dt><dd><span class="slds-badge badge-success">Success</span></dd></div>' +
      '<div class="sf-hl"><dt>Assigned Underwriter</dt><dd>' + esc(d.underwriter) + "</dd></div>" +
      '<div class="sf-hl"><dt>Type</dt><dd>Communication</dd></div>' +
      '<div class="sf-hl"><dt>Files</dt><dd>' + filesCount + "</dd></div></dl>" +
      '<div class="sf-subnav"><span class="item active">Details</span><span class="item">Related</span><span class="item">Files</span></div></div>' +
      '<div class="sf-body"><div class="sf-col-left">' +
      '<section class="sf-card"><header><span class="ic">▾</span> Details</header><div class="sf-card-body"><div class="sf-fieldgrid">' +
      '<div class="sf-field"><div class="lbl">From Address</div><div class="val"><a>' + esc(d.from) + "</a></div></div>" +
      '<div class="sf-field"><div class="lbl">Owner</div><div class="val"><a>' + esc(d.owner) + "</a></div></div>" +
      '<div class="sf-field"><div class="lbl">To Address</div><div class="val"><a>' + esc(d.to) + "</a></div></div>" +
      '<div class="sf-field"><div class="lbl">Status</div><div class="val">Success</div></div>' +
      '<div class="sf-field"><div class="lbl">CC Address</div><div class="val">&nbsp;</div></div>' +
      '<div class="sf-field"><div class="lbl">Related Submission</div><div class="val">' + (MODE === "additional" ? '<a>' + esc(d.sub) + "</a>" : "&nbsp;") + "</div></div>" +
      '<div class="sf-field full"><div class="lbl">Subject</div><div class="val">' + esc(d.subject) + "</div></div>" +
      '<div class="sf-field"><div class="lbl">Type</div><div class="val">Communication</div></div>' +
      '<div class="sf-field"><div class="lbl">Message Date</div><div class="val">' + esc(d.messageDate) + "</div></div>" +
      "</div></div></section>" +
      '<section class="sf-card"><header><span class="ic">▾</span> System Information</header><div class="sf-card-body"><div class="sf-fieldgrid">' +
      '<div class="sf-field"><div class="lbl">Created By</div><div class="val"><a>' + esc(d.owner) + "</a>, 7/13/2026 3:37 PM</div></div>" +
      '<div class="sf-field"><div class="lbl">Last Modified By</div><div class="val"><a>Automated Process</a>, 7/13/2026 4:22 PM</div></div>' +
      '</div><p class="static-note">Details, System Information and the record header are a static mock of the live Salesforce page.</p></div></section>' +
      "</div>" +
      '<div class="sf-col-right"><section class="cc" id="cc"><div class="cc-head">' +
      '<div class="cc-head-title"><span class="cc-bolt">⚡</span> Submissions AI Engine Status</div>' +
      '<span class="cc-badge-mount"></span></div>' +
      statusStripHTML() +
      '<div class="cc-body" id="cc-body"></div></section>' +
      sideCardsHTML() + "</div></div>"
    );
  }

  function boot(concept) {
    const conceptName = concept.name || "Concept";
    document.body.innerHTML = chromeHTML(conceptName);
    const badgeMount = document.querySelector(".cc-badge-mount");
    if (badgeMount) badgeMount.innerHTML = statusBadge();
    const mount = document.getElementById("cc-body");
    // New submission = simple: just Upload → Process (no review, no line picking).
    if (MODE === "initial") {
      const scope = newScope();
      let initErr = null;
      function renderInit() {
        mount.innerHTML =
          bannerHTML() +
          renderUploadStep(scope) +
          '<div class="cc-initnote">Astrus reads every uploaded attachment and creates the submission — <strong>all lines of business</strong> at once. You fine-tune individual lines later by reprocessing.</div>' +
          (initErr ? '<div class="cc-err">⚠ ' + esc(initErr) + "</div>" : "") +
          '<div class="cc-actions"><span class="spacer"></span><button class="slds-btn slds-btn--brand" id="cc-init-run">Process submission →</button></div>';
        bindUploadStep(mount, scope, function () { initErr = null; renderInit(); });
        const b = mount.querySelector("#cc-init-run");
        if (b) b.onclick = async () => {
          const e = uploadError(scope);
          if (e) { initErr = e; renderInit(); return; }
          initErr = null;
          const ok = await runProcess(scope);
          if (ok) { scope.uploaded = []; renderInit(); }
        };
      }
      renderInit();
      document.title = "Astrus New Submission · " + conceptName;
      return;
    }
    const ctx = {
      mode: MODE,
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
      hasSelection: hasSelection,
      hasUploads: hasUploads,
      uploadError: uploadError,
      lineError: lineError,
      bannerHTML: bannerHTML,
      renderUploadStep: renderUploadStep,
      bindUploadStep: bindUploadStep,
      renderReview: renderReview,
      renderFiles: renderReview,
      computeRunSummary: computeRunSummary,
      runProcess: runProcess,
      runReprocess: runProcess,
      momentStepper: momentStepper,
      statusBadge: statusBadge
    };
    concept.render(mount, ctx);
    document.title = "Astrus " + (MODE === "additional" ? "Reprocess" : "New Submission") + " · " + conceptName;
  }

  window.ASTRUS = { data: data, mode: MODE, esc: esc, toast: toast, confirmModal: confirmModal, newScope: newScope, boot: boot };
})();
