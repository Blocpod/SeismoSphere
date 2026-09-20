# Local voice input

Use the microphone beside the copilot question field, choose an installed language, and select **Start microphone**. Select **Stop and transcribe**, review or edit the words, then **Insert into question**. The existing Send button submits the question to the selected brain. Insertion preserves the existing draft and replaces only its selected text.

English uses a local Whisper small.en model through faster-whisper, running CPU int8. The Windows offline recognizers provide the other languages installed on this PC: German, French, Japanese, Spanish, and Simplified/Traditional Chinese. The language list reflects the host, not a promised universal language inventory. Without the Whisper installation, the installed Windows English engine is also available.

The native English engine was evaluated first. It preserved numeric values but garbled opening words in browser-captured synthetic speech; Whisper recognized the complete command in that same workflow. Transcripts remain editable because names, numbers and other words can still be wrong. This is dictation, not continuous listening or a guarantee of scientific interpretation.

## Installation and operation

The current machine is ready. For another installation, run `scripts/setup-speech.ps1 -Python <Python executable>` and restart SeismoSphere. This reuses the project Python environment and downloads the pinned `Systran/faster-whisper-small.en` revision `d1d751a5f8271d482d14ca55d9e2deeebbae577f`. Source hashes are retained in `data/speech-small.en/source.json`; model.bin SHA-256 is `62b2a45b05ee59acb4a5341b33ee35e041395d378d418a18acfe4c9e768ee37a`.

Recognition opens the installed model with network access disabled in the model loader. Audio is processed in memory and is not written to app storage, conversations, logs, or a speech service. Sending a reviewed question uses the ordinary conversation storage and selected local/Astra brain. Astra receives the text and its research context, not the recording. The app never issues forecasts from a voice recording.

Browser capture uses native microphone permission and AudioWorklet, with native offline resampling to mono 16 kHz PCM. It stops at 30 seconds. Cancel, page hiding, microphone disconnection and closing the dialog release tracks and the audio context; late permission results are released and late transcripts are withheld. A cancelled request already received by the host can finish locally, but its text is discarded by that dialog. Transcription requests have a 45-second worker deadline and run one at a time.

The host exposes `GET /api/speech` and `POST /api/transcribe` under the existing origin/pairing controls. The latter admits only canonical 0.2–30-second mono 16 kHz 16-bit PCM WAV data. Viewer devices cannot transcribe or ask the copilot. Microphone capture requires localhost or a trusted HTTPS workspace with browser support. The Windows WebKit test runtime reports its missing Web Audio support clearly; this is not a physical Safari acceptance result.

## Verification and limits

- `node --test test/speech.test.mjs` checks malformed/oversized audio, numerical PCM bounds, installed native recognition, local HTTP transcription, silence, origin rejection and no forecast issuance.
- `node scripts/voice-input-check.mjs` generates a speech fixture and uses Chrome's synthetic microphone, the real local transcription endpoint and actual local/Astra copilot calls. Four fresh Chrome and four fresh WebKit layouts check controls and draft insertion or the unsupported state.
- `node scripts/voice-lifecycle-check.mjs` verifies track/context cleanup, controlled denied/delayed permission, cancelled transcription, disconnection, hidden pages and the real 30-second stop. Its transcript responses are controlled fixtures, not model quality measurements.

The associated reports and screenshots are under `artifacts/voice-*` and `artifacts/*-voice-*`. The browser audio fixture is synthetic; no user microphone was opened during these tests. Real human speech, accents, noisy rooms, physical phones and headsets still require acceptance. Spatial Earth also offers Dictate / Transcribe inside Ask, using this same recorder and local engines. See docs/SPATIAL-EARTH.md for evidence/session cancellation and the immersive verification limits.

The complete 75-test suite and six main viewport/replay/scrub/midpoint workflows also pass after integration. The actual speech → local copilot and transcript → Astra checks agree on the exact two-event view at their saved cutoff. The Deep command clears a previous region search and applies depth >300 km over 72 hours; its evidence is separate from the longer model-watch lookback. A former Deep/All conflict was corrected so “show all earthquakes deeper than 300 km” retains the Deep filter.

Implementation references: [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [pinned model repository](https://huggingface.co/Systran/faster-whisper-small.en), [Microsoft asynchronous recognition](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.recognizeasync?view=netframework-4.8.1), [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode), and [native offline audio rendering](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext).
