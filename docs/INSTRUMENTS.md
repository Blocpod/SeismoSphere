# Seismic stations, continuous feeds and saved waveforms

Open **Stations** in the Earth toolbar. Query up to five exact FDSN network codes and a three-character channel pattern at an elapsed UTC date. The default IU/II networks and BHZ channel select global broadband vertical-channel metadata. Search the returned channel epochs, inspect sensor/orientation/sensitivity, and locate a channel on its historical Earth. Amber surface markers represent channel metadata, not confirmed recording availability or earthquake detections. Multiple channel locations can share a station coordinate.

Select a channel and retrieve an elapsed interval of up to 15 minutes. The application saves the original EarthScope GeoCSV, source receipt, microsecond timestamps, individual samples and separate source blocks in immutable SQLite records. Identical queries reuse their saved result. JSON and original GeoCSV downloads retain every sample; SVG charts preserve the first, last, minimum and maximum values in each display-pixel bucket. Source blocks and detected sample gaps are drawn separately. Empty HTTP 204 results retain a receipt and are never filled with zero amplitudes.

The saved-query menu displays the latest 40 station queries independently of the latest 40 recordings. Earlier records remain in SQLite and remain accessible through their exported IDs; older-query pagination is not implemented. Requests are on demand, with one EarthScope retrieval at a time, a 45-second timeout, a 16 MB response limit, at most 4,000 channel epochs and at most 250,000 waveform samples. Archive retrieval uses the existing Node runtime. Continuous acquisition additionally uses the local ObsPy decoder described below.

## Sources and interpretation

- [EarthScope FDSN station service](https://service.earthscope.org/fdsnws/station/1/) supplies original channel-level text metadata and validity epochs. Missing optional numeric values remain unknown.
- [EarthScope FDSN dataselect service](https://service.earthscope.org/fdsnws/dataselect/1/) supplies two-column GeoCSV with repeated metadata headers. The application requests raw counts without sensitivity scaling.
- Network attribution: [IU Global Seismograph Network](https://doi.org/10.7914/SN/IU) and [II Global Seismograph Network](https://doi.org/10.7914/SN/II). Other requested networks retain their exact network codes and source receipt; cite their providers when publishing.

Digital counts depend on the instrument. They are not displacement, velocity, acceleration or earthquake magnitude. A metadata sensitivity in counts per m/s at one frequency does not perform full instrument-response removal. The raw inspector performs no response correction, filtering, phase picking, arrival-time prediction or causal event assignment. Optional saved full-response correction is described in [Response correction](RESPONSE-CORRECTION.md). A large signal alone does not identify a particular earthquake.

Gap transitions are adjacent retained timestamps separated by more than 1.5 times the larger adjacent nominal sample period; non-increasing transitions between blocks are counted separately as overlaps. These diagnostics describe the retrieved data, not a complete station availability assessment. A source-block boundary alone does not imply missing data. Sub-millisecond timestamps are retained as safe integer microseconds, including clocks that differ slightly between otherwise continuous source blocks.

Revised-catalog inspection permits archived metadata and samples received today. Strict observation replay requires both metadata and recording to have already been received by this installation at the cutoff. A recording ending after the cutoff is rejected in either mode. Switching the Earth to an ineligible cutoff hides an already-loaded waveform and station overlay. Archive queries remain on demand. The separate continuous acquisition controls below use the provider's SeedLink service.

## AI and exports

**Explain with my AI** uses the selected brain: local Qwen by default, or authenticated Codex/Astra through the existing subscription integration. The server retrieves the immutable recording by ID and supplies channel metadata, sample summaries, source-block time ranges, continuity counts and provenance. Individual waveform samples are not sent to the language model. The prompt and displayed answer identify that limitation; AI interpretation is not automatic phase analysis. Both AI backends use the same cutoff checks.

Earth publication figures include the visible station epochs, selected channel, metadata query, receipt and attribution in their matching evidence. Waveform SVGs include their record ID, query, receipt, computed statistics and rendering policy; their matching JSON holds the full raw data. SHA-256 verifies retained body and source text consistency, not an independent trusted timestamp.

## Verified archive example

Actual EarthScope retrieval: IU/II BHZ metadata at **2010-02-27 07:02 UTC**, 206 channel epochs at 119 distinct stations. Saved metadata record:

`5fee039ce50075686a1aa20130735b710f91e0587bd768a9d9866f33734a9a43`

Actual **IU.ANMO.00.BHZ**, 07:00–07:02 UTC, recording:

`8b35f1209f600de2f19719c9f8af9eac2165a0d04870c1100f4152841b4c1a86`

The recording has 2,400 samples at 20 Hz in two blocks of 2,020 and 380 samples, zero detected gap transitions and zero overlap transitions. Its first timestamp is 07:00:00.019538 UTC. Raw counts range from −501,324 to 197,245; mean −48,050.8571 and RMS about the mean 154,425.2806. No causal earthquake association is asserted.

`node --test` passes 42 tests. Instrument checks cover exact timing, units, malformed/empty input, missing metadata, source identity and sample counts, gap handling, peak-preserving charts, immutable records/cache, historical reception and query-history retention. `scripts/instruments-check.mjs` verifies actual Chrome and WebKit station selection on Earth, recording retrieval, exact source/body export hashes, SVG metadata, strict-replay rejection and narrow portrait/landscape layouts. `scripts/instruments-ai-check.mjs` verifies actual local Qwen and Astra answers, including keeping a pending local explanation through a phone-width resize. An initial Qwen answer incorrectly equated a block boundary with a gap; explicit continuity context and exact-count checks corrected that observed failure.

Saved single-window and time-frequency analysis are now available below each waveform; see [Spectra](SPECTRA.md) for detrending, tapers, source-linked exports and AI interpretation. Phase analysis, separate signal filters, SeedLink v4 identifiers, wider network acceptance and physical phone testing remain unfinished work in the full brief. Full-response correction is now available; see [Response correction](RESPONSE-CORRECTION.md).


## Continuous acquisition

Install the decoder with `scripts/setup-instruments.ps1` (Python 3.12). It uses the existing isolated model runtime, NumPy 2.4.2 and ObsPy 1.5.1. `pip check` passes alongside the installed model and speech dependencies. Python's standard TLS/socket support connects to `rtserve.earthscope.org:18500` with certificate validation; ObsPy decodes the MiniSEED. The app does not implement Steim decompression or poll the archive for a live feed.

In **Stations**, load metadata for the current date, select a channel whose epoch is valid now, and choose **Start selected channel** while Earth is Live. One host connection is permitted at a time. Stop remains available if Earth moves into replay. Closing the dialog does not stop acquisition; **Stop feed** or app shutdown does. Startup does not automatically resume a stream. Controller devices can start/stop/capture; paired viewers have read-only access.

The connection uses legacy SeedLink v3 negotiation and 520-byte packets (8-byte sequence header plus 512-byte MiniSEED). Current supported identifiers are up to two network characters, five station characters, two location characters and a three-character channel. Blank-location selection is filtered again against the decoded exact source ID. Metadata epoch bounds are checked against received samples. Data is not assigned to an earthquake.

Reconnect delays back off from 5 to 60 seconds, resuming from the next accepted 24-bit sequence. Sequence skips alone do not identify missing samples. The socket times out after five minutes without data; the app sends no rapid protocol keepalives. A connected socket without arriving samples is shown as waiting. Source age and receipt age are separate; either exceeding 60 seconds flags an active feed stale. Samples more than one second ahead of the host clock are flagged. These thresholds describe this app's display policy, not a provider latency guarantee.

The in-memory ring retains complete packets within 15 minutes of its newest source sample, at most 250,000 samples and 10,000 packets. It discards exact duplicate packets within that ring and counts evictions. Late obsolete packets are discarded without evicting newer retained data. The preview shows at most the last 120 packets / 20,000 samples; all retained samples are included in a capture. Source boundaries and detected time gaps remain separate. The ring is volatile: closing the app discards uncaptured samples.

**Capture recording** saves an immutable waveform record, every included original packet, its sequence and local receipt time, source channel metadata and all decoded samples. Original source nanoseconds are retained as strings; plotted sample timestamps are nearest integer microseconds. The binary source SHA-256 is computed on original bytes, not on the base64 representation. JSON exports mark the base64 encoding; **Original SeedLink packets** downloads the binary `.seedlink` file. Existing archive exports remain GeoCSV. **Saved recordings** reopens either kind and provides the same raw-count chart, spectrum/time-frequency tools and both AI brains. The default joining option combines verified contiguous, same-rate source packets for spectra and response correction. Gaps, overlaps and excessive clock drift split runs; every original timestamp and contributing source slice remains in the export. Disable joining to analyze blocks separately. See [frequency analysis](SPECTRA.md) and [response correction](RESPONSE-CORRECTION.md).

The AI context supplies an explicit acquisition classification and preformatted source, reception and save timestamps. It contains computed summaries, at most 80 segment details (first/last 40 when truncated), omitted-detail counts and source checksums; individual samples, packet bytes and long packet-hash lists stay in the export. An observed local-model error mislabeled a capture and converted an epoch into the wrong date; a focused waveform prompt and explicit UTC strings corrected that case. AI prose still requires evidence review.

## Verified continuous example

Actual IU.ANMO.00.BHZ, 40 Hz, **2026-09-13 19:00:05.119538–19:00:48.719538 UTC**: 1,745 samples in three packets, no detected gap or overlap transitions. First/last local packet reception: 19:00:17.766 and 19:00:47.808 UTC; immutable save time: 19:00:48.967 UTC. The final source time is slightly ahead of the final receipt; those independent clocks are preserved without correction.

Capture ID: `3b2c71714da4df0eb9cdff3aa29597e5bb4810c2494004a101513af2aa49a6ad`.

Original 1,560-byte packet SHA-256: `10a6af3de74a8299a3d83a0cdbeb0fe63ca645a6dc554fbada02c29b24b51d9c`.

`data/model-runtime/Scripts/python.exe scripts/reproduce-seedlink.py artifacts/seedlink-capture.json` decodes every saved packet again and verifies every sample, timestamp, encoding and packet hash exactly. A first-packet 579-sample Hann periodogram (`bf539abfa852af72207531f987136b73b2bba9f4397aa9272982ce4677f577a3`) also reproduces with zero numerical error from its source-linked export. Its 0.20725388601036265 Hz peak is a spectral bin, not a source identification.

`seedlink-check.mjs` tests actual browser Start/Stop/Capture, continued host acquisition when the dialog closes, original binary downloads, source-linked spectra and eight fresh Chrome/WebKit desktop/320/390/landscape layouts. `--saved` reuses the retained recording; after a server restart it supplies its saved real samples as a controlled stopped-preview fixture. `seedlink-lifecycle-check.mjs` controls only response timing/status to verify replay hiding, Stop access and late-capture isolation. `seedlink-reconnect-check.mjs` interrupts a real worker and verifies resumed real packets, followed by complete process-tree cleanup, including immediate stop after start. The observed reconnect capture had 1,135 samples, no detected gap and no overlap. `seedlink-ai-check.mjs` verifies actual Qwen and subscription-backed Astra explanations and cutoff rejection. Test streams are stopped after verification.

Protocol references: [EarthScope SeedLink service](https://docs.earthscope.org/service/seedlink), [SeisComP SeedLink protocol](https://www.seiscomp.de/doc/apps/seedlink.html), [ObsPy MiniSEED reader](https://docs.obspy.org/packages/autogen/obspy.io.mseed.core._read_mseed.html). The implementation currently verifies EarthScope/ANMO operation; it does not establish uninterrupted delivery or acceptance across every available network.
