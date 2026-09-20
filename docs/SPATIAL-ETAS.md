# Regional spatial ETAS laboratory

The Research lab fits a separate joint time/location ETAS experiment. It provides immutable inputs, numerical diagnostics, a training-only KDE comparator, 1/7/10-day component maps, and a historical Earth overlay. The copilot can explain the selected run using either the default local Ollama brain or signed-in Codex/Astra.

## Formulation

The implementation is `rectangular-gaussian-spatial-etas-0.1.0`. Time is in days and projected coordinates are in kilometres.

```
lambda(t,x,y | Ht) = mu / area
  + sum over ti < t of A exp(alpha (Mi - Mc)) g(t-ti) f(x-xi,y-yi; sigma_i)
g(u) = (p-1)/c (1+u/c)^(-p)
sigma_i = sigmaKm exp(gamma (Mi-Mc)/2)
f(dx,dy;sigma) = exp(-(dx²+dy²)/(2 sigma²)) / (2 pi sigma²)
log L = sum over training events log lambda(ti,xi,yi) - integral lambda dt dx dy
```

This follows the normalized Omori/productivity and Gaussian spatial family documented by the authors of [R ETAS](https://search.r-project.org/CRAN/refmans/ETAS/html/etas.html), with a uniform fitted background. It is not that package's full semiparametric procedure. See also [Ogata (1998)](https://doi.org/10.1023/A:1003403601725).

The rectangle uses spherical cylindrical equal-area coordinates with the standard latitude at its midpoint. This preserves spherical area but distorts distance. Latitude bounds must lie within ±70°, latitude span must be at most 20°, and longitude span must be 0.1–30°. West greater than east denotes a dateline crossing. See [PROJ's CEA definition](https://proj.org/en/stable/operations/projections/cea.html).

Each triggering kernel's compensator uses its Gaussian mass actually inside the rectangle, from normal CDF differences, and the analytic Omori time integral. It is not renormalized to retain offspring outside the region. Mu is total regional background events/day. Conditioning events contribute intensity and integral terms but not the training event-log sum. Exactly simultaneous events cannot trigger each other.

## Fit and diagnostics

Three bounded Nelder–Mead starts optimize seven parameters. Bounds: mu from 0.00001 to max(1, three times the training daily rate); n 0–0.98; alpha 0–0.95 beta; c 0.0001–2 days; p 1.01–2.8; sigmaKm 2–300 km; gamma 0–2. Beta uses training magnitudes with the temporal model's 0.1-bin convention. `A = n (1-alpha/beta)` makes n an implied full-plane branching ratio under the exponential magnitude assumption, not the regional offspring fraction.

Reports preserve every start's objective/convergence, evaluations, boundary flags and fitted values. A boundary solution needs scrutiny even if the optimizer converges. No global optimum or confidence intervals are claimed. Fits require at least 30 training events and at most 1,500 conditioning plus training events; larger requests fail without sampling. The worker has a 90-second limit.

Parents outside the region and before the conditioning history are missing. Depth, fault orientation, anisotropy, location uncertainty and magnitude-scale homogenization are absent. Completeness at the chosen threshold is assumed, including after large events. Such issues can bias ETAS fits; see [Grimm et al. (2022)](https://doi.org/10.1007/s00477-022-02221-2).

## Evaluation and map meaning

Training history is frozen inside the model. Holdout scoring combines it with later observed outcomes without refitting. An outcome becomes a parent only for subsequent events. Joint time/location likelihood is compared with uniform Poisson and static spatial KDE Poisson baselines using the training daily rate. KDE bandwidth is selected solely on training locations by leave-one-out likelihood over 10, 25, 50, 100 and 200 km. Its kernels are normalized inside the region. Bits/event divides the likelihood difference by event count and log(2); it is null for an empty holdout.

Maps have 32×32 equal-area cells integrated over space and 1/7/10 days. They include background and triggering by parents observed at the training cutoff. **They exclude future parents and their subsequent cascades.** Their integral is a direct intensity component, not calibrated probability or expected total sequence size. Logarithmic colours and training epicentres are labeled.

Showing a map on Earth loads its historical cutoff and temporarily hides illustrative DS field, paths and volumes. Removing it restores the scene. Changing time, entering X-ray/cutaway or starting a route flight clears it. Figure evidence includes the run, parameters, input reference, horizon and cells; its caption identifies the component and magnitude threshold.

Copilot context includes parameters, diagnostics, units and a bounded map summary. Holdout results are withheld until their end is at or before the analysis cutoff. Strict observation mode also rejects runs created after that cutoff. Revised-catalog replay cannot reconstruct 2011 operational knowledge. Pretrained LLM knowledge cannot be removed; a deterministic renderer remains available.

## Saved example and verification

Japan run `c55ce812ad7f357680095dfdfa90c780162178bdccc26928b493488549f78985` uses USGS, 30–46° N / 130–148° E, M≥4.5, five conditioning days, training February 15–March 10, 2011, and holdout through March 20. It has 62 training and 1,504 holdout events. Sigma is 12.308 km and n reaches its 0.98 bound. KDE chooses 100 km. Holdout gain is 5.711 bits/event against KDE Poisson. The 7-day direct component integrates to approximately 13.07.

This famous sequence was selected exploratorily. Sequential holdout gain does not establish advance prediction of the mainshock, prospective skill or probability calibration. Region/threshold sensitivity and untouched evaluation remain required.

Numerical tests independently check projection/area, Gaussian rectangle masses, joint-intensity integration, Poisson reduction, coincident events, frozen history and future-outcome isolation. API tests check fitting, reuse, separate snapshots, SQL immutability and cutoff-limited context. `scripts/spatial-check.mjs` passed laboratory, Earth overlay, figure evidence, restoration and 320/390/768-width layouts in Chrome and WebKit. `scripts/spatial-ai-check.mjs` verified actual local Qwen and Astra explanations with later holdout results withheld. Viewport emulation does not establish physical phone or Safari acceptance.

Runs have content-derived identifiers and separate immutable training/outcome snapshots. Exports contain the report and complete source snapshots. Local guards and hashes are not an external trusted timestamp.
