#!/usr/bin/env python3
"""Local bridge service to keep TechWordLearn vocab in sync across browsers."""

from __future__ import annotations

import argparse
import json
import signal
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

STAMP_KEY = "vocab_sync_updated_at"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_stamp(stamp: Any) -> float:
    if not isinstance(stamp, str):
        return 0.0
    text = stamp.strip()
    if not text:
        return 0.0
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text).timestamp()
    except ValueError:
        return 0.0


def normalize_word(raw: Any) -> str | None:
    text = str(raw or "")
    token = []
    started = False
    for ch in text:
        if ch.isalpha() or (started and ch in ("'", "-")):
            token.append(ch.lower())
            started = True
            continue
        if started:
            break
    result = "".join(token).strip("-'")
    return result or None


def sanitize_word_map(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        if not isinstance(v, str):
            continue
        word = normalize_word(k)
        definition = v.strip()
        if not word or not definition:
            continue
        out[word] = definition
    return out


def sanitize_word_list(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        word = normalize_word(item)
        if not word or word in seen:
            continue
        seen.add(word)
        out.append(word)
    return out


def sanitize_state(raw: Any, fallback_stamp: str | None = None) -> dict[str, Any]:
    custom = sanitize_word_map(raw.get("custom_vocab") if isinstance(raw, dict) else None)
    deleted = [
        word
        for word in sanitize_word_list(raw.get("deleted_vocab") if isinstance(raw, dict) else None)
        if word not in custom
    ]
    stamp = raw.get(STAMP_KEY) if isinstance(raw, dict) else None
    if parse_stamp(stamp) <= 0:
        stamp = fallback_stamp or now_iso()
    return {"custom_vocab": custom, "deleted_vocab": deleted, STAMP_KEY: stamp}


def state_fingerprint(state: dict[str, Any]) -> str:
    normalized = sanitize_state(state)
    custom_sorted = {k: normalized["custom_vocab"][k] for k in sorted(normalized["custom_vocab"])}
    deleted_sorted = sorted(normalized["deleted_vocab"])
    return json.dumps({"custom_vocab": custom_sorted, "deleted_vocab": deleted_sorted}, ensure_ascii=False)


def merge_equal_stamp(current: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    custom = {**current["custom_vocab"], **incoming["custom_vocab"]}
    deleted_set = []
    seen: set[str] = set()
    for word in current["deleted_vocab"] + incoming["deleted_vocab"]:
        if word in custom or word in seen:
            continue
        seen.add(word)
        deleted_set.append(word)
    return {"custom_vocab": custom, "deleted_vocab": deleted_set, STAMP_KEY: now_iso()}


def pick_canonical(current: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    current = sanitize_state(current)
    incoming = sanitize_state(incoming, fallback_stamp=current[STAMP_KEY])
    current_ts = parse_stamp(current[STAMP_KEY])
    incoming_ts = parse_stamp(incoming[STAMP_KEY])

    if incoming_ts > current_ts:
        return incoming
    if incoming_ts < current_ts:
        return current

    if state_fingerprint(current) == state_fingerprint(incoming):
        return current
    return merge_equal_stamp(current, incoming)


class StateStore:
    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.state = self._load()

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            state = sanitize_state({})
            self._save(state)
            return state
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return sanitize_state(data)
        except Exception:
            state = sanitize_state({})
            self._save(state)
            return state

    def _save(self, state: dict[str, Any]) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return dict(self.state)

    def sync(self, incoming: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            next_state = pick_canonical(self.state, incoming)
            if next_state != self.state:
                self.state = next_state
                self._save(next_state)
            return dict(self.state)

    def import_file(self, path: Path) -> dict[str, Any]:
        data = json.loads(path.read_text(encoding="utf-8"))
        incoming = sanitize_state(data)
        return self.sync(incoming)


class BridgeHandler(BaseHTTPRequestHandler):
    store: StateStore | None = None

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_json(200, {"ok": True})

    def do_GET(self) -> None:  # noqa: N802
        if self.path not in ("/state", "/health"):
            self._send_json(404, {"ok": False, "error": "not_found"})
            return
        assert self.store is not None
        if self.path == "/health":
            self._send_json(200, {"ok": True, "time": now_iso()})
            return
        self._send_json(200, {"ok": True, **self.store.snapshot()})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/sync":
            self._send_json(404, {"ok": False, "error": "not_found"})
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            self._send_json(400, {"ok": False, "error": "empty_body"})
            return
        try:
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            self._send_json(400, {"ok": False, "error": "invalid_json"})
            return
        assert self.store is not None
        state = self.store.sync(payload)
        self._send_json(200, {"ok": True, **state})

    def log_message(self, fmt: str, *args: Any) -> None:
        # Keep launchd log noise low; one-line summary only.
        print(f"[bridge] {self.address_string()} {self.command} {self.path} - {fmt % args}")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="TechWordLearn local vocab sync bridge")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=43110)
    parser.add_argument(
        "--state-file",
        default=str(Path.home() / ".techwordlearn" / "vocab-bridge-state.json"),
    )
    parser.add_argument(
        "--import-json",
        default="",
        help="Optional JSON file to import once into bridge state at startup",
    )
    return parser


def main() -> None:
    args = build_arg_parser().parse_args()
    store = StateStore(Path(args.state_file).expanduser())
    if args.import_json:
        store.import_file(Path(args.import_json).expanduser())

    BridgeHandler.store = store
    server = ThreadingHTTPServer((args.host, args.port), BridgeHandler)
    server.daemon_threads = True

    stop = threading.Event()

    def handle_signal(_sig: int, _frame: Any) -> None:
        stop.set()
        server.shutdown()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    print(f"[bridge] listening on http://{args.host}:{args.port}")
    print(f"[bridge] state file: {Path(args.state_file).expanduser()}")
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
        print("[bridge] stopped")


if __name__ == "__main__":
    main()
