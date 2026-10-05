# FIX1: Final-review cleanups (tokens, unused transition aliases)
Wave: 8 · Deps: T08 · Risk: low · Model: sonnet

## Goal
Every color comes from `colors` in src/ui/theme.ts, and the transition-only aliases this run added (old color names,
the `ui` StyleSheet, Button `compact`) are gone because nothing uses them any more.

## Context
Findings from the orchestrator's final self-review (orch-reviewer unavailable, A5): 4 literal hex colors in
src/ui/Button.tsx (pressed shades) and src/ui/Segmented.tsx (track); `ui` + legacy color names in theme.ts were kept
only so pre-redesign screens compiled mid-run — their last user is `ui.screen` in App.tsx; Button `compact` has no callers.

## Write-set
- modify: src/ui/theme.ts
- modify: src/ui/Button.tsx
- modify: src/ui/Segmented.tsx
- modify: App.tsx
- modify: docs/DESIGN.md

## Steps
1. theme.ts: add `blueSoftPressed '#D9E4FF'`, `redPressed '#B0222A'`, `greenPressed '#086246'`, `track '#E8ECF3'` to the
   palette; remove the legacy aliases (card, border, text, muted, primary, danger, success, warning) and the `ui` export.
2. Button.tsx / Segmented.tsx: use those tokens; remove the `compact` prop.
3. App.tsx: local StyleSheet `screen: { flex: 1, backgroundColor: colors.bg }` instead of `ui.screen`.
4. DESIGN.md token table: add the pressed shades and track.

## Verify
```bash
npm run typecheck
npm run lint
npx jest --ci --silent
test -z "$(grep -rnE '#[0-9A-Fa-f]{6}' src --include=*.tsx)"
```

## Done when
- [ ] Verify passes; no hex color literal in any .tsx under src

## Out of scope
- Any visual change.

## Notes
