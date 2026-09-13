# Demo script

Plain language. Read it roughly, in your own voice. Stumbles are fine — they make it
sound like a person.

**Before recording**
- Have the app open and ready
- Pre-run a completed experiment in a second tab so you are never waiting
- Pre-run the look-ahead fork in a third tab

---

### 1 · What it is

> "This is Falsify. It starts with the question *does buying NIFTY after a sharp fall
> work?*
>
> The problem is you can't actually answer that. Nobody has said what a sharp fall is.
> Or how long you'd hold it for. Or what you're even comparing it against.
>
> So instead of guessing, this shows you what's missing first."

*Type the question. Click Investigate.*

---

### 2 · It refuses to guess

> "The first thing it does is ask.
>
> It's picked sensible defaults for most settings. But there are two it won't decide for
> you — what counts as a sharp fall, and how long you'd hold. Those two change the answer
> more than anything else. If it picked them quietly, the answer would be its answer, not
> yours."

*Point at the numbers under each option.*

> "And it tells you how often each one actually happened. A three percent fall sounds more
> serious than one percent. But it's only happened 79 times in nineteen years, against
> 647. So you can see what you're giving up before you pick."

*Choose 2%, hold 5 days. Confirm.*

---

### 3 · The experiment, written out

> "Now it's a proper experiment. Every line says where it came from — did I choose it, or
> did the app? And if the app chose it, it says why."

*Scroll to entry timing.*

> "This one it decides on its own, on purpose.
>
> The fall is measured using the closing price. But you only know the closing price after
> the market shuts — and by then you can't buy at it any more. So it buys the next
> morning instead.
>
> That's not a preference. It's just the only thing that's actually possible."

---

### 4 · Running it

*Click Run.*

> "When I run it, it does two things. It tests my rule. And it also tests what would have
> happened if I'd just bought on any random day, using the exact same rules.
>
> That second one is the important bit. NIFTY went up about five times over these nineteen
> years. So almost anything that keeps you invested is going to look like it made money.
> The real question is whether buying after a fall did better than just buying."

*Point at the chart.*

> "These two shapes are those two things. Blue is buying after a fall. Orange is buying on
> any day. They're sitting almost exactly on top of each other.
>
> That's the answer."

*Point at the verdict.*

> "So it says: no evidence. Not because it lost money — but because when it tried
> thousands of random dates instead, most of them did just as well.
>
> And it keeps two things apart. Here's what the numbers say. And separately, here's what
> it thinks that means. Plus a list of what this doesn't prove."

---

### 5 · The cheating version

*Click the "how much edge if we cheat?" suggestion.*

> "It also suggests what to look at next, and each one opens as a new experiment that
> remembers where it came from.
>
> This one runs the cheating version — buying at that closing price you couldn't actually
> have bought at."

*Let it finish.*

> "And it refuses to give a result. It just says invalid.
>
> I liked that more than writing *'I avoided look-ahead bias'* in a document somewhere."

---

### 6 · AI, and what's next

> "On the AI side — I used Claude Code to write a lot of this.
>
> But the part I actually care about is inside the app. The AI reads your question, and it
> writes the explanation at the end. That's it. It doesn't pick any of the numbers, and it
> doesn't decide the verdict. That comes from normal code I can test.
>
> So it can't talk itself into sounding confident when the result doesn't back it up."

> "If I had more time — I'd hold back the last few years of data and test on those
> separately. And I'd run the whole thing on sharp *rises* instead of falls. If buying
> after rises looks just as good, then the fall was never the reason.
>
> That's the first thing I'd add."

---

## If you lose your place

Say this and keep going. It's true and it's enough:

> "The short version — it won't guess the two things that matter, it compares against just
> buying normally, and it's willing to tell you there's nothing here."

---

## Appendix — the same points, if someone asks in the interview

Plain version above, precise version here. You don't need these on camera.

| Plain | Precise |
|---|---|
| "buying on any random day" | the unconditional baseline — identical rules, exits and costs applied to every session in the window |
| "tried thousands of random dates" | a one-sided bootstrap, 4,000 resamples, p = 0.60 on the seed question |
| "in contiguous chunks, not single days" | circular block bootstrap — overlapping forward returns are autocorrelated, so an i.i.d. resample would manufacture significance |
| "the cheating version" | look-ahead bias — entry at the same close that produced the signal |
| "where each setting came from" | the provenance ledger: `user_stated`, `user_confirmed`, `system_assumed`, `needs_user_input` |
| "it won't say more than the evidence supports" | the verdict ladder stops at `SUGGESTIVE`; there is no "proven" rung, and a test asserts it |
| "reasons it could be wrong" | twelve guards; a critical one vetoes the conclusion outright |
