const S = { data: null, schema: {}, byMrn: {}, sel: null, reviews: {}, dirty: {} };

// ApproxDate.date is ALWAYS a full, real calendar date as YYYY-MM-DD — the
// precision dropdown conveys how much is actually known. Empty = unknown.
function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = +m[1],
    mo = +m[2],
    d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const APPROX_DATE_HELP =
  "Always enter a full calendar date as YYYY-MM-DD.\n\n" +
  "Use “precision” to say how much is actually known:\n" +
  "• day — full date known → 2023-05-14\n" +
  "• month — only month & year → enter the 1st: 2023-05-01\n" +
  "• year — only the year → enter Jan 1: 2023-01-01\n" +
  "• unknown — date not known → leave the date blank\n\n" +
  "“anchor” (optional) records how an imprecise date was placed within its " +
  "period: beginning / end / midpoint of the month or year, or exact.";

const ANCHOR_OPTS = [
  ["", "—"],
  ["EXACT", "exact"],
  ["MID", "midpoint"],
  ["BOM", "beginning of month"],
  ["EOM", "end of month"],
  ["BOY", "beginning of year"],
  ["EOY", "end of year"],
];

async function init() {
  wirePicker();
  let data = {};
  try {
    data = await (await fetch("/api/data")).json();
  } catch (e) {
    data = {};
  }
  if (data.reviewer) document.getElementById("reviewer").value = data.reviewer;
  if (data.loaded) hydrate(data);
  else showPicker();
}

function showPicker() {
  document.getElementById("picker").style.display = "";
  document.getElementById("layout").style.display = "none";
  document.getElementById("ctx").textContent = "";
  const sp = document.getElementById("savepath");
  sp.textContent = "";
  sp.onclick = null;
  document.getElementById("progtxt").textContent = "";
  document.getElementById("prog").style.width = "0";
}

// Show last two path segments (…/folder/file) — full path kept in title + copy.
function shortenPath(p) {
  const parts = String(p).split(/[/\\]/).filter(Boolean);
  return (parts.length > 2 ? "…/" : "") + parts.slice(-2).join("/");
}

function wirePicker() {
  const inp = document.getElementById("pkgfile");
  if (!inp) return;
  const err = document.getElementById("pkgerr");
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    err.style.color = "";
    err.textContent = "Loading " + f.name + "…";
    let text;
    try {
      text = await f.text();
    } catch (e) {
      err.textContent = "Could not read that file.";
      return;
    }
    try {
      const data = await (
        await fetch("/api/load", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: text,
        })
      ).json();
      if (data.loaded) {
        err.textContent = "";
        hydrate(data);
      } else {
        err.style.color = "var(--no)";
        err.textContent = data.error || "Failed to open package.";
      }
    } catch (e) {
      err.style.color = "var(--no)";
      err.textContent = "Upload failed: " + e;
    }
  };
}

// Render a freshly loaded package (from --package on startup or the file picker).
function hydrate(data) {
  S.data = data;
  S.schema = data.field_schema || {};
  S.reviews = data.reviews || {};
  S.byMrn = {};
  S.sel = null;
  document.getElementById("ctx").textContent =
    (data.definition_name || "") + " · batch " + (data.batch || "");
  const sp = document.getElementById("savepath");
  if (data.reviews_path) {
    sp.textContent = "· saving to " + shortenPath(data.reviews_path);
    sp.title = "Reviews file (click to copy): " + data.reviews_path;
    sp.onclick = () => copyText(data.reviews_path, sp);
  } else {
    sp.textContent = "";
    sp.onclick = null;
  }
  document.getElementById("picker").style.display = "none";
  document.getElementById("layout").style.display = "";
  for (const p of data.patients) S.byMrn[p.mrn] = p;
  renderSidebar();
  if (data.patients.length) selectPatient(data.patients[0].mrn);
  else
    document.getElementById("main").innerHTML =
      '<div class="empty">No events in this package.</div>';
  updateProgress();
}

function patientCounts(p) {
  let done = 0;
  for (const e of p.events) if (S.reviews[e.event_key]) done++;
  return [done, p.events.length];
}

function renderSidebar() {
  const el = document.getElementById("sidebar");
  el.innerHTML = "";
  for (const p of S.data.patients) {
    const [d, t] = patientCounts(p);
    const div = document.createElement("div");
    div.className = "p" + (p.mrn === S.sel ? " sel" : "") + (d === t ? " done" : "");
    div.innerHTML =
      "<span>MRN " + escapeHtml(p.mrn) + '</span><span class="cnt">' + d + "/" + t + "</span>";
    div.onclick = () => selectPatient(p.mrn);
    el.appendChild(div);
  }
}

function selectPatient(mrn) {
  S.sel = mrn;
  renderSidebar();
  renderMain();
}

function fieldValue(ev, name) {
  const r = S.reviews[ev.event_key];
  if (r && r.edits && name in r.edits) return r.edits[name];
  return ev.fields ? ev.fields[name] : undefined;
}

function renderMain() {
  const p = S.byMrn[S.sel],
    main = document.getElementById("main");
  main.innerHTML = "";
  if (!p) {
    main.innerHTML = '<div class="empty">Select a patient.</div>';
    return;
  }
  for (const ev of p.events) main.appendChild(renderCard(p, ev));
}

function renderCard(p, ev) {
  const spec = S.schema[ev.event_type] || { label: ev.event_type, fields: [] };
  const review = S.reviews[ev.event_key];
  const verdict = review ? review.verdict : "pending";
  const card = document.createElement("div");
  card.className = "card" + (verdict !== "pending" ? " " + verdict : "");
  card.dataset.key = ev.event_key;

  const note = (p.notes || {})[ev.note_id] || {};
  const quotes = gatherEvidence(ev, spec); // evidence_verbatim snippets

  // header: badge · click-to-copy MRN/Note/Date chips · verdict pill
  const head = document.createElement("div");
  head.className = "chead";
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = spec.label;
  head.appendChild(badge);
  const ids = document.createElement("span");
  ids.className = "ids";
  ids.appendChild(makeCopyChip("MRN", p.mrn));
  if (ev.note_id) ids.appendChild(makeCopyChip("Note ID", ev.note_id));
  if (note.note_date) ids.appendChild(makeCopyChip("Date", note.note_date));
  head.appendChild(ids);
  const pill = document.createElement("span");
  pill.className =
    "pill " +
    verdict +
    (review && review.edits && Object.keys(review.edits).length ? " edited" : "");
  pill.textContent = verdict;
  head.appendChild(pill);
  card.appendChild(head);

  const body = document.createElement("div");
  body.className = "cbody";
  // left: source note with evidence snippets highlighted inline
  const left = document.createElement("div");
  left.className = "col";
  const evN = quotes.length;
  left.innerHTML =
    "<h4>Source note" +
    (evN
      ? ' <span class="muted">· ' +
        evN +
        " evidence span" +
        (evN === 1 ? "" : "s") +
        " highlighted</span>"
      : "") +
    "</h4>" +
    '<div class="notemeta">' +
    escapeHtml([note.note_type, note.department].filter(Boolean).join(" · ")) +
    "</div>" +
    '<div class="note">' +
    buildHighlightedNote(note.note_text || "", quotes) +
    "</div>";
  body.appendChild(left);
  // right: editable fields
  const right = document.createElement("div");
  right.className = "col";
  right.innerHTML = "<h4>Extracted fields</h4>";
  for (const f of spec.fields) right.appendChild(renderField(ev, f));
  body.appendChild(right);
  card.appendChild(body);

  // action row
  const row = document.createElement("div");
  row.className = "approw";
  const cmt = document.createElement("input");
  cmt.type = "text";
  cmt.className = "cmt";
  cmt.placeholder = "reviewer comment (optional)";
  cmt.value = review ? review.comment || "" : "";
  const approve = document.createElement("button");
  approve.className = "ok";
  approve.textContent = "✓ Approve";
  approve.onclick = () => saveVerdict(card, ev, "approved", cmt.value);
  const reject = document.createElement("button");
  reject.className = "no";
  reject.textContent = "✕ Reject";
  reject.onclick = () => saveVerdict(card, ev, "rejected", cmt.value);
  row.appendChild(approve);
  row.appendChild(reject);
  row.appendChild(cmt);
  card.appendChild(row);
  return card;
}

function renderField(ev, f) {
  const wrap = document.createElement("div");
  wrap.className = "fld";
  wrap.dataset.name = f.name;
  const lab = document.createElement("label");
  lab.textContent = f.label + (f.required ? "" : " (optional)");
  wrap.appendChild(lab);
  if (f.description) {
    const d = document.createElement("div");
    d.className = "desc";
    d.textContent = f.description;
    wrap.appendChild(d);
  }
  const val = fieldValue(ev, f.name);
  if (f.control === "readonly") {
    const box = document.createElement("div");
    box.className = "readonly";
    box.textContent = val != null && val !== "" ? String(val) : "—";
    wrap._kind = "readonly";
    wrap._inputs = [];
    wrap.appendChild(box);
    return wrap;
  }
  if (f.control === "evidence_verbatim") {
    // read-only provenance: list of exact note snippets, click to locate in note
    const items = Array.isArray(val) ? val : val != null && val !== "" ? [String(val)] : [];
    const box = document.createElement("div");
    box.className = "evlist";
    if (!items.length) {
      box.innerHTML = '<span class="muted">none</span>';
    }
    items.forEach((q, i) => {
      const it = document.createElement("div");
      it.className = "ev";
      it.title = "click to find in the note";
      it.innerHTML =
        '<span class="evn">' +
        (i + 1) +
        '</span><span class="evt">' +
        escapeHtml(String(q)) +
        "</span>";
      it.onclick = () => flashEvidence(wrap.closest(".card"), String(q));
      box.appendChild(it);
    });
    wrap._kind = "evidence_verbatim";
    wrap._inputs = [];
    wrap.appendChild(box);
    return wrap;
  }
  let ctrl;
  if (f.control === "enum") {
    ctrl = document.createElement("select");
    for (const o of f.options || []) {
      const op = document.createElement("option");
      op.value = o;
      op.textContent = o;
      ctrl.appendChild(op);
    }
    ctrl.value = val != null ? val : f.default != null ? f.default : "";
  } else if (f.control === "approx_date") {
    const box = document.createElement("div");
    box.className = "adate";
    const di = document.createElement("input");
    di.type = "text";
    di.placeholder = "YYYY-MM-DD";
    di.inputMode = "numeric";
    di.value = val && val.date ? val.date : "";
    // precision
    const ps = document.createElement("select");
    [
      ["0", "unknown"],
      ["1", "year"],
      ["2", "month"],
      ["3", "day"],
    ].forEach(([v, t]) => {
      const op = document.createElement("option");
      op.value = v;
      op.textContent = t;
      ps.appendChild(op);
    });
    ps.value = val && val.precision != null ? String(val.precision) : "0";
    const pl = document.createElement("label");
    pl.className = "sublbl";
    pl.append("precision", ps);
    // anchor
    const as = document.createElement("select");
    ANCHOR_OPTS.forEach(([v, t]) => {
      const op = document.createElement("option");
      op.value = v;
      op.textContent = t;
      as.appendChild(op);
    });
    as.value = val && val.anchor ? val.anchor : "";
    const al = document.createElement("label");
    al.className = "sublbl";
    al.append("anchor", as);
    // help
    const help = document.createElement("span");
    help.className = "help";
    help.textContent = "?";
    help.title = APPROX_DATE_HELP;
    const err = document.createElement("div");
    err.className = "fld-err";
    const validate = () => {
      const s = di.value.trim();
      const ok = s === "" || isRealDate(s);
      di.classList.toggle("bad", !ok);
      err.textContent = ok
        ? ""
        : "Enter a real calendar date as YYYY-MM-DD — use precision for approximate dates";
      return ok;
    };
    di.oninput = () => {
      validate();
      mark(wrap, true);
    };
    ps.onchange = as.onchange = () => mark(wrap, true);
    box.append(di, pl, al, help);
    wrap.appendChild(box);
    wrap.appendChild(err);
    wrap._kind = "approx_date";
    wrap._inputs = [di, ps, as];
    wrap._validate = validate;
    validate(); // flag any pre-existing malformed value on render
    return wrap;
  } else if (f.control === "number") {
    ctrl = document.createElement("input");
    ctrl.type = "number";
    ctrl.step = "any";
    ctrl.value = val != null ? val : "";
  } else if (f.control === "bool") {
    ctrl = document.createElement("input");
    ctrl.type = "checkbox";
    ctrl.checked = !!val;
    ctrl.style.width = "auto";
  } else {
    ctrl = document.createElement("textarea");
    ctrl.value = val != null ? val : "";
  }
  ctrl.oninput = ctrl.onchange = () => mark(wrap, true);
  wrap._kind = f.control;
  wrap._inputs = [ctrl];
  wrap.appendChild(ctrl);
  return wrap;
}

function mark(wrap, changed) {
  wrap.classList.toggle("changed", changed);
}

// Order-insensitive canonical form so {date,precision,anchor} compares equal
// regardless of key order — used to decide whether a field actually changed.
function canon(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x === undefined ? null : x);
  if (Array.isArray(x)) return "[" + x.map(canon).join(",") + "]";
  return (
    "{" +
    Object.keys(x)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canon(x[k]))
      .join(",") +
    "}"
  );
}
function sameValue(a, b) {
  return canon(a) === canon(b);
}

function collectEdits(card, ev) {
  const edits = {};
  card.querySelectorAll(".fld").forEach((wrap) => {
    const name = wrap.dataset.name,
      kind = wrap._kind,
      ins = wrap._inputs || [];
    if (kind === "evidence_verbatim" || kind === "readonly") return; // read-only, never edited
    const orig = ev.fields ? ev.fields[name] : undefined;
    let v;
    if (kind === "approx_date") {
      const date = ins[0].value.trim() || null,
        prec = Number(ins[1].value);
      const anchor = ins[2] && ins[2].value ? ins[2].value : null;
      const origIsObj = orig && typeof orig === "object";
      if (date === null && prec === 0 && anchor === null && !origIsObj) {
        v = null;
      } else {
        v = { date: date, precision: prec };
        // Include anchor to match the stored shape; omit only when there's no
        // anchor selected AND the original had no anchor key (avoids false edits).
        if (anchor !== null || (origIsObj && "anchor" in orig)) v.anchor = anchor;
      }
    } else if (kind === "bool") {
      v = ins[0].checked;
    } else if (kind === "number") {
      v = ins[0].value === "" ? null : Number(ins[0].value);
    } else {
      v = ins[0].value;
    }
    if (!sameValue(v, orig === undefined ? null : orig)) edits[name] = v;
  });
  return edits;
}

async function saveVerdict(card, ev, verdict, comment) {
  // Don't persist malformed dates — make the reviewer fix them first.
  let bad = false;
  card.querySelectorAll(".fld").forEach((wrap) => {
    if (wrap._kind === "approx_date" && wrap._validate && !wrap._validate()) bad = true;
  });
  if (bad) {
    alert(
      "Please fix the highlighted date(s) first — use YYYY-MM-DD (set precision for approximate dates)."
    );
    return;
  }
  const edits = collectEdits(card, ev);
  const review = {
    event_key: ev.event_key,
    mrn: S.sel,
    event_type: ev.event_type,
    note_id: ev.note_id,
    verdict: verdict,
    edits: edits,
    comment: comment || "",
    reviewer: document.getElementById("reviewer").value || "",
    reviewed_at: new Date().toISOString(),
  };
  const r = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(review),
  });
  const res = await r.json();
  if (!res.ok) {
    alert("Save failed: " + (res.error || "unknown"));
    return;
  }
  S.reviews[ev.event_key] = review;
  // re-render just this card in place
  const fresh = renderCard(S.byMrn[S.sel], ev);
  card.replaceWith(fresh);
  renderSidebar();
  updateProgress();
}

function updateProgress() {
  let done = 0,
    tot = 0;
  for (const p of S.data.patients) {
    const [d, t] = patientCounts(p);
    done += d;
    tot += t;
  }
  const pct = tot ? Math.round((100 * done) / tot) : 0;
  document.getElementById("prog").style.width = pct + "%";
  document.getElementById("progtxt").textContent = done + " / " + tot + " reviewed";
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// A small "label: value" chip that copies the raw value on click — for pasting
// MRN / note id / date straight into the EMR. localhost counts as a secure context
// so navigator.clipboard works; fallbackCopy covers anything that doesn't.
function makeCopyChip(label, value) {
  const v = value == null ? "" : String(value);
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "copychip";
  chip.title = "Click to copy " + label + ": " + v;
  chip.innerHTML =
    '<span class="ck">' +
    escapeHtml(label) +
    '</span><span class="cv">' +
    escapeHtml(v) +
    "</span>";
  chip.onclick = (e) => {
    e.stopPropagation();
    copyText(v, chip);
  };
  return chip;
}
function copyText(text, el) {
  const done = () => {
    if (!el) return;
    el.classList.add("copied");
    setTimeout(() => el.classList.remove("copied"), 900);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}
function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
  } catch (e) {}
  document.body.removeChild(ta);
  done && done();
}

// Flatten all evidence_verbatim snippets for an event into a list of quote strings.
function gatherEvidence(ev, spec) {
  const out = [];
  for (const f of spec.fields || []) {
    if (f.control !== "evidence_verbatim") continue;
    const v = ev.fields ? ev.fields[f.name] : null;
    const list = Array.isArray(v) ? v : v != null && v !== "" ? [v] : [];
    for (const item of list) {
      // defensively split legacy ' ||| '-joined snippets too
      String(item)
        .split(" ||| ")
        .forEach((s) => {
          const t = s.trim();
          if (t) out.push(t);
        });
    }
  }
  return out;
}

// Render note text as HTML with each quote highlighted. Matching is
// whitespace-flexible (a run of whitespace in the quote matches any whitespace
// in the note) because note text was normalized — 2+ spaces became newlines —
// so an exact substring match would otherwise miss. Case-insensitive.
function buildHighlightedNote(text, quotes) {
  if (!text) return escapeHtml("(note text unavailable)");
  const ranges = [];
  (quotes || []).forEach((q) => {
    const t = String(q).trim();
    if (t.length < 3) return;
    const pat = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    let re;
    try {
      re = new RegExp(pat, "gi");
    } catch (e) {
      return;
    }
    let m,
      guard = 0;
    while ((m = re.exec(text)) !== null && guard++ < 5000) {
      if (m[0].length) ranges.push([m.index, m.index + m[0].length]);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  });
  if (!ranges.length) return escapeHtml(text);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  let out = "",
    pos = 0;
  for (const [s, e] of merged) {
    out += escapeHtml(text.slice(pos, s));
    out += '<mark class="hl">' + escapeHtml(text.slice(s, e)) + "</mark>";
    pos = e;
  }
  out += escapeHtml(text.slice(pos));
  return out;
}

// Scroll to + flash the highlighted span matching a clicked evidence snippet.
function flashEvidence(card, q) {
  if (!card) return;
  const norm = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();
  const target = norm(q);
  for (const mk of card.querySelectorAll(".note mark.hl")) {
    const mt = norm(mk.textContent);
    if (mt && (mt.includes(target) || target.includes(mt))) {
      mk.scrollIntoView({ block: "center", behavior: "smooth" });
      mk.classList.add("flash");
      setTimeout(() => mk.classList.remove("flash"), 1300);
      return;
    }
  }
}

// In the browser there is no `module`, so boot the app. Under Node (the test
// runner) export the pure helpers instead of booting — init() needs a DOM.
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    canon,
    sameValue,
    shortenPath,
    gatherEvidence,
    buildHighlightedNote,
    escapeHtml,
  };
} else {
  init();
}
