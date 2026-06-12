/* Orange Nelumbo — adaptive diagnostic front-end (vanilla JS) */
const API = "/api/step";
const MAX = 20;

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 2) => (x >= 0 ? "+" : "") + Number(x).toFixed(d);
const sigmoid = (t, b, a = 1) => 1 / (1 + Math.exp(-a * (t - b)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let CLUSTERS = [];

/* ----------------------------------------------------------------- API */
async function api(payload) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("api " + res.status);
  return res.json();
}

async function boot() {
  try {
    const meta = await (await fetch(API)).json();
    $("fItems").textContent = meta.items;
    $("fClusters").textContent = meta.clusters.length;
    CLUSTERS = meta.clusters;
  } catch (e) {
    // static preview without backend — keep intro usable
    $("fItems").textContent = "239";
    $("fClusters").textContent = "9";
  }
}

/* --------------------------------------------------------------- views */
function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("is-on"));
  $(view).classList.add("is-on");
}
function setMode(mode) {
  document.querySelectorAll(".mode").forEach((m) => {
    const on = m.dataset.mode === mode;
    m.classList.toggle("is-on", on);
    m.setAttribute("aria-selected", on ? "true" : "false");
  });
  show(mode === "sim" ? "sim" : "intro");
}

/* -------------------------------------------------------- axis drawing */
const SVG = "http://www.w3.org/2000/svg";
function el(tag, attrs) {
  const n = document.createElementNS(SVG, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function renderAxis(svg, theta, se, bs, accent = "#f3a64c") {
  const W = 600, H = 190, padL = 30, padR = 30, top = 18, base = 132;
  const X = (t) => padL + ((t + 3) / 6) * (W - padL - padR);
  const Y = (p) => base - p * (base - top); // p in 0..1
  svg.innerHTML = "";

  // baseline + ticks
  svg.appendChild(el("line", { x1: padL, y1: base, x2: W - padR, y2: base, stroke: "rgba(255,255,255,0.18)", "stroke-width": 1 }));
  for (let t = -2; t <= 2; t++) {
    svg.appendChild(el("line", { x1: X(t), y1: base, x2: X(t), y2: base + 5, stroke: "rgba(255,255,255,0.22)" }));
    const lab = el("text", { x: X(t), y: base + 20, fill: "#6b7280", "font-size": 11, "text-anchor": "middle", "font-family": "Space Mono, monospace" });
    lab.textContent = (t > 0 ? "+" : "") + t;
    svg.appendChild(lab);
  }

  // logistic response curve (the 1PL link, centred at theta)
  let d = "";
  for (let i = 0; i <= 120; i++) {
    const t = -3 + (6 * i) / 120;
    const p = sigmoid(t, theta);
    d += (i === 0 ? "M" : "L") + X(t).toFixed(1) + "," + Y(p).toFixed(1) + " ";
  }
  svg.appendChild(el("path", { d, fill: "none", stroke: "rgba(58,214,196,0.55)", "stroke-width": 2 }));

  // SE band
  if (se != null && isFinite(se)) {
    const x1 = X(Math.max(-3, theta - se)), x2 = X(Math.min(3, theta + se));
    svg.appendChild(el("rect", { x: x1, y: top, width: Math.max(1, x2 - x1), height: base - top, fill: accent, opacity: 0.12, rx: 4 }));
  }

  // administered item ticks (by difficulty b)
  (bs || []).forEach((b) => {
    svg.appendChild(el("line", { x1: X(b), y1: base - 6, x2: X(b), y2: base + 6, stroke: "rgba(58,214,196,0.5)", "stroke-width": 1.5 }));
  });

  // theta marker
  const xt = X(Math.max(-3, Math.min(3, theta)));
  svg.appendChild(el("line", { x1: xt, y1: top, x2: xt, y2: base, stroke: accent, "stroke-width": 1.5, "stroke-dasharray": "3 3", opacity: 0.7 }));
  svg.appendChild(el("circle", { cx: xt, cy: Y(sigmoid(theta, theta)), r: 7, fill: accent, opacity: 0.25 }));
  svg.appendChild(el("circle", { cx: xt, cy: Y(0.5), r: 5, fill: accent, stroke: "#0c0e13", "stroke-width": 1.5 }));
}

/* ============================================================ TEST flow */
const T = { answers: [], current: null, bs: [], clusterStats: {} };

function clusterChipsInit(container) {
  container.innerHTML = "";
  CLUSTERS.forEach((c) => {
    const s = document.createElement("span");
    s.className = "cchip";
    s.dataset.cluster = c;
    s.textContent = c.replace(/ & /g, " & ").split(" ").slice(0, 2).join(" ");
    s.title = c;
    container.appendChild(s);
  });
}
function clusterChipsUpdate(container) {
  container.querySelectorAll(".cchip").forEach((chip) => {
    const st = T.clusterStats[chip.dataset.cluster];
    chip.classList.remove("hit", "miss");
    if (st) chip.classList.add(st.wrong > 0 ? "miss" : "hit");
  });
}

async function startTest() {
  T.answers = []; T.current = null; T.bs = []; T.clusterStats = {};
  $("nMax").textContent = MAX;
  clusterChipsInit($("clusterChips"));
  show("test");
  try {
    const res = await api({ answers: [], config: { max_items: MAX } });
    applyStep(res);
  } catch (e) {
    $("qText").textContent = "Backend not reachable. Deploy to Vercel (or run `vercel dev`) so /api/step is live.";
  }
}

function renderQuestion(item) {
  T.current = item;
  $("qCluster").textContent = item.cluster || "—";
  $("qYear").textContent = item.session || "—";
  $("qDiff").textContent = "b " + fmt(item.b);
  $("qType").textContent = (item.question_type || "") + (item.multi_concept ? " · multi-concept" : "");
  $("qText").textContent = item.summary || item.item_id;
  $("qAnswer").textContent = item.answer || "(not recorded)";
  $("answerWrap").hidden = true;
  $("preReveal").hidden = false;
  $("postReveal").hidden = true;
}

function applyStep(res) {
  $("thetaVal").textContent = fmt(res.theta);
  $("seVal").textContent = res.se == null ? "—" : res.se.toFixed(2);
  $("nNow").textContent = res.n_answered;
  $("progBar").style.width = (100 * res.n_answered / MAX) + "%";
  $("bandText").textContent = res.ability_band || "";
  renderAxis($("axis"), res.theta, res.se, T.bs);
  clusterChipsUpdate($("clusterChips"));

  if (res.done || !res.next_item) { showResult(res); return; }
  renderQuestion(res.next_item);
}

async function mark(correct) {
  if (!T.current) return;
  const it = T.current;
  T.answers.push({ item_id: it.item_id, correct: correct ? 1 : 0 });
  T.bs.push(it.b);
  const st = (T.clusterStats[it.cluster] ||= { seen: 0, wrong: 0 });
  st.seen++; if (!correct) st.wrong++;
  try {
    const res = await api({ answers: T.answers, config: { max_items: MAX } });
    applyStep(res);
  } catch (e) {
    $("qText").textContent = "Backend not reachable.";
  }
}

function showResult(res) {
  $("rTheta").textContent = "θ " + fmt(res.theta);
  $("rBand").textContent = res.ability_band || "";
  $("rScore").textContent = res.score + "/" + res.n_answered;
  $("rN").textContent = res.n_answered;
  $("rSe").textContent = res.se == null ? "—" : res.se.toFixed(2);

  const weak = Object.entries(T.clusterStats)
    .filter(([, s]) => s.wrong > 0)
    .sort((a, b) => b[1].wrong - a[1].wrong);
  const box = $("repair"); box.innerHTML = "";
  if (weak.length === 0) {
    const r = document.createElement("div"); r.className = "rrow";
    r.innerHTML = "<span>No missed clusters — clean run. Push the difficulty by retaking.</span>";
    box.appendChild(r);
  } else {
    weak.forEach(([c, s]) => {
      const r = document.createElement("div"); r.className = "rrow";
      r.innerHTML = `<b>${s.wrong}×</b><span>${c} — route here for concept repair</span>`;
      box.appendChild(r);
    });
  }
  show("result");
}

/* ====================================================== SIMULATION flow */
let simBusy = false;
async function runSim() {
  if (simBusy) return; simBusy = true;
  const trueTheta = parseFloat($("simTheta").value);
  $("simMax").textContent = MAX;
  $("simLog").innerHTML = "";
  let answers = [], bs = [];
  show("sim");
  try {
    let res = await api({ answers, config: { max_items: MAX, seed: Math.floor(Math.random() * 1e6) } });
    while (!res.done && res.next_item) {
      const it = res.next_item;
      const p = sigmoid(trueTheta, it.b);
      const correct = Math.random() < p ? 1 : 0;
      answers.push({ item_id: it.item_id, correct });
      bs.push(it.b);

      // log row
      const row = document.createElement("div"); row.className = "logrow";
      row.innerHTML = `<span>${it.item_id} · b ${fmt(it.b)}</span><span class="${correct ? "ok" : "no"}">${correct ? "right" : "miss"}</span>`;
      $("simLog").prepend(row);

      res = await api({ answers, config: { max_items: MAX, seed: 7 } });

      $("simThetaVal").textContent = fmt(res.theta);
      $("simErr").textContent = fmt(res.theta - trueTheta);
      $("simN").textContent = res.n_answered;
      $("simBar").style.width = (100 * res.n_answered / MAX) + "%";
      $("simBand").textContent = res.ability_band || "";
      renderAxis($("simAxis"), res.theta, res.se, bs);
      await sleep(260);
    }
    $("simBand").textContent =
      `Recovered θ ${fmt(res.theta)} against true ${fmt(trueTheta)} in ${res.n_answered} items (SE ${res.se?.toFixed(2) ?? "—"}).`;
  } catch (e) {
    $("simBand").textContent = "Backend not reachable. Deploy to Vercel (or run `vercel dev`).";
  }
  simBusy = false;
}

/* ------------------------------------------------------------- wire up */
document.querySelectorAll(".mode").forEach((m) =>
  m.addEventListener("click", () => setMode(m.dataset.mode))
);
$("startBtn").addEventListener("click", startTest);
$("againBtn").addEventListener("click", () => { setMode("test"); startTest(); });
$("revealBtn").addEventListener("click", () => {
  $("answerWrap").hidden = false;
  $("preReveal").hidden = true;
  $("postReveal").hidden = false;
});
$("rightBtn").addEventListener("click", () => mark(true));
$("wrongBtn").addEventListener("click", () => mark(false));
$("simTheta").addEventListener("input", (e) => { $("simThetaLab").textContent = fmt(e.target.value); });
$("simRun").addEventListener("click", runSim);

// init empty axes + facts
renderAxis($("axis"), 0, 1, []);
renderAxis($("simAxis"), 0, 1, []);
boot();
