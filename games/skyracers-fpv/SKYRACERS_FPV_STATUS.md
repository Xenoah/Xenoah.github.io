# SkyRacers FPV Agent Handoff

Last updated: 2026-07-09

Scope: `games/skyracers-fpv`

This is the project-specific handoff/status document for SkyRacers FPV. Do not rename this file to `CLAUDE.md`. The repo may have other agents working in parallel; do not revert unrelated changes.

## Project Goal

SkyRacers FPV is a static browser-based Three.js FPV drone racing game. The current product direction is a game-forward FPV simulator with Time Attack, 60-second Score Attack, Free Flight route practice, class-based drone selection, gate racing, course previews, records, sectors, ghost replay, training aids, mobile controls, and gamepad support.

The game is inspired by and partially porting systems from `games/drone-simulator`, but SkyRacers is no longer a one-file clone. It now has a separate data file, larger state model, generated course set, richer UI, persistent lap data, and more simulator-like FPV handling.

## Current Architecture

- `skyracers-fpv.html`
  - Static entry point and UI shell.
  - Loads Tailwind from CDN and Three.js from CDN.
  - Defines screens/popups for menu, Time Attack selection, Free Flight selection, HUD, pause, finish, and settings.
  - Contains CSS for full-screen game layout, HUD, mobile controls, safe-area behavior, and responsive visibility.

- `js/error-handler.js`
  - Global load/runtime failure surface.
  - Watches `window.onerror`, resource `error`, and `unhandledrejection`.
  - Displays failures on the loading screen, which is important because CDN failures otherwise look like a dead page.

- `js/drone-data.js`
  - Provides `window.DRONE_CLASS_DATA`.
  - Data is grouped by gameplay class, then normalized by `game.js`.
  - Includes tiny whoop, camera drone, racing FPV, cinema, enterprise, and heavy-lift style classes. It is gameplay/editorial data, not official industry classification.

- `js/game.js`
  - Main runtime: data normalization, course generation, Three.js scene/world setup, controls, physics, HUD, save/import/export, race flow, records, sectors, ghosts, replay, mobile controls, and gamepad menu navigation.
  - Uses global Three.js and DOM APIs; no bundler/build step.
  - Stores best times in cookie `xnh_best_times`.
  - Stores lap data in localStorage key `xnh_lap_data_v1`.
  - Save export schema is versioned with `SAVE_SCHEMA_VERSION = 3` and includes settings, selected drone/class, language, best times, lap data, and Score Attack records.

- `assets/textures/`
  - SVG texture sources used by the world material generator for ground, terrain, panels, support, and trim surfaces.

- `test-reports/`
  - Review and QA artifacts from other agents.
  - `tester-10-qa-test-plan.md` is the most comprehensive regression plan for the current round.

## Gameplay Spec

Primary modes:

- Menu preview
  - Shows a generated track/world as a moving background preview.
  - Allows Time Attack, Score Attack, Free Flight, Settings, and language toggle.

- Time Attack
  - Player selects course, drone class, then drone.
  - Course selection can start with the currently selected/default drone after a course is chosen.
  - Player spawns before Gate 1, crosses Gate 1 to start the timer, then clears each gate in order.
  - Finish occurs at the final gate. The current behavior pauses the race and opens the finish popup instead of auto-looping to Gate 1.
  - Records are keyed by `trackId::droneClassId`, not individual drone entry.
  - Finish screen shows time, best, max speed, crash count, local rank, sectors, and replay availability.

- Score Attack
  - Uses the same course/drone prep flow as Time Attack.
  - Gate 1 starts a 60-second countdown.
  - Each cleared gate after the clock starts adds 1 point.
  - The route loops continuously until time expires.
  - Score records are separate from Time Attack records and are keyed by `trackId::droneClassId`.
  - Finish screen shows score, gates cleared, laps, max speed, crash count, rank, and best score.
  - Runs with training aids enabled are unranked and do not overwrite score records.

- Free Flight
  - Player selects one of the same racing worlds.
  - Runs without the race timer, gate scoring, records, or finish popup.
  - Gates stay visible as a dim route-practice overlay instead of a live race sequence.

Controls:

- Keyboard
  - `W` increases throttle, `S` decreases throttle.
  - `A/D` yaw, arrow keys pitch/roll.
  - `R` resets run, `G` respawns at current gate.
  - Escape is screen-aware: settings close, pause toggles, selection backs out, finish screen is protected from accidental restart/quit.

- Gamepad
  - First connected gamepad is used.
  - Left stick throttle/yaw, right stick pitch/roll.
  - X resets, Y respawns, Start pauses/resumes, A activates menu item, B follows the current screen's close/back action.
  - Menu navigation supports D-pad/left stick and range control adjustments.

- Touch
  - Mobile/touch mode uses left virtual stick for throttle/yaw and right virtual stick for pitch/roll.
  - Mobile reset, respawn, and pause buttons are present.
  - Touch mode is re-evaluated on resize/orientation/visualViewport changes.

Flight model:

- Quaternion-based FPV orientation with angular velocity.
- Rate/acro-style attitude response through target angular velocity and motor response interpolation.
- Throttle curve, gravity, drag, battery drain, voltage sag, and prop-wash style perturbation.
- Camera is first-person with configurable camera angle, speed-linked FOV, and light vibration at speed.
- Optional training chase camera shows a lightweight live drone mesh; FPV remains the ranked/default camera.
- Optional stabilized flight assist, gentle collision practice, and circular gate pass mode exist as training aids.
- Timed runs with any training aid enabled are explicitly unranked.
- Physics now runs on a fixed 1/120s accumulator with a max substep cap.

Race systems:

- Gate layouts are generated from authored base course layouts plus themed transforms.
- 14 base layouts are expanded through 4 theme groups for 56 visible courses.
- The added `neonSpiral` layout creates a climbing neon helix course in every terrain theme; old track IDs remain stable and new layouts start at extra IDs.
- Compact layouts exist for tiny/whoop style flying.
- Gate passage uses plane crossing plus local opening bounds, not simple distance-only checks.
- Gate frames have visuals and box colliders.
- Sectors split each course into 3 boundaries.
- Ghost samples record position/quaternion over a lap, capped to 900 samples.
- Replay can play last or best ghost and return to finish/pause context.
- Quality profiles now drive pixel ratio, shadows, terrain tessellation, prop density, marker density, light density, and stadium reflection density.

## Recent Progress

Recent work appears to have addressed many issues called out in the earlier tester reports:

- Score Attack is now a first-class mode with a 60-second timer, looping gates, scoring, best-score records, mode-aware HUD, and mode-aware finish results.
- `lapData.scoreRecords` was added and save export schema moved to version 3 while keeping older saves normalizable.
- Current Setup, course/class/drone stat bars, score-aware best displays, and Score Attack prep text were added to the selection flow.
- Screen-edge next-gate pointer and transient flight toasts were added for gate, sector, respawn, and Score Attack feedback.
- Training aids were added: chase camera, stabilized flight, gentle collision practice, and circular gate pass. These make timed runs unranked.
- Chase camera/replay now display a lightweight live drone mesh so the player can read attitude while learning.
- Quality profiles now control object density, terrain tessellation, lights, and reflection accents.
- A seeded environment prop generator adds track-side structure while preserving route clearance.
- `neonSpiral` was added as the 14th base layout, expanding the visible course list to 56 without shifting legacy course IDs.
- Free Flight now uses the same racing worlds as dim route-practice spaces, without scoring or record writes.
- Finish flow now calls `completeTimeAttackLap()`, freezes the race, updates finish stats, shows `popup-finish`, and avoids automatic next-lap restart.
- Replay flow now hides popups during playback and returns to finish/pause context instead of always resetting the race.
- Gate progression now uses `didPassGate()` with gate-plane crossing and local X/Y bounds.
- Track preview and track length stop at the final gate rather than implying a final-to-first loop.
- Gate frame visuals/colliders were added around gates.
- Keyboard throttle now supports `W` up and `S` down with `dt`-based throttle change.
- Reset/respawn actions use rising-edge detection to avoid repeated resets on long press.
- `KeyboardEvent.code` support and blur input clearing are present.
- Escape/gamepad B/Start handling was made screen-aware.
- Camera angle setting is wired into UI, import/export, and flight camera.
- Fixed-step physics and throttled HUD updates were added.
- Touch controls are re-evaluated on resize/orientation/visualViewport changes.
- Export/import now includes `bestTimes` and `lapData`.
- Detail panels, aerial preview, class leaderboard snippets, compact course warnings, sector HUD, ghost status, and finish sectors are implemented.

## Systems Being Ported From `games/drone-simulator`

The source simulator is a single-file Three.js browser game with:

- Mode list: free flight, ring race, 60-second time attack.
- Drone list: three simple drones with acceleration, max speed, lift, yaw, drag, size, and stat bars.
- Course list: city/canyon/neon.
- Quality presets including pixel ratio, shadows, object density, and mirror option.
- Pointer-stick touch controls.
- Keyboard controls.
- Generated worlds and ring paths.
- Simple physics based on heading, velocity, drag, speed cap, AABB collisions, and visual pitch/roll.
- Ring crossing via side-change and radial radius.
- LocalStorage records for times/scores.
- Chase/FPV camera toggle.
- HUD with speed, altitude, timer, ring pointer, pause, and result overlays.

SkyRacers current port status:

- [x] Static browser-only delivery model retained.
- [x] Three.js renderer/scene/camera/world loop retained.
- [x] Menu-driven mode/course/drone selection retained, expanded substantially.
- [x] Drone stat model retained conceptually, replaced with normalized class/entry data.
- [x] Touch virtual sticks retained, expanded with mobile reset/respawn/pause and resize handling.
- [x] Keyboard controls retained, made more stateful for throttle.
- [x] Gamepad support added beyond the source simulator.
- [x] Ring race concept ported as gate racing with stronger gate direction/bounds checks.
- [x] Local records retained, expanded to cookie best times plus localStorage leaderboards/sectors/ghosts.
- [x] Result overlay retained, expanded into finish popup with sectors/rank/replay.
- [x] Quality selection retained conceptually, now `FLAT` / `TEXTURED` / `CINEMATIC`.
- [x] Generated world/course idea retained, expanded to 56 themed tracks.
- [x] FPV camera retained as ranked default; chase camera exists as an unranked training aid.
- [x] 60-second score attack mode from source simulator is present as `SCORE_ATTACK`.
- [x] Screen-edge next-gate pointer from the source simulator is present as an optional HUD overlay.
- [x] Source-style quality object density is ported into SkyRacers quality profiles.
- [x] Source-style neon identity is represented by the stadium theme and `neonSpiral`.
- [x] Free Flight now functions as route practice with gates visible and no records.
- [ ] True mirror/render-target reflection is not ported; SkyRacers uses conservative stadium glow/reflection floor accents instead.

## Implementation Status Checklist

Core runtime:

- [x] Static HTML game entry works without a build step.
- [x] Three.js scene, camera, lighting, terrain, world props, and racing gates are created by `game.js`.
- [x] Renderer quality modes exist.
- [x] Error display exists for script/resource/runtime failures.
- [ ] Tailwind and Three.js are still CDN dependencies.
- [ ] WebGL initialization and context lost/restored handling are not fully hardened.

Data and selection:

- [x] Drone class data loads from `drone-data.js` with fallback data in `game.js`.
- [x] Drone entries are normalized into speed/agility/weight/motor/battery/drag gameplay stats.
- [x] Course layouts and theme groups generate 56 courses.
- [x] Course/class/drone selection UI is implemented.
- [x] Detail panel and aerial preview are implemented.
- [ ] `customStats` and `custom-drone-panel` still appear to be unused/hidden rather than true tuning.
- [ ] Best time keys are class-level only; individual drone fairness is unresolved.

Flight and controls:

- [x] FPV quaternion flight model exists.
- [x] Rate, expo, deadzone, camera angle, compass, horizon, and input overlay settings exist.
- [x] Training chase camera, stabilized flight, gentle collision practice, and circular gate pass settings exist.
- [x] Keyboard, gamepad, and touch controls exist.
- [x] Reset and respawn use rising-edge detection.
- [x] Touch controls re-evaluate on viewport changes.
- [ ] Pointer-lock/mouse flight input is not implemented.
- [ ] Axis-specific FPV rates/expo, throttle calibration, transmitter-style non-centering throttle, PID/motor mixer/inertia tensor are not implemented.

Race flow:

- [x] Gate-plane crossing and local opening checks are implemented.
- [x] Gate frames have visual bars and colliders.
- [x] Time Attack starts at the first gate and finishes at the final gate.
- [x] Finish popup shows result and pauses race.
- [x] Restart, menu return, and replay buttons are wired.
- [x] Current-gate respawn exists with time penalty.
- [x] Sector timing and finish sector display exist.
- [x] Ghost records and replay exist.
- [x] Score Attack starts at Gate 1, loops the route, and finishes after 60 seconds.
- [x] Score Attack records are separate from Time Attack records.
- [x] Free Flight is route practice with dim gates, no timer, no scoring, and no record writes.

Persistence:

- [x] Cookie best times exist.
- [x] localStorage lap data exists for leaderboards, sector bests, ghosts, and score records.
- [x] Export/import includes settings, language, selected drone/class, best times, lap data, and score records.
- [x] Save schema/physics version values exist.
- [ ] Cookie plus localStorage split remains a migration/consistency risk.

UI/HUD:

- [x] HUD includes battery, health, speed, lap/score clock, sectors/score chips, sector delta, ghost/score status, compass, horizon, gate pointer, flight toasts, training status, and input overlay.
- [x] Settings include audio, video quality, rate, expo, deadzone, camera angle, training aids, and overlay toggles.
- [x] Mobile HUD/control layout has safe-area and responsive work.
- [x] Gamepad menu focus/navigation exists.
- [ ] Accessibility is incomplete: dialogs, focus traps, specific generated button labels, and mobile control labels still need attention.
- [ ] Some visible strings in imported UI may show mojibake if encoding is mishandled by tooling; keep files UTF-8.

Performance:

- [x] Fixed physics step is implemented.
- [x] HUD updates are throttled to 30Hz.
- [x] Geometry/material disposal exists in cleanup paths.
- [ ] Gate rebuild still recreates gate objects on progression; object reuse would reduce spikes.
- [ ] World regeneration on quality changes can still be heavy.
- [ ] Real browser FPS and mobile performance need measurement.

## Testing Notes

Static checks:

- Run `node --check games/skyracers-fpv/js/game.js`.
- Run `git diff --check -- games/skyracers-fpv`.
- Search for conflict markers with `rg -n "<{7}|={7}|>{7}" games/skyracers-fpv`.

High-priority manual QA:

- Open `games/skyracers-fpv/skyracers-fpv.html` in Chrome/Edge/Firefox.
- Confirm menu loads with no console errors.
- Time Attack quick path: choose a course, confirm Start Race is enabled with the current drone, start race.
- Cross Gate 1 and verify timer starts.
- Cross gates in order and confirm final gate opens finish popup.
- Confirm finish buttons: Restart Run, Replay Best/Last, Back to Menu.
- Confirm replay returns to finish popup or pause popup based on where it was launched.
- Score Attack path: choose Score Attack, start Gate 1, clear several gates, confirm score increments, countdown reaches 0, and score result opens.
- Confirm Score Attack bests are separate from Time Attack bests in prep/detail/result UI.
- Free Flight path: select a course, confirm dim route gates are visible, and confirm no timer/score/result popup appears.
- Training aids: enable chase camera and confirm the drone mesh is visible; enable stabilized/gentle/circular options and confirm HUD shows `UNRANKED`.
- Confirm `W/S`, `A/D`, arrows, `R`, `G`, Escape, and blur behavior.
- Confirm gamepad Start/A/B/X/Y and menu navigation.
- Confirm touch controls, reset/respawn/pause, and orientation changes on mobile or device emulation.
- Confirm gate behavior: forward pass succeeds, reverse pass does not, outside/edge pass does not, high-speed pass does not skip under normal frame rates.
- Confirm compact course warning with larger drones.
- Confirm export/import restores settings, best times, leaderboards, sectors, and ghosts.

Known local testing caveat:

- Prior tester reports noted that local browser automation/headless Chrome was unreliable in that environment due to GPU/Crashpad/cache failures, so screenshots/FPS were not collected there. Prefer real browser/manual smoke tests until Playwright/Chrome is stable on the machine.

Regression plan:

- Use `test-reports/tester-10-qa-test-plan.md` as the main checklist. It covers static validation, desktop browser flow, mobile, gamepad, race results, and gate validation.

## Known Risks And Next Work

- CDN dependency risk: Tailwind and Three.js load from external CDNs. Offline/local/network-restricted environments can fail before gameplay starts.
- WebGL hardening risk: renderer initialization lacks a full capability/context-lost recovery path.
- Physics realism risk: flight is rate/acro-inspired, but not a real motor/PID/inertia model. `speed` still influences vertical thrust, and `weight` is a gameplay multiplier rather than pure mass.
- Input realism risk: no pointer-lock mouse input and no transmitter-style throttle calibration.
- Performance risk: gate rebuild and world regeneration can still cause allocation spikes.
- Persistence risk: best times are split into cookie storage while richer lap data is localStorage.
- Tuning risk: `customStats` UI/state exists but is not a connected feature.
- Fairness risk: records are class-level, while entries inside a class can have different normalized stats.
- Accessibility risk: modal semantics, focus trap, generated button labels, and touch-control labels need follow-up.
- Mobile risk: safe-area and touch layout were improved, but real iOS Safari and Android Chrome verification is still needed.
- Course readability risk: vertical/over-under courses still need stronger altitude/path communication beyond compass and aerial preview.
- Encoding risk: existing Japanese comments/docs are UTF-8; use UTF-8-aware tools when reading/writing docs.

## Agent Guidance

- Do not make broad refactors while other agents are active.
- Before editing, check `git status --short`.
- Do not revert unrelated changes.
- For code changes, prefer narrow edits in `js/game.js`, `skyracers-fpv.html`, or supporting assets as needed.
- For documentation-only tasks, avoid touching game code.
- If changing gameplay, update this file and the relevant test report/checklist notes.
- If changing persistence, preserve backwards compatibility with old saves that lack `bestTimes` or `lapData`.
- If changing gate logic, retest `razorback`, `tunnelRush`, `overUnder`, `vaultDrop`, and `microPulse`.
