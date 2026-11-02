"""Content-addressed, read-only storage for original evidence.

Paths are generated from the SHA-256 of the content, never from user input, so a hostile filename cannot reach the
filesystem. Uploads are first streamed into a staging file (hash and size computed on the way); only after the caller has
validated the content type is the file committed into `originals/`.
"""
import hashlib
import os
import re
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

CHUNK = 1024 * 1024
HEAD_BYTES = 64 * 1024


class UploadTooLarge(Exception):
    def __init__(self, limit: int):
        self.limit = limit
        super().__init__(f"upload exceeds {limit} bytes")


@dataclass
class StagedUpload:
    tmp_path: Path
    sha256: str
    size: int
    head: bytes  # first 64 KiB, for content-type sniffing before anything is committed


def stage_upload(src: BinaryIO, root: Path, max_bytes: int) -> StagedUpload:
    tmp_dir = root / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp = tmp_dir / f"up_{secrets.token_hex(8)}"
    h, size, head = hashlib.sha256(), 0, b""
    try:
        with open(tmp, "wb") as out:
            while chunk := src.read(CHUNK):
                size += len(chunk)
                if size > max_bytes:
                    raise UploadTooLarge(max_bytes)
                if len(head) < HEAD_BYTES:
                    head += chunk[: HEAD_BYTES - len(head)]
                h.update(chunk)
                out.write(chunk)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return StagedUpload(tmp, h.hexdigest(), size, head)


def commit_staged(staged: StagedUpload, root: Path) -> str:
    """Move the staged file into the content-addressed store (read-only). Returns the path relative to `root`."""
    rel = f"originals/{staged.sha256[:2]}/{staged.sha256}"
    dest = root / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():  # identical content is already stored: keep the existing file
        staged.tmp_path.unlink(missing_ok=True)
    else:
        os.replace(staged.tmp_path, dest)
        os.chmod(dest, 0o444)
    return rel


def discard_staged(staged: StagedUpload) -> None:
    staged.tmp_path.unlink(missing_ok=True)


def safe_resolve(root: Path, rel: str) -> Path:
    """Resolve a stored relative path and refuse anything that escapes the storage root."""
    base = root.resolve()
    p = (base / rel).resolve()
    if base != p and base not in p.parents:
        raise ValueError("path escapes storage root")
    return p


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(CHUNK):
            h.update(chunk)
    return h.hexdigest()


_UNSAFE = re.compile(r"[^A-Za-z0-9._ -]+")


def sanitize_filename(name: str | None) -> str:
    """Display-only name: no directories, no control or special characters, bounded length."""
    base = (name or "").replace("\\", "/").rsplit("/", 1)[-1]
    base = _UNSAFE.sub("_", base).strip(" .")
    base = re.sub(r"_{2,}", "_", base)
    return (base[:120] or "upload")


_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def derived_dir(root: Path, case_id: str, evidence_id: str, run_id: str) -> Path:
    """Directory for derived artifacts (thumbnails, transcodes). Identifiers are validated, never trusted."""
    for part in (case_id, evidence_id, run_id):
        if not _ID.match(part):
            raise ValueError(f"unsafe identifier: {part!r}")
    d = root / "derived" / case_id / evidence_id / run_id
    d.mkdir(parents=True, exist_ok=True)
    return d
