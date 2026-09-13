# AI Usage Note

> Section 6 is yours to write. Everything above it is a factual record — check it
> reflects your experience and change anything that doesn't.

## 1. Which tools

- **Claude Code (Opus 5)** — the large majority of the implementation, and a genuine
  partner on design: the backtest engine, the agent pipeline, the API, the interface, the
  tests and the Python data pipeline.
No language model is configured in the deployed prototype, and it is worth being explicit
about that rather than letting the architecture imply otherwise. The product has a working
integration layer — adapters for Gemini, Groq and Anthropic, schema-validated output and a
repair attempt when the model returns something invalid — but running it needs an API key,
and Anthropic has no free tier. That constraint is actually what shaped the design: rather
than couple the product to one vendor I could not afford, I made the model a replaceable
component with a rule-based reader behind it. The deployed app runs on that fallback, says
so in its own interface, and is fully functional either way. Supplying a key is a one-line
change.

## 2. What I used them for

Honestly: most of it. The code is AI-written, and several of the strongest ideas in the
architecture were proposed by the model rather than by me — comparing every result against
an unconditional baseline, the guard system that can veto a conclusion, and keeping the
language model structurally unable to produce a number or a verdict.

What I did with those proposals is the part I'd stand behind. I made the model explain each
one until I could restate it in my own words, pushed back where the reasoning was thin, and
rejected the pieces I couldn't justify. The clearest evidence of that is the Thinking Note:
I wrote it myself, in my own language, after working through the statistics rather than
paraphrasing an explanation. If I could not explain a decision without help, I took it as a
sign I did not yet understand it.

## 3. Decisions I made myself

- **Treating this as a real project rather than a submission.** That drove the choice to
  build the research journal and experiment lineage at all — neither is required by the
  brief.
- **Writing the Thinking Note myself**, and turning down offers to have it drafted. It is
  the part of the submission that is supposed to be my thinking, so having it written for me
  would have defeated the point.
- **Publishing the repository publicly straight away**, against a recommendation to keep it
  private until after submitting.
- **Shipping the demo video at five minutes** rather than re-recording toward the stated
  two-to-three. A video that exists beats a shorter one that never gets made, and
  timestamps let a reviewer skip to what they need.
- **Rewriting the demo narration in plain language.** The first version leaned on terms
  like "unconditional baseline" and "look-ahead bias" that I could not explain naturally on
  camera. If I could not say it simply, I did not understand it well enough to say it at
  all.
- **Recording locally instead of waiting on a deployment bug**, so that one broken thing did
  not block the thing that actually mattered.

## 4. What was rejected or changed

Some of these were my calls, some were the model's recommendation that I agreed with after
asking for the reasoning. I have not tried to claim them all.

- **promptfoo for the evaluation harness.** Rejected in favour of a bespoke one, because the
  assertions worth making are not "does the output contain this string" but "did it
  correctly refuse to invent a number the user never gave". Those are checks against a
  typed object, so running them through the real code path means a schema change breaks the
  evaluation.
- **An agent framework such as LangChain.** A three-step pipeline with typed inputs and
  outputs does not need orchestration machinery, and adding it would have hidden the part
  worth showing.
- **A separate Python backtesting service.** Tempting, since the role lists Python, but it
  would have added a network hop and a second deployment to a few hundred lines of pure
  functions. Python does the data pipeline instead, where it genuinely earns its place.
- **recharts**, installed and then removed unused, along with three other scaffold
  dependencies.

## 5. Where the AI was wrong

Worth stating plainly, because "used AI extensively" and "checked the output" are not the
same claim. These were caught by tests rather than by reading, which is itself the lesson —
the tests were the thing that made heavy AI use safe.

- **The experiment fingerprint was silently broken.** It used
  `JSON.stringify(spec, Object.keys(spec).sort())`. Passing an array as the second argument
  makes it a recursive key filter, which stripped every nested field, so every experiment
  hashed identically and the lineage feature would have quietly collapsed.
- **A chart that invented its own data.** The first version of the distribution comparison
  reconstructed the baseline as a smooth curve from a mean and a standard deviation. For a
  chart whose entire purpose is to show the honest overlap between two sets of results,
  drawing an invented shape was indefensible. It was replaced with the real counts.
- **Two bugs in the question reader, found by the evaluation harness on its first run.** It
  missed written numbers such as "holding one month", and it treated "what is the best NIFTY
  options straddle strategy" as answerable simply because the question mentioned NIFTY — it
  would have run the wrong experiment and reported a confident result.

## 6. What I am most proud of

Not the code. Most of that was written with heavy AI help and I would rather be straight
about it than claim otherwise.

What I like is that the thing refuses to oversell itself. On some settings it reports a
positive average return and still concludes there is no evidence, because the comparison
against ordinary days and the checks around it will not let it claim more than the data
supports. Most tools in this space are built to find something. This one is built to tell
you when there is nothing there, and I think that is the more useful behaviour.

The part I am personally pleased with is smaller. I started this with no real background in
markets or statistics. By the end I could explain in my own words why testing thirteen
variations makes the best-looking one close to worthless, and why beating zero is not the
same as beating simply having been invested. Those two ideas are the whole submission, and
working them out properly rather than repeating them back is the thing I would defend if
someone told me I had it wrong.
