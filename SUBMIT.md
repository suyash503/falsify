# Submission checklist

Ordered. Timeboxed. Nothing gets added to this list — new ideas go in `v2.md`.

- [ ] **Deploy to Vercel** — 15 min
      vercel.com/new → import `suyash503/falsify` → Deploy. No env vars needed.
      If `DATABASE_URL` takes more than 5 minutes, skip it. The app runs without
      one and says so in the interface.

- [ ] **Record the demo** — 30 min
      Follow `DEMO_SCRIPT.md`. **The third take ships.**

- [ ] **Thinking Note** — 30 min, 2 pages max
      Source material you already have:
        - "sharp fall" readings ........ the Clarify options in the app
        - assumptions + reasoning ...... the Define ledger, and `src/agents/defaults.ts`
        - what could go wrong .......... the guard table in README.md
        - the experiment design ........ the Define panel
      Bullet points are fine. It is a note, not an essay.

- [ ] **AI_USAGE.md section 6** — 10 min
      Four sentences, your own words. Everything else in that file is already factual.

- [ ] **Submit** — 5 min
      Deployed link · repo link · Thinking Note · README · AI Usage Note · video

---

## Stop rules

- No new features.
- No refactors.
- No "just one more test".
- If something is broken but the journey still demos, it ships broken and goes in `v2.md`.
