# Orbital camera and path travel

Focus moves now follow the shortest rotation between the starting and target viewing directions, with a 1.4-second smoothstep transition. Radius interpolates separately. This keeps an antipodal focus move outside the Earth instead of moving the camera through its interior. Identical and antipodal directions are handled by quaternion rotation; reduced-motion mode sets the target immediately.

**Fly path** uses the selected model watch, or the first current candidate if nothing is selected. It takes a copy of that watch's route, highlights it on the globe, and visits each waypoint. The panel shows the watch region, waypoint count and coordinates. Pause, Resume, Next stop and End flight are available. Dragging the Earth or selecting another focus ends the flight. Resize and tab hiding pause it; it does not silently resume while the user is elsewhere. Reduced-motion mode only advances when Next stop is pressed.

Flight switches to the surface view. Route geometry is illustrative, and camera travel does not represent stress, wave speed, pressure propagation or model elapsed time. The analysis and forecast ledger are not changed. Publication evidence includes any highlighted route separately from currently displayed forecast candidates.

This is waypoint-guided orbital travel. Native camera video is implemented separately; see [recording](RECORDING.md). A free-flying hypocenter camera remains separate work.

Scientific rendering also uses immediate focus and manual **Next stop** path travel. It disables automatic orbit and ends a current flight when enabled; restoring cinematic rendering does not start an orbit automatically. See [scientific presentation](SCIENTIFIC-VIEW.md).

`scripts/camera-check.mjs` verifies sampled camera radii for antipodal, quarter-turn and identical directions, endpoint accuracy, path pause/advance, manual cancellation, mobile layout and reduced-motion operation. The recorded 45 samples stayed within the 2–4 Earth-radius endpoints; no flight crossed the interior.


## Selected-event focus annotation

A compact label and leader line follow the selected earthquake during orbit and zoom. The anchor is explicitly labeled surface projection, hypocenter or projected section. Magnitude type and catalog depth remain source values even when display depth is exaggerated. X-ray uses the same depth scaling/core clamp as the points; sections use the same true-depth projection. Surface anchors follow enabled positive ETOPO relief.

The label uses the current rendered event list, including the 15,000-point limit or section corridor. Filtering the event out hides it; new catalog revisions replace its readout. Historical timeline changes clear selection. Orbital labels hide on the far hemisphere or outside the camera frame. Placement tries six nearby positions, avoiding visible panels and primary controls; if none fits, the label hides while the existing event details remain available. This is hemisphere culling, not per-mountain occlusion testing. Long place names truncate visually and remain complete in the keyboard-accessible button name and reopened details.

Activating the annotation opens the existing event inspector. It does not issue a watch or ask an AI. The UI has no extra annotation animation; it tracks the existing camera and respects its reduced-motion setting. Publication figures include an anchor ring, source caption and exact projected coordinates in evidence. Native camera videos draw the selected anchor and a compact caption; submitted-frame evidence records its source identity, world point and screen coordinates.

`scripts/focus-annotation-check.mjs` exercises eight fresh Chrome/WebKit layouts, keyboard reopening, back-hemisphere hiding, 5× depth geometry, true-depth sections, figure evidence, historical clearing and a Chrome video with per-frame annotation evidence. Physical-device and full visual acceptance remain open. The X-ray button state is now updated in the shared renderer method, fixing a stale active button after returning to the mobile Earth tab.
