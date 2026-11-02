"""Seed the existing oracle demo without invoking a real detector on synthetic footage."""
import runpy
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import jobs

_original_params = jobs.preprocess_params

def oracle_params(*args, **kwargs):
    return {**_original_params(*args, **kwargs), 'chain_detect': False}

if __name__ == '__main__':
    jobs.preprocess_params = oracle_params
    runpy.run_path(str(Path(__file__).with_name('seed_demo.py')), run_name='__main__')
