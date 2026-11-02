#!/usr/bin/env python3
"""Fresh-clone setup on Windows, macOS and Linux. No evidence or database resets."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--skip-install', action='store_true', help='Only prepare the configured database; dependencies must already exist')
    args = parser.parse_args()
    if sys.version_info < (3, 11):
        print('Use Python 3.11 or newer.')
        return 1
    if not (ROOT / '.env').exists() and not os.environ.get('DATABASE_URL'):
        shutil.copyfile(ROOT / '.env.example', ROOT / '.env')
        print('Created .env in the repository root. Set DATABASE_URL for your PostgreSQL database, then run this command again.')
        return 1
    python = ROOT / 'backend' / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    try:
        if not python.exists():
            if args.skip_install:
                print('Backend environment missing. Run python setup-local.py without --skip-install.')
                return 1
            subprocess.run([sys.executable, '-m', 'venv', str(ROOT / 'backend' / '.venv')], check=True)
        if not args.skip_install:
            npm = shutil.which('npm')
            if not npm:
                print('Install Node.js/npm, then run setup again.')
                return 1
            subprocess.run([str(python), '-m', 'pip', 'install', '-r', str(ROOT / 'backend' / 'requirements.txt')], check=True)
            subprocess.run([npm, 'ci'], cwd=ROOT / 'frontend', check=True)
        subprocess.run([str(python), '-m', 'app.bootstrap'], cwd=ROOT / 'backend', check=True)
    except (subprocess.CalledProcessError, OSError):
        print('Setup stopped. Resolve the error above and run setup again. Existing cases are preserved.')
        return 1
    print('Setup complete. Run python run-local.py, then open http://127.0.0.1:5176/')
    print('Case creation does not require model weights or an external AI key. See README for optional video models.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
