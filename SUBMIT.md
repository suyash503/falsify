# Submission checklist

Ordered. Timeboxed. Nothing gets added to this list — new ideas go in `v2.md`.

- [x] **Deploy to Vercel** — done: https://falsify-pink.vercel.app/

- [ ] **Record the demo** — 30 min
      Follow `DEMO_SCRIPT.md`. Record against `npm run dev` (localhost), not the
      deployed URL. **The third take ships.**

- [ ] **Attach Neon so the live link works** — 10 min
      The deployed app needs a database: on Vercel, route handlers and page
      renders are separate functions with separate memory, so the in-memory
      journal cannot be read back and every experiment page 404s.
        1. neon.tech → new project (free, no card) → copy the connection string
        2. Vercel → project → Settings → Environment Variables → DATABASE_URL
        3. Redeploy
      That is all. The table is created automatically on first use, so there is
      no migration step to run.
      Verify: open the live URL, ask the question, confirm the page loads.

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
