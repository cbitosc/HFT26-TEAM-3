# Evidence-to-reconstruction workflow

The Evidence page owns setup. The reconstruction page stays focused on playback, chapters, and findings. Both show one compact readiness/update row; setup checks, matching, clocks and original metadata are folded by default.

1. Upload videos, a sensor CSV, and multiple named witness accounts (typed or UTF-8 `.txt`). Choose **Mixed demo** when combining recorded footage with simulated records; each source needs an explicit origin. Real cases continue to reject simulated sources.
2. Configure sensor columns/units. Witness uploads use hosted extraction only when the case policy and server configuration permit it; otherwise the UI invokes local keyword extraction. It recognizes common English incident sentences, not arbitrary language. Original text and exact quote offsets remain unchanged. Review proposals, exclude incorrect claims or select a quote manually.
3. Create vehicle labels and confirm the corresponding video tracks, witness claims and sensor sources. Track previews highlight stored bounding boxes. A review basis is required in the UI; identity decisions are audited. Confirmed references must belong to the same case, and one reference cannot be confirmed to two vehicles.
4. Align source clocks using a shared instant in seconds from each recording's start and an explicit uncertainty. Incorrect relations can be removed. Place witness claims on a justified source-relative range, retaining uncertainty and the investigator's basis. Unknown/ambiguous times remain unplaced.
5. Build/update reconstruction. Readiness checks report processing, witness extraction, sensor mapping, shared clocks and identity links. Builds create a new baseline snapshot and preserve older scenarios. Stable input fingerprints detect changed evidence, claims, identities, clocks and processing results. Incomplete evidence can still be inspected; it is not silently filled in.
6. Findings show separate source accounts, quotes, timestamps, source links, and review controls. Claim assessments reference the latest baseline's actual findings. No finding is not the same as a verified claim.

## Entry-order rule scope

Local extraction recognizes explicit wording such as “Vehicle A entered the junction before Vehicle B.” `CON-ORDER-01` compares reversed order from distinct witness records only when vehicle labels resolve unambiguously, first-vehicle identities are confirmed, scope matches, and anchored time ranges overlap. `CON-ORDER-VIDEO-01` is limited to entry into the camera **scene**, never junction entry; first detections remain uncertain because tracking can start late. Neither rule chooses which source is correct.

## Validation

`backend/tests/test_evidence_workflow.py` covers local quote offsets, idempotency, readiness, stale snapshots, cross-case identity rejection, exclusion/time validation, ambiguous anchors and a mixed-evidence API flow. The mixed test runs YOLO/tracking on a generated pan over a street photograph with simulated witness/sensor data. This verifies integration, not accident-detection accuracy on real footage.

Frontend workflow tests cover collapsed setup, explicit updates, build blocking, extraction failure, Unicode manual selections, identity confirmation and mixed-source provenance. The existing scenario suites verify rule logic on supplied synthetic detections.

## Local preview

The existing default launcher ports remain 8010/5176. When they are occupied, start a second pair with:

```sh
TRACELINE_API_PORT=8012 TRACELINE_FRONTEND_PORT=5178 TRACELINE_RELOAD=1 python3 start-background.py
```

The API and frontend must be started together so the frontend proxy targets the matching API. PostgreSQL must already be running. This launcher is a development convenience, not a production supervisor.
