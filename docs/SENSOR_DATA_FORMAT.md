# Sensor data format

The sensor path is `kind: sensor_csv`. The original file is stored unchanged. `SensorRecord.t_raw` keeps the timestamp cell text. Converted values sit beside it and are not written back over the file.

## File

Delimited text with a header row. The delimiter is whichever of comma, semicolon, or tab appears most often on the first line. Encoding is UTF-8, with a leading BOM ignored. Duplicate header names fail validation.

## Mapping

`POST /evidence/{id}/sensor-preview` parses and returns a summary. Nothing is stored.

`POST /cases/{id}/sensors` stores the mapping. Body:

| Field | Required | Values |
|---|---|---|
| evidence_id | yes | A `sensor_csv` row in the case |
| mapping | yes | Canonical field name to header column |
| units | yes | Unit for each mapped field. Undeclared units are rejected, not guessed |
| clock | no | `relative` (default), `utc`, `local`, `simulation` |
| timezone | when `clock` is `local` | IANA name |
| sign | no | `1` or `-1` per accel or gyro field |
| thresholds | no | Overrides for the defaults below. Omitted keys keep the default |
| actor_id | no | Vehicle the investigator says carried the sensor. That link is confirmed because the investigator said so |

Canonical fields: `t`, `speed`, `accel_long`, `accel_lat`, `accel_vert`, `gyro_z`, `heading`, `lat`, `lon`, `collision`. `t` is required. Any other name is `MAPPING_INVALID`.

| Field | Allowed units | Stored as |
|---|---|---|
| t | `s`, `ms`, `iso`, `epoch_s`, `epoch_ms` | Milliseconds from the first valid sample (`time_ms`). ISO and epoch values are shifted so the first valid sample is 0 |
| speed | `m/s`, `km/h`, `mph`, `kn` | m/s |
| accel_long, accel_lat, accel_vert | `m/s2`, `g` | m/s². `g` uses 9.80665 |
| gyro_z | `rad/s`, `deg/s` | rad/s |
| heading | `deg` (default if the key is omitted), `rad` | degrees |
| lat, lon | none | Decimal degrees. Latitude −90..90, longitude −180..180 |
| collision | none | A flag column. The cell is not converted to a speed |

A row that fails a range or a parse is stored with `valid: false` and an `issues` list. It is not dropped.

## GPS

Map `lat` and `lon` together. If `speed` is also mapped, `gps_consistency` compares the haversine speed between consecutive valid fixes with the mapped speed. The result is `{median_gps_to_speed_ratio, consistent, method}`. `consistent` is true when the median ratio is within `gps_speed_tolerance` of 1 (default 0.3). A disagreement does not delete rows and does not by itself create a collision event. There is no map match and no camera lookup.

## Events the rules can emit

Only from valid rows, in the sensor's own time: `hard_braking`, `acceleration_spike`, `stop`, `heading_change`, `collision_flag`, `sensor_gap`. Defaults: hard brake −3.0 m/s² for at least 0.2 s, spike 12.0 m/s², stop below 0.3 m/s for at least 1.0 s after moving at 1.0 m/s, heading change 30° inside 2.0 s, gap when a step is more than 2.5 times the median step. A missing interval becomes `sensor_gap`. It is not a contradiction.

Sensor time is not on a camera clock until a clock record, a sync edge, or a source-annotation offset is recorded and a scenario is built.

## What is not accepted

No unit guessing. No second evidence row for the same bytes in one case. A sensor file on a case designated `real` must be declared `synthetic: false`.
