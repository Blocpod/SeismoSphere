# Instrument-response correction

Open **Stations**, load a saved raw recording, and scroll to **Instrument-response correction**. **Load full instrument response** retrieves the exact channel's StationXML from EarthScope. Inspect its epoch, sampling rate, native units, sensitivity and response stages before selecting a continuous source run and choosing **Correct & save recording**.

The raw waveform, original StationXML and corrected result are separate immutable records. Original StationXML bytes, encoding declaration, source URL, local receipt time and SHA-256 are retained. The parser rejects document/entity declarations and uses a non-network XML parser. It requires an exact NSLC match, a single response epoch covering the full raw recording interval, matching saved channel epoch bounds, response stages, supported translational physical input units and count output units. Correction also requires the actual sample rate to match the response.

## Processing

The existing isolated Python runtime uses ObsPy 1.5.1, NumPy 2.4.2 and SciPy 1.18.1; no additional dependency beyond the station decoder is required. Run `scripts/setup-instruments.ps1` on a new installation. Full evalresp deconvolution is used; dividing by a single sensitivity is not substituted for the response.

- Select one continuous run with 64–250,000 samples. The joining control above the analysis panels is on by default: verified contiguous, same-rate blocks can be combined. Timing breaks, overlaps and excessive accumulated clock drift remain separate; no gaps are filled and samples are not resampled. Disable joining for the original separate-block behavior.
- Output is displacement in **m**, velocity in **m/s**, or acceleration in **m/s²**, along the channel's sensor orientation. No geographic-component rotation is performed.
- Remove the mean or a linear trend before correction.
- Four frequencies satisfy `0 < f1 < f2 < f3 < f4 < Nyquist`. The frequency taper is one from f2 to f3, zero outside f1–f4, and transitions with a cosine from f1 to f2 and f3 to f4. Defaults depend on the full selected run's length; changing the sample count does not silently change the entered frequencies.
- The time-domain SAC cosine taper fraction spans both ends: 0.05 means approximately 5% total, with sample rounding. Allowed range: 0.01–0.20.
- Water-level clipping is disabled by default. The UI offers 40, 60 or 80 dB; the API accepts 20–120 dB. It can suppress useful frequencies when changing the native measured quantity. This is distinct from the four-corner frequency taper.

ObsPy applies internal FFT padding and returns the original number of samples. Saved output retains each selected original microsecond timestamp. The numerical calculation assumes the run's nominal sampling interval; joining checks both adjacent steps and accumulated clock deviation against the greater of two microseconds or 0.01% of a sample period. Each result records its actual selected-window timing deviation, exact contributing source slices and joined-boundary count; see [waveform frequency analysis](SPECTRA.md). Raw counts, actual timestamps and response metadata remain available for review.

The output is a **band-limited motion estimate**, conditional on metadata and processing choices. Short windows, low-frequency support and finite-window/edge effects matter. A taper does not establish a universally artifact-free interior. No phase picking, earthquake association, magnitude calculation, stress inference or prediction is performed. These controls do not constitute complete signal-analysis or station-quality acceptance across every network.

## Evidence and exports

The saved result contains selected sample bounds, processing settings, corrected samples, descriptive statistics, warnings, and a 256-frequency instrument transfer function (amplitude and wrapped phase). The transfer curve is part of the JSON evidence; it is not a spectrum of the corrected signal. **Analyze corrected spectrum** opens the shared frequency tools on this saved correction; **Analyze original counts** returns to the raw recording. Physical-unit spectral exports retain the full correction/raw/StationXML chain. See [frequency analysis](SPECTRA.md#response-corrected-spectra).

**Corrected samples CSV** retains each timestamp and value in the displayed physical units. **Chart SVG** preserves extrema in display-pixel buckets and embeds the complete corrected record. **Result + both sources JSON** includes the raw waveform, original StationXML and independent body/source checksums. **Original StationXML** downloads the unmodified XML bytes.

Strict replay requires the raw recording, response metadata and saved correction to be available at the cutoff. A raw recording ending after the cutoff is rejected. Revised-catalog inspection can use metadata retrieved today for an older recording. This does not reconstruct historical metadata availability or establish a trusted external timestamp.

Both local Qwen and subscription-backed Astra receive computed summaries, processing settings and response metadata, not individual samples or transfer-function bins. A focused correction prompt distinguishes original counts from corrected physical units. During verification, Qwen initially mislabeled the taper's transition band; the context now supplies an explicit numeric passband/transition sentence and the check requires its accurate reproduction. Deterministic explanation remains available.

Processing is bounded to 30 seconds and 16 MB of output. Timeout and app shutdown stop the worker process tree. The first development invocation exceeded its time limit; a separate diagnostic run completed, and subsequent computations completed in seconds. The initial delay's cause was not established; worker cleanup and explicit error reporting do not rely on a successful numerical return.

## Verified examples

The retained 2010 **IU.ANMO.00.BHZ** archive has 2,400 samples at 20 Hz. Its first 2,020-sample block was corrected to velocity using linear detrending, `[0.019802, 0.039604, 7, 9]` Hz corners, a 0.05 time taper and disabled water level. Three response stages were supplied, with native velocity-to-counts sensitivity 3.27511×10⁹ at 0.02 Hz.

- Raw recording: `8b35f1209f600de2f19719c9f8af9eac2165a0d04870c1100f4152841b4c1a86`.
- Full response: `2f09ba4f9132e9b77b8c773ef972691af0cc7864c8d1bfd45f92e72e3740b2f7`.
- Corrected result: `4cde7f4ed169dfdabaed27bc1caf7f3973d7896dc72105c33f62fe2872958890`.
- Velocity range: −0.00008920595087402716 to 0.00005185228694349952 m/s; RMS about mean 0.00002380871515264003 m/s. No causal event assignment is asserted.

The actual 2026 SeedLink capture also works: its first 579 samples at 40 Hz were corrected with `[0.14, 0.28, 14, 18]` Hz corners, mean removal, 0.05 time taper and no water-level clipping. Result `586e5122c3d29fc1d9b273eb83176a9080a5af242958e6213dc78c134bd94260` links to response `91fe07cab17d2f0a865ba7368b84bd033190382f48d144fddfc2e7263b5e191e`. Its velocity range is −6.159598821794163×10⁻⁸ to 8.767153572073234×10⁻⁸ m/s. The short source packet and chosen frequency band constrain interpretation.

`node scripts/reproduce-response.mjs artifacts/chromium-response.json` and the same command with `artifacts/seedlink-corrected.json` re-decode the saved response and recompute every corrected value and transfer-curve bin exactly. Offline known-gain synthetic checks independently recover displacement, velocity and acceleration with less than 0.2% relative RMS error in the tested central interval. They also cover declared Latin-1 XML, invalid units/epochs/rates/bands, and document/entity rejection. Node checks cover source immutability, cache reuse, cutoff isolation and worker cancellation.

`scripts/response-check.mjs` verifies actual response retrieval/correction, saved selection, every CSV sample, original XML bytes, full JSON/SVG hashes and eight fresh Chrome/WebKit desktop/320/390/landscape layouts. `response-lifecycle-check.mjs` controls response timing to verify channel changes and replay cannot receive a stale result or answer. `response-ai-check.mjs` checks actual Qwen, actual Astra and the deterministic explanation, including cutoff rejection.

Sources: [ObsPy remove_response](https://docs.obspy.org/packages/autogen/obspy.core.trace.Trace.remove_response.html), [evalresp response output units](https://docs.obspy.org/packages/autogen/obspy.core.inventory.response.Response.get_evalresp_response.html), [EarthScope Station service](https://service.earthscope.org/fdsnws/station/1/). Calibration and output are only as reliable as the supplied response and the stated assumptions.

With contiguous-block joining enabled, the full 2,400-sample archive correction is `c8ddec1d08f627bc3dfc5826fc16a097fe01bbbc4b2d1756ccee19a501247767`; the full 1,745-sample SeedLink correction is `ef0e3d61662ba6fbaf53a5f4d46e5f4fadb2a22f5c2876199ba8cb0390c71849`. Each uses its selected run's default frequency corners and retains those exact settings. Every output sample and transfer-curve value reproduces from the exports using `scripts/reproduce-response.mjs`. Joining preserves 2 µs and 0 µs measured nominal-clock deviation respectively. Both real AI brains correctly describe the joined SeedLink provenance and physical units. The original separate-block examples above remain unchanged.
