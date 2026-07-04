#!/usr/bin/env python3
"""Minimal cloud sync server for TechWordLearn vocabulary state."""

from __future__ import annotations

import argparse
import json
import os
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
    for key, value in raw.items():
        if not isinstance(value, str):
            continue
        word = normalize_word(key)
        definition = value.strip()
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
    deleted = []
    seen: set[str] = set()
    for word in current["deleted_vocab"] + incoming["deleted_vocab"]:
        if word in custom or word in seen:
            continue
        seen.add(word)
        deleted.append(word)
    return {"custom_vocab": custom, "deleted_vocab": deleted, STAMP_KEY: now_iso()}


def choose_canonical(current: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
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
            next_state = choose_canonical(self.state, incoming)
            if next_state != self.state:
                self.state = next_state
                self._save(next_state)
            return dict(self.state)

    def import_file(self, path: Path) -> dict[str, Any]:
        data = json.loads(path.read_text(encoding="utf-8"))
        return self.sync(sanitize_state(data))


class CloudHandler(BaseHTTPRequestHandler):
    store: StateStore | None = None
    bearer_token: str = ""
    allow_anonymous: bool = False

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization,content-type,x-techwordlearn-client")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _is_authorized(self) -> bool:
        if self.allow_anonymous or not self.bearer_token:
            return True
        raw = self.headers.get("Authorization", "")
        if not raw.startswith("Bearer "):
            return False
        token = raw[7:].strip()
        return token == self.bearer_token

    def _reject_unauthorized(self) -> bool:
        if self._is_authorized():
            return False
        self._send_json(401, {"ok": False, "error": "unauthorized"})
        return True

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_json(200, {"ok": True})

    def do_GET(self) -> None:  # noqa: N802
        if self.path not in ("/health", "/state"):
            self._send_json(404, {"ok": False, "error": "not_found"})
            return
        if self.path == "/health":
            self._send_json(200, {"ok": True, "time": now_iso()})
            return
        if self._reject_unauthorized():
            return
        assert self.store is not None
        self._send_json(200, {"ok": True, **self.store.snapshot()})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/sync":
            self._send_json(404, {"ok": False, "error": "not_found"})
            return
        if self._reject_unauthorized():
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            self._send_json(400, {"ok": False, "error": "empty_body"})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._send_json(400, {"ok": False, "error": "invalid_json"})
            return

        assert self.store is not None
        state = self.store.sync(payload)
        self._send_json(200, {"ok": True, **state})

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[cloud-sync] {self.address_string()} {self.command} {self.path} - {fmt % args}")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="TechWordLearn cloud vocab sync server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument(
        "--state-file",
        default=str(Path.cwd() / "data" / "techwordlearn-cloud-state.json"),
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("TWL_SYNC_TOKEN", ""),
        help="Bearer token for Authorization header. Can also be passed via TWL_SYNC_TOKEN.",
    )
    parser.add_argument(
        "--allow-anonymous",
        action="store_true",
        help="Allow requests without Authorization. Not recommended on public internet.",
    )
    parser.add_argument(
        "--import-json",
        default="",
        help="Optional JSON file to import once into cloud state at startup",
    )
    return parser


def main() -> None:
    args = build_arg_parser().parse_args()
    token = str(args.token or "").strip()
    if not token and not args.allow_anonymous:
        raise SystemExit("Refusing to start without token. Set TWL_SYNC_TOKEN or pass --allow-anonymous explicitly.")

    store = StateStore(Path(args.state_file).expanduser())
    if args.import_json:
        store.import_file(Path(args.import_json).expanduser())

    CloudHandler.store = store
    CloudHandler.bearer_token = token
    CloudHandler.allow_anonymous = bool(args.allow_anonymous)

    server = ThreadingHTTPServer((args.host, args.port), CloudHandler)
    server.daemon_threads = True
    stop = threading.Event()

    def handle_signal(_sig: int, _frame: Any) -> None:
        stop.set()
        server.shutdown()

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    auth_mode = "anonymous" if args.allow_anonymous or not token else "bearer"
    print(f"[cloud-sync] listening on http://{args.host}:{args.port}")
    print(f"[cloud-sync] state file: {Path(args.state_file).expanduser()}")
    print(f"[cloud-sync] auth: {auth_mode}")
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
        stop.set()


if __name__ == "__main__":
    main()
