# Tectonic-context count comparison

In Research lab → Learning the seismic week, select a saved model run and choose **Fit + compare tectonic baseline**. The comparison is saved immutably, with its geometry, implementation, training counts and test windows. Repeating the same inputs retrieves the same record.

This baseline distributes a training-fitted global weekly rate across 72 equal-area cells. Its spatial prior mixes PB2002 boundary length with uniform background. Great-circle segments are subdivided at no more than 25 km; each piece contributes its length to the cell containing its midpoint. A fixed 0.00–0.99 mixture grid is scored using training events only, retaining at least 1% background. Ties favor the smaller boundary weight. The UI flags a solution at either grid edge.

Geometry: [Bird PB2002, converted by Hugo Ahlenius / fraxen](https://github.com/fraxen/tectonicplates), Open Data Commons Attribution 1.0; Bird (2003), DOI 10.1029/2001GC000252. This conventional reference geometry does not define Dutchsinse pressure routes.

## Reproduce an exported comparison

Download the tectonic comparison and its parent model's **Export weights, test windows + source snapshot** file, then run:

```powershell
node scripts/reproduce-tectonic.mjs comparison.json parent-learned-export.json
```

The script checks content hashes, recomputes boundary exposure and the training fit, independently sums Poisson log likelihood, and rebuilds the comparison from the original training catalog. Without the parent file it can verify the supplied training counts and scores, but cannot check those counts against raw observations.

## Verified result and limits

Comparison `b30fa794c414900b5e686579fd651dd8ea347c0c7d49d742755821eb20cbd252`, derived from parent `4f666dc2f069ae0bb72e3dd9d4b5b183298b02d38b0c6a2a77fa2607a8f11e18`, fitted 30,560 events across 883 training weeks. It selected 99% boundary length and 1% background, with 34.6093 expected global events per week. Across 312 test weeks and 10,783 events, its log likelihood was −22,387.6355 and its gain versus the graph model was **−0.635829 bits/event**. It performed worse than the graph on this explored interval.

These are static counts, not calibrated probabilities or precise earthquake predictions. The model does not incorporate slip rates, boundary types, inland faults, local crust or transient stress. Modern geometry is not reconstructed historical knowledge. Catalog completeness, stationarity and Poisson assumptions remain unvalidated; this repeatedly examined test interval is not fresh prospective evidence.

The research comparison and export are implemented. Choose PB2002 tectonic baseline in Count model to display its 72 static weekly expectations on Earth. Cell inspection, source-bearing figure/video evidence and isolated local/Astra explanations reuse the count-map workflow. Historical maps use revised-catalog replay; strict replay rejects a comparison created after its cutoff. The model is fitted only once and does not use the map date to refit. Combined-ensemble and prospective integrations remain unfinished. This comparator alone does not complete the brief's broader tectonic engine.

Saved comparison reads now verify the input ID, report, geometry and implementation hashes, creation time against its database column, the retained training snapshot, and test windows against the parent run. A mismatch prevents reuse by maps, AI or exports. These checks detect inconsistent retained data; they are not an external signature against an attacker who can rewrite every record and hash.
