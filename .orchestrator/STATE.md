# ORCHESTRATOR STATE
<!-- Source of truth for this run. Any agent or tool resuming work reads this first. -->
run: vendor-ui-v1
branch: dev-v1.0
run-base: ab92e97aaff47df88ffc7f6db17a8e60b5999492
status: executing
updated: 2026-10-06 · Claude Code / claude-opus-5-5
<!-- status: executing | planning | awaiting-approval | executing | integrating | done | blocked -->

## NEXT ACTION
Phase 3: T05 in progress (Orders + OrderCard). Then T06.

## Baseline
verify-all @ab92e97: typecheck PASS, lint PASS, jest 17/17 PASS (3 suites), android JS bundle PASS. No pre-existing failures.

## Tasks
- [x] T01 Design system: fonts, icon font, tokens, UI kit — w1 — done c9fcd61..add0fd1 (gate PASS)
- [x] T02 Domain + API for stats/history/schedule — w1 — done 336338d..dac07f7 (gate PASS)
- [x] T03 Hooks: useRemote, useStoreStatus, useShopProfile — w2 — deps T02 — done 1225adf..26a1a4c (gate PASS)
- [x] T04 App shell, tab bar, back handling, Login redesign — w3 — deps T01 T03 — done 80d79a2..5e8709e (gate PASS)
- [~] T05 Orders screen, OrderCard, RejectSheet, StoreSwitch — w4 — deps T04 — agent=orchestrator attempt=1
- [ ] T06 History + OrderDetailsSheet — w5 — deps T04
- [ ] T07 Insights — w6 — deps T04
- [ ] T08 Account, Store timings, Order alerts — w7 — deps T04
- [ ] T09 Integrate: verify-all, AC1 diff, docs — w8 — deps T05-T08
<!-- one line per task, starting at column 0 with "- [", e.g.
  - [x] T01 Add Money type — w1 — done 1a2b3c4..5d6e7f8 (gate PASS)
  - [~] T02 Parse amounts — w2 — base=5d6e7f8 agent=<id> attempt=1
  - [ ] T03 Wire checkout — w3 — deps T02
  - [!] T04 Refund flow — blocked: <reason>
  - [-] T05 Legacy export — dropped: <ruling>
-->

## Open questions
- none blocking. Carried from vendor-app-v1: real counter-phone test (Xiaomi/Oppo/Vivo/Realme), release keystore,
  backend VENDOR push + Firebase app registration, Handover-at-rider-arrival live test.
- User to test live: Online/Offline switch and Store timings save (Claude must not write to prd).
