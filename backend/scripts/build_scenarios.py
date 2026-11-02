"""Generate the four synthetic scenario packages into <STORAGE_ROOT>/scenarios/<id>/ (videos, sensor CSV, witness texts, ground truth).

    python scripts/build_scenarios.py [A B C D]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings  # noqa: E402
from scenarios import world  # noqa: E402


def main(keys: list[str]) -> int:
    root = get_settings().storage_path / "scenarios"
    for k in keys or list(world.ALL):
        s = world.ALL[k]()
        m = world.write_package(s, root / s.id)
        print(f"{s.id}: {', '.join(m['files'].values())}, contacts {s.contacts() or 'none'}")
    print("all files are SYNTHETIC; stored under", root)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
