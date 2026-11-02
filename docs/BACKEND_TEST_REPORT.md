# Backend test report

Command, from `backend/` with the project virtualenv:

```bash
./.venv/bin/python -m pytest -q -s --tb=line
```

Result: **162 passed, 17 skipped, 0 failed**, 71.60 seconds. One Starlette deprecation warning from FastAPI's test client (`httpx` vs `httpx2`). No assertion failures.

Skip reasons were listed with the real-video test deselected, so the detector did not run a second time. That listing was 161 passed, 17 skipped, 1 deselected.

## Skipped

| Count | Reason |
|---:|---|
| 12 | `tests/test_reconstruction.py`: `run scripts/build_scenarios.py first` (synthetic scenario packages are not in this checkout) |
| 4 | `tests/test_report.py`: same missing packages |
| 1 | `tests/test_detection.py`: accident-cue test that needs the model's validation image split. The cue weights themselves are installed and did run on the real video (18 boxes). |

The real-video test was not skipped in the full run. Weights and `selected_accident.mp4` were both present.

## What the new tests cover

| Test | Result |
|---|---|
| `tests/test_job_progress.py::test_preprocess_progress_steps_with_grabbed_frames` | passed. Preprocess progress increases by one container frame per step. Finished jobs store `progress` 1.0. |
| `tests/test_job_progress.py::test_failed_detect_keeps_the_last_real_fraction` | passed. A missing weight file fails `detect` at progress 0, after preprocess has already reported real frame steps. |
| `tests/test_real_video_pipeline.py::test_selected_accident_video_is_detected_tracked_and_reviewed` | passed. Counts are in `docs/REAL_VIDEO_PIPELINE_TEST.md`. Stored boxes on one frame match a fresh YOLO26s predict within 3 pixels. The lone camera is its own reference clock: 1093 events placed, 0 unplaced, seek at case time 0 returns media time 0. |

Existing detection, tracking, video, schema, sync, and video-event tests passed with the progress callbacks in place. Image overlap is still not stored as a `collision` event. `tests/test_video_events.py` passed, including the tests that require an abrupt speed change before `possible_collision`. `tests/test_sync.py` includes the lone-source clock and the two-source case that stays unrelated.
