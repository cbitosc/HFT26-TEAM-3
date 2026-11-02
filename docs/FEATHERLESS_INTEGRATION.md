# Featherless integration

Featherless is an optional text model. It proposes witness claims and, separately, sentences for an incident narrative. Code decides what is stored. A missing key, a policy block, a network failure, or an invalid answer leaves the deterministic records in place. The model text from a failed check is not saved and is not presented as an answer.

The key is `FEATHERLESS_API_KEY` in the process environment, read through settings. It is sent only as `Authorization: Bearer …`. It is not written to the database, the ledger request body, logs, or any API response. `FEATHERLESS_BASE_URL` defaults to `https://api.featherless.ai/v1`. `FEATHERLESS_TEXT_MODEL` defaults to `Qwen/Qwen3-14B`. `FEATHERLESS_VISION_MODEL` is unused by claim extraction and by the incident narrative. `FEATHERLESS_DISABLE_THINKING` defaults on and adds `chat_template_kwargs.enable_thinking: false` for Qwen3 claim calls and for the narrative call.

`Case.allow_external_inference` is checked before the key. A case with that flag false raises `PolicyBlocked` and does not open a socket. No key raises `NotConfigured`. Tests use a stand-in client. This document does not claim a live Featherless run.

## Witness claims

`POST` a witness statement, or upload `witness_text` / `witness_pdf`. `maybe_enqueue_claims` queues stage `claims` only when the case allows external inference and a key is set. Otherwise no job is created and the statement stays available for a manual claim.

`handle_extract_claims` sends the original statement as delimited data (`witness-claims-v1`). The model must return JSON claims whose `source_text` is a verbatim quote. Code locates that quote in the statement and stores `statement_id`, `char_start`, `char_end`, and `source_text` copied from those offsets. A quote that is not in the statement is rejected and not rewritten. Unknown fields, including fault or credibility, fail schema validation. One repair call is allowed. A second invalid output fails the job, keeps the ledger rows, and leaves the manual path. The event-type hint and any left/right/straight reading come from fixed code tables, not from the model.

The database trigger `tl_claim_span` rejects a claim whose span does not match the statement text. The original statement cannot be edited.

## Incident narrative

`narrate` runs once when a scenario is built. Playback calls `read_narrative` and does not call the model.

The request is one chat completion at temperature 0, purpose `incident_narrative`, response format JSON. The user message is the incident view (event ids, evidence ids, times, track ids, detector classes, rule ids, observations) plus `hypotheses`. Each hypothesis is a stored inference alternative that already has a complete evidence trace: `id`, `statement`, `alternatives`, `evidence_ids`, and `probability: null`. Incomplete premises are omitted from that list. They are not given a model explanation.

`validate_sentences` rejects the whole answer. It does not edit a sentence. A sentence that states a time, vehicle, movement, proximity, or contact must cite `event_ids` and `evidence_ids`. Those event ids must be incident rows or hypothesis ids from the payload. The evidence ids must equal the evidence ids of the cited rows, and that set must be non-empty. An unknown id, an empty list, a hypothesis with no evidence ids, banned wording, a plate or make/model, or contact language the stored events do not support fails validation. `record_validation` marks the ledger row invalid. Invalid rows are not replayed from cache.

On `not_configured`, `policy_blocked`, `request_failed`, or `validation_failed`:

- `ai_narrative` is null
- `ai_narrative_status` is `unavailable`
- `deterministic.headline` and `deterministic.sentences` stay the template summary
- `hypothesis_explanation` is still present: `{items, note}` from stored events, not from the model

A ready narrative is `{model, model_run_id, sentences}` under `ai_narrative`. The report builder does not embed that object. Investigator and full reports keep the template text.

`GET /cases/{id}/incident-narrative` returns the stored document. Older scenarios that were built before `hypothesis_explanation` existed gain that object on read from the current events. That read does not call Featherless.
