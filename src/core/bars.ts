/** One trading session. Prices are index levels, not rupees per share. */
export interface Bar {
  /** YYYY-MM-DD, Asia/Kolkata session date. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Parse the frozen CSV produced by `pipeline/fetch_nifty.py`. */
export function parseBarsCsv(csv: string): Bar[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idx = {
    date: header.indexOf("date"),
    open: header.indexOf("open"),
    high: header.indexOf("high"),
    low: header.indexOf("low"),
    close: header.indexOf("close"),
    volume: header.indexOf("volume"),
  };
  for (const [key, value] of Object.entries(idx)) {
    if (value === -1) throw new Error(`Dataset is missing the "${key}" column`);
  }

  const bars: Bar[] = new Array(lines.length - 1);
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    bars[i - 1] = {
      date: cells[idx.date],
      open: Number(cells[idx.open]),
      high: Number(cells[idx.high]),
      low: Number(cells[idx.low]),
      close: Number(cells[idx.close]),
      volume: Number(cells[idx.volume]),
    };
  }
  return bars;
}

/**
 * Inclusive slice by ISO date. Returns the index offset as well, because the
 * engine needs to look *behind* the window start to compute lookback-based
 * signals without reaching past the dataset edge.
 */
export function sliceByDate(bars: Bar[], start: string, end: string) {
  let from = bars.findIndex((b) => b.date >= start);
  if (from === -1) from = bars.length;
  let to = bars.length - 1;
  while (to >= 0 && bars[to].date > end) to--;
  return { from, to };
}

export function firstDate(bars: Bar[]): string {
  return bars.length ? bars[0].date : "";
}

export function lastDate(bars: Bar[]): string {
  return bars.length ? bars[bars.length - 1].date : "";
}
