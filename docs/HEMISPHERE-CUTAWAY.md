# Hemisphere and radial cutaways

Open **Tools → Section**, then choose **Hemisphere** or **Radial wedge** in the section controls. A hemisphere removes half of Earth using one plane through its center. A radial wedge removes a quarter using two central planes. The hemisphere side selector chooses the removed side relative to the A → B direction. Center/bearing, exact endpoints and surface picking reuse the same great-circle corridor tools.

Both modes project only earthquakes and enabled Slab2 contour segments within the selected corridor onto the central section plane. Switching modes or sides preserves this selection and the source depths. This is not an inventory of every earthquake in the retained hemisphere. Other reference layers retain their own geographical positions.

Sections use true 1× depth. The colored caps are schematic global references: uniform 35 km crust, mantle/core boundary at 2,900 km and outer/inner core boundary at 5,120 km. They are not measurements of local crust or mantle structure. Cinematic inspection lighting follows the camera; it is illustrative. Scientific presentation keeps the Earth surface unlit and disables that inspection light.

Section JSON records the mode, removed side, plane normals, cap count, projected observations and source context. Publication JSON/SVG retains this evidence and labels hemisphere captures. Video evidence preserves the initial section; changing the mode or side stops recording with a visible reason. Cancelling endpoint picking restores the previous section.

The copilot accepts **Use hemisphere cutaway** and **Restore radial wedge view**. Explicit view requests use a focused presentation context so unrelated forecast scores do not distract the explanation. Both local Qwen and ChatGPT-authenticated Astra were exercised. View commands do not change observations or model scores.

## Verification

- All 93 automated tests pass, including complementary hemisphere clipping, quarter-wedge clipping, unchanged depth projection and explicit/negated AI command handling.
- Chrome and WebKit passed fresh 1366×900, 320×740, 390×844 and 844×390 layouts, with at least 44 px section-control targets and no horizontal document overflow.
- The retained Japan replay preserved 1,507 projected earthquakes and 4,946 clipped Slab2 contour segments when switching shapes and sides. Figure metadata and geometry agree; the existing section picking, dateline, profile and restoration checks also pass.
- A real Chrome recording stopped after a side change, preserving its initial hemisphere/side evidence and 36 frames.
- The production forecast chain remains valid at 282 records and 417 result reviews. No prospective protocol was registered by these checks.

Run `node --test`, `node scripts/hemisphere-check.mjs`, `node scripts/section-check.mjs`, `node scripts/hemisphere-recording-check.mjs` and `node scripts/hemisphere-ai-check.mjs` against the local server. Browser reports and images are retained under ignored `artifacts/`. AI checks require the configured local model and ChatGPT-authenticated Codex CLI.

Physical iOS/Android/XR testing and acceptance against the user's complete visual brief remain open. Playwright viewport checks do not establish physical-device acceptance.
