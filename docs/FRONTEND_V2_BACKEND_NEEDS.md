# Frontend V2: what the UI still needs from the backend

Read against backend `8e5cedc` (migration `0010`). Items the backend now serves are wired and listed under "Served and wired". Nothing below was changed in `backend/` by the frontend work.

## Served and wired
`GET /cases/{id}/associations` (always uncertain, `probability: null`), `GET /cases/{id}/reconstruction/completeness`, timeline `hypotheses` and `overlaps`, event `clocks`, `evidence_class`, `trace`, narrative `hypothesis_explanation`, case `incident_at` (offset required) / `incident_at_note` / `location_text`, report list `format` (`executive` | `full`), `GET /cases/{id}/storyboard`, sensor mapping endpoints, `POST /cases/{id}/associations`.

## Still needed or worth deciding
| # | Need | Why |
|---|---|---|
| 1 | Reject or flag synthetic evidence uploaded into a `real` case (derive `mixed` or return 409). Today `designation` stays `real`. | The UI warns (MIXED banner) but the dashboard list cannot, because case rows carry no per-evidence synthetic flag. |
| 2 | `completeness.defensible` is `true` for a case with one video, no calibration, unconfirmed identities and fragmented tracks. Decide whether one camera can ever be "defensible". | The UI shows the backend's flag and its gap reasons; it does not override it. |
| 3 | Cross-case `GET /activity`, `GET /jobs?status=`, `GET /findings?review_status=` | The dashboard fans out per case (first 12 / 4 cases). |
| 4 | Wall-clock time per event (needs a trusted clock record) | `clocks.wall_clock` is `null` for every event until a clock is declared; the UI shows Not established. |
| 5 | A separate `reference` field so `code` can stay the system code | The UI sends the reference as `code`. |
| 6 | Event significance (`significant`, reason) and a ready-made case overview | The frontend ranks event types and builds the overview itself (`lib/overview.js`). |
| 7 | Report `full` lists every event (hundreds on busy footage) | ~195 KB markdown for a 15 s clip on `main`; consider a cap or grouping. |
| 8 | `visually_supported_contact` is never emitted by the video rules | A possible collision is amber only; the UI cannot show a stronger state because none exists. |
| 9 | Rotated video | Boxes are documented as upright; no rotated clip was tested in the UI. |
| 10 | An event review endpoint (`PATCH /events/{id}/review` with reviewed / relevant / not relevant / inconclusive) recorded in the audit log | Alert decisions are saved in the browser only today. |
| 11 | An event `tier` (information / attention / possible accident) and its reason from the rules | The frontend derives the tier from event type and the movement-change observation (`lib/alerts.js`). |
| 12 | On-demand before / event / after keyframe extraction at configurable offsets, with derived thumbnails stored apart from originals | The UI uses the nearest stored 5 fps samples and labels the offset. |

