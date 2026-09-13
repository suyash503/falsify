import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { experiments } from "./schema";
import type { ExperimentRecord, Repository } from "./types";

/**
 * Storage, chosen at runtime.
 *
 * With DATABASE_URL set, experiments persist in Postgres and the research
 * journal survives restarts - which is the whole point of a knowledge base.
 * Without it, an in-process store keeps the app completely functional for
 * anyone who clones the repo and runs `npm run dev` with no accounts anywhere.
 *
 * The in-memory store is honest about what it is: the UI says so, because a
 * journal that silently forgets would be worse than no journal at all.
 */

/* ------------------------------------------------------------------ */
/* In-memory                                                           */
/* ------------------------------------------------------------------ */

declare global {
  // Survives the module reloads that Next performs in development.
  // eslint-disable-next-line no-var
  var __falsifyStore: Map<string, ExperimentRecord> | undefined;
}

function memoryRepository(): Repository {
  const store = (globalThis.__falsifyStore ??= new Map<string, ExperimentRecord>());

  return {
    kind: "memory",
    async create(record) {
      store.set(record.id, record);
      return record;
    },
    async update(id, patch) {
      const existing = store.get(id);
      if (!existing) return null;
      const next = { ...existing, ...patch };
      store.set(id, next);
      return next;
    },
    async get(id) {
      return store.get(id) ?? null;
    },
    async list(limit = 50) {
      return [...store.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
    },
    async countLineage(rootId) {
      const all = [...store.values()];
      const root = resolveRoot(all, rootId);
      return all.filter(
        (r) => r.status === "complete" && resolveRoot(all, r.id) === root,
      ).length;
    },
    async children(id) {
      return [...store.values()]
        .filter((r) => r.parentId === id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };
}

function resolveRoot(all: ExperimentRecord[], id: string): string {
  const byId = new Map(all.map((r) => [r.id, r]));
  let cursor = byId.get(id);
  const seen = new Set<string>();
  while (cursor?.parentId && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    const parent = byId.get(cursor.parentId);
    if (!parent) break;
    cursor = parent;
  }
  return cursor?.id ?? id;
}

/* ------------------------------------------------------------------ */
/* Postgres                                                            */
/* ------------------------------------------------------------------ */

type Row = typeof experiments.$inferSelect;

function toRecord(row: Row): ExperimentRecord {
  return {
    id: row.id,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
    question: row.question,
    spec: row.spec as ExperimentRecord["spec"],
    specFingerprint: row.specFingerprint,
    assumptions: row.assumptions as ExperimentRecord["assumptions"],
    questions: row.questions as ExperimentRecord["questions"],
    status: row.status as ExperimentRecord["status"],
    parentId: row.parentId,
    forkedBecause: row.forkedBecause,
    interpretationProvenance:
      row.interpretationProvenance as ExperimentRecord["interpretationProvenance"],
    result: (row.result ?? null) as ExperimentRecord["result"],
  };
}

function postgresRepository(url: string): Repository {
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  return {
    kind: "postgres",
    async create(record) {
      await db.insert(experiments).values({
        id: record.id,
        createdAt: new Date(record.createdAt),
        question: record.question,
        spec: record.spec,
        specFingerprint: record.specFingerprint,
        assumptions: record.assumptions,
        questions: record.questions,
        status: record.status,
        parentId: record.parentId,
        forkedBecause: record.forkedBecause,
        interpretationProvenance: record.interpretationProvenance,
        result: record.result,
      });
      return record;
    },
    async update(id, patch) {
      const values: Record<string, unknown> = {};
      if (patch.spec !== undefined) values.spec = patch.spec;
      if (patch.specFingerprint !== undefined)
        values.specFingerprint = patch.specFingerprint;
      if (patch.assumptions !== undefined) values.assumptions = patch.assumptions;
      if (patch.questions !== undefined) values.questions = patch.questions;
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.result !== undefined) values.result = patch.result;
      if (!Object.keys(values).length) return this.get(id);

      const rows = await db
        .update(experiments)
        .set(values)
        .where(eq(experiments.id, id))
        .returning();
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async get(id) {
      const rows = await db
        .select()
        .from(experiments)
        .where(eq(experiments.id, id))
        .limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async list(limit = 50) {
      const rows = await db
        .select()
        .from(experiments)
        .orderBy(desc(experiments.createdAt))
        .limit(limit);
      return rows.map(toRecord);
    },
    async countLineage(rootId) {
      // Recursive CTE: walk the whole ancestry tree containing this node.
      const rows = await sql<{ count: string }[]>`
        WITH RECURSIVE up AS (
          SELECT id, parent_id FROM experiments WHERE id = ${rootId}
          UNION ALL
          SELECT e.id, e.parent_id FROM experiments e JOIN up ON e.id = up.parent_id
        ),
        root AS (SELECT id FROM up WHERE parent_id IS NULL LIMIT 1),
        down AS (
          SELECT id FROM experiments WHERE id = (SELECT id FROM root)
          UNION ALL
          SELECT e.id FROM experiments e JOIN down ON e.parent_id = down.id
        )
        SELECT COUNT(*)::text AS count
        FROM experiments
        WHERE id IN (SELECT id FROM down) AND status = 'complete'
      `;
      return Number(rows[0]?.count ?? 0);
    },
    async children(id) {
      const rows = await db
        .select()
        .from(experiments)
        .where(eq(experiments.parentId, id))
        .orderBy(experiments.createdAt);
      return rows.map(toRecord);
    },
  };
}

/* ------------------------------------------------------------------ */

let cached: Repository | null = null;

export function getRepository(): Repository {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  cached = url ? postgresRepository(url) : memoryRepository();
  return cached;
}
