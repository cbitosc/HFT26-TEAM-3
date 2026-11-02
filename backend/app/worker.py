"""Optional standalone worker: `python -m app.worker`. The API also runs pending jobs right after each upload."""
import time

from app.config import get_settings
from app.db import get_session_factory
from app.services.jobs import run_pending

if __name__ == "__main__":
    factory, settings = get_session_factory(), get_settings()
    print("worker started; polling for pending jobs (Ctrl+C to stop)")
    while True:
        if run_pending(factory, settings) == 0:
            time.sleep(2)
