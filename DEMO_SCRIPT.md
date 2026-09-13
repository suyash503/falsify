# Demo script — 2:30

Read it roughly. Do not memorise it. Small stumbles are fine and make it sound human.

**Before you hit record**
- Open the deployed URL (or `localhost:3000` — a local recording is completely acceptable)
- Have a second tab on the GitHub repo
- Clear the journal if it is cluttered (restart the server — in-memory mode forgets)

**One rule: the third take ships.** Not the best take. The third one.

---

### 0:00 — 0:20 · What it is

> "This is Falsify. The brief asked what happens when a user asks *'does buying NIFTY
> after a sharp fall work?'* — and the point is that the question can't be answered as
> asked. 'Sharp fall' isn't defined, there's no holding period, and there's no statement
> of what we'd be comparing against. So I didn't build something that answers it. I built
> something that shows you what the question is missing, and then tests it honestly."

*Type the question. Click Investigate.*

---

### 0:20 — 0:55 · Clarify — the core idea

> "First thing it does is refuse to guess. It has picked defaults for most parameters,
> but there are two it won't decide for you: what counts as a sharp fall, and how long
> you'd hold. Those two move the answer more than the result itself does, so choosing
> them silently would make the conclusion the system's rather than yours."

*Point at the occurrence counts.*

> "And each option tells you what it costs you in sample size before you pick it. Three
> percent sounds more decisive than one percent — but it's 79 occurrences in nineteen
> years instead of 647. That's the trade-off, shown up front."

*Pick 2%, hold 5 days. Confirm.*

---

### 0:55 — 1:20 · Define — provenance

> "Now the question is a written experiment. Every parameter is tagged with where it
> came from — mine, or the system's — and every assumption carries its reasoning."

*Scroll the ledger. Stop on entry timing.*

> "This one the system decides on its own, deliberately. The fall is measured at the
> closing price, so the earliest you could actually act is the next morning's open.
> Buying at that same close would mean trading on a price that hadn't been set yet.
> That's look-ahead bias, and it's not a preference — it's an error. So it's the one
> assumption I let it make unilaterally."

---

### 1:20 — 1:55 · Test and Learn — the baseline

*Click Run.*

> "It runs the backtest — and it also runs the exact same rules on every other day in
> the period. That's the part that matters. NIFTY went up about fivefold over these
> nineteen years, so almost any rule that keeps you invested shows a profit. The only
> number that answers the question is the difference between the two."

*Point at the distribution chart.*

> "These are the two distributions. The blue is trades after a fall, the orange is any
> random day. They sit almost exactly on top of each other — that's the finding."

*Point at the verdict.*

> "So the verdict is NO EVIDENCE. Not because the return was negative, but because
> sixty percent of randomly-timed trade sets did just as well. And the system separates
> what the data shows from what it concludes, and then lists what this specifically does
> *not* establish."

---

### 1:55 — 2:15 · The look-ahead demo — the best beat

*Scroll to next experiments. Click "How much 'edge' appears if we cheat?"*

> "It also suggests what to investigate next, and each one forks into a child experiment
> that remembers where it came from. This one runs the impossible version — buying at
> the same close that generated the signal."

*Let it run.*

> "And it comes back INVALID. The system won't report a number from an experiment that
> used information that didn't exist yet. I think that's more convincing than just
> writing 'I avoided look-ahead bias' in a document."

---

### 2:15 — 2:40 · AI, and what's next

> "On AI — I used Claude Code for most of the implementation, but the split I care about
> is inside the product: the language model reads the question and writes the
> explanation, and that's all. It never picks a threshold, never computes a statistic,
> and never decides the verdict. That comes from ordinary tested code and gets handed to
> the model as a fixed input. So it can't talk itself into a confident answer the
> evidence doesn't support."

> "With more time: a real out-of-sample holdout, and a placebo test — running the same
> machinery on sharp *rises*. If buying after rises shows the same edge, then the dip was
> never the mechanism. That's the first thing I'd add."

---

## If you freeze

Say this and keep clicking — it is true and it is enough:

> "The short version: it refuses to guess the two things that matter, it compares against
> doing nothing special, and it's willing to tell you there's no evidence."
