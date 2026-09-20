# Modeled arrivals and manual phase picks

Open Stations & waveforms, select a saved recording, and use **Arrivals & manual phase picks**. A saved response-corrected recording also has **Compare arrivals & pick phases**. Raw and corrected sources keep separate comparison histories.

Choose a stored catalog earthquake, IASP91 or ak135, and up to ten supported phase names. The event selector lists up to 500 stored earthquakes from two hours before recording start through recording end. This is a source-hypothesis list, not automatic association; use catalog imports when the required event is absent.

The calculation uses the installed [ObsPy TauP implementation](https://docs.obspy.org/packages/obspy.taup.html), which computes theoretical travel times through a spherically symmetric one-dimensional Earth model. The source depth and spherical source-to-station angular distance enter [get_travel_times](https://docs.obspy.org/packages/autogen/obspy.taup.tau.TauPyModel.get_travel_times.html). Receiver depth is explicitly zero. No station elevation, sensor-depth, local-crust, topographic or ellipticity correction is applied. Both the source revision and station metadata remain available for inspection.

Supported names: P, p, Pn, Pg, Pdiff, PKP, PKIKP, S, s, Sn, Sg, Sdiff, SKS, SKIKS, pP, sP, PP, SS. Source depths must be 0–800 km. Multiple branches with the same name remain distinct and indexed. Missing model branches are not missing ground motion or a statement about detectability.

Dashed gold lines show arrivals inside the recording interval. The full branch list includes times outside that interval and flags modeled times outside actual sample continuity. Continuity uses the shared timestamp/rate checks, including short runs and contiguous source blocks; gaps, overlap and excess drift are not bridged.

## Manual interpretation

Tap the waveform to select the nearest retained sample, or enter its original source block and zero-based sample index using the keyboard. Choose a modeled branch as a phase hypothesis, or leave it unidentified. Enter positive timing uncertainty up to 120 seconds and an apparent up/down/unclear trace polarity. A maximum of 20 picks can be retained in one record.

Adding/removing picks changes a draft. **Save picks as new record** preserves a new immutable record with its parent ID; prior picks are never overwritten. Parent chains are included in exports and limited to 1,000 revisions per comparison. An unsaved draft must be saved before exporting its chart. Saved JSON and AI explanations always refer to the saved record, not draft edits. Editor values survive resizing, and controls are disabled during a save to protect pending edits.

Residual = picked time − modeled arrival time, in seconds. A negative residual is earlier and a positive residual later. Timing uncertainty is the operator's interpretation, not a calibrated travel-time-model error. Apparent trace polarity is not an established P-wave first motion or a focal-mechanism constraint. There is no automatic waveform detector, phase classifier, relocation or confirmed source association in this tool.

## Preservation and reproduction

The immutable record contains the exact catalog revision/hash, source ID, model, requested phases, every calculated branch, source/receiver geometry, package versions, model-file SHA-256, calculation-source SHA-256 and the operator's exact sample references. Corrected sources include the original raw recording and full StationXML chain in their evidence export. Parent records preserve earlier interpretations. SVG metadata matches the saved JSON record.

```powershell
node scripts/reproduce-phase.mjs path/to/export.json
```

The verifier checks record/source/model hashes, re-runs the reference-model calculation, verifies arrival timestamps and interval/continuity flags, reproduces every sample amplitude/residual, and verifies the complete parent chain. It requires the matching local ObsPy/model runtime. It does not establish that a real phase was detected.

Strict replay excludes waveforms, corrections and comparisons received or created after the cutoff. Revised-catalog inspection can view subsequently calculated results for an elapsed recording. Later catalog revisions never alter an earlier comparison. Delayed calculations, history loads and AI answers are discarded after source/context changes.

## Verified evidence

The retained ANMO recording spans 2010-02-27 07:00–07:02 UTC. For the stored Maule M8.8 source revision and IASP91, the requested P, S, pP, sP, PP and SS phases yield six branches. Only modeled SS is inside that interval, at 07:00:57.674894 UTC. This is a timing comparison, not a confirmed SS detection. Production comparisons contain no acceptance-test manual picks.

Isolated software tests place a sample marker at 07:00:57.019538 UTC, yielding a −0.655356-second residual to that modeled SS branch. This deliberately selected test sample is not a scientist-confirmed phase. Both raw and response-corrected exports reproduce exactly, including the parent record.

Ninety automated tests pass, including both models, multiple branches, short-run continuity, exact picks, invalid inputs, immutable revisions and historical isolation. Eight fresh Chrome/WebKit desktop/mobile/landscape workflows pass; native WebKit selector overflow was contained. Both engines pass delayed-response isolation, strict replay hiding and editor preservation on resize. Actual Qwen and subscription-authenticated Astra explain the saved counts, physical units, manual uncertainty and residual direction without treating the marker as a confirmed detection. These targeted AI checks do not validate all generated prose. Physical mobile-device and human phase-interpretation acceptance remain separate.
