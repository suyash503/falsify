"use client";

import { useState } from "react";
import type { EquityPoint } from "@/core/backtest/stats";

/* ------------------------------------------------------------------ */
/* Equity curve                                                        */
/* ------------------------------------------------------------------ */

const W = 720;
const H = 200;
const P = { top: 16, right: 16, bottom: 28, left: 48 };

export function EquityCurve({ points }: { points: EquityPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;

  const values = points.map((p) => p.equity);
  const lo = Math.min(...values, 100);
  const hi = Math.max(...values, 100);
  const pad = (hi - lo) * 0.1 || 1;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const plotW = W - P.left - P.right;
  const plotH = H - P.top - P.bottom;
  const xOf = (i: number) => P.left + (i / (points.length - 1)) * plotW;
  const yOf = (v: number) => P.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(p.equity)}`)
    .join(" ");
  const startY = yOf(100);

  return (
    <figure className="m-0">
      <figcaption className="mb-3">
        <h4 className="text-sm font-semibold">
          Compounding every trade in sequence, starting from 100
        </h4>
        <p className="mt-1 text-xs text-[var(--ink-secondary)]">
          Only counts time actually in the market, so this is not a comparison
          with buy-and-hold.
        </p>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Strategy equity curve ending at ${values[values.length - 1].toFixed(1)} from a start of 100.`}
        onMouseLeave={() => setHover(null)}
      >
        <line
          x1={P.left}
          x2={P.left + plotW}
          y1={startY}
          y2={startY}
          stroke="var(--rule-strong)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text x={P.left - 8} y={startY + 3} textAnchor="end" fontSize={10} fill="var(--ink-muted)">
          100
        </text>

        <path d={path} fill="none" stroke="var(--series-strategy)" strokeWidth={2} strokeLinejoin="round" />

        {hover !== null && (
          <>
            <line
              x1={xOf(hover)}
              x2={xOf(hover)}
              y1={P.top}
              y2={P.top + plotH}
              stroke="var(--rule-strong)"
              strokeWidth={1}
            />
            <circle
              cx={xOf(hover)}
              cy={yOf(points[hover].equity)}
              r={5}
              fill="var(--series-strategy)"
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          </>
        )}

        {points.map((_, i) => (
          <rect
            key={i}
            x={xOf(i) - plotW / points.length / 2}
            y={P.top}
            width={Math.max(4, plotW / points.length)}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        <text x={P.left} y={H - 8} fontSize={10} fill="var(--ink-muted)">
          {points[0].date}
        </text>
        <text x={P.left + plotW} y={H - 8} textAnchor="end" fontSize={10} fill="var(--ink-muted)">
          {points[points.length - 1].date}
        </text>
      </svg>

      <div className="mt-1 min-h-[1.25rem] text-xs tabular text-[var(--ink-secondary)]">
        {hover !== null &&
          `${points[hover].date} - ${points[hover].equity.toFixed(1)}`}
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Trades by year                                                      */
/* ------------------------------------------------------------------ */

/**
 * Exists to make the regime-concentration guard visible rather than merely
 * asserted. One tall bar is the whole argument.
 */
export function YearStrip({ tradesByYear }: { tradesByYear: Record<string, number> }) {
  const entries = Object.entries(tradesByYear).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return null;

  const total = entries.reduce((s, [, n]) => s + n, 0);
  const peak = Math.max(...entries.map(([, n]) => n));

  return (
    <figure className="m-0">
      <figcaption className="mb-3">
        <h4 className="text-sm font-semibold">When these trades happened</h4>
        <p className="mt-1 text-xs text-[var(--ink-secondary)]">
          Falls cluster in crises. A single dominant year means the result
          describes that year.
        </p>
      </figcaption>

      <div className="flex items-end gap-1" style={{ height: 96 }}>
        {entries.map(([year, n]) => {
          const share = (n / total) * 100;
          const dominant = share > 30;
          return (
            <div key={year} className="group flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular text-[var(--ink-muted)] opacity-0 group-hover:opacity-100">
                {n}
              </span>
              <div
                title={`${year}: ${n} trades (${share.toFixed(0)}%)`}
                style={{
                  height: `${Math.max(2, (n / peak) * 64)}px`,
                  background: dominant ? "var(--status-warning)" : "var(--series-strategy)",
                  borderRadius: "4px 4px 0 0",
                }}
                className="w-full"
              />
              <span className="text-[9px] tabular text-[var(--ink-muted)]">
                {year.slice(2)}
              </span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}
