# Falsify

[![CI](https://github.com/suyash503/falsify/actions/workflows/ci.yml/badge.svg)](https://github.com/suyash503/falsify/actions/workflows/ci.yml)

**A research tool that turns a vague market question into an experiment, and then argues with the result.**

Ask *"Does buying NIFTY after a sharp fall work?"* and most tools will hand you a number. This one starts by pointing out that the question cannot be answered as asked, refuses to guess the two things that would decide the answer, and — once you have decided them — tests the idea against nineteen years of NIFTY 50 history *and against simply having been invested*, which is the comparison that actually settles the question.

On the seed question, the honest answer is **no evidence**. The tool says so.

```bash
git clone https://github.com/suyash503/falsify.git && cd falsify
npm install
npm run dev
```

No API key. No database. No accounts. It works.

---

## What it does

The journey is **ASK → CLARIFY → DEFINE → TEST → LEARN**.

| Stage | What happens |
|---|---|
| **Ask** | You type the question in your own words. |
| **Clarify** | The system names what the question left undefined and blocks on the two decisions that change the answer most: what counts as a "sharp fall", and how long you would hold. Each option is annotated with how often it actually occurred — choosing "3% or more" shows you that means 79 occurrences in nineteen years, *before* you choose it. |
| **Define** | The question becomes a written experiment. Every parameter carries a visible tag: **yours**, **assumed**, or **undecided** — with the reasoning behind each assumption. |
| **Test** | The backtest runs, and so does an unconditional baseline: identical rules, identical costs, applied to *every* session in the window. |
| **Learn** | "What the data shows" and "what the system concludes" are separate panels, joined by a third stating what the result specifically does **not** establish. Follow-up experiments are buttons that fork into child records. |

---

## The three ideas this is built on

### 1. The baseline is the whole answer

A backtest reporting *"+1.2% per trade"* has answered nothing, because it never said what the alternative was. NIFTY rose roughly fivefold over the period studied, so almost any rule that puts you in the market for a while shows a profit.

So every experiment also runs the identical rules — same exit, same holding period, same costs — starting on **every** session in the test window. The only number that speaks to the question is the difference between the two.

This is what makes the result legible. Holding for 60 sessions after a 2% fall returns **+2.87%**, which sounds like a finding — until the baseline shows **+2.08%** for doing it on any random day. Nearly all of the "edge" was just market drift.

### 2. Nothing enters the experiment without a declared origin

The brief asks a system to distinguish what the user said, what it assumed, and what it should ask. Rather than treat that as a presentation concern, provenance is a property of every parameter in the type system. Nothing reaches the engine untagged.

Two parameters are judged too consequential to decide on the user's behalf and **block the run** until answered. The rest carry defaults with the reasoning attached — including one the system *does* decide unilaterally, because the alternative is not a preference but an error (see look-ahead, below).

### 3. The language model never produces a number

The LLM reads English: it extracts what you stated, names what is ambiguous, and writes the final explanation. It does **not** choose thresholds, compute statistics, or reach a verdict.

The verdict comes from `concludeFrom()` — ordinary, unit-tested code — and is handed to the narrator as a **fixed input it is instructed to express, not revisit**. The failure mode being designed out is the obvious one: a fluent model talking its way into a confident claim the evidence does not support. It cannot fabricate a statistic because it is never in a position to produce one.

> **Note on the live demo:** no API key is configured there, so it runs on the rule-based reader and the template writer. The app states which path produced each stage in its own interface. Set `GEMINI_API_KEY` (free tier, no card) to exercise the model path — nothing else changes.

---

## What the system knows can go wrong

"What could go wrong" is not a section in a document here; it is a set of checks that run on every experiment and can **veto the conclusion**.

| Guard | Fires when |
|---|---|
| `LOOK_AHEAD_ENTRY` | Entry uses the same close that generated the signal. **Invalidates the result.** |
| `NO_TRADES` | The condition never occurred — itself a finding. |
| `SMALL_SAMPLE` | Fewer than 30 occurrences. |
| `REGIME_CONCENTRATION` | Over 30% of trades fall in one calendar year. |
| `MULTIPLE_TESTING` | Several variants tested on the same data; reports the family-wise error rate. |
| `OVERLAPPING_TRADES` | Positions share days, so observations are not independent. |
| `SAME_BAR_AMBIGUITY` | Target and stop both reachable in one session. |
| `COSTS_DOMINATE` | A real pattern exists but costs consume all of it. |
| `SHORT_TEST_PERIOD` | Window shorter than a market cycle. |
| `LOOKBACK_WARMUP` | A lookback signal cannot fire in the opening stretch of the data. |
| `PRICE_INDEX_ONLY`, `NOT_DIRECTLY_TRADABLE`, `TRUNCATED_TAIL` | Structural limits, always reported. |

The verdict ladder is **`INVALID` → `NO_EVIDENCE` → `WEAK_EVIDENCE` → `SUGGESTIVE`**.

There is deliberately **no rung above `SUGGESTIVE`**. One backtest on one index over one era cannot establish that a trading rule works, and offering a stronger word would be the most dishonest thing this product could do. A test asserts this.

### Look-ahead bias, specifically

The fall is measured at the **closing** price. You cannot know the close until the session is over, by which point you can no longer trade at it. So entry is always at the **next session's open**.

The impossible version is available as a diagnostic — the app offers to run it — and any result it produces is marked `INVALID` rather than reported. Seeing the number move is more persuasive than being told the rule exists.

---

## Architecture

```
  Browser
     │
     ▼
  Next.js App Router ── Route Handlers (REST)
     │                        │
     │                        ▼
     │                  src/server/experiments.ts     ← the pipeline, as plain functions
     │                    │         │          │
     │                    ▼         ▼          ▼
     │              src/agents   src/core    src/db
     │              (language)  (decisions)  (journal)
     │                    │         │          │
     │                    ▼         │          ▼
     │              src/llm/*       │     Postgres | in-memory
     │           Gemini|Groq|       │
     │           Anthropic|rules    ▼
     │                         data/nifty50_daily.csv  ← frozen, checksummed
     ▼
  pipeline/fetch_nifty.py  ← build-time: fetch, validate, freeze
```

**Ports and adapters, applied twice.** Both external dependencies are optional and swappable behind one interface:

- **LLM** → Gemini, Groq, or Anthropic, falling back to a rule-based reader when no key exists *or when the provider fails mid-request*.
- **Storage** → Postgres via Drizzle when `DATABASE_URL` is set, otherwise an in-process store.

Both degradations are **stated in the interface**, never hidden. A journal that silently forgets would be worse than no journal.

`src/core/` is pure: no framework, no I/O, no network. That is why the engine is testable, and why the significance number is reproducible.

### Layout

```
src/core/         domain — spec, assumption ledger, engine, statistics, guards
src/agents/       the language layer + its deterministic twin
src/llm/          provider adapters, structured output with schema repair
src/db/           repository interface, Postgres and in-memory implementations
src/server/       dataset loader, pipeline orchestration
src/app/          pages and REST route handlers
src/components/   interface, hand-built SVG charts
pipeline/         Python: fetch, validate and freeze the dataset
evals/            golden set + scored runner for the interpretation stage
tests/            70 tests
```

---

## Technology, and why

| Choice | Reasoning |
|---|---|
| **Next.js 16 + TypeScript** | One deployable, one language across UI and API. The domain is modelled with discriminated unions and Zod, so an invalid experiment is unrepresentable rather than merely unlikely. |
| **Backtest engine in TypeScript** | Keeps it in-process — no second service to deploy, no cold start between a click and a result. It is a few hundred lines of pure functions; the reach for pandas would have bought a network hop. |
| **Python for the data pipeline** | Where pandas genuinely earns its place: fetching, validating and freezing the dataset, with a full quality report. Runs at build time, not in the request path. |
| **Postgres + Drizzle** | The journal is the point — versioned specs, lineage, multiple-testing counts. Lineage is a real column with an index; the research artefacts are JSONB because they are always read whole. |
| **Zod at every boundary** | HTTP bodies and model output are both untrusted input and are validated identically. Model output gets exactly one schema-guided repair attempt, then the deterministic path takes over. |
| **Hand-built SVG charts** | The key chart draws two distributions on one axis from real binned data. Full control over the theme mattered more than a charting dependency; recharts was installed, went unused, and was removed. |
| **No LLM framework** | A three-step pipeline with typed inputs and outputs does not need an orchestration framework. Adding one would have hidden the part worth showing. |

---

## Data

NIFTY 50 daily OHLC, **4,659 sessions from 2007-09-17 to 2026-09-11**, fetched from the Yahoo Finance chart API, validated, and committed as a checksummed CSV.

It is frozen deliberately. A backtest whose input changes between runs is not a research tool, and a deployed demo should not depend on a third party having a good minute. `data/nifty50_daily.meta.json` carries the checksum, provenance and full quality report.

The validator dropped 34 rows of holiday padding (sessions with null prices) and flagged three extreme moves it kept: **2008-10-24 (−12.2%)**, **2009-05-18 (+17.7%)** and **2020-03-23 (−13.0%)**. All three are real history, which is exactly why they are flagged for a human rather than filtered by a threshold.

**Known limitations**, surfaced in the app itself:

- It is a **price index** — dividends are excluded, understating long holds by roughly 1–1.5% a year.
- The index is **not directly tradable**; a real implementation trades a future or an ETF, each with its own tracking error, roll cost and spread.
- One index, one country, one era.

Refresh with `npm run data`.

---

## Key assumptions

| Assumption | Value | Why |
|---|---|---|
| Entry timing | Next session's open | The only timing that is physically possible. Not offered as a preference. |
| Brokerage | 5 bps each way | Retail index exposure via a liquid ETF or near-month future. |
| Slippage | 10 bps each way | Assuming zero cost is the most common way a backtest flatters itself. |
| Overlapping trades | Disallowed by default | Falls cluster; overlapping positions share market movement and inflate apparent sample size. |
| Same-bar target *and* stop | Assume the stop | Daily data cannot order intrabar events. Resolve against the strategy, and count how often. |
| Trades running past the data | Dropped, not truncated | A shortened trade is measured over a shorter horizon and would bias the average. |
| Test period | Full history | Avoids quietly choosing a window that flatters the result. |

---

## Statistical method

Significance is a **one-sided bootstrap**: draw thousands of randomly-timed trade sets of the same size from the baseline, and report how often chance alone does at least as well.

The resampling uses **contiguous blocks, not independent draws**. Forward returns overlap heavily — the 5-day return starting Monday shares four days with Tuesday's — so treating them as independent understates the true variation and manufactures significance out of noise. Block resampling preserves that correlation.

The seed is derived from the experiment definition, so an identical experiment always returns an identical p-value and a changed one honestly returns a new one. There is a test for this.

---

## LLM evaluation

The interpretation stage has a **golden set** (`evals/`) of nine cases and 23 checks, scored by a runner that exits non-zero below 90%.

```bash
npm run eval                 # scores whichever reader is configured
npm run eval:deterministic   # forces the rule-based reader (runs in CI)
npm run eval -- --json report.json
```

The checks that matter most are the **negative** ones — that the reader reports a `null` when you did not state something. A model that helpfully fills in "−2%" because that is a common threshold has silently made your decision for you, and no amount of downstream honesty repairs it.

The trap case is `percentage-trap`: *"Does NIFTY really return 12% a year?"* An eager reader captures 12% as a fall threshold and builds a plausible-looking experiment answering a question nobody asked.

**This harness has already earned its place.** On its first run it failed two cases and exposed two real bugs: the reader missed word-numbers (`"holding one month"`), and it marked *"What is the best NIFTY options straddle strategy?"* as testable because the question mentioned NIFTY — it would have quietly run the wrong experiment. Both are fixed, and both are now regression tests.

The same cases run against the deterministic reader in the unit suite, so the fallback — the path a reviewer actually meets — cannot rot unnoticed.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

**Optional configuration** (copy `.env.example` to `.env.local`):

```bash
GEMINI_API_KEY=...   # free tier, no card: https://aistudio.google.com/apikey
DATABASE_URL=...     # any Postgres; free tier: https://neon.tech
```

With a database:

```bash
npm run db:push      # apply the schema
```

**Verification:**

```bash
npm test             # 70 tests
npm run typecheck    # runs `next typegen` first - the PageProps and
                     # RouteContext helpers are generated, not committed
npm run eval:deterministic
npm run build
```

CI runs all four on every push.

---

## What I would do next

1. **A real out-of-sample holdout.** The journal counts variants and warns as the family-wise error rate climbs, but counting is not a substitute for data you have not looked at. I would reserve the most recent three years, lock it, and require a finding to survive there before the UI would call it anything.
2. **A placebo test.** Run the identical machinery on a *rise* condition. If buying after sharp rises produces a similar edge, the "dip" was never the mechanism. This is the single cheapest way to catch a spurious result and it is the first thing I would add.
3. **Intraday data**, to resolve the same-bar target/stop ambiguity honestly instead of pessimistically.
4. **Total-return data**, so long holds stop being understated by the dividend yield.
5. **More instruments**, so "does this generalise?" becomes a question the tool can answer rather than a caveat it prints.
6. **Streamed narration**, and Langfuse tracing on the model calls — the provenance is recorded per stage already, but it is not yet aggregated anywhere you could spot drift.
7. **Auth and multi-user journals.** Everything is single-tenant today.

---

## AI tools used

Claude Code did most of the implementation, with the architecture, the statistical method and the product decisions argued out in conversation rather than accepted from it. The full account — what was rejected and why — is in [`AI_USAGE.md`](./AI_USAGE.md).

---

## A note on scope

The brief said *"Build less. Think more."*

The things I chose **not** to build are as deliberate as the things I did: no LLM framework, no vector database, no multi-instrument support, no user accounts, no live data feed, no charting library. Each would have added surface area without making the central question — *does this result mean anything?* — any easier to answer honestly.
