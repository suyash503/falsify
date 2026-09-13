# AI Usage Note

> **Draft — rewrite in your own voice before submitting.** The facts below are an accurate
> record of how this was built. The judgements, especially the last section, should be yours.

## 1. Which tools

- **Claude Code (Opus 5)** — the large majority of the implementation: engine, agents, API, interface, tests, data pipeline.
- **Google Gemini (free tier)** — not a build tool but a *runtime* dependency, behind a provider interface. Anthropic's API has no free tier, which is what pushed the design toward being provider-agnostic rather than coupled to one vendor.

## 2. What I used them for

Writing code, mostly. The architecture, the statistical method, and every product decision were argued out in conversation first; the AI then implemented against decisions that were already made. Where I used it most valuably was as something to disagree with — proposing an approach, having it push back, and keeping whichever argument survived.

## 3. Decisions I made myself

- **Comparing against a baseline rather than against zero.** This is the core idea of the product. A backtest reporting "+1.2% per trade" answers nothing without saying what the alternative was; NIFTY rose fivefold over the period, so almost any rule that keeps you invested shows a profit. Every experiment therefore runs the identical rules on *every* session for comparison.
- **The guards, and the verdict ladder that tops out at `SUGGESTIVE`.** No rung means "proven". One backtest on one index cannot establish that a rule works, and offering a stronger word would be the most dishonest thing the product could do.
- **The LLM is never allowed to produce a number or a verdict.** The verdict comes from deterministic code and is handed to the narrator as a fixed input. This kills the over-confident-conclusion failure mode architecturally rather than by asking a prompt nicely.
- **Blocking on exactly two questions.** Thresholds and holding period change the answer more than anything else, so the system refuses to pick them. Everything else gets a default with the reasoning attached.
- **Freezing the dataset at build time**, so results are reproducible and a demo does not depend on a third party's uptime.

## 4. What I rejected or changed

- **promptfoo for the evals.** Reasonable and well-known, but the assertions worth making here are not "does the output contain this string" — they are "did it correctly decline to invent a number the user never gave". Those are predicates over a typed object, so I wrote a harness that runs the real code path against the same Zod schema the app uses. A schema change now breaks the evaluation, which is the coupling I wanted.
- **LangChain / an agent framework.** A three-step pipeline with typed inputs and outputs does not need orchestration machinery, and adding it would have hidden the part worth showing.
- **recharts.** Installed, then removed unused. The key chart draws two distributions on one axis and needed exact control over binning and theme; three other scaffold dependencies went the same way.
- **A separate Python backtesting service.** Tempting because the role lists Python, but it would have added a network hop and a second deployment to a few hundred lines of pure functions. Python does the data pipeline, where pandas genuinely earns its place.

## 5. Bugs the AI wrote that I caught

Worth stating plainly, because "used AI extensively" and "checked the output" are not the same claim:

- **The experiment fingerprint was broken.** It used `JSON.stringify(spec, Object.keys(spec).sort())`. Passing an array as the replacer makes it a *recursive key allowlist*, which stripped every nested field — so every experiment hashed identically and lineage would have silently collapsed. A lineage test caught it.
- **A chart that fabricated its own data.** The first version of the distribution comparison reconstructed the baseline as a normal curve from a mean and the *strategy's* standard deviation. For a chart whose entire purpose is an honest shape comparison, that was indefensible. Replaced with real binned counts computed server-side.
- **Two interpreter bugs, found by the eval harness on its first run.** It missed word-numbers (`"holding one month"`), and it marked *"What is the best NIFTY options straddle strategy?"* as testable because the question mentioned NIFTY — it would have quietly run the wrong experiment. Both are now regression tests.
- **Two wrong test expectations of my own**, where the engine was right and the test was wrong. One of them exposed a genuine subtlety — a lookback signal cannot fire until it has a full window of history — which became a user-facing guard.

## 6. What I am most proud of

> *Replace this with your own answer.*

The part I would point at is that the system is built so it **cannot** oversell a result. The verdict is computed by code that can be unit-tested, the guards can veto it, the narrator is handed the verdict as a fixed input, and the chart draws the real overlap between the strategy and doing nothing special. On the assignment's own question, all of that machinery arrives at "no evidence" — and the most useful thing the tool does is say so clearly instead of finding a number that sounds like an answer.
