"use client";

import { useState } from "react";
import type { ReturnHistogram } from "@/core/backtest/stats";

/**
 * The chart that answers the actual question.
 *
 * A bar showing "+1.2% average return" is not evidence of anything. Two
 * distributions drawn on the same axis are: if the trades taken after a fall
 * sit on top of the trades taken on any random day, the condition did nothing,
 * and no amount of confident narration can hide that the curves overlap.
 *
 * Both series are drawn as share-of-observations rather than counts, because
 * the baseline has an order of magnitude more members and raw counts would make
 * the comparison unreadable.
 *
 * The bins arrive already computed from the real samples. They are not
 * reconstructed here from means and standard deviations - a chart whose job is
 * to show the true shape of two distributions must not draw an invented one.
 */

interface Props {
  histogram: ReturnHistogram;
  strategyMean: number;
  baselineMean: number;
}
const WIDTH = 720;
const HEIGHT = 260;
const PAD = { top: 24, right: 16, bottom: 40, left: 48 };

export default function DistributionChart({
  histogram,
  strategyMean,
  baselineMean,
}: Props) {
  const [hoverBin, setHoverBin] = useState<number | null>(null);

  const { binEdges, strategy: s, baseline: b, clipped } = histogram;
  if (binEdges.length < 2) return null;

  const BIN_COUNT = s.length;
  const lo = binEdges[0];
  const hi = binEdges[binEdges.length - 1];
  const binWidth = binEdges[1] - binEdges[0];
  const peak = Math.max(...s, ...b, 1);
  const model = { lo, hi, binWidth, s, b, peak };

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const xOf = (v: number) =>
    PAD.left + ((v - model.lo) / (model.hi - model.lo)) * plotW;
  const yOf = (share: number) => PAD.top + plotH - (share / model.peak) * plotH;

  /** Step outline across bin tops, closed to the baseline for the fill. */
  const stepPath = (series: number[]) => {
    const parts: string[] = [];
    for (let i = 0; i < series.length; i++) {
      const x0 = PAD.left + (i / BIN_COUNT) * plotW;
      const x1 = PAD.left + ((i + 1) / BIN_COUNT) * plotW;
      const y = yOf(series[i]);
      parts.push(i === 0 ? `M ${x0} ${y}` : `L ${x0} ${y}`);
      parts.push(`L ${x1} ${y}`);
    }
    return parts.join(" ");
  };

  const closedPath = (series: number[]) =>
    `${stepPath(series)} L ${PAD.left + plotW} ${PAD.top + plotH} L ${PAD.left} ${PAD.top + plotH} Z`;

  const zeroX = xOf(0);
  const ticks = [model.lo, model.lo + (model.hi - model.lo) / 2, model.hi];

  return (
    <figure className="m-0">
      <figcaption className="mb-3">
        <h4 className="text-sm font-semibold text-[var(--ink-primary)]">
          Where these trades landed, against every other day
        </h4>
        <p className="mt-1 text-xs text-[var(--ink-secondary)]">
          The closer the two shapes sit, the less the condition changed anything.
        </p>
      </figcaption>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-[3px] w-5 rounded-full"
            style={{ background: "var(--series-strategy)" }}
          />
          <span className="text-[var(--ink-secondary)]">After a fall</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-[3px] w-5 rounded-full"
            style={{ background: "var(--series-baseline)" }}
          />
          <span className="text-[var(--ink-secondary)]">Any day (baseline)</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Distribution of returns after a fall, averaging ${strategyMean.toFixed(2)} percent, compared with all sessions averaging ${baselineMean.toFixed(2)} percent.`}
        onMouseLeave={() => setHoverBin(null)}
      >
        {/* Gridlines, recessive */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={PAD.top + plotH - f * plotH}
            y2={PAD.top + plotH - f * plotH}
            stroke="var(--rule)"
            strokeWidth={1}
          />
        ))}

        {/* Break-even */}
        <line
          x1={zeroX}
          x2={zeroX}
          y1={PAD.top}
          y2={PAD.top + plotH}
          stroke="var(--rule-strong)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <text
          x={zeroX}
          y={PAD.top - 10}
          textAnchor="middle"
          fontSize={10}
          fill="var(--ink-muted)"
        >
          break even
        </text>

        <path d={closedPath(model.b)} fill="var(--series-baseline-soft)" />
        <path d={closedPath(model.s)} fill="var(--series-strategy-soft)" />
        <path
          d={stepPath(model.b)}
          fill="none"
          stroke="var(--series-baseline)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path
          d={stepPath(model.s)}
          fill="none"
          stroke="var(--series-strategy)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Mean markers, direct-labelled so identity never rests on colour */}
        {[
          { v: baselineMean, c: "var(--series-baseline)", label: "any day" },
          { v: strategyMean, c: "var(--series-strategy)", label: "after a fall" },
        ].map((m, i) => {
          // When the two means nearly coincide - which is itself the finding -
          // the labels would sit on top of each other, so they are stacked and
          // pushed to opposite sides.
          const close = Math.abs(xOf(strategyMean) - xOf(baselineMean)) < 120;
          const toRight = close ? i === 1 : xOf(m.v) <= WIDTH / 2;
          return (
            <g key={m.label}>
              <line
                x1={xOf(m.v)}
                x2={xOf(m.v)}
                y1={PAD.top + 2}
                y2={PAD.top + plotH}
                stroke={m.c}
                strokeWidth={2}
              />
              <text
                x={xOf(m.v)}
                y={PAD.top + 12 + i * 13}
                textAnchor={toRight ? "start" : "end"}
                dx={toRight ? 6 : -6}
                fontSize={10}
                fontWeight={600}
                fill={m.c}
              >
                {m.label} avg {m.v.toFixed(2)}%
              </text>
            </g>
          );
        })}

        {/* Axes */}
        <line
          x1={PAD.left}
          x2={PAD.left + plotW}
          y1={PAD.top + plotH}
          y2={PAD.top + plotH}
          stroke="var(--rule-strong)"
          strokeWidth={1}
        />
        {ticks.map((t, i) => (
          <text
            key={t}
            x={xOf(t)}
            y={HEIGHT - 18}
            textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}
            fontSize={10}
            fill="var(--ink-muted)"
          >
            {i === 0
              ? `${t.toFixed(1)}%${clipped ? " or worse" : ""}`
              : i === ticks.length - 1
                ? `${t.toFixed(1)}%${clipped ? " or better" : ""}`
                : `${t.toFixed(1)}%`}
          </text>
        ))}
        <text
          x={PAD.left}
          y={HEIGHT - 4}
          fontSize={10}
          fill="var(--ink-muted)"
        >
          return per trade after costs
        </text>
        <text
          x={PAD.left - 8}
          y={PAD.top + 4}
          textAnchor="end"
          fontSize={10}
          fill="var(--ink-muted)"
        >
          {model.peak.toFixed(0)}%
        </text>
        <text
          x={PAD.left - 8}
          y={PAD.top + plotH}
          textAnchor="end"
          fontSize={10}
          fill="var(--ink-muted)"
        >
          0
        </text>

        {/* Hover targets, wider than the marks */}
        {model.s.map((_, i) => {
          const x0 = PAD.left + (i / BIN_COUNT) * plotW;
          return (
            <rect
              key={i}
              x={x0}
              y={PAD.top}
              width={plotW / BIN_COUNT}
              height={plotH}
              fill={hoverBin === i ? "var(--rule)" : "transparent"}
              opacity={hoverBin === i ? 0.5 : 1}
              onMouseEnter={() => setHoverBin(i)}
            />
          );
        })}
      </svg>

      <div className="mt-2 min-h-[2.5rem] text-xs text-[var(--ink-secondary)]">
        {hoverBin === null ? (
          <span className="text-[var(--ink-muted)]">
            Hover a slice to compare how often each group landed there.
          </span>
        ) : (
          <span className="tabular">
            Returns between{" "}
            <strong>
              {(model.lo + hoverBin * model.binWidth).toFixed(2)}%
            </strong>{" "}
            and{" "}
            <strong>
              {(model.lo + (hoverBin + 1) * model.binWidth).toFixed(2)}%
            </strong>
            : {model.s[hoverBin].toFixed(1)}% of trades after a fall,{" "}
            {model.b[hoverBin].toFixed(1)}% of all days.
          </span>
        )}
      </div>
    </figure>
  );
}
