# CONTRADICTION_DETECTION

Version 2. Candidate contradictions come from **deterministic rules**. An LLM may only write a short explanation of a record that already exists. The system never decides which source is correct.

## 1. Preconditions shared by all rules

A pair (A, B) is compared only if:
1. A and B come from **different, independent** evidence sources (INCIDENT_RECONSTRUCTION_ENGINE §5).
2. They concern the same **confirmed** entity (or the same scene attribute such as a signal), unless the rule explicitly allows candidate links. Allowed cases are marked in the output.
3. They are in the same **sync group**, or the rule is time-independent.
4. Their time intervals overlap, or are within the rule's tolerance, after uncertainty.
5. Their attributes are expressed in a **comparable frame of reference** (see §3), or the rule can convert them.

If a precondition fails for a pair that would otherwise be compared, the result is `insufficient` with the failed precondition named. It is not a contradiction.

## 2. Rule catalogue (v1)

| Rule ID | Conflict type | Fires when | Tolerances | Example |
|---|---|---|---|---|
| CON-ACTION-01 | Different vehicle actions | Mutually exclusive maneuver classes for the same entity and time (straight vs turned left/right; stopped vs moving) | Time overlap required; maneuver class confidence ≥ threshold | CCTV track continues straight; witness says it turned left |
| CON-TIME-01 | Different claimed event times | Same event (same type and entity) with non-overlapping intervals beyond tolerance | Tolerance = sum of both bounds + rule margin | Witness: "at 6:40"; CCTV clock (offset known): 6:43 |
| CON-DIR-01 | Conflicting directions | Travel directions differ beyond an angle threshold in a shared frame | Angle threshold + both uncertainties | Witness: "heading north"; GPS heading 180° |
| CON-ID-01 | Conflicting identities | Two sources attribute the same action to different entities when only one can have done it (e.g., the vehicle that entered first) | Requires confirmed links on both | Witness: "the truck entered first"; video: car entered first |
| CON-ORDER-01 | Conflicting order | One source orders X before Y, another orders Y before X, and both orders are certain within their own source | Certain relations only | W1: braked then hit; sensor: impact then braking |
| CON-LOC-01 | Conflicting locations | Positions differ beyond the combined uncertainty in a shared frame, or location descriptions map to disjoint zones | Zone map or metric frame required | Witness: "in the left lane"; track in right lane (calibrated CCTV) |
| CON-EXIST-01 | Existence conflict | A source asserts an event or entity during an interval that a covering source shows without it | Covering source must have adequate quality and no gap there | Witness: "a motorcycle passed"; clear CCTV coverage shows none |
| CON-QTY-01 | Quantity conflict | A numeric claim (speed) differs from a measurement beyond tolerance | Measurement uncertainty + claim precision | Claim "about 90 km/h"; sensor 48–52 km/h |

**What is not a contradiction:**
- Vague claims ("very fast") are `insufficient`: untestable without a number.
- Image-space direction on a moving dashcam against a road-frame claim, without ego compensation, is `insufficient`.
- Box overlap in video against "no collision" is `insufficient`, because image overlap does not establish contact.
- Differences within tolerance are `supporting` or `partially_supporting`.

## 3. Frames of reference

| Source | Native frame | Comparable with |
|---|---|---|
| Static CCTV with zones | Road zones (approach, intersection, exit legs) → maneuver class | Witness maneuver claims, other zone-based sources |
| Calibrated camera | Ground plane (metres) | GPS/ENU via a registered transform, location claims mapped to zones |
| Dashcam, uncompensated | Image relative to the moving ego | Only claims about the ego or relative positions; not absolute directions |
| Dashcam + ego sensors | Ego-compensated relative motion | Limited maneuver classes |
| GPS/IMU | WGS84 / local ENU, compass heading | Compass claims, calibrated positions |
| Witness | Language: maneuvers, compass words, landmarks | Mapped to zones or compass only through explicit rules |

Mapping witness phrases to frames uses a fixed table (e.g., "turned left" → maneuver class `left` relative to the vehicle's approach leg). It is never free-form model output.

## 4. Record content

Every contradiction record stores: rule ID; compared event IDs; entity link IDs and status; sync group and time bounds used; the compared values in their frames; tolerances; the independence assessment; **benign explanations** from a rule-specific list (different viewpoint, timing uncertainty, identity uncertainty, perception limits); a template explanation; an optional LLM explanation.

## 5. LLM explanation (optional, CON-03)

- **Input:** only the stored record (compared values, references, tolerances, benign-explanation list), never raw evidence beyond the referenced snippets, and never other case data.
- **Output:** two to four sentences, validated so that it mentions only IDs and values present in the input, contains no judgement of which source is correct, and uses no fault or credibility language.
- **On validation failure:** the template explanation is used and the failure is logged.

## 6. Avoiding over-flagging
- Precision first: thresholds are set so that a rule fires only with comparable frames and confirmed identity.
- Each record has a `strength` field (`clear` or `marginal`, by how far beyond tolerance it is). Marginal records are listed separately in the summary.
- Duplicate records (same pair, multiple rules) are grouped under the strongest rule, with the others listed.

## 7. Evaluation
Precision, recall, and F1 against planted contradictions in synthetic scenarios, plus false-alarm counts on statements with no planted conflicts. These are reported per rule ID with sample sizes (EVALUATION_PLAN). Both the oracle-input and model-input configurations are evaluated.
