# GNSS station velocities

Open **Layers → GNSS**. Fetch and freeze an NGL MIDAS solution in IGS20, North America fixed, Pacific fixed or Eurasia fixed coordinates. Choose a saved receipt, filter station IDs, fit duration and horizontal component uncertainty, or restrict the field to 2,000 km around the view. Click or tap a station arrow to inspect its source values, locate it, or ask the configured local/Astra brain. The main copilot also recognizes questions about the selected visible GNSS station.

These are published long-term station trends, not daily coordinates, current station health, strain, stress, locking, pressure transfer or earthquake precursors. Plate-fixed horizontal velocities differ from global-frame velocities. Original station-provider credits are linked from each station's NGL page.

## Sources and receipts

- [NGL Plug and Play portal](https://geodesy.unr.edu/PlugNPlayPortal.php)
- [MIDAS field format](https://geodesy.unr.edu/velocities/midas.readme.txt)
- [IGS20 velocity summary](https://geodesy.unr.edu/gps_timeseries/IGS20/midas/midas.IGS.txt); the same directory provides `midas.NA.txt`, `midas.PA.txt` and `midas.EU.txt`.
- [MIDAS method, Blewitt et al. 2016](https://doi.org/10.1002/2015JB012552), [NGL processing, Blewitt et al. 2018](https://doi.org/10.1029/2018EO104623)
- [NGL decimal-year convention](https://geodesy.unr.edu/NGLStationPages/DecimalYearConvention)

The actual September 13, 2026 downloads contain 21,812 IGS20, 9,417 NA, 8,150 EU and 2,387 PA stations. The IGS20 receipt is `f02295f5a2096612f70458078e9c8837724d56298ca4f9b1deba8e6b6fcd72b6`; its original text SHA-256 is `aa21dbebf748e3dc10059b4c8e5ebcf15b9364bfa53549ddb9f0c8a823c2a5c2`. SQLite preserves exact text, reference frame, reception time, HTTP last-modified value and provenance. SQL triggers reject updates and deletes. Identical bytes in the same frame reuse their first receipt. Reading verifies both source hash and receipt identity. Source downloads have a 60-second timeout, 16 MB bound and shutdown cancellation.

JSON and original text exports preserve source units and values. Publication figures embed the selected station, exact plotted station IDs, filters, frame, receipt and display scale with their evidence checksum. Downloaded browser text exports match the original IGS20 hash.

## Display and historical rules

The source uses metres/year. UI velocity and reported component uncertainty multiply by 1,000 to show mm/year. The app does not refit the solution or infer missing covariance. Source longitude is retained separately from its normalized display longitude. Underscore-containing station IDs are valid. Large velocities remain source values, including unusual polar motion; no undocumented missing-value sentinel is invented.

Default display filters require a valid fit interval, at least three years and E/N component uncertainties at most 2 mm/year. This shows 18,701 stations in the saved IGS20 receipt. These filters are not a station-quality certificate. EN tangent arrows use great-circle geometry: 50 mm/year corresponds to 200 display km, with arrow lengths capped at 500 km (four capped arrows in the default field). Teal/violet indicate positive/negative up velocity. Capping changes only geometry. Batched points and segments respect section clipping; selection supports mouse and touch.

One actual source row, `0KAR`, reports a first epoch of `0.0099` inconsistent with its duration. It remains inspectable under source interval issues and is excluded from plotting. No guessed correction is applied. Malformed rows, duplicate IDs, invalid coordinates and negative uncertainties reject an import.

The entire solution is hidden from Earth and AI before its first local receipt, including revised-catalog replay. NGL years have exactly 365.25 days and integer leap-year values at January 1 noon GPS time. Fit eligibility uses a conservative upper bound from UTC noon on January 1, 2000, plus half the four-decimal rounding bin; it does not claim exact UTC epoch conversion. A fit not safely before receipt is retained for source review but excluded from plotting and AI. Later AI responses are withheld if the user changes to an earlier observation cutoff.

## Verification

`node --test` passes 57 tests, including EN geometry, polar/dateline handling, exact units, malformed and future fit intervals, immutable receipts, first-reception reuse and context routing. The real P090 IGS20 values are E −20.291, N −5.902 and U −0.824 mm/year, with uncertainties 0.170, 0.154 and 0.593. Actual local Qwen 3.6 35B and subscription-backed Astra explanations preserve these quantities and the source fit epochs.

`scripts/gnss-check.mjs` checks eight fresh Chrome/WebKit desktop, 320/390-wide and landscape views, source-issue inspection, clipping, region filters, selected cards, raw export and historical hiding. `scripts/gnss-evidence-check.mjs` checks actual offset mouse/touch picking, figure hashes, selected copilot routing and a controlled delayed response across a cutoff change. `scripts/gnss-ai-check.mjs` exercises both real brains. The broader six-view Earth/replay/midpoint check also passes. These are desktop automation results, not physical iOS/Android acceptance; the documented Windows WebKit resize-compositor issue still applies.
