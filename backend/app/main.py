from fastapi import FastAPI

from app import __version__
from app.api import actors, calibration, cases, claims, dashboard, detections, evidence, health, jobs, reconstruction, reports, sensors, sync, tracks, video, witnesses
from app.errors import install_error_handlers

app = FastAPI(title="TraceLine API", version=__version__, description="Accident evidence reconstruction (investigation support; no fault determination).")
install_error_handlers(app)
for module in (health, dashboard, cases, evidence, video, detections, tracks, witnesses, claims, actors, sensors, sync, calibration, jobs, reconstruction, reports):
    app.include_router(module.router, prefix="/api/v1")
