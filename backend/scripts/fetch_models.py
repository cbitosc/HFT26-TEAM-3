"""Download pinned model weights into <STORAGE_ROOT>/models and verify them.

    python scripts/fetch_models.py                       # YOLO26s and YOLO26n (Ultralytics, AGPL-3.0)
    python scripts/fetch_models.py --include-accident    # also the accident-cue model (no licence in its source repo)
"""
import argparse
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings  # noqa: E402
from app.services.weights import UnsafeWeights, load_lock, verified_path  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--include-accident", action="store_true")
    args = ap.parse_args()
    models_dir = get_settings().models_path
    models_dir.mkdir(parents=True, exist_ok=True)
    lock = load_lock()
    names = [n for n, e in lock.items() if e["kind"] == "detector"] + (["accident_yolov8s"] if args.include_accident else [])
    if args.include_accident:
        print("NOTE: the accident model's source repository states no licence. It is used locally as a weak cue,\n"
              "      must not be redistributed, and the author's permission is still to be obtained.\n")
    ok = True
    for name in names:
        entry = lock[name]
        dest = models_dir / entry["file"]
        if not dest.is_file():
            print(f"downloading {name} from {entry['source']}")
            tmp = dest.with_suffix(".part")
            urllib.request.urlretrieve(entry["source"], tmp)
            tmp.rename(dest)
        try:
            verified_path(name, models_dir)
            print(f"ok       {name}: hash pinned, pickle scan clean ({entry['licence'][:60]})")
        except (UnsafeWeights, FileNotFoundError) as exc:
            ok = False
            print(f"REFUSED  {name}: {exc}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
