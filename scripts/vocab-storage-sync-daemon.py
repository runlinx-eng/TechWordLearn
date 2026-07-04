#!/usr/bin/env python3
"""Sync TechWordLearn vocab across Chrome and Atlas by mirroring extension storage."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STAMP_KEY = "vocab_sync_updated_at"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_stamp(stamp: Any) -> float:
    if not isinstance(stamp, str):
        return 0.0
    text = stamp.strip()
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
    out = "".join(token).strip("-'")
    return out or None


def sanitize_word_map(raw: Any) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        if not isinstance(v, str):
            continue
        word = normalize_word(k)
        val = v.strip()
        if not word or not val:
            continue
        out[word] = val
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


def sanitize_state(raw: dict[str, Any]) -> dict[str, Any]:
    custom = sanitize_word_map(raw.get("custom_vocab"))
    deleted = [w for w in sanitize_word_list(raw.get("deleted_vocab")) if w not in custom]
    stamp = raw.get(STAMP_KEY)
    if parse_stamp(stamp) <= 0:
        stamp = ""
    return {"custom_vocab": custom, "deleted_vocab": deleted, STAMP_KEY: stamp}


def state_fingerprint(state: dict[str, Any]) -> str:
    custom = state.get("custom_vocab", {})
    deleted = state.get("deleted_vocab", [])
    custom_sorted = {k: custom[k] for k in sorted(custom)}
    return json.dumps({"custom_vocab": custom_sorted, "deleted_vocab": sorted(deleted)}, ensure_ascii=False)


def read_varint32(data: bytes, pos: int) -> tuple[int, int]:
    result = 0
    shift = 0
    while True:
        b = data[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if b < 0x80:
            return result, pos
        shift += 7


def parse_log(path: Path) -> list[tuple[int, list[tuple[str, str | None]]]]:
    data = path.read_bytes()
    off = 0
    batches: list[tuple[int, list[tuple[str, str | None]]]] = []
    while off + 7 <= len(data):
        length = int.from_bytes(data[off + 4 : off + 6], "little")
        rec_type = data[off + 6]
        off += 7
        rec = data[off : off + length]
        off += length
        if rec_type != 1 or len(rec) < 12:
            continue
        seq = int.from_bytes(rec[:8], "little")
        count = int.from_bytes(rec[8:12], "little")
        pos = 12
        ops: list[tuple[str, str | None]] = []
        for _ in range(count):
            if pos >= len(rec):
                break
            tag = rec[pos]
            pos += 1
            klen, pos = read_varint32(rec, pos)
            key = rec[pos : pos + klen].decode("utf-8", errors="replace")
            pos += klen
            if tag == 1:
                vlen, pos = read_varint32(rec, pos)
                val = rec[pos : pos + vlen].decode("utf-8", errors="replace")
                pos += vlen
                ops.append((key, val))
            else:
                ops.append((key, None))
        batches.append((seq, ops))
    return batches


def load_state(dir_path: Path) -> tuple[dict[str, Any], int, Path]:
    logs = sorted(dir_path.glob("*.log"))
    if not logs:
        raise RuntimeError(f"No log file in {dir_path}")
    latest: dict[str, str | None] = {}
    max_seq = 0
    for log in logs:
        for seq, ops in parse_log(log):
            max_seq = max(max_seq, seq)
            for k, v in ops:
                latest[k] = v
    try:
        custom_vocab = json.loads(latest.get("custom_vocab") or "{}")
    except Exception:
        custom_vocab = {}
    try:
        deleted_vocab = json.loads(latest.get("deleted_vocab") or "[]")
    except Exception:
        deleted_vocab = []
    try:
        stamp = json.loads(latest.get(STAMP_KEY) or "\"\"")
    except Exception:
        stamp = ""

    state = sanitize_state(
        {
            "custom_vocab": custom_vocab,
            "deleted_vocab": deleted_vocab,
            STAMP_KEY: stamp,
        }
    )
    return state, max_seq, logs[-1]


# CRC32C (Castagnoli) for LevelDB log records.
POLY = 0x82F63B78
_CRC_TABLE = []
for i in range(256):
    c = i
    for _ in range(8):
        c = (c >> 1) ^ POLY if (c & 1) else (c >> 1)
    _CRC_TABLE.append(c & 0xFFFFFFFF)


def crc32c(data: bytes) -> int:
    crc = 0xFFFFFFFF
    for b in data:
        crc = _CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >> 8)
    return crc ^ 0xFFFFFFFF


def mask_crc(crc: int) -> int:
    return (((crc >> 15) | ((crc << 17) & 0xFFFFFFFF)) + 0xA282EAD8) & 0xFFFFFFFF


def varint32(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def put_entry(key: str, value: str) -> bytes:
    kb = key.encode("utf-8")
    vb = value.encode("utf-8")
    return b"\x01" + varint32(len(kb)) + kb + varint32(len(vb)) + vb


def append_state(log_file: Path, seq: int, state: dict[str, Any]) -> None:
    payload_body = b"".join(
        [
            put_entry("custom_vocab", json.dumps(state["custom_vocab"], ensure_ascii=False)),
            put_entry("deleted_vocab", json.dumps(state["deleted_vocab"], ensure_ascii=False)),
            put_entry(STAMP_KEY, json.dumps(state[STAMP_KEY], ensure_ascii=False)),
        ]
    )
    payload = seq.to_bytes(8, "little") + (3).to_bytes(4, "little") + payload_body
    rec_type = b"\x01"
    checksum = mask_crc(crc32c(rec_type + payload)).to_bytes(4, "little")
    header = checksum + len(payload).to_bytes(2, "little") + rec_type
    with open(log_file, "ab") as f:
        f.write(header + payload)


def choose_canonical(states: list[dict[str, Any]]) -> dict[str, Any]:
    states = [sanitize_state(s) for s in states]
    best = states[0]
    for s in states[1:]:
        if parse_stamp(s[STAMP_KEY]) > parse_stamp(best[STAMP_KEY]):
            best = s
    # If timestamps tie but content diverges, merge and bump stamp.
    fp_set = {state_fingerprint(s) for s in states}
    if len(fp_set) > 1:
        merged_custom: dict[str, str] = {}
        merged_deleted: list[str] = []
        seen_deleted: set[str] = set()
        for s in states:
            merged_custom.update(s["custom_vocab"])
        for s in states:
            for w in s["deleted_vocab"]:
                if w in merged_custom or w in seen_deleted:
                    continue
                seen_deleted.add(w)
                merged_deleted.append(w)
        return {"custom_vocab": merged_custom, "deleted_vocab": merged_deleted, STAMP_KEY: now_iso()}

    # When all sources match by content but some are missing stamp, stabilize on one valid
    # timestamp; if none exists, mint one once so later comparisons are deterministic.
    canonical_stamp = best[STAMP_KEY] if parse_stamp(best[STAMP_KEY]) > 0 else now_iso()
    return {
        "custom_vocab": best["custom_vocab"],
        "deleted_vocab": best["deleted_vocab"],
        STAMP_KEY: canonical_stamp,
    }


def sync_once(target_dirs: list[Path]) -> None:
    loaded = []
    for d in target_dirs:
        state, max_seq, log_file = load_state(d)
        loaded.append({"dir": d, "state": state, "max_seq": max_seq, "log": log_file})

    canonical = choose_canonical([item["state"] for item in loaded])
    changed = 0
    for item in loaded:
        fp_equal = state_fingerprint(item["state"]) == state_fingerprint(canonical)
        stamp_equal = item["state"][STAMP_KEY] == canonical[STAMP_KEY]
        if fp_equal and stamp_equal:
            continue
        append_state(item["log"], item["max_seq"] + 1, canonical)
        changed += 1

    print(
        f"[sync] custom={len(canonical['custom_vocab'])} deleted={len(canonical['deleted_vocab'])} "
        f"stamp={canonical[STAMP_KEY]} changed_targets={changed}"
    )


def find_atlas_profile(base: Path) -> Path:
    for candidate in sorted(base.glob("user-*")):
        d = candidate / "Local Extension Settings" / "cehpmlkdhejmljioeaianakpmjkdoppp"
        if d.exists():
            return candidate
    raise RuntimeError("Atlas profile with cehp... extension not found")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Sync TechWord vocab between Chrome and Atlas")
    p.add_argument("--interval", type=int, default=20, help="seconds between sync runs")
    p.add_argument("--once", action="store_true")
    p.add_argument(
        "--lock-file",
        default=str(Path.home() / ".techwordlearn" / "vocab-storage-sync.lock"),
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    lock_path = Path(args.lock_file).expanduser()
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock_fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("[sync] another instance is running; exit")
        return

    atlas_base = Path.home() / "Library/Application Support/com.openai.atlas/browser-data/host"
    atlas_profile = find_atlas_profile(atlas_base)
    targets = [
        atlas_profile / "Local Extension Settings" / "cehpmlkdhejmljioeaianakpmjkdoppp",
        atlas_profile / "Sync Extension Settings" / "cehpmlkdhejmljioeaianakpmjkdoppp",
        Path.home() / "Library/Application Support/Google/Chrome/Default/Local Extension Settings/gmldanoplcfaabgiphamdldiemmhjnhp",
    ]

    if args.once:
        sync_once(targets)
        return

    print("[sync] daemon started")
    while True:
        try:
            sync_once(targets)
        except Exception as exc:
            print(f"[sync] error: {exc}")
        time.sleep(max(5, int(args.interval)))


if __name__ == "__main__":
    main()
