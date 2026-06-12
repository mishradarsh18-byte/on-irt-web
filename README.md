# Orange Nelumbo — Differential Equations Adaptive Diagnostic

A live 1PL item-response (IRT) adaptive test over the 239 previous-year JEE
Differential Equations questions from your `14_ON_Differential_Equations_KG`
knowledge graph. The model picks each question to be maximally informative about
the student's current ability, re-estimates ability after every answer, and
stops when it is confident.

Static front-end + one pure-Python serverless function. No build step, no
runtime dependencies — deploys to Vercel as-is.

---

## Deploy to Vercel (GitHub)

1. Create a new GitHub repo and push this folder:
   ```bash
   git init
   git add .
   git commit -m "Orange Nelumbo adaptive diagnostic"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. Go to vercel.com → **Add New… → Project** → import the repo.
3. Framework preset: **Other**. Leave build/output settings empty. **Deploy.**

That's it. Vercel auto-detects `api/step.py` as a Python serverless function and
serves `index.html` at the root. Nothing to configure.

## Preview locally first (optional)

No dependencies needed:
```bash
python3 serve.py        # open http://localhost:8000
```
`serve.py` imports the exact same runtime Vercel uses, so local == production.

---

## What you can do on the site

- **Take the diagnostic.** Real previous-year items are served adaptively. Solve
  each on paper, reveal the stored answer, mark yourself *I solved it / I missed
  it*. Ability θ, standard error, and concept coverage update live; the result
  screen flags the clusters you missed for concept repair.
- **Watch it think.** Set a "true" ability with the slider and watch the engine
  recover it from scratch, item by item, on the logistic axis.

> The workbook is a PYQ index, so items carry a one-line summary + the answer,
> not full option text — hence the self-assessment flow. To show full questions,
> just add a `text`/`options` field per item (see "Swapping in full questions").

---

## How the model works

1PL / Rasch-class response function:

    P(correct | θ, b) = 1 / (1 + exp(-a·(θ − b)))

- **θ** student ability (logit scale), **b** item difficulty, **a** one shared
  discrimination (a = 1 is Rasch).
- Item difficulties are **seeded** from the workbook's 1–10 difficulty proxy via
  `b = (d − 5.5) / 1.5`, so the bank is adaptive on day one.
- **Ability** is estimated by Newton-Raphson MLE, with an EAP (normal-prior)
  fallback for all-right / all-wrong patterns where MLE diverges.
- **Selection** picks the unanswered item whose success probability is closest to
  a target (default 0.55 — near max-information but kinder than a pure 0.5
  coin-flip), with randomesque exposure control and content balancing across the
  nine concept clusters.
- **Stopping**: standard error ≤ 0.40 (after a 6-item minimum), or 20 items.

The serverless function is **stateless**: the browser holds the answer history
and posts it each step; the server recomputes θ and returns the next item.

## Project layout

```
api/step.py        serverless function: pure-python 1PL runtime + embedded bank
index.html         the page
styles.css         dark-luxe theme (Fraunces / Inter / Space Mono)
app.js             adaptive flow, logistic-axis rendering, simulation
serve.py           local preview server (stdlib only)
tools/             OFFLINE calibration toolkit (not deployed)
  irt_1pl.py         numpy 1PL engine: MLE/EAP, CAT, penalised JMLE calibration
  build_item_bank.py workbook Question Index -> item_bank.json
  demo.py            simulation proving θ recovery + calibration
  item_bank.json     full bank (source of the embedded copy in api/step.py)
```

## Recalibration workflow (once you have real responses)

The deployed bank uses proxy-seeded difficulties. After you collect responses,
calibrate in Python and re-embed:

```bash
cd tools
pip install -r requirements-dev.txt
python3 demo.py                      # see calibrate_jmle in action
# 1) run calibrate_jmle on your response matrix -> updates item_bank.json (b, a)
# 2) regenerate the base64 bank embedded in ../api/step.py from item_bank.json
# 3) commit + push -> Vercel redeploys
```

`calibrate_jmle` uses a prior that anchors thin items to their seed, so
cold-start items stay sane until they have enough exposure (~150–200 responses).

## Swapping in full question text

Add `text` (and optionally `options`) to each record in `tools/item_bank.json`,
re-embed the bank into `api/step.py`, and render `next_item.text` instead of
`next_item.summary` in `app.js`. No model changes needed.

## Notes & limits

- One θ per student (unidimensional). For a per-topic ability vector, run one
  bank/session per concept cluster and let the knowledge graph own routing.
- Rasch (a = 1) information caps at 0.25/item, so SE ≈ 0.49 around 20 items;
  tune `se_stop` / `max_items` or use a calibrated a > 1 for shorter tests.
