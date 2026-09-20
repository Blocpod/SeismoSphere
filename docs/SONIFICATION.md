# Spatial catalog sonification

Enable **Tools → Sound** to hear selected catalog events. **Tools → Audio settings** provides volume, headphone HRTF or simple stereo, a selected-event preview, chronological sequence playback and mute. Audio starts from a user interaction and defaults to off on each page load.

These are synthesized sine tones, not station recordings, ground-motion amplitudes, pressure propagation or an alert service. The archived waveform inspector remains a separate feature.

| Catalog/view input | Audio mapping |
|---|---|
| Magnitude M | Peak gain `clamp(0.06 × 10^((M−6)/10), 0.0001, 0.12)` before age and master volume |
| Depth | 990 Hz at the surface, linearly decreasing to 110 Hz at 700 km; pitch saturates outside that depth range |
| Age at the displayed cutoff | Gain `max(0.08, exp(−ageDays/8))`; later-than-cutoff events are rejected |
| Hypocenter | Original spherical position using 6371.0088 km Earth radius, independently of visual exaggeration or section projection; extreme radii have a 0.04-unit floor |
| Camera | Listener position and orientation follow the Earth camera |
| Distance | Web Audio inverse attenuation, reference distance 1 Earth unit, rolloff 0.5; an illustrative listening scale |

Tones last 1.3 seconds with attack and release envelopes. Sequence playback uses the event records attached to the actual displayed point geometry, including its hidden hemisphere. This respects the renderer's magnitude cap and a cutaway's section subset, deduplicates IDs, and orders events chronologically. One event starts every 0.6 seconds; original inter-event timing is deliberately compressed. The progress card reports count, magnitude and original event timestamp.

Selecting an event interrupts a sequence. Changing cutoff, filters or section stops it and clears the previous tone readout. Stop ends the current sequence; mute disables all sound. A hidden page also mutes playback. Source nodes disconnect after completion. Audio generation stays in the browser and requests no microphone access.

## Verification

`node --test test/sonification.test.mjs` checks spherical positions, age/pitch/magnitude mappings, invalid/future input, plotted geometry selection and the legacy listener fallback.

`node scripts/sonification-check.mjs` renders actual Chrome offline audio and checks left/right energy, camera reversal, distance attenuation, pitch, age and magnitude effects, HRTF output, native legacy spatial APIs and silence after the tone. Real app interactions cover selected-event playback, volume zero, chronological sequences, section subsets, filter/replay cancellation, cleared historical readouts, mute and responsive dialogs. The visibility test deliberately controls the hidden-page property; it does not certify physical background-app behavior.

The installed Windows Playwright WebKit 26.5 exposes neither AudioContext nor OfflineAudioContext. Its explicit unavailable state and mobile dialogs are verified, **not audio output**. Real Safari, mobile speakers/headphones and XR listening remain device-acceptance work.

References: [Web Audio specification](https://webaudio.github.io/web-audio-api/), [AudioListener position compatibility](https://developer.mozilla.org/en-US/docs/Web/API/AudioListener/positionX).
