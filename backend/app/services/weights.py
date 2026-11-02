"""Safe loading of pinned model weights.

A .pt file is a pickle: unpickling can execute arbitrary code. Before anything is unpickled we
1. resolve the file only through the lock manifest (no caller-supplied paths),
2. check its SHA-256 against the pinned value,
3. statically scan every pickle inside it (without executing it) and refuse any global outside a tight allowlist.
"""
import hashlib
import json
import pickletools
import zipfile
from functools import lru_cache
from pathlib import Path

LOCK_FILE = Path(__file__).resolve().parents[2] / "models.lock.json"

# Exactly what the official YOLO26 weights and the accident model reference (inspected in Phase 4), plus their
# storage-type siblings. Anything else (os, subprocess, builtins.eval, ...) is refused.
_ALLOWED_PREFIXES = ("ultralytics.nn.", "torch.nn.modules.")
_ALLOWED_EXACT = {
    "__builtin__.set", "builtins.set", "collections.OrderedDict", "torch.Size",
    "torch._utils._rebuild_parameter", "torch._utils._rebuild_tensor_v2",
    "torch.FloatStorage", "torch.HalfStorage", "torch.LongStorage", "torch.IntStorage", "torch.BFloat16Storage",
    "torch.DoubleStorage", "torch.ByteStorage", "torch.BoolStorage",
    "ultralytics.yolo.utils.IterableSimpleNamespace", "ultralytics.utils.IterableSimpleNamespace",
}


class UnsafeWeights(Exception):
    pass


def load_lock() -> dict:
    return {k: v for k, v in json.loads(LOCK_FILE.read_text()).items() if not k.startswith("_")}


def pickle_globals(path: Path) -> set[str]:
    """Every global a pickle inside the zip would import, found by reading opcodes (nothing is executed)."""
    refs: set[str] = set()
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile as exc:
        raise UnsafeWeights(f"{path.name} is not a zip-format PyTorch checkpoint") from exc
    pickles = [n for n in z.namelist() if n.endswith(".pkl")]
    if not pickles:
        raise UnsafeWeights(f"{path.name} contains no pickle to inspect")
    for name in pickles:
        strings: list[str] = []
        for op, arg, _ in pickletools.genops(z.read(name)):
            if op.name in ("SHORT_BINUNICODE", "BINUNICODE", "UNICODE", "BINUNICODE8", "SHORT_BINSTRING", "BINSTRING", "STRING"):
                strings.append(arg)
            elif op.name == "GLOBAL":
                refs.add(arg.replace(" ", "."))
            elif op.name == "STACK_GLOBAL":
                refs.add(f"{strings[-2]}.{strings[-1]}" if len(strings) >= 2 else "<unresolvable STACK_GLOBAL>")
            elif op.name in ("INST", "OBJ"):
                refs.add(f"<{op.name} opcode>")  # legacy object construction: never needed by these checkpoints
    return refs


def disallowed(refs: set[str]) -> list[str]:
    return sorted(r for r in refs if r not in _ALLOWED_EXACT and not r.startswith(_ALLOWED_PREFIXES))


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def verified_path(name: str, models_dir: Path) -> tuple[Path, dict]:
    """Return the path of a pinned, hash-checked, scan-clean weights file. Raises UnsafeWeights or FileNotFoundError."""
    lock = load_lock()
    if name not in lock:
        raise UnsafeWeights(f"model '{name}' is not in models.lock.json")
    entry = lock[name]
    path = models_dir / entry["file"]
    if not path.is_file():
        raise FileNotFoundError(f"weights for '{name}' are not installed ({entry['file']}); run scripts/fetch_models.py")
    if sha256_of(path) != entry["sha256"]:
        raise UnsafeWeights(f"weights for '{name}' do not match the pinned SHA-256")
    bad = disallowed(pickle_globals(path))
    if bad:
        raise UnsafeWeights(f"weights for '{name}' reference disallowed objects: {bad[:5]}")
    return path, entry


@lru_cache(maxsize=4)
def load_yolo(name: str, models_dir: str):
    """Load an Ultralytics model only after verification. Cached per process."""
    path, entry = verified_path(name, Path(models_dir))
    from ultralytics import YOLO  # imported lazily: heavy

    model = YOLO(str(path))
    return model, entry
