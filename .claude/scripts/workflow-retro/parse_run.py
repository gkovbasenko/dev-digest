#!/usr/bin/env python3
"""parse_run.py — deterministic metrics extractor for a Claude Code multi-agent run.

Reads one Claude Code session transcript (`~/.claude/projects/<slug>/<session>.jsonl`)
and emits a compact JSON summary of the ORCHESTRATOR side of the run: which agents were
spawned, in what order / waves, wall-clock timing, orchestrator-side token usage, and a
truncated copy of each agent's final report for the model to interpret.

HARD LIMIT (by design, not a bug): per-subagent internal token usage is NOT recoverable.
Subagents leave no `isSidechain` rows in the orchestrator transcript and their tool_result
carries no usage metadata — only the final report text is visible. All token numbers here
are ORCHESTRATOR / main-thread spend. See .claude/commands/workflow-retro.md.

Usage:
    parse_run.py <session.jsonl>          # parse a specific transcript
    parse_run.py --latest [--dir DIR]     # newest .jsonl in the project transcripts dir
    parse_run.py --list  [--dir DIR]      # list candidate transcripts (newest first)

Output: JSON on stdout. Human-readable notes on stderr.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
from datetime import datetime

AGENT_TOOLS = {"Task", "Agent"}
REPORT_PREVIEW_CHARS = 800


def default_dir() -> str:
    slug = os.path.basename(os.getcwd()).replace("/", "-")
    # Claude stores transcripts under ~/.claude/projects/<abs-path-with-dashes>/
    cwd_slug = os.getcwd().replace("/", "-")
    home = os.path.expanduser("~")
    cand = os.path.join(home, ".claude", "projects", cwd_slug)
    if os.path.isdir(cand):
        return cand
    # fall back to any projects dir matching the basename
    base = os.path.join(home, ".claude", "projects")
    hits = [d for d in glob.glob(os.path.join(base, f"*{slug}*")) if os.path.isdir(d)]
    return hits[0] if hits else cand


def list_transcripts(d: str) -> list[str]:
    files = glob.glob(os.path.join(d, "*.jsonl"))
    files.sort(key=lambda f: os.path.getmtime(f), reverse=True)
    return files


def _tag(s: str, name: str) -> str | None:
    m = re.search(rf"<{name}>(.*?)</{name}>", s, re.DOTALL)
    return m.group(1).strip() if m else None


def parse_ts(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def load_lines(path: str) -> list[dict]:
    out = []
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            try:
                out.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
    return out


def parse(path: str) -> dict:
    lines = load_lines(path)

    spawns: list[dict] = []          # each Task/Agent tool_use, in order
    results_by_id: dict[str, dict] = {}   # tool_use_id -> {ts, chars, preview}  (sync-agent tool_result / ack)
    notif_by_id: dict[str, dict] = {}     # tool_use_id -> {ts, chars, preview}  (background completion <result>)
    usage_totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
    }
    assistant_turns = 0
    models: set[str] = set()
    first_ts: datetime | None = None
    last_ts: datetime | None = None
    tool_call_counts: dict[str, int] = {}

    for ln in lines:
        ts = parse_ts(ln.get("timestamp"))
        if ts:
            first_ts = ts if first_ts is None else min(first_ts, ts)
            last_ts = ts if last_ts is None else max(last_ts, ts)

        msg = ln.get("message")
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        model = msg.get("model")
        if model and model != "<synthetic>":
            models.add(model)

        if role == "assistant":
            assistant_turns += 1
            usage = msg.get("usage") or {}
            for k in usage_totals:
                v = usage.get(k)
                if isinstance(v, int):
                    usage_totals[k] += v

        content = msg.get("content")

        # Background agents don't return their report in the spawn's tool_result — that
        # slot holds a "launched successfully" ack (internal metadata; never quote it).
        # The real report arrives later as a <task-notification> string carrying the
        # spawn's <tool-use-id> and the agent's output in <result>. A task-id can notify
        # more than once (resumable); keep the last *completed* notification.
        if isinstance(content, str) and "<task-notification>" in content:
            tid = _tag(content, "tool-use-id")
            if tid:
                status = _tag(content, "status") or ""
                result = _tag(content, "result") or ""
                prev = notif_by_id.get(tid)
                if prev is None or status == "completed":
                    notif_by_id[tid] = {
                        "result_ts": ln.get("timestamp"),
                        "chars": len(result),
                        "preview": result[:REPORT_PREVIEW_CHARS],
                        "status": status,
                        "output_file": _tag(content, "output-file"),
                    }
            continue

        if not isinstance(content, list):
            continue

        # Spawns emitted in one assistant turn share message.id even though the harness
        # logs each tool_use on its own jsonl line (distinct uuids). message.id is the
        # true wave key; the line uuid is not. Fall back to uuid if id is absent.
        wave_key = msg.get("id") or ln.get("uuid")
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type")
            if btype == "tool_use":
                name = block.get("name", "")
                tool_call_counts[name] = tool_call_counts.get(name, 0) + 1
                if name in AGENT_TOOLS:
                    inp = block.get("input") or {}
                    spawns.append({
                        "seq": len(spawns) + 1,
                        "tool_use_id": block.get("id"),
                        "wave_key": wave_key,           # spawns sharing message.id = one parallel wave
                        "subagent_type": inp.get("subagent_type") or "(default)",
                        "description": inp.get("description") or "",
                        "background": bool(inp.get("run_in_background", True)),
                        "spawn_ts": ln.get("timestamp"),
                    })
            elif btype == "tool_result":
                tid = block.get("tool_use_id")
                if not tid:
                    continue
                rc = block.get("content")
                text = ""
                if isinstance(rc, str):
                    text = rc
                elif isinstance(rc, list):
                    text = "\n".join(
                        b.get("text", "") for b in rc if isinstance(b, dict) and b.get("type") == "text"
                    )
                is_ack = "launched successfully" in text or "internal metadata" in text
                results_by_id[tid] = {
                    "result_ts": ln.get("timestamp"),
                    "chars": len(text),
                    "preview": "" if is_ack else text[:REPORT_PREVIEW_CHARS],
                    "is_ack": is_ack,
                }

    # Stitch spawn -> report. Prefer the background <task-notification> <result> (the real
    # report + real completion time); fall back to the tool_result slot only for synchronous
    # agents that have no notification. The ack in a background spawn's tool_result is skipped.
    for sp in spawns:
        tid = sp["tool_use_id"]
        notif = notif_by_id.get(tid)
        res = results_by_id.get(tid)
        # An ack-only tool_result is NOT a report — treat as "no report captured" (the real
        # notification fell outside this transcript, e.g. a compaction/session boundary).
        sync_res = res if (res and not res.get("is_ack")) else None
        chosen = notif or sync_res
        sp["completed"] = chosen is not None
        sp["source"] = "notification" if notif else ("tool_result" if sync_res else "ack-only")
        sp["output_file"] = notif.get("output_file") if notif else None
        if chosen:
            sp["report_chars"] = chosen["chars"]
            sp["report_preview"] = chosen["preview"]
            a, b = parse_ts(sp["spawn_ts"]), parse_ts(chosen["result_ts"])
            sp["duration_s"] = round((b - a).total_seconds(), 1) if a and b else None
        else:
            sp["report_chars"] = None
            sp["report_preview"] = ""
            sp["duration_s"] = None

    # group into waves (preserve order of first appearance)
    waves: list[dict] = []
    wave_index: dict[str, int] = {}
    for sp in spawns:
        wk = sp["wave_key"]
        if wk not in wave_index:
            wave_index[wk] = len(waves)
            waves.append({"wave": len(waves) + 1, "agents": []})
        waves[wave_index[wk]]["agents"].append({
            "subagent_type": sp["subagent_type"],
            "description": sp["description"],
        })
    for sp in spawns:
        sp.pop("wave_key", None)

    roster: dict[str, int] = {}
    for sp in spawns:
        roster[sp["subagent_type"]] = roster.get(sp["subagent_type"], 0) + 1

    wall_s = None
    if first_ts and last_ts:
        wall_s = round((last_ts - first_ts).total_seconds(), 1)

    return {
        "transcript": path,
        "limits": {
            "per_subagent_tokens": "UNAVAILABLE — orchestrator transcript has no sidechain rows for subagents; "
                                   "all token numbers below are orchestrator/main-thread spend only.",
        },
        "totals": {
            "agent_spawns": len(spawns),
            "waves": len(waves),
            "assistant_turns": assistant_turns,
            "wall_clock_s": wall_s,
            "models": sorted(models),
            "orchestrator_usage": usage_totals,
            "orchestrator_tool_calls": dict(sorted(tool_call_counts.items(), key=lambda kv: -kv[1])),
        },
        "roster": dict(sorted(roster.items(), key=lambda kv: -kv[1])),
        "waves": waves,
        "spawns": spawns,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("session", nargs="?", help="path to a session .jsonl transcript")
    ap.add_argument("--latest", action="store_true", help="use newest transcript in --dir")
    ap.add_argument("--list", action="store_true", help="list candidate transcripts and exit")
    ap.add_argument("--dir", help="project transcripts dir (default: auto from cwd)")
    args = ap.parse_args()

    d = args.dir or default_dir()

    if args.list:
        for f in list_transcripts(d):
            mt = datetime.fromtimestamp(os.path.getmtime(f)).isoformat(timespec="seconds")
            sz = os.path.getsize(f)
            print(f"{mt}  {sz:>9}  {f}")
        return 0

    path = args.session
    if not path and args.latest:
        files = list_transcripts(d)
        if not files:
            print(f"no transcripts in {d}", file=sys.stderr)
            return 1
        path = files[0]
    if not path:
        ap.error("give a session path, or --latest, or --list")

    if not os.path.isfile(path):
        print(f"not a file: {path}", file=sys.stderr)
        return 1

    result = parse(path)
    print(f"parsed {result['totals']['agent_spawns']} spawns across "
          f"{result['totals']['waves']} waves from {os.path.basename(path)}", file=sys.stderr)
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
