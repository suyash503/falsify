import { readFileSync } from "node:fs";
import path from "node:path";
import { parseBarsCsv, type Bar } from "@/core/bars";

export interface DatasetMeta {
  symbol: string;
  instrument: string;
  description: string;
  source: string;
  retrieved_at: string;
  actual_range: { start: string; end: string };
  rows: number;
  sha256: string;
  known_limitations: string[];
}

const DATA_DIR = path.join(process.cwd(), "data");

let barsCache: Bar[] | null = null;
let metaCache: DatasetMeta | null = null;

/**
 * Loaded once per server process from the frozen CSV. Deliberately synchronous
 * and cached: the dataset is 224KB and never changes at runtime, so the
 * simplest possible thing is also the right one.
 */
export function loadBars(): Bar[] {
  if (!barsCache) {
    const csv = readFileSync(path.join(DATA_DIR, "nifty50_daily.csv"), "utf-8");
    barsCache = parseBarsCsv(csv);
  }
  return barsCache;
}

export function loadMeta(): DatasetMeta {
  if (!metaCache) {
    metaCache = JSON.parse(
      readFileSync(path.join(DATA_DIR, "nifty50_daily.meta.json"), "utf-8"),
    ) as DatasetMeta;
  }
  return metaCache;
}
