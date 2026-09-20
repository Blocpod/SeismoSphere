# Earth workspace

The main toolbar has five controls: Global, X-ray, Scientific, Layers and Tools. Labels stay visible on phones, including a 320-pixel viewport.

**Layers** contains plate boundaries, Slab2 contours, geological cutaway, mapped faults, stations/waveforms, focal mechanisms and volcano references. Experimental paths, the derived pressure field and watch volumes have a separate group. Watch volumes can be hidden independently of the watch list. Section and statistical modes temporarily hide them and restore the prior setting on exit.

**Tools** contains Pacific focus, orbit, sound and audio settings, model-path travel, section configuration and figure export. [Spatial sonification](SONIFICATION.md) offers selected-event tones and chronological plotted-event sequences. Scientific view and reduced-motion preferences still disable automatic camera travel while allowing manual path steps.

The layer badge opens Layers and identifies whether experimental hypotheses are visible. Passive source captions live under **Visible layer provenance** there. Active section, statistical-map and path controls remain on Earth in a bounded stack, with scrolling when necessary. The original controls and inspectors are reused, so source queries, AI explanations and exports retain their existing handlers.

Both panels use native HTML auto-popovers: Escape and outside clicks dismiss them; keyboard navigation follows the invoker. Opening an inspector first focuses the visible toolbar invoker so the inspector can return focus there when it closes, including WebKit's mouse-focus behavior. The provenance badge also retains a visible focus target. Popover content scrolls independently and its position follows the available viewport.

## Verification

Run the existing project-local scripts with Node:

```powershell
node scripts/workbench-check.mjs
node scripts/section-check.mjs
node scripts/learned-check.mjs
node scripts/instruments-check.mjs
node scripts/scientific-check.mjs
```

`workbench-check.mjs` uses fresh Chrome and WebKit pages at 320×740, 390×844, 844×390, 768×1024, 1366×768 and 1920×1080. It checks the five-button toolbar, popover bounds, keyboard entry/Escape, outside dismissal, source-inspector focus, actual renderer toggles, unchanged event/watch identifiers, section restoration and manual path steps. Other scripts exercise existing source, statistical, section and export flows through the same visible panels using `browser-controls.mjs`.

Installed Windows WebKit loses WebGL compositing after viewport resizing, independently reproduced with a plain WebGL canvas. Fresh viewport checks do not certify Safari rotation, physical phones, screen readers or the full visual quality target. See [scientific view](SCIENTIFIC-VIEW.md) and [build status](BUILD-STATUS.md).

Native behavior reference: [MDN Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using).
