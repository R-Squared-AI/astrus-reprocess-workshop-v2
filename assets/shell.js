/* ============================================================================
   Astrus Reprocess Workshop — shared engine (Round 3)
   Faithful, NON-interactive Salesforce Communication page + shared helpers.
   Round 3: badge = "New attachments received"; lines = Submission Details + the
   4 LOBs (with a selection count); on-state reads "Will populate"; text is
   trimmed to the essentials; bold, satisfying states. Still pre-extraction:
   the only known facts are which documents are new vs already-processed and the
   line names.
   ============================================================================ */
(function () {
  "use strict";

  const data = {
    com: "COM-0022689",
    sub: "SUB 022689",
    sul: "SUL-3212",
    account: "Cooper Engineering",
    subject: "FW: 2026-2027 Cooper Engineering GL Auto WC XS Submission",
    from: "mlettieri@astrusins.com",
    to: "submissions-uat@astrusins.com",
    messageDate: "7/13/2026, 3:37 PM",
    underwriter: "Karen Rivara",
    latestEmail: "Jul 13, 2026 · 9:14 AM",
    owner: "Astrus AI Integration User",
    engine: {
      status: "Requires Review",
      stage: "complete",
      filesPrep: "5 / 5",
      filesExt: "5 / 5",
      completed: "7/13/2026, 4:22:32 PM"
    },
    protectedField: "Estimated / Proposed Bound Premium",
    followup: { file: "Vehicle_Schedule_REVISED.xlsx", when: "Jul 13, 2026 · 9:14 AM" },
    newAttachmentCount: 1,
    // Selectable lines: Submission Details (submission-level) + the 4 LOBs.
    lines: [
      { id: "sub", label: "Submission Details", kind: "sub" },
      { id: "gl", label: "General Liability", kind: "lob" },
      { id: "ca", label: "Commercial Auto", kind: "lob" },
      { id: "wc", label: "Workers' Compensation", kind: "lob" },
      { id: "xs", label: "Excess / Umbrella", kind: "lob" }
    ],
    files: [
      { name: "ACORD_125_Commercial_Application.pdf", type: "pdf", size: "1.2 MB", isNew: false },
      { name: "Vehicle_Schedule_2024.xlsx", type: "xlsx", size: "88 KB", isNew: false },
      { name: "GL_Loss_Runs_5yr.pdf", type: "pdf", size: "640 KB", isNew: false },
      { name: "WC_Experience_Mod.pdf", type: "pdf", size: "210 KB", isNew: false },
      { name: "Statement_of_Values.xlsx", type: "xlsx", size: "44 KB", isNew: false },
      { name: "Vehicle_Schedule_REVISED.xlsx", type: "xlsx", size: "91 KB", isNew: true }
    ]
  };

  const MOMENTS = [
    { key: "arrival", num: "01", label: "Follow-up" },
    { key: "files", num: "02", label: "Documents" },
    { key: "scope", num: "03", label: "Lines" },
    { key: "run", num: "04", label: "Reprocess" }
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---- scope helpers ---------------------------------------------------- */
  // scope = { excludedDocs:Set, whole:bool, lob:Set(lineIds) }
  function newScope() {
    return { excludedDocs: new Set(), whole: false, lob: new Set() };
  }
  function includedDocs(scope) {
    return data.files.filter((f) => !scope.excludedDocs.has(f.name));
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

  /* ---- badge (Round 3: New attachments received) ----------------------- */
  function statusBadge() {
    return '<span class="slds-badge badge-attn">📎 New attachments received</span>';
  }

  /* ---- toast ------------------------------------------------------------ */
  function toast(variant, title, message, ms) {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    const t = document.createElement("div");
    t.className = "toast toast--" + variant;
    t.innerHTML =
      '<div class="ic" aria-hidden="true">' +
      (variant === "success" ? "✓" : variant === "warning" ? "⚠" : "✕") +
      "</div><div><strong>" + esc(title) + "</strong><span>" + esc(message) +
      '</span></div><div class="x" role="button" aria-label="Close">✕</div>';
    t.querySelector(".x").onclick = () => t.remove();
    wrap.appendChild(t);
    setTimeout(() => t.remove(), ms || 5000);
  }

  /* ---- modal ------------------------------------------------------------ */
  function confirmModal(opts) {
    return new Promise((resolve) => {
      const back = document.createElement("div");
      back.className = "modal-backdrop";
      back.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) +
        '"><header>' + esc(opts.title) + '</header><div class="modal-body">' + opts.body +
        '</div><footer><button class="slds-btn" data-x="cancel">' + esc(opts.cancelLabel || "Cancel") +
        '</button><button class="slds-btn ' + (opts.destructive ? "slds-btn--destructive" : "slds-btn--brand") +
        '" data-x="ok">' + esc(opts.confirmLabel || "Confirm") + "</button></footer></div>";
      function close(v) {
        back.remove();
        document.removeEventListener("keydown", onKey);
        resolve(v);
      }
      function onKey(e) {
        if (e.key === "Escape") close(false);
      }
      back.querySelector('[data-x="cancel"]').onclick = () => close(false);
      back.querySelector('[data-x="ok"]').onclick = () => close(true);
      back.onclick = (e) => {
        if (e.target === back) close(false);
      };
      document.addEventListener("keydown", onKey);
      document.body.appendChild(back);
      back.querySelector('[data-x="ok"]').focus();
    });
  }

  /* ---- follow-up bell (terse) ------------------------------------------ */
  function bellAlertHTML() {
    return (
      '<div class="cc-alert cc-alert--bell">' +
      '<div class="cc-alert-ic">🔔</div>' +
      "<div><strong>New attachment received.</strong> <em>" + esc(data.followup.file) +
      "</em> was linked here. Nothing was reprocessed — you decide what happens next.</div></div>"
    );
  }

  /* ---- document picker (terse; all included by default) ---------------- */
  function fileRow(f, scope) {
    const on = !scope.excludedDocs.has(f.name);
    return (
      '<div class="doc-row' + (on ? " is-in" : " is-out") + '">' +
      '<button class="doc-toggle sw sw--sm' + (on ? " on" : "") + '" data-doc="' + esc(f.name) +
      '" role="switch" aria-checked="' + on + '" aria-label="Include ' + esc(f.name) + '"></button>' +
      '<span class="file-ic file-ic--' + f.type + '">' + f.type.toUpperCase() + "</span>" +
      '<span class="doc-name">' + esc(f.name) + "</span>" +
      '<span class="doc-size">' + esc(f.size) + "</span></div>"
    );
  }
  function renderFiles(scope) {
    const news = data.files.filter((f) => f.isNew);
    const old = data.files.filter((f) => !f.isNew);
    const inCount = includedDocs(scope).length;
    function group(title, arr) {
      if (!arr.length) return "";
      return (
        '<div class="doc-group"><div class="doc-group-head">' + title + " (" + arr.length + ")</div>" +
        arr.map((f) => fileRow(f, scope)).join("") + "</div>"
      );
    }
    return (
      '<div class="docs-block">' +
      '<div class="docs-head"><strong>Documents</strong><span class="docs-count">' + inCount + " of " + data.files.length + " included</span></div>" +
      group("New attachment", news) +
      group("Already processed", old) +
      "</div>"
    );
  }

  /* ---- run summary (terse; "populate" language) ------------------------ */
  function computeRunSummary(scope) {
    const inDocs = includedDocs(scope);
    const pop = selectedLines(scope);
    const locked = lockedLines(scope);
    const lines = [];
    lines.push({ kind: "docs", text: "Reads " + inDocs.length + " of " + data.files.length + " documents." });
    if (pop.length) lines.push({ kind: "populate", text: "Populates " + pop.map((l) => l.label).join(", ") + "." });
    if (locked.length) lines.push({ kind: "lock", text: "Locked: " + locked.map((l) => l.label).join(", ") + "." });
    lines.push({ kind: "protect", text: data.protectedField + " protected." });
    return { lines: lines, selectedCount: selectedCount(scope), total: data.lines.length, whole: scope.whole, includedDocs: inDocs.length };
  }

  /* ---- reprocess (guard + confirm + toast) ----------------------------- */
  async function runReprocess(scope) {
    if (!hasSelection(scope)) {
      toast("warning", "Choose what to populate", "Pick at least one line, or the entire submission.");
      return false;
    }
    const pop = selectedLines(scope);
    const inDocs = includedDocs(scope);
    const headline = scope.whole
      ? "Reprocess the entire submission?"
      : "Populate " + pop.length + " of " + data.lines.length + " lines?";
    const body =
      "<p>Reads the <strong>" + inDocs.length + " included document" + (inDocs.length === 1 ? "" : "s") +
      "</strong> and populates <strong>" + esc(pop.map((l) => l.label).join(", ")) +
      "</strong>.</p>" + (scope.whole ? "" : "<p>Every other line stays locked.</p>") +
      "<p><strong>" + esc(data.protectedField) + "</strong> is protected. This can’t be undone.</p>";
    const ok = await confirmModal({
      title: headline,
      body: body,
      confirmLabel: scope.whole ? "Reprocess submission" : "Populate " + pop.length + " line" + (pop.length === 1 ? "" : "s"),
      cancelLabel: "Cancel",
      destructive: true
    });
    if (!ok) return false;
    toast("success", "Reprocess started", "Only the lines you chose will populate when it finishes.");
    return true;
  }

  /* ---- moment stepper --------------------------------------------------- */
  function momentStepper(current, onNav) {
    const bar = document.createElement("div");
    bar.className = "cc-stepper";
    bar.setAttribute("role", "tablist");
    MOMENTS.forEach((m, i) => {
      const b = document.createElement("button");
      b.className = "cc-step" + (i === current ? " is-current" : "") + (i < current ? " is-done" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", i === current ? "true" : "false");
      b.innerHTML = '<span class="cc-step-num">' + (i < current ? "✓" : m.num) + '</span><span class="cc-step-label">' + m.label + "</span>";
      b.onclick = () => onNav(i);
      bar.appendChild(b);
    });
    return bar;
  }

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

  function chromeHTML(conceptName) {
    const d = data;
    return (
      '<div class="proto-ribbon"><span>Astrus prototype</span><span class="dot">•</span>' +
      "<span><strong>" + esc(conceptName) + "</strong></span><span class=\"dot\">•</span>" +
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
      '<div class="sf-hl"><dt>Related Submission</dt><dd><a>' + esc(d.sub) + "</a></dd></div>" +
      '<div class="sf-hl"><dt>Status</dt><dd><span class="slds-badge badge-success">Success</span></dd></div>' +
      '<div class="sf-hl"><dt>Assigned Underwriter</dt><dd>' + esc(d.underwriter) + "</dd></div>" +
      '<div class="sf-hl"><dt>Latest Email</dt><dd>' + esc(d.latestEmail) + "</dd></div>" +
      '<div class="sf-hl"><dt>Files</dt><dd>' + d.files.length + "</dd></div></dl>" +
      '<div class="sf-subnav"><span class="item active">Details</span><span class="item">Related</span><span class="item">Emails</span></div></div>' +
      '<div class="sf-body"><div class="sf-col-left">' +
      '<section class="sf-card"><header><span class="ic">▾</span> Details</header><div class="sf-card-body"><div class="sf-fieldgrid">' +
      '<div class="sf-field"><div class="lbl">From Address</div><div class="val"><a>' + esc(d.from) + "</a></div></div>" +
      '<div class="sf-field"><div class="lbl">Owner</div><div class="val"><a>' + esc(d.owner) + "</a></div></div>" +
      '<div class="sf-field"><div class="lbl">To Address</div><div class="val"><a>' + esc(d.to) + "</a></div></div>" +
      '<div class="sf-field"><div class="lbl">Status</div><div class="val">Success</div></div>' +
      '<div class="sf-field"><div class="lbl">CC Address</div><div class="val">&nbsp;</div></div>' +
      '<div class="sf-field"><div class="lbl">Matching Message</div><div class="val">Submission processed successfully</div></div>' +
      '<div class="sf-field"><div class="lbl">BCC Address</div><div class="val">&nbsp;</div></div>' +
      '<div class="sf-field"><div class="lbl">Type</div><div class="val">Email</div></div>' +
      '<div class="sf-field full"><div class="lbl">Subject</div><div class="val">' + esc(d.subject) + "</div></div>" +
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
    const ctx = {
      data: data,
      MOMENTS: MOMENTS,
      esc: esc,
      toast: toast,
      confirmModal: confirmModal,
      statusBadge: statusBadge,
      newScope: newScope,
      includedDocs: includedDocs,
      selectedLines: selectedLines,
      lockedLines: lockedLines,
      selectedCount: selectedCount,
      hasSelection: hasSelection,
      bellAlertHTML: bellAlertHTML,
      renderFiles: renderFiles,
      computeRunSummary: computeRunSummary,
      runReprocess: runReprocess,
      momentStepper: momentStepper
    };
    concept.render(mount, ctx);
    document.title = "Astrus Reprocess · " + conceptName;
  }

  window.ASTRUS = { data: data, MOMENTS: MOMENTS, esc: esc, toast: toast, confirmModal: confirmModal, newScope: newScope, boot: boot };
})();
