# Waveform frequency analysis

Open **Stations → retrieve a waveform → Frequency analysis**. Select a continuous source run, its first sample index and number of samples. Choose mean or linear detrending, and a periodic Hann or rectangular taper. **Calculate & save spectrum** computes a one-sided modified periodogram locally with the existing NumPy runtime. Saved results are independently selectable; changing the form does not relabel a saved result.

**Combine contiguous source blocks for analysis** is on by default. Same-rate blocks can form one chronological run only when timestamps strictly increase, the adjacent step matches the nominal sample period, and accumulated timing deviation stays within the greater of two microseconds and 0.01% of that period. Gaps, overlaps, rate changes and excessive drift split runs. No missing samples are inserted, clocks repaired, overlaps resolved or values resampled. Original blocks are unchanged. Disable the option to analyze each block separately; existing saved analyses retain their original behavior and identity.

The selected window retains every contributing source slice (original segment index, first index and count), joined-boundary count, exact endpoint timestamps, and measured maximum deviation from the selected first sample's nominal clock. This last measurement can differ from the run's clock tolerance when selecting an interior window. At least 16 selected samples are required. The archive inspector's coarser gap-summary threshold does not authorize joining. New joined calculations use algorithm version 0.2.0; legacy separate-block calculations retain version 0.1.0.

For N samples and rate fs, mean subtraction is followed optionally by least-squares removal of the centered linear trend. The periodic Hann taper is `0.5 − 0.5 cos(2πi/N)`; the rectangular taper is one. The implementation uses [NumPy rfft](https://numpy.org/doc/stable/reference/generated/numpy.fft.rfft.html) without zero padding. PSD is `|FFT(detrended counts × taper)|² / (fs × sum(taper²))`; interior positive-frequency bins are doubled, while DC and an even-length Nyquist bin are not. This matches the one-sided density convention documented for [SciPy periodogram](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.periodogram.html).

The displayed bin spacing is fs/N, and the FFT interval is N/fs. The first-to-last sample span is (N−1)/fs; both are retained separately. A bin spacing is not a peak confidence interval. Integrated PSD is the taper-weighted mean square; it need not equal the unweighted residual variance for a Hann taper. Equivalent noise bandwidth, removed mean/slope, residual RMS and the largest positive-frequency bin are saved. A flat detrended signal has no selected peak.

For original raw recordings, units remain **digital counts squared per Hz**, not calibrated ground motion or earthquake magnitude. No full instrument response, bandpass filter, phase picking, arrival prediction or causal earthquake association is performed. A peak does not identify a source or a pressure-transfer mechanism. Single-window periodograms can be noisy and sensitive to window/trend choice; they do not provide statistical confidence by themselves.

The chart uses linear frequency and logarithmic power, with its display floor explicitly stated. Original zeros and lower powers remain in the stored bins. Pixel buckets retain endpoints and extrema; CSV and JSON contain every frequency/power pair. SVG contains editable chart geometry and the full saved spectrum metadata. JSON also includes the complete immutable source recording and verifies its original GeoCSV or binary SeedLink checksum. Source and result IDs identify exact snapshots; they are not external timestamps.

The host admits one instrument operation at a time. Spectral computation is bounded to 250,000 samples, a 15-second child-process timeout and a 16 MB output limit. No dependency was added: `model/requirements.txt` already pins NumPy 2.4.2. Results reuse the append-only instrument table and are cached by source, processing parameters and algorithm version. Spectra are not forecast records. The saved menu lists spectra among the latest 40 spectral records, filtered to the current recording; older exports remain accessible by ID.

Both the compute and explanation APIs reject source recordings ending after the cutoff and later-received sources in strict mode. A saved spectrum created after a strict cutoff is withheld. The UI also clears ineligible results and rejects late responses after channel, saved-selection or replay changes. Source recording creation/reception remains distinct from the historical sample times.

**Explain spectrum with my AI** sends retained numerical summaries, processing choices and source metadata to local Qwen or subscription-backed Astra. It does not send individual samples or spectral bins. The explanation has no UI actions and cannot issue forecasts. Raw-waveform explanations remain a separate operation.

## Verified retained example

Source `8b35f1209f600de2f19719c9f8af9eac2165a0d04870c1100f4152841b4c1a86` is the retained EarthScope IU.ANMO.00.BHZ recording from February 27, 2010, 07:00–07:02 UTC. Its first source run contains 2,020 samples at 20 Hz. Mean removal and periodic Hann taper produce saved spectrum:

`3aa00046201e10f21bb51954b63eb7a7c08d3695d410621e2197a60dba5a70fe`

The selected interval is 07:00:00.019538 through 07:01:40.969538 UTC. Bin spacing and largest nonzero-frequency bin are both 0.009900990099009901 Hz; Nyquist is 10 Hz. There are 1,011 one-sided bins. Integrated PSD is approximately 9.837038014×10⁹ counts². This describes the selected instrument recording, without causal assignment.

- `node --test test/spectrum.test.mjs`: independent direct-DFT agreement, sinusoid power, odd/even scaling, DC/Nyquist, flat signals, linear detrending, timing discontinuities, immutable reuse and cutoff rejection.
- `node scripts/reproduce-spectrum.mjs <export.json>`: validates source/result hashes and recomputes bins and summaries from exported samples. The retained example reproduced with zero relative error on this runtime.
- `node scripts/spectrum-check.mjs`: eight fresh Chrome/WebKit desktop, portrait and landscape flows, all-bin CSV/JSON equality, SVG metadata, saved selection, invalid windows and delayed channel-response isolation.
- `node scripts/spectrum-ai-check.mjs`: actual local/Astra source-limited explanations and cutoff rejection.
- `node scripts/spectrum-lifecycle-check.mjs`: out-of-order saved selection, strict replay and late AI isolation.

Continuous acquisition and response correction are now implemented in the station tools. Phase analysis and broader network/device acceptance remain unfinished parts of the platform.

## Frequency through time

Enable **Include time-frequency map** before calculating. Set a frame size and hop in samples. Each complete frame uses the same verified periodogram formula, with mean/linear detrending performed independently within that frame. Frame overlap can range from zero to 75%. Limits are 16–8,192 samples per frame, at most 1,024 frames and 200,000 time/frequency cells. The complete selected-window spectrum remains a separate plot with its own frequency resolution.

This follows the consecutive-Fourier-transform approach described in [SciPy's spectrogram documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.spectrogram.html), implemented using the existing NumPy kernel. No samples are padded or joined across timing breaks. Frames can span verified contiguous source blocks when joining is enabled. Only complete frames are computed. The count of unused trailing samples is explicit. Frame centers are the midpoint of their first and last nominal sample times, measured from the selected first sample. They are not arrival picks. Each display column represents a complete, potentially overlapping window rather than an instantaneous observation; overlapping columns are not independent trials.

The heatmap uses linear frequency and logarithmic power color, with a labeled color scale in counts²/Hz. Reduced display cells retain the maximum original power rather than interpolating across bins. Tap/click a map cell, or use the frame and frequency-bin number controls, to inspect an original matrix value. CSV exports every frame/index/time/frequency/power cell. The separate time-frequency SVG embeds its raster heatmap and the full numerical record; axes and labels remain editable. JSON retains both spectra and the complete original source recording.

The retained ANMO example with 256-sample frames and a 128-sample hop has 14 frames, 129 frequency bins, 50% overlap, 12.8-second windows, 6.4-second hops and 0.078125 Hz frame bin spacing. Its frame centers range from 6.375 to 89.575 seconds, leaving 100 trailing samples. The whole-window spectrum still has 0.009900990099009901 Hz bin spacing: the two resolutions must not be confused. Saved record:

`f0ad2993d2cd99d00ea60038d5dff75aaad4db649bca05b4e6b09ae044d22f28`

`scripts/spectrogram-check.mjs` verifies eight fresh Chrome/WebKit layouts, pointer and number-field inspection, all 1,806 exported cells, SVG metadata and source hashes. `scripts/reproduce-spectrum.mjs artifacts/chromium-spectrogram.json` reproduces the matrix exactly. The numerical test changes a synthetic tone from 4 Hz to 12 Hz and compares selected frames against independent standalone calculations; it also checks flat frames and invalid parameters. `scripts/spectrum-ai-check.mjs artifacts/chromium-spectrogram.json` exercises actual local/Astra explanations with separate whole-window and frame summaries. Individual power cells and samples are not sent to the language models; only saved summaries, per-frame peak bins and provenance are supplied.

## Joined archive and stream examples

The same retained archive now yields a 2,400-sample joined spectrum with 1,201 bins and 17 complete 256-sample/128-hop frames. Saved result: `c3f8ed49f1edfe8fe0c1065d5ad89c96a1d62f6fa2e0b9b7489be2bbce32ab12`. The three-packet SeedLink capture yields 1,745 samples, 873 bins and 12 complete frames: `3a138b162c3695b6e7e4decff728d256aa4957992af628b7edfffa985c6e9803`. Both reproduce exactly from their original source exports. The different lengths legitimately change frequency resolution and estimated power; neither replaces an earlier immutable result.

`node --test test/joined-waveforms.test.mjs` covers source chronology/provenance, partial-window slices, gaps, overlaps, rate changes, small jitter, cumulative drift, non-increasing timestamps and 250,000-sample selections. `scripts/joined-waveforms-check.mjs` verifies the full spectrum and correction flows in eight Chrome/WebKit layouts. `scripts/joined-waveforms-lifecycle-check.mjs` controls late computation, history and AI responses during joining changes and tests replay isolation. `scripts/joined-waveforms-ai-check.mjs` exercises actual local Qwen and subscription-backed Astra with the saved source counts/timing. Full JSON exports preserve all slices; AI context retains the total count and at most 20 slice details.

## Response-corrected spectra

Load a saved correction under **Instrument-response correction**, then choose **Analyze corrected spectrum**. The same frequency tools now operate on that exact corrected recording. The source heading shows its output quantity, units and identity. **Analyze original counts** returns to the raw source. Each source has its own saved-spectrum menu; changing source clears prior results and withholds late computation, history and AI responses.

Select a continuous corrected interval, optional time-frequency frames, mean/linear detrending and Hann/rectangular window. The correction's full response, frequency taper, time taper and water level have already affected this signal. The spectrum applies its own detrend and window; it does not perform another response correction. Correction settings are displayed with the result. Power outside its usable correction band and near window edges is processing-dependent, and cannot establish reliable broadband motion, an event cause or a forecast.

| Corrected signal | Signal unit | Power-density unit |
|---|---|---|
| Displacement | m | (m)²/Hz |
| Velocity | m/s | (m/s)²/Hz |
| Acceleration | m/s² | (m/s²)²/Hz |

Power density follows the squared-input-unit per hertz convention in [SciPy's periodogram documentation](https://scipy.github.io/devdocs/reference/generated/scipy.signal.periodogram.html). Integrated PSD has squared signal units and describes taper-weighted mean square, not energy. It need not equal unweighted residual RMS squared. The physical result uses `psd`, `sampleUnits`, `integratedPsd` and corresponding generic statistics; the immutable raw-count result format is unchanged. Physical spectra use algorithm version 0.3.0. The Python worker explicitly uses UTF-8 so Windows does not corrupt acceleration's squared symbol.

JSON exports contain the spectrum, corrected source, original raw source, original StationXML and seven integrity checks. A derived raw-sample mapping identifies which original raw block indices correspond to selected corrected timestamps. This mapping does **not** isolate all influencing samples: full-window response deconvolution can mix information from elsewhere in the correction input. The derived mapping is recomputable from the immutable records. AI context includes its explicit count/text and at most 20 slice details. Strict replay checks the entire source chain plus the spectrum's creation time.

The retained ANMO examples analyze corrected indices 64–2111: 2,048 samples at 20 Hz, 1,025 whole-window bins, and 15 complete 256-sample/128-hop frames. Bin spacing is 0.009765625 Hz; frame spacing is 0.078125 Hz. All three quantities reproduce every bin and frame exactly from exported source samples. Their raw timestamp/index mapping spans 1,956 samples from the first original block and 92 from the second, crossing one original raw-block boundary.

- Velocity: `e5c9a80da8f53755270521e53324b40e31fc94464a19b316696ac964024b52e9`.
- Displacement: `336d8f99ba66d0e1610209e347b333cb6a70c4685dc230a74439767c0a56731d`.
- Acceleration: `9eee3304393c299f20fa861dfa31978d67cef9248a608cea0a3614f1e6feef3c`.

`node --test` passes 82 tests, including known-tone SI power and immutable source-chain cutoff checks. `scripts/physical-spectrum-check.mjs` covers all three quantities in eight Chrome/WebKit desktop/portrait/landscape layouts, every CSV value, full exports, and source switching. SVG metadata matches JSON for all three quantities in both engines. `scripts/reproduce-spectrum.mjs <export.json>` checks exact bins, frame matrices and source hashes. `scripts/physical-spectrum-lifecycle-check.mjs` controls delayed computation, history, AI and strict replay. `scripts/physical-spectrum-ai-check.mjs` exercises actual local Qwen and subscription-backed Astra. An initial local answer incorrectly inferred that one corrected output block avoided a raw join; explicit timestamp/index mapping corrected that interpretation in the verified answers.
