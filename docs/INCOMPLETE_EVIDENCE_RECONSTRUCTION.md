# Incomplete evidence

A reconstruction is built from the records that exist. Missing video, a gap in a sensor file, an unsynchronized camera, and a clock disagreement are stored as gaps or as unplaced events. They are not filled in, and they are not contradictions.

`GET /cases/{id}/reconstruction/completeness` is the summary. `defensible` is true only when at least one placed event has a complete trace and an evidence class of `direct_observation`, `derived_observation`, `sensor_observed`, or `witness_reported`. Otherwise the reason `no_placed_evidence` is set. There is no score.

## Clocks

Each timeline event carries `clocks`. `media_ms` is the source's own time. `container_pts_ms` adds the stored container PTS when the source is a video. `wall_clock` is set only from a trusted clock record (`declared_by_investigator` or `simulation_clock`) plus that media time. `creation_time_claimed` is not used. `case_ms` is the existing case clock (`start_ms` / `end_ms`). `synchronized_ms` is that same interval only when the sync group has two or more sources and the group is consistent. A lone file is its own reference: `case_ms` is set and `synchronized_ms` is null.

A source annotation offset (`time in this source = time in the reference + clock_offset_ms`) is applied the next time a scenario is built, as edge `ann:{evidence_id}`. It does not rewrite a scenario that already exists.

## Overlap, gaps, and disagreement

`overlaps` on the timeline lists evidence pairs whose placed case-time spans intersect. Overlap is not contact and is not corroboration.

Gaps keep their own route. `video_missing_interval` and `sensor_missing_interval` are missing samples. `unsynchronized_source` means no recorded clock relation. `clock_inconsistency` means two applied relations disagree by more than their bounds. Those gaps appear in `missing_evidence`. Contradiction ids stay on the contradictions route. The completeness payload does not mix the two lists.

`recording_starts_after_event` and `recording_ends_before_event` are used only when a trusted wall clock exists and the investigator's recording window does not contain that instant. Duration of the file is not treated as the incident time.

## Associations and hypotheses

A cross-camera association is a separate row with status `uncertain` and `probability: null`. It is written when confirmed actor links already span two evidence ids, or when an investigator posts one. Matching tracker id integers does not create a row. A duplicate upload returns the existing evidence id, so it cannot corroborate.

Hypotheses are the alternatives already stored on an inference whose premises all have evidence ids. An inference with a premise that has no evidence id is listed under `unsupported_hypotheses` and is not given a hypothesis entry. Alternatives are not probabilities.

## What is refused

No invented interval for a file that was not recording. No contact from image overlap. No legal fault. No synthetic file inside a case designated real.
