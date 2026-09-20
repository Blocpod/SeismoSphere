# Earth video recording

Open **Tools → Record Earth**. Choose landscape (1280×720) or portrait (720×1280), a title, a 30/60/120-second maximum and optional synthesized catalog sound. Start recording, then orbit or zoom. To record an existing model-path flight, start the flight before recording. Pause/resume and Finish clip remain available in the Earth inspection stack.

Download the video and matching evidence JSON. Files remain in the browser until replaced or the page closes; download them to retain them. The recorder warns before leaving an active recording. It uses only the application's canvas and optional synthesized sound, without microphone, desktop-screen or system-audio access. Application sound keeps its ordinary volume, spatialization and mute controls.

Each clip preserves one observation cutoff and scene configuration. A catalog refresh, historical cutoff change, layer/selection change, viewport resize, hidden page or lost graphics context ends the clip and finalizes its captured portion. Pauses exclude wall time. This is a camera clip, not a timeline/replay movie spanning different scientific contexts. A 128 MB accumulated-chunk guard also ends recording; the final encoder chunk can take the total slightly above that threshold.

The recorder fits the current viewport crop inside its fixed canvas. It does not reframe the whole Earth or add terrain detail. Titles, observation cutoff, depth exaggeration, presentation mode, hypothesis disclosure and base source credits are drawn into the video. Selected-event focus rings and compact source captions are drawn separately, with per-frame projected coordinates in the evidence. HTML plate labels, workspace panels and dialogs are omitted. Complete enabled-source attribution and license information accompany the matching evidence.

## Implementation and evidence

Browser-native [canvas capture](https://www.w3.org/TR/mediacapture-fromelement/) and [MediaRecorder](https://www.w3.org/TR/mediastream-recording/) reuse the live rendered frame synchronously after WebGL drawing. A separate 2D canvas adds captions and preserves the viewport aspect ratio. No encoder dependency, server upload or renderer resizing is needed. H.264/AAC MP4 is preferred when supported, with native WebM/MP4 alternatives. The actual emitted MIME type is retained. Requested 30 frames/second and 5 Mbps are targets; the browser may drop frames or vary bitrate.

Video and static figure export share their scientific scene-evidence collector. Recording adds source scene context, original plotted observations, active model/source snapshots, cutoff, start/end times, stop reason and submitted-frame camera poses. It retains a SHA-256 of the complete video and a separate checksum over `JSON.stringify(evidence)` in the JSON wrapper. The submitted-frame count is not an independently decoded frame count or proof of constant frame rate. These hashes identify the files, not an external timestamp or forecast skill.

Generated previews use local blob media. The app content policy permits `media-src 'self' blob:` while preserving its existing script, connection, object and framing restrictions. Each new successful recording revokes the previous preview/download URLs; failed preparation preserves the prior available download. Encoder errors retain a partial clip when data is available and disclose the error.

## Verification and remaining limits

`node --test` passes 58 checks, including aspect-ratio fitting and invalid dimensions. `scripts/recording-check.mjs` verifies Chrome desktop, 320/390-wide portrait and landscape capture, native video decoding, nonblank Earth pixels, moving camera poses, matching video/evidence hashes, pause/resume, source-layer changes and viewport changes. The desktop audio clip decodes to nonzero 48 kHz stereo PCM. Its emitted format is H.264/AAC MP4. Actual sample clips have variable submitted frame rates, as disclosed.

`scripts/recording-lifecycle-check.mjs` exercises the real 30-second limit in revised-catalog 2011 replay, a controlled hidden-page event while paused, and a change to the next historical cutoff. Static PNG/SVG/JSON export continues to pass in Chrome and WebKit after sharing the evidence collector. The six main Earth layouts, 959-event replay, historical scrub and midpoint interaction also pass.

The installed Windows Playwright WebKit runtime provides neither MediaRecorder nor canvas capture. Its four fresh layouts verify only the explicit unsupported state and disabled recording form. No Safari or physical-device recording pass is claimed. The full brief's visual quality, XR, editable 3D export, broader rendering and physical-device acceptance remain open.
