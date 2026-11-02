#!/usr/bin/env python3
"""Portable foreground API + frontend launcher; applies migrations before starting."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def main():
    python = ROOT / 'backend' / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    npm = shutil.which('npm')
    if not python.exists() or not npm or not (ROOT / 'frontend' / 'node_modules').exists():
        print('Run python setup-local.py first (Python 3.11+, Node.js and PostgreSQL are required).')
        return 1
    env = os.environ.copy()
    api_port = env.get('TRACELINE_API_PORT', '8010')
    web_port = env.get('TRACELINE_FRONTEND_PORT', env.get('TRACELINE_WEB_PORT', '5176'))
    env['TRACELINE_API_URL'] = f'http://127.0.0.1:{api_port}'
    children = []
    try:
        subprocess.run([str(python), '-m', 'app.bootstrap'], cwd=ROOT / 'backend', check=True, env=env)
        children.append(subprocess.Popen([str(python), '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', api_port], cwd=ROOT / 'backend', env=env))
        children.append(subprocess.Popen([npm, 'run', 'dev', '--', '--host', '127.0.0.1', '--port', web_port, '--strictPort'], cwd=ROOT / 'frontend', env=env))
        print(f'TraceLine: http://127.0.0.1:{web_port}/ · API http://127.0.0.1:{api_port}/docs', flush=True)
        while all(p.poll() is None for p in children):
            import time
            time.sleep(.3)
        return next((p.returncode for p in children if p.returncode), 0)
    except KeyboardInterrupt:
        return 0
    except (subprocess.CalledProcessError, OSError):
        print('Startup failed. Check setup and PostgreSQL. Existing cases are preserved.')
        return 1
    finally:
        for p in children:
            if p.poll() is None:
                p.terminate()
        for p in children:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()


if __name__ == '__main__':
    raise SystemExit(main())
