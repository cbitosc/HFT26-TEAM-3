# SECURITY_AND_EVIDENCE_INTEGRITY

Version 2. Hackathon-grade controls designed so they could be strengthened. **They are not a certified legal chain of custody.**

## 1. Evidence integrity

| Control | Implementation |
|---|---|
| Hash at ingest | SHA-256 computed while streaming the upload; stored with the evidence item |
| Immutable raw store | Content-addressed path; files set read-only; the application role cannot update or delete evidence rows |
| Verification on read | Strict mode re-hashes on export and before processing; a mismatch raises an integrity alert and stops processing |
| Separate processed store | Derived files never overwrite raw files; each stores its input hash |
| Append-only derived records | Events, claims, correlations, and summaries are versioned, not edited |
| Hash-chained audit log | `entry_hash = sha256(prev_hash ‖ canonical_json(entry))`; periodic verification job |
| Export integrity | Exports (summary PDF/JSON, reconstruction MP4) carry a manifest with the SHA-256 of each file and of the input versions |
| Generated vs original | Reconstruction videos carry banners and manifests marking them as generated; they are stored under `artifacts/`, never in the evidence store |

## 2. Access control
- Users with roles: **investigator** (upload, process, edit, propose), **reviewer** (review, confirm links and sync points, finalize), **admin** (users, policy).
- Bearer tokens; HTTPS in any non-local deployment.
- Every mutation is attributed to a user in the audit log.
- The evaluation role alone can read ground truth (separate schema and grants).

## 3. External inference and data protection
- **Per-case policy `allow_external_inference`**, default `false` for cases designated real. When false, no frame, statement, or record leaves the machine; hosted stages are skipped and reported.
- When true: only the minimum required data is sent (selected frames or crops; one statement's text; specific compared records). Witness contact details are never sent.
- Every outbound call is recorded in the model-call ledger (what was sent, as hashes; which model; when).
- Optional face and plate blurring before sending frames (P2).
- Synthetic data is used for demos.

## 4. Secrets
- `FEATHERLESS_API_KEY` and other secrets live only in backend environment variables or a local `.env` excluded by `.gitignore`.
- Never in frontend code, documentation, logs, error messages, or test fixtures.
- A pre-commit secret scan (e.g., a pattern-based scanner) runs on commits.
- Keys are never pasted into chat or issues.

## 5. Input safety
- Content-based file type detection; size limits; decoding in a worker process (crash isolation).
- Archive uploads are not extracted automatically.
- Statement and OCR text is treated as data. Model prompts delimit it, and output validation prevents text inside a statement from changing system behaviour (prompt injection is bounded because outputs must match schemas and verbatim spans).
- Downloaded datasets are kept in their own directories and are not executed.

## 6. Logging and privacy
- Logs carry IDs and stage information, not statement text or frames.
- Configurable retention for processed frames.
- Ability to export or delete an entire case at the end of a hackathon demo (deletion is an explicit admin action, audited, and not available for evidence in normal operation).

## 7. Licences and attribution
Dataset licences are recorded per evidence item (`provenance.licence`). BDD100K is research and non-profit only; NGSIM is CC BY-SA; CARLA content terms are to be checked. Model licences (e.g., AGPL-3.0 for Ultralytics) are recorded in MODEL_REPOSITORY_ANALYSIS (Phase 2).

## 8. Threats and residual risks

| Threat | Mitigation | Residual |
|---|---|---|
| Tampering with raw files on disk | Hash verification, read-only files | A local admin could replace both file and hash; the audit chain detects edits only if the chain head is kept elsewhere |
| Model fabricates facts | Schema + span + ID validation; templates | A validated sentence can still misread evidence |
| Leakage to a third-party API | Policy gate, minimization, ledger | Provider-side retention is outside our control; documented |
| Secret exposure | Env-only secrets, scans | Human error |
| Ground-truth leakage into processing | Separate schema and grants, tests | — |
