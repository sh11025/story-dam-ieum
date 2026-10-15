# Dami animation asset map

Audit date: 2026-10-07. All runtime Dami motion states use full-frame PNG sequences under `src/assets/dami/motion/`. Motion files are loaded through the eager Vite glob in `src/components.tsx`; reduced-motion and image-load failure use `src/assets/dami/static/`.

## Motion inventory

| State | Frames | Runtime behavior | Status |
|---|---:|---|---|
| basic | 4 | short idle loop | FRAME_SEQUENCE |
| wave | 4 | short wave loop | FRAME_SEQUENCE |
| happy | 4 | short happy loop | FRAME_SEQUENCE |
| read | 4 | page interaction loop; also Home idle | FRAME_SEQUENCE |
| stack | 4 | short log placement loop | FRAME_SEQUENCE |
| carry | 5 | distinct full-character walking poses carrying a log; Bridge moves whole character | FRAME_SEQUENCE |
| build | 5 | `ready → lift → strike → impact → recover`; impact coordinates log installation | FRAME_SEQUENCE |
| complete | 5 | distinct full-character celebration poses; one-shot completion | FRAME_SEQUENCE |

Each state has numbered `00.png`, `01.png`, etc., except Build and Read, whose named frame files are retained. The original approved artwork and source GIFs are preserved under `src/assets/dami/source/dami/`.

## Runtime and fallback

`Dami` in `src/components.tsx` maps state to `motion/<state>/` frames. Normal motion uses PNG frames. `prefers-reduced-motion: reduce` selects the corresponding static PNG. If a selected motion frame fails to load, the component marks that state failed and uses the static PNG fallback. Build and Read keep their named full-frame sequences. The Interview side panel passes `state="read"` and therefore resolves the Read PNG sequence.

Carry and Complete PNG sequences are five distinct full-character frames each. Their former runtime GIF copies were removed after replacement; approved source artwork remains preserved. The browser frame inventory test compares decoded pixel data across all frame pairs. No runtime GIF references are expected.

## Progress and positioning

`Work` → `calculateWorkProgress` (`src/model.ts`) → `BridgeProgress` → `bridgeMetrics` → installed log count/completion → Dami position and motion phase. The impact phase installs one log. Subsequent carry steps walk across the newly installed deck before the next impact; multiple input changes coalesce to the latest target. Reload and task re-entry render saved progress immediately without replaying earlier construction. Local/demo mode does not disable animation. A progress decrease and reduced motion snap to the current work-derived state.

The compact work header keeps Bridge in view while the user edits. Dami uses a whole-character position transform; no limbs are assembled or animated with CSS. Runtime aligns the frame-specific foot anchor to the rendered SVG deck plane.

## Reduced motion and known gaps

When `prefers-reduced-motion: reduce` is active, motion is replaced with static PNG poses while progress and installed logs remain correct. In a normal browser setting, Home selects complete `wave`, `read`, or `happy` sequences, excludes the previous selection, plays each sequence twice at 320 ms per frame, and pauses 1.5 seconds at its stable pose before the next sequence. Bridge construction briefly plays `stack`, then full-character `carry`, `build`, and `complete` sequences. Browser E2E and manual Browser checks validate decoded frames and runtime state, not filenames alone.

## Motion Quality 02 verification

Carry and Complete source frames were replaced by five distinct transparent full-character PNG poses apiece. Their SHA-256 and decoded pixel comparison found five distinct files in each sequence (all ten pairwise comparisons differ). Stack is triggered once at the start of a progress increase, before the Carry approach; it is not repeated for every installed log. The work-header Bridge reserves a separate title row and places Dami in the scene row so the zero-progress caption and character do not overlap. Scene overflow permits the full character frame to remain visible; Bridge height has 12 px of added clearance in the sticky viewport; the progress pill sits beside its label so it does not cover Dami near completion. Foot-to-deck alignment remains anchored. The runtime evidence and screenshots for the quality check are stored under `artifacts/screenshots/history/2026-10-07/dami-motion-quality-02/`.
