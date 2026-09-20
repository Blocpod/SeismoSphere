# Spatial Earth

Open **Tools → Spatial Earth**. The browser checks for `immersive-vr` and `immersive-ar` independently. Entry requires a user click and the browser's native consent. Unsupported modes remain disabled, with a device-check retry. Another device must use the existing paired HTTPS address and trust its certificate.

The implementation uses the installed Three.js 0.180 renderer and native WebXR. It adds no package, external rendering service or new server endpoint. Reference: [Three.js WebXRManager](https://threejs.org/docs/pages/WebXRManager.html), [WebXR session requirements](https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/requestSession).

## Current interaction

- VR initially places a one-metre Earth in front of the viewer, facing the same geocentric direction as the ordinary camera. Head movement is tracked directly. The globe can be resized from 0.3 to 6 metres and rotated in discrete steps.
- AR requires hit testing. An upward-facing surface reticle must exist before selection places Earth above that surface. Recenter returns to placement. Unsupported hit-test entry fails without claiming a successful placement.
- Controller, gaze/select and screen-ray events use the session's `targetRaySpace`; the application does not assume two physical controllers. The two visible controller rays supplement those input events.
- A spatial panel and ray-selectable controls remain available without DOM overlays. Browsers supporting DOM overlays also show touch controls with 44-pixel minimum targets. Ordinary page controls become inert during the session and restore their previous state afterward.
- Controls rotate, resize, switch X-ray, recenter, page through captured visible-layer notes and exit. Configure source layers, catalog filters, time and optional audio before entering. X-ray uses the existing application behavior, including leaving a cutaway or statistical overlay where applicable.
- Selecting a plotted earthquake shows its provider, identifier, native magnitude type, catalog depth and origin time. The selected record updates or clears when the plotted catalog changes. Selecting alone does not issue a forecast or invoke a language model. Explicit copilot controls are described below.
- Live, strict replay, revised-catalog replay and future-only contexts are identified. Current observation cutoff, plotted-point count, physical globe size and depth scale remain visible. Experimental paths, fields and watches remain labeled hypotheses.

The spatial view uses the same live scene and filtered data, not a screenshot or a separately maintained catalog. Its render pass temporarily maps the geocentric scene into metres. Shared clipping planes, directional-light targets, sun shader directions and point-size uniforms follow that transform. A `finally` block restores the scene and scientific coordinates immediately after rendering. Controller picking applies the inverse transform. In-session X-ray choices persist on returning, while the ordinary camera and control state are restored.

Enabled catalog sonification uses the inverse-transformed headset pose as its listener. Source tones continue to use original hypocenters at true depth. Entering spatial view finishes an existing ordinary-camera recording; it does not silently record headset imagery into that clip.

## Verification and limits

`test/spatial-view.test.mjs` checks metre transforms, shared clipping, point size, shader direction and exact restoration, including a controlled renderer exception. The complete Node suite passes 75 tests.

`scripts/spatial-view-check.mjs` exercises the actual application and GPU renderer in eight fresh Chrome/WebKit desktop, portrait and landscape layouts. It substitutes controlled WebXR sessions and poses to check denial/retry, VR/AR lifecycle, ray selection, live record refresh, placement, source notes and restoration. Additional desktop checks reject hidden/clipped observations and verify that delayed AR setup cannot overwrite a newer VR session. These controlled sessions **do not test native headset presentation, stereo optics, hardware tracking, physical touch/gaze ergonomics, AR alignment, device permissions or headset audio**. The browser report records `hardwareVerified: false`.

The ordinary six-viewport check, historical replay/scrub/midpoint flow and native Chrome video recording/decoding also pass after the shared animation loop changed to `renderer.setAnimationLoop`. Windows WebKit still reports its unavailable recording APIs accurately.

The current implementation is not final XR acceptance. Physical Quest/Vision Pro or other supported headset testing, real AR phone placement and performance budgets remain open. Layer selection, timeline editing, the full source inspectors and evidence exports currently remain in the ordinary workspace. Preset and custom selected-evidence questions are available in the spatial view. Persistent AR anchors, real-world occlusion and full in-headset research workflows remain additional work. The full project goal remains active.


## Spatial copilot

The second control row offers **Explain**, **Watch**, **Against**, **Brain**, **Read**, **Previous**, **Next** and **Ask**. Explain uses the ray-selected earthquake. Watch and Against use the leading visible draft belonging to the current analysis. Brain switches between the configured local model and ChatGPT-authenticated Astra for that request; it does not change the saved default provider. Read opens/closes the answer, and Previous/Next page through it. Busy request controls are disabled while the spatial view remains interactive.

The server resolves IDs against the retained analysis snapshot. It rejects expired analyses, changed times or modes, missing selections, unsupported brain names, and mixed source/model evidence. Observation evidence retains native magnitude type, catalog depth and an ISO origin time. Watch evidence is explicitly an **unissued draft**. User-supplied event details do not replace server evidence. Preset requests use a fixed explanation/counterargument prompt; custom questions retain the same evidence limits and permit no UI actions. Existing owner/controller/viewer permissions remain in force.

Answers retain the model name and evidence cutoff. Selecting a revised/different event, changing replay time, hiding/replacing the relevant watch, or ending the session invalidates the answer. An unchanged event may retain a dated explanation during live refresh; it is not relabeled with a newer cutoff. Future views can explain a displayed watch from its past analysis snapshot, but do not manufacture future earthquake observations. Invalidating a response does not claim to terminate already-running model computation on the server.

Actual verification in `scripts/spatial-copilot-check.mjs` used Qwen 3.6 35B and `gpt-6-astra`: both retained USGS:usp000huc2, M6.9 mww, 26 km depth and origin 2011-02-11T20:05:30.910Z in the March 1 revised-catalog replay. Astra supplied counterarguments for the selected draft and Qwen explained its configured factors, keeping model match separate from probability. The API's proposed actions were filtered to an empty applied-action list. The saved default stayed Ollama; the original 282-forecast chain and 417 review chains remained valid and unchanged.

`test/api.test.mjs` checks the spatial evidence boundaries and absence of forecast issuance in an isolated database. `scripts/spatial-ai-isolation-check.mjs` checks event/time changes, future-watch cutoffs, paging and unapplied response actions in four fresh Chrome/WebKit desktop/touch contexts. The real-brain check also verifies late-session isolation. Those browser XR sessions use controlled poses: native headset permissions, tracking, stereo display, ergonomics and audio remain unverified. General immersive research operations and physical-device acceptance remain open requirements.

## Custom questions

Choose **Ask** to write a question about the selected observation. If no observed event is selected, it uses the leading visible draft, naming that target above the question. Switch Brain before opening Ask to choose local Qwen or subscription-backed Astra.

The composer supports up to 2,000 characters. Its 3D keyboard works through the same controller, gaze/select or screen-ray input as the other spatial controls. Shift, a number/punctuation layout, cursor arrows, Back, Space and Clear allow editing. Browsers with DOM overlays also offer a normal textarea for touch, physical keyboards and native text entry. The 3D panel displays the text around the caret. Return keeps the draft; ending the spatial session clears it. If the target evidence changes, Send is disabled until Return → Ask attaches the retained draft to the newly displayed target. Sending never issues a forecast or applies model-proposed UI actions.

Controller keys use Three.js rectangle hit boxes, avoiding numerical misses on a key mesh's triangle seam. Hidden controls cannot receive rays; disabled controls block click-through. The answer uses the selected retained analysis and its stated cutoff. Custom questions are scoped requests, not access to unprovided mechanisms, waveforms or future events.

`scripts/spatial-question-check.mjs` checks controller typing, Shift, numbers, Unicode-aware backspace/caret movement, draft preservation, changed-evidence blocking, request scope and late-session response isolation. Eight fresh Chrome/WebKit viewport flows and controller-only screenshots exercise the actual scene renderer with controlled XR poses. `scripts/spatial-question-ai-check.mjs` sends custom questions to both real backends; both preserved the historical Chile event's 6.9 mww magnitude and 26 km depth and explicitly identified missing rupture-plane/pressure-transfer evidence. The complete suite passes 75 tests. These checks do not establish physical headset usability or native microphone support.

The shared HTTP request decoder preserves UTF-8 characters across network chunk boundaries. The isolated API test deliberately splits an emoji's bytes between writes and checks the stored question alongside accented and Japanese text. This protects both spatial questions and ordinary JSON submissions without changing their existing request-size limits.

## Immersive dictation

Inside Ask, choose **Dictate**, speak for up to 30 seconds, then choose **Transcribe**. The host uses the same offline speech pipeline as the ordinary copilot. **Language** cycles installed recognizers; the current language appears on the evidence card. Review the inserted text and correct names or numbers with the controller keyboard or textarea before Send. Voice never sends a question automatically.

**Cancel mic**, Return, session end and a hidden spatial session stop capture and withhold pending transcripts. Changed evidence also cancels dictation and preserves the original question. Late microphone permission is released. A shared recorder permits only one active capture across composers; entering spatial Earth stops ordinary capture. Preparing and transcribing disable editing and Send while Exit remains available. Unsupported browsers and viewer devices have explicit unavailable states. Browser permission is still required; native headset permission and microphone behavior have not been verified on physical hardware.

`scripts/spatial-voice-check.mjs` exercises synthetic Chrome microphone audio through real local Whisper, editable spatial text and both Qwen/Astra backends. It also checks 3D controller rays for Dictate/Transcribe, microphone handoff, cancelled recording, delayed permission, hidden sessions and late transcripts after evidence/session changes. No user microphone is opened. Eight fresh Chrome/WebKit layouts retain 44-pixel DOM controls without horizontal overflow. The ordinary recorder lifecycle checks and complete 75-test suite pass with the shared capture module. Recordings remain in memory; reviewed questions use existing copilot conversation storage.
