import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * One table, with the research artefacts held as JSONB.
 *
 * A fully normalised schema (experiments / spec_versions / runs / trades)
 * would be the right call for a production system with reporting needs. Here
 * the spec is a single versioned document that is always read whole, and
 * splitting it across five tables would buy nothing but joins. Lineage is the
 * one relationship that genuinely matters, so that gets a real column and an
 * index.
 */
export const experiments = pgTable(
  "experiments",
  {
    id: text("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    question: text("question").notNull(),
    spec: jsonb("spec").notNull(),
    specFingerprint: text("spec_fingerprint").notNull(),
    assumptions: jsonb("assumptions").notNull(),
    questions: jsonb("questions").notNull(),
    status: text("status").notNull(),
    parentId: text("parent_id"),
    forkedBecause: text("forked_because"),
    interpretationProvenance: jsonb("interpretation_provenance").notNull(),
    result: jsonb("result"),
  },
  (t) => [
    index("experiments_parent_idx").on(t.parentId),
    index("experiments_created_idx").on(t.createdAt),
  ],
);
