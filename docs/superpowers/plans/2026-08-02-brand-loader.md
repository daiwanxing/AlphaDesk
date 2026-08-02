# Loading Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved B-style AlphaDesk brand loader and replace the event timeline skeleton screen with it.

**Architecture:** Add a reusable inline-SVG React component and a content-area overlay under `src/shared/components`. The overlay delays mounting for fast requests, fades out before unmounting, and is positioned inside the shell's content pane so the topbar and navigation remain visible.

**Tech Stack:** React 19, TypeScript, Motion for React (`motion/react`), SCSS, Vitest, Testing Library.

---

### Task 1: Define the loader contract with tests

**Files:**

- Create: `src/shared/components/Loading.test.tsx`
- Create: `src/shared/components/LoadingOverlay.test.tsx`

- [x] **Step 1: Write failing tests** for the public loader role, tone/size classes, normalized path attributes, delayed overlay mount, and exit unmount.
- [x] **Step 2: Run the focused tests** and verify they fail because the component does not exist.

### Task 2: Implement the public loader

**Files:**

- Create: `src/shared/components/Loading.tsx`
- Create: `src/shared/components/loading.scss`

- [x] **Step 1: Implement the inline SVG component** with transparent default, optional framed mode, dark/light tone, inline/page/boot sizes, and status label.
- [x] **Step 2: Implement the approved continuous B animation** with Motion `pathLength: 0 → 1`, `cubic-bezier(.16, 1, .3, 1)`, 3px stroke, no highlight, no hold, and `prefers-reduced-motion` static fallback.
- [x] **Step 3: Run focused loader tests** and verify they pass.

### Task 3: Add the content-area loading overlay

**Files:**

- Create: `src/shared/components/LoadingOverlay.tsx`
- Create: `src/shared/components/loading-overlay.scss`
- Modify: `src/styles/terminal-shell.scss`
- Modify: `src/routes/events/index.tsx`
- Modify: `src/features/market-turnover/components/TurnoverBoard.tsx`
- Modify: `src/features/event-track/event-track.scss`
- Modify: `src/features/market-turnover/market-turnover.scss`

- [x] **Step 1: Add a 250ms delayed mount** so fast requests never flash the mask.
- [x] **Step 2: Fade the content-area mask out for 200ms** before removing it from the DOM.
- [x] **Step 3: Mount the same overlay in event tracking and A-share turnover**, without covering the topbar or navigation.
- [x] **Step 4: Remove obsolete inline skeleton/loading styles** and verify the shared overlay tests pass.

### Task 4: Verify the workspace

- [x] **Step 1: Run `pnpm test`.
- [x] **Step 2: Run `pnpm lint` (the command is blocked by existing `no-console` errors in `scripts/build-cloudfunctions.mjs`; edited files pass targeted Oxlint).
- [x] **Step 3: Run `pnpm build`.
- [x] **Step 4: Run linter diagnostics on edited source files and inspect the final diff.
