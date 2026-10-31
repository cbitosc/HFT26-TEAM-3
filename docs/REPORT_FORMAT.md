# Report formats

`POST /cases/{id}/reports` takes an optional `format`. The default is `full`. Omitting it returns the same 16-section dossier as before. `format: "investigator"` returns a shorter report. Neither call deletes stored events.

## Full export

Sixteen sections, in this order: Case overview, Purpose and limits, Evidence inventory, Methods and models, Time synchronization, Vehicles and people, Reconstructed timeline, Direct observations and machine detections, Witness statements and claims, Sensor data, Corroborations, Contradictions, Gaps and missing evidence, Trajectories, Inferences and alternatives, Open questions and suggested next steps.

The reconstructed timeline lists every placed event. That is the archive. It is the right file when an investigator needs every stored row.

## Investigator report

Four sections:

1. **Executive summary.** Case designation, how many events are stored, how many appear on the key timeline, and how many `potential_interaction` rows were left in the store. It states the limits: no fault finding, image overlap is not contact, video speeds are box-diagonals per second.
2. **Key timeline.** Placed events of types that are not mere proximity: possible collision, possible near-miss, slowing, stopped, enter, leave, direction change, maneuver, sensor flags, witness claims, and inferences. At most 30 rows of one type are printed. The rest of that type stay in the findings list.
3. **Findings.** One statement per type, plus one per contradiction. Every finding has `event_ids`. Each id is a stored `events.id` for that scenario. A finding with no stored event is not emitted.
4. **Evidence appendix.** Files, hashes, synthetic flag, methods, and gap recommendations. It points at the full export for the complete event list.

An empty scenario still has the four sections, an empty key timeline, and no findings. Validation fails if a cited id is not in `stored_event_ids`.

## Size on the selected clip

Same stored scenario (`scn_b498fa275dd1`, 1,093 events). The events were not regenerated for this measurement.

| | Markdown characters | Markdown UTF-8 bytes | PDF bytes |
|---|---:|---:|---:|
| Full export | 218,552 | 233,940 | 51,721 |
| Investigator report | 16,931 | 17,743 | 10,253 |

The earlier audit recorded the full PDF as 51,719 bytes. The rebuild differs by the generation timestamp.

The workspace **Generate report** button requests `investigator`. **Full export** requests `format: "full"`.
