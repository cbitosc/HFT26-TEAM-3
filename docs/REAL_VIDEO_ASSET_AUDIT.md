# Real video asset audit

Audited on this machine before the pipeline run. No MP4 was in the git checkout or in gitignored `data/`. Weights are not videos and are not listed as assets here.

Every file below was opened with `ffprobe`, `ffmpeg -i … -f null -` (exit 0, empty stderr), and OpenCV `VideoCapture`. OpenCV's grabbed-frame count matched `nb_frames`, and the first decoded frame's width and height matched the container. No file has a rotation tag or an embedded `creation_time`.

None of these files was linked to a TraceLine case at audit time. There were no stored detections, tracks, or events for them. A previous YOLOv8n measurement exists only in the project-store selection note. Those boxes are not in this database and are not reused.

After the audit, `selected_accident.mp4` was uploaded through the API into the development database as case `TL-C30DD7` (`case_d255f851d423`), evidence `ev_289b77d5484e`. The measured pipeline counts are in [REAL_VIDEO_PIPELINE_TEST.md](REAL_VIDEO_PIPELINE_TEST.md). The file itself stays gitignored.

`selected_accident.mp4` is a byte-for-byte copy of `candidate-04.mp4` (same SHA-256). That pair is the clip the pipeline ran. It is a real-world fixed-camera preview. The gallery title is not a finding.

## Unique files

| File | Bytes | SHA-256 | Duration | Resolution | Codec | Nominal fps | Average fps | Frames |
|---|---:|---|---:|---|---|---|---|---:|
| candidate-02.mp4 | 4,302,956 | `8d7354f8d20a8ad656c0ce6321f97de37db6a39c07282c077299bb05034a0908` | 30.000 s | 1280×720 | H.264 High, yuv420p | 30/1 | 146/5 | 876 |
| candidate-03.mp4 | 5,025,533 | `7ef9f8c680374b0098d1b2e0c7fd0d7d6f42d415932626bd54e2d70bf39215fa` | 30.075 s | 1920×910 | H.264 High, yuv420p | 27850/659 | 13952850/838907 | 501 |
| candidate-04.mp4 | 4,954,521 | `29567448e55c8810cc434349cf78c9202033622e038d8d9c03b426cd1d067b6b` | 15.133 s | 2392×1352 | H.264 High, yuv420p | 60/1 | 5130/227 (22.608) | 342 |
| candidate-05.mp4 | 4,561,795 | `37b8bf535cd3d337e8752d92caa525709e2e0221b0c246ed8b0400dae9ddeb96` | 30.033 s | 1620×1080 | H.264 High, yuv420p | 30/1 | 6750/451 | 450 |
| candidate-06.mp4 | 6,934,082 | `7ecf751db66958f2f3c707a991c9f9bc324364c0001980554bf49934c6fc2b50` | 24.200 s | 1920×1080 | H.264 High, yuv420p | 30/1 | 20880/727 | 696 |
| primary-demo.mp4 | 4,356,673 | `f98cae80ae53a51cbb9fc605e0f518cdd369e396f64aa1e9cea7bae2843406d0` | 30.000 s | 1280×720 | H.264 High, yuv420p | 30/1 | 332/15 | 664 |
| intersection_demo_share.mp4 | 1,918,866 | `93f2234a0d77c199e7593678b2563a866168fb847d09f2cc0ef0048f480a6564` | 15.100 s | 1280×720 | H.264 High, yuv420p | 60/1 | 60/1 | 906 |

Decode for every row: ffmpeg exit 0, OpenCV opened, OpenCV frame count equals the Frames column, decoded size equals Resolution. Case link: none. Existing TraceLine results: none.

## Every path

The `artifacts/` copies match the `media/` copies by SHA-256. `selected_accident.mp4` matches `candidate-04.mp4`.

| Path | Same bytes as |
|---|---|
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/media/accident-demos/candidate-02.mp4` | candidate-02 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/artifacts/cursor/stores/self/media/accident-demos/candidate-02.mp4` | candidate-02 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/media/accident-demos/candidate-03.mp4` | candidate-03 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/artifacts/cursor/stores/self/media/accident-demos/candidate-03.mp4` | candidate-03 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/media/accident-demos/candidate-04.mp4` | candidate-04 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/artifacts/cursor/stores/self/media/accident-demos/candidate-04.mp4` | candidate-04 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/media/accident-demos/selected_accident.mp4` | candidate-04 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/artifacts/cursor/stores/self/media/accident-demos/selected_accident.mp4` | candidate-04 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/media/accident-demos/candidate-05.mp4` | candidate-05 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/artifacts/cursor/stores/self/media/accident-demos/candidate-05.mp4` | candidate-05 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/media/accident-demos/candidate-06.mp4` | candidate-06 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/artifacts/cursor/stores/self/media/accident-demos/candidate-06.mp4` | candidate-06 |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/media/accident-demos/primary-demo.mp4` | primary-demo |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/artifacts/cursor/stores/self/media/accident-demos/primary-demo.mp4` | primary-demo |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/media/accident-demos/intersection_demo_share.mp4` | intersection_demo_share |
| `/cursor/stores/bc-3b54d890-8339-4d21-8738-df7081472a8b/artifacts/intersection_demo_share.mp4` | intersection_demo_share |

## Clip that was processed

`selected_accident.mp4` / `candidate-04.mp4`, SHA-256 `29567448e55c8810cc434349cf78c9202033622e038d8d9c03b426cd1d067b6b`.

Source URL recorded on the evidence row: `https://accidentbench.github.io/assets/videos/real-world/tbone%20(4).mp4`. Licence recorded as reported text: `CC BY-NC-SA 4.0`. `synthetic` is false. `designation` is `real`.

Container PTS of the first frame, measured later by preprocess, is `0.0` ms. Media-relative time and container PTS therefore start at the same number for this file only. Other files in this table must not assume that.
