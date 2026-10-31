# Remaining issues

These are still true after the follow-up on `cursor/real-video-pipeline-c915`.

- The selected case still stores 1,093 events from the previous rules, including 943 proximity interactions and 49 possible-collision candidates. They were not deleted. A new tracking run uses the time-based merge (139 events on those same tracks in a replay). Until that run is executed and a new reconstruction is built, the workspace timeline still draws the old rows.
- Other cases that were preprocessed before this change still have a playback file scaled to 1080 if the source was taller. Re-run preprocess to remux them. The local playback for `ev_289b77d5484e` was remade at 2392×1352 and is not in git.
- The clips cannot support a physical-contact, fault, or metres-per-second claim. There is no camera calibration. Speeds are box-diagonals per second. Image overlap is not contact. The accident cue does not decide an event. After the rule replay this clip still has 4 possible-collision candidates, each of which is overlap plus an abrupt drop in box speed.
- Two real files with no sync edge stay unplaced. Do not present them on one clock.
- Firefox and Safari were not installed and were not tested.
- Login is not implemented. `X-Actor` is an optional header.
- Featherless is not configured, so a live witness extraction returns 503 and does not invent claims.
- Packet-timestamp warnings still fire on any H.264 reordering and do not measure how large the inversion is.
- A display rotation other than 0, 90, 180, or 270 is rejected. A build of OpenCV that does not honor the display matrix is refused for a rotated file rather than decoded in a different orientation from the player.
- The twelve reconstruction tests and four report tests that need `scripts/build_scenarios.py` packages are still skipped, and the accident-cue validation image split test is still skipped.
