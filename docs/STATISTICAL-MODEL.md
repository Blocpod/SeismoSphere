# Regional temporal ETAS

The Research laboratory fits a temporal epidemic-type aftershock sequence model inside a fixed spherical region. Coordinates select catalog events; the model does not estimate a spatial triggering kernel. It is a separate statistical experiment, not an ingredient silently added to the DS score.

A separate fitted joint time/location experiment is available; see [regional spatial ETAS](SPATIAL-ETAS.md) for its Gaussian kernel, finite-region integrals, KDE comparator and historical Earth projection.

## Model and fitting

Time is measured in days. For earthquakes above the chosen magnitude threshold Mc:

```
lambda(t | Ht) = mu + sum over ti < t of A exp(alpha (Mi - Mc)) g(t - ti)
g(u) = (p - 1) / c * (1 + u/c)^(-p), u > 0
log L = sum over training events log lambda(ti | Hti) - integral lambda(t) dt
```

The normalized Omori density has unit mass for c > 0 and p > 1. Each integral is analytic. Conditioning events preceding the training start contribute to the intensity and compensator but not the training event-log sum. Coincident event times do not trigger each other. The code follows the temporal ETAS formulation described by [Ogata (2007)](https://doi.org/10.1029/2006JB004697); the normalized kernel parameterization is also documented by the authors of the [ETAS package](https://search.r-project.org/CRAN/refmans/ETAS/html/etas.html).

Beta is estimated from the training magnitudes using `1 / (mean(M) - Mc + 0.05)`, assuming a 0.1 magnitude bin. Productivity uses `A = n (1 - alpha/beta)`, so n is the implied branching ratio under the continuous shifted-exponential magnitude model. Alpha is constrained below 0.95 beta; n ranges from 0 to 0.98. The time offset c ranges from 0.0001 to 2 days and p from 1.01 to 2.8. Background mu ranges from 0.00001 to max(1, 3 times the observed training daily rate).

Three bounded Nelder–Mead starts optimize the conditional time likelihood. The report records convergence, boundary estimates, every start's objective, exact parameters and time-rescaled residuals. Boundary solutions and limited conditioning history can indicate a poor parameterization for the selected sequence. This implementation does not estimate confidence intervals or prove a global optimum. At least 30 training events are required, and conditioning plus training is limited to 1,500 events; larger requests fail explicitly without subsampling. The fit runs in a worker so the Earth interface remains responsive.

## Holdout and projection

The holdout never enters parameter or beta fitting. Its score is prequential: each already observed holdout event becomes an eligible parent only for later events. The comparator is a constant Poisson rate estimated solely on the training interval. Information gain is the difference in temporal log likelihood; bits/event divides by the event count and log(2). These scores assess timing within the selected region, not location or magnitude forecasts. They are not the DS hit-rate metric and do not go onto the prospective leaderboard.

The displayed rate curve conditions only on parents observed at the training cutoff. It excludes triggering by future, as-yet unobserved parents. Its integral must not be interpreted as the expected total including all subsequent cascades. No calibrated earthquake probability is displayed.

The initial Japan example uses training February 15–March 10, 2011, five conditioning days, a 1,200 km circle at 38° N, 142° E and M >= 4.5. There are 67 training events and 1,505 holdout events through March 20. The saved fit reaches the n and p bounds. Its positive temporal holdout information gain reflects the evolving observed sequence and does not demonstrate advance prediction of the March 11 mainshock. This famous interval was chosen for demonstration, so it is an exploratory retrospective experiment.

All dates are UTC. The input catalog is revised historical data, not a reconstruction of what a forecaster knew in 2011. Magnitude completeness, uniform detection, magnitude-scale consistency, region effects and independence of manual model-selection decisions remain assumptions to investigate. Prospective registration and an untouched evaluation protocol are still required.

## Persistence

Runs have a content-derived identifier covering model version, options and catalog input. Training and outcome snapshots are separate immutable SQLite records. The UI exports the fit and both complete snapshots. SQL guards reject updates and deletes to saved runs. The local file is not an independent timestamp authority.

# Catalog identity and retractions

Observations retain provider-published aliases. Transitive associations use those explicit IDs only, within the provider namespace. No distance/time heuristic silently merges physical events. USGS and EMSC remain independently selectable research catalogs; a model uses exactly one provider. This prevents unassociated reports from two services inflating model counts, but is not a completed cross-provider association service.

Revision selection precedes origin-time filtering, since providers can revise the origin time itself. Strict replay limits revisions by their local reception timestamp. Revised-catalog replay uses the latest known revision. Authoritative deletions are stored as new observation revisions, preserving the pre-deletion strict history. Older provider-update versions cannot overwrite newer revisions or resurrect a deleted event.

An hourly [USGS FDSN query](https://earthquake.usgs.gov/fdsnws/event/1/) requests `includedeleted=only` by update time with a one-minute cursor overlap. Its first sync searches the preceding 31 days of updates, including origins back to 1900. Failed/truncated/malformed responses do not advance the cursor. Some actual USGS records have blank id, net, code and ids fields. Those explicit but unidentified deletions are preserved in a reconciliation collection before advancing the cursor; they never cause guessed event removal. The inventory links to this collection and displays its count. The first successful local sync retained 221 such records alongside 288 identified deletions.

Absence from a rolling live feed is never treated as deletion. The initial sync does not recover all deletions predating installation; old imports may require explicit reconciliation. Retractions do not rewrite frozen forecasts or their recorded resolutions; resolution amendments remain future work.
