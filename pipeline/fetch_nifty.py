"""
Fetch, validate and freeze the NIFTY 50 daily price history.

Why this is a build-time pipeline and not a runtime API call
------------------------------------------------------------
The prototype must give the *same* answer every time it is demonstrated. A
backtest whose input silently changes between runs is not a research tool, it
is a random number generator with a chart. So we fetch once, validate hard,
write a checksummed CSV, and commit it. The app reads only the frozen file.

This also means the deployed prototype has no runtime dependency on a third
party that can rate-limit us in the middle of a demo.

Usage:
    python pipeline/fetch_nifty.py
    python pipeline/fetch_nifty.py --start 2007-01-01 --end 2025-09-12
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

SYMBOL = "^NSEI"
SOURCE_NAME = "Yahoo Finance chart API"
CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"

REPO_ROOT = Path(__file__).resolve().parents[1]
OUT_CSV = REPO_ROOT / "data" / "nifty50_daily.csv"
OUT_META = REPO_ROOT / "data" / "nifty50_daily.meta.json"

# A single-session move beyond this is possible (2008, 2020) but rare enough
# that it deserves to be surfaced rather than trusted blindly.
EXTREME_MOVE_PCT = 10.0
# NSE closes for at most a few consecutive days. A longer hole means the source
# dropped data and any backtest spanning it will be subtly wrong.
MAX_EXPECTED_GAP_DAYS = 7


def fetch_raw(symbol: str, start: dt.date, end: dt.date) -> dict:
    url = CHART_URL.format(symbol=urllib.parse.quote(symbol))
    params = urllib.parse.urlencode(
        {
            "period1": int(dt.datetime.combine(start, dt.time()).timestamp()),
            "period2": int(dt.datetime.combine(end, dt.time()).timestamp()),
            "interval": "1d",
        }
    )
    req = urllib.request.Request(
        f"{url}?{params}",
        headers={"User-Agent": "falsify-research-pipeline/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Source returned HTTP {resp.status}")
        return json.loads(resp.read().decode("utf-8"))


def to_frame(payload: dict) -> pd.DataFrame:
    result = payload["chart"]["result"][0]
    quote = result["indicators"]["quote"][0]
    frame = pd.DataFrame(
        {
            "date": pd.to_datetime(result["timestamp"], unit="s", utc=True)
            .tz_convert("Asia/Kolkata")
            .date,
            "open": quote["open"],
            "high": quote["high"],
            "low": quote["low"],
            "close": quote["close"],
            "volume": quote["volume"],
        }
    )
    return frame


def validate(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Clean the frame and return it alongside an auditable quality report.

    Nothing here is silent. Every row we drop is counted, and every row we keep
    but distrust is listed, so the README and the Thinking Note can cite real
    numbers instead of hand-waving about "data quality".
    """
    report: dict = {}
    initial = len(frame)

    # 1. Holiday padding: the source emits rows for sessions that never traded.
    null_mask = frame[["open", "high", "low", "close"]].isna().any(axis=1)
    report["rows_dropped_null_ohlc"] = int(null_mask.sum())
    frame = frame.loc[~null_mask].copy()

    # 2. Duplicate sessions would double-count a signal.
    dup_mask = frame["date"].duplicated(keep="first")
    report["rows_dropped_duplicate_date"] = int(dup_mask.sum())
    frame = frame.loc[~dup_mask].copy()

    # 3. Non-positive prices are impossible for an index.
    bad_price = (frame[["open", "high", "low", "close"]] <= 0).any(axis=1)
    report["rows_dropped_non_positive"] = int(bad_price.sum())
    frame = frame.loc[~bad_price].copy()

    frame = frame.sort_values("date").reset_index(drop=True)

    # 4. OHLC internal consistency. A high below the close means the bar is
    #    corrupt and any intraday target/stop logic built on it is fiction.
    inconsistent = (
        (frame["high"] < frame[["open", "close"]].max(axis=1))
        | (frame["low"] > frame[["open", "close"]].min(axis=1))
        | (frame["high"] < frame["low"])
    )
    report["rows_dropped_ohlc_inconsistent"] = int(inconsistent.sum())
    frame = frame.loc[~inconsistent].copy().reset_index(drop=True)

    # 5. Flag, do not drop: extreme single-day moves. 2008 and March 2020 were
    #    real. We surface them so a human can confirm they are not bad ticks.
    returns = frame["close"].pct_change() * 100
    extreme = returns.abs() > EXTREME_MOVE_PCT
    report["extreme_moves_flagged"] = [
        {"date": str(frame.loc[i, "date"]), "return_pct": round(float(returns[i]), 2)}
        for i in frame.index[extreme]
    ]

    # 6. Flag, do not drop: calendar holes larger than a normal holiday run.
    date_series = pd.to_datetime(frame["date"])
    gaps = date_series.diff().dt.days
    big_gaps = gaps > MAX_EXPECTED_GAP_DAYS
    report["calendar_gaps_flagged"] = [
        {
            "after": str(frame.loc[i - 1, "date"]),
            "before": str(frame.loc[i, "date"]),
            "gap_days": int(gaps[i]),
        }
        for i in frame.index[big_gaps]
    ]

    report["rows_in"] = initial
    report["rows_out"] = len(frame)
    return frame, report


def write_outputs(frame: pd.DataFrame, report: dict, start: dt.date, end: dt.date) -> None:
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)

    out = frame.copy()
    out["date"] = out["date"].astype(str)
    for col in ("open", "high", "low", "close"):
        out[col] = out[col].round(2)
    out["volume"] = out["volume"].fillna(0).astype("int64")
    out.to_csv(OUT_CSV, index=False, lineterminator="\n")

    digest = hashlib.sha256(OUT_CSV.read_bytes()).hexdigest()

    meta = {
        "symbol": SYMBOL,
        "instrument": "NIFTY50",
        "description": "NIFTY 50 total-return-excluded price index, daily OHLC.",
        "source": SOURCE_NAME,
        "retrieved_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "requested_range": {"start": str(start), "end": str(end)},
        "actual_range": {
            "start": str(frame["date"].iloc[0]),
            "end": str(frame["date"].iloc[-1]),
        },
        "rows": len(frame),
        "sha256": digest,
        "quality_report": report,
        "known_limitations": [
            "Price index only - dividends are excluded, so long-hold returns are understated by roughly 1-1.5% a year.",
            "Index level is not directly tradable; a real implementation would trade a futures contract or ETF with its own tracking error, roll cost and bid-ask spread.",
            "Survivorship and reconstitution effects inside the index are inherited from the index provider and not modelled here.",
        ],
    }
    OUT_META.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch and freeze NIFTY 50 daily data.")
    parser.add_argument("--start", default="2007-01-01", help="YYYY-MM-DD")
    parser.add_argument("--end", default=dt.date.today().isoformat(), help="YYYY-MM-DD")
    args = parser.parse_args()

    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end)

    print(f"Fetching {SYMBOL} from {SOURCE_NAME}: {start} -> {end}")
    payload = fetch_raw(SYMBOL, start, end)
    frame = to_frame(payload)
    print(f"  received {len(frame)} raw rows")

    frame, report = validate(frame)
    print(f"  kept {report['rows_out']} rows after validation")
    for key in (
        "rows_dropped_null_ohlc",
        "rows_dropped_duplicate_date",
        "rows_dropped_non_positive",
        "rows_dropped_ohlc_inconsistent",
    ):
        if report[key]:
            print(f"    dropped {report[key]} ({key})")
    if report["extreme_moves_flagged"]:
        print(f"    flagged {len(report['extreme_moves_flagged'])} extreme moves (kept)")
    if report["calendar_gaps_flagged"]:
        print(f"    flagged {len(report['calendar_gaps_flagged'])} calendar gaps (kept)")

    if report["rows_out"] < 1000:
        print("ABORT: too few rows to support any credible backtest.", file=sys.stderr)
        return 1

    write_outputs(frame, report, start, end)
    print(f"  wrote {OUT_CSV.relative_to(REPO_ROOT)}")
    print(f"  wrote {OUT_META.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
