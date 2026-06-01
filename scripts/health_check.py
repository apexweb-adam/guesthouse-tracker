#!/usr/bin/env python3
"""
Daily health check for guesthouse-tracker (Candidate).

The big risk-pattern this catches: BOARD ROT. Companies move off Greenhouse/Lever
all the time, so the env-var board lists silently go stale and discovery returns 0
(which is what just happened on 2026-06-01 — atlassian, canva, etc. all 404'd).

Probes every board in GREENHOUSE_BOARDS / LEVER_BOARDS. If any return 404, the
issue body lists them so Adam can swap them out before Candidate notices.

Also smoke-tests the live discover endpoint to catch broader breakage
(auth, deploy, etc.).
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone

import httpx

OPPORTUNITIES_24H_FLOOR = 1   # at least 1 new opportunity over the last 7d
DISCOVER_TIMEOUT = 180


def emit(level: str, name: str, detail: str) -> dict:
    return {"level": level, "name": name, "detail": detail}


def probe_greenhouse(boards: list[str]) -> dict:
    if not boards:
        return emit("warn", "greenhouse_boards", "GREENHOUSE_BOARDS env var empty")
    dead: list[str] = []
    ok: list[str] = []
    for b in boards:
        b = b.strip()
        if not b:
            continue
        try:
            r = httpx.get(
                f"https://boards-api.greenhouse.io/v1/boards/{b}/jobs?content=true",
                timeout=8.0,
            )
            (ok if r.status_code == 200 else dead).append(b)
        except Exception:
            dead.append(b)
    if not dead:
        return emit("ok", "greenhouse_boards", f"all {len(ok)} boards alive: {', '.join(ok)}")
    return emit(
        "fail",
        "greenhouse_boards",
        f"{len(dead)}/{len(ok)+len(dead)} dead: `{'`, `'.join(dead)}` — swap them out in GREENHOUSE_BOARDS env var.",
    )


def probe_lever(boards: list[str]) -> dict:
    if not boards:
        return emit("warn", "lever_boards", "LEVER_BOARDS env var empty")
    dead: list[str] = []
    ok: list[str] = []
    for b in boards:
        b = b.strip()
        if not b:
            continue
        try:
            r = httpx.get(
                f"https://api.lever.co/v0/postings/{b}?mode=json",
                timeout=8.0,
            )
            (ok if r.status_code == 200 else dead).append(b)
        except Exception:
            dead.append(b)
    if not dead:
        return emit("ok", "lever_boards", f"all {len(ok)} boards alive: {', '.join(ok)}")
    return emit(
        "fail",
        "lever_boards",
        f"{len(dead)}/{len(ok)+len(dead)} dead: `{'`, `'.join(dead)}` — swap them out in LEVER_BOARDS env var.",
    )


def probe_supabase(url: str, key: str) -> dict:
    if not (url and key):
        return emit("warn", "supabase", "credentials missing")
    try:
        from supabase import create_client
        db = create_client(url, key)
        since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        r = db.table("opportunities").select("id", count="exact").gte("ingested_at", since).execute()
        n = getattr(r, "count", 0) or 0
        level = "ok" if n >= OPPORTUNITIES_24H_FLOOR else "fail"
        return emit(level, "opportunities_7d", f"{n} new opportunities in last 7 days (floor={OPPORTUNITIES_24H_FLOOR})")
    except Exception as e:
        return emit("fail", "supabase", f"{type(e).__name__}: {e}")


def probe_discover(base: str, secret: str) -> dict:
    if not (base and secret):
        return emit("warn", "discover", "NETLIFY_BASE_URL or DISCOVERY_SECRET missing")
    try:
        r = httpx.post(
            f"{base.rstrip('/')}/.netlify/functions/discover",
            headers={"Authorization": f"Bearer {secret}"},
            json={},
            timeout=DISCOVER_TIMEOUT,
        )
        if r.status_code != 200:
            return emit("fail", "discover", f"HTTP {r.status_code}: {r.text[:200]}")
        data = r.json()
        td = data.get("total_discovered", 0)
        ti = data.get("total_ingested", 0)
        # 0-discovered isn't always a failure (sources have slow days) so warn, don't fail
        level = "warn" if td == 0 else "ok"
        return emit(level, "discover", f"{td} discovered, {ti} ingested on smoke-test")
    except Exception as e:
        return emit("fail", "discover", f"{type(e).__name__}: {e}")


def build_report(results: list[dict]) -> tuple[bool, str]:
    failed = [r for r in results if r["level"] == "fail"]
    warned = [r for r in results if r["level"] == "warn"]
    icon = {"ok": "🟢", "warn": "🟡", "fail": "🔴"}
    lines = [
        f"### Health report — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "| Status | Check | Detail |",
        "|---|---|---|",
    ]
    for r in results:
        lines.append(f"| {icon[r['level']]} | `{r['name']}` | {r['detail']} |")
    lines.append("")
    if failed:
        lines.append(f"**🔴 {len(failed)} failing check(s) — swap out dead boards / fix breakage.**")
    elif warned:
        lines.append(f"**🟡 {len(warned)} warning(s).**")
    else:
        lines.append("**🟢 All systems green.**")
    return bool(failed or warned), "\n".join(lines)


def upsert_issue(title: str, body: str) -> None:
    try:
        out = subprocess.check_output(
            ["gh", "issue", "list", "--state=open", "--search", title, "--json", "number,title", "--limit", "5"],
            text=True,
        )
        existing = [i for i in json.loads(out) if i["title"].startswith(title)]
    except subprocess.CalledProcessError:
        existing = []
    if existing:
        subprocess.run(["gh", "issue", "comment", str(existing[0]["number"]), "--body", body], check=False)
    else:
        subprocess.run(["gh", "issue", "create", "--title", title, "--body", body, "--label", "health-check"], check=False)


def main() -> int:
    green = [s.strip() for s in (os.environ.get("GREENHOUSE_BOARDS") or "").split(",") if s.strip()]
    lever = [s.strip() for s in (os.environ.get("LEVER_BOARDS") or "").split(",") if s.strip()]
    results = [
        probe_greenhouse(green),
        probe_lever(lever),
        probe_supabase(os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")),
        probe_discover(os.environ.get("NETLIFY_BASE_URL", ""), os.environ.get("DISCOVERY_SECRET", "")),
    ]
    has_alerts, body = build_report(results)
    print(body)
    if has_alerts:
        upsert_issue("Health alert: guesthouse-tracker", body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
