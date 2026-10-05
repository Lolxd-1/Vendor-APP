# ORCHESTRATOR STATE
<!-- Source of truth for this run. Any agent or tool resuming work reads this first. -->
run: vendor-ui-v1
branch: dev-v1.0
run-base: ab92e97aaff47df88ffc7f6db17a8e60b5999492
status: done
updated: 2026-10-06 · Claude Code / claude-opus-5-5
<!-- status: done | planning | awaiting-approval | executing | integrating | done | blocked -->

## NEXT ACTION
Code complete and gated on dev-v1.0 (main untouched). Needs the user / a device:
1. Build + look on the emulator/phone (README "Windows: build from a short path" needs `subst Q:` — user's OK).
2. On a TEST shop only: Online/Offline switch, Store timings save, History/Insights numbers vs web dashboard.
3. Carried from vendor-app-v1: real counter phone (Xiaomi/Oppo/Vivo/Realme), release keystore, backend VENDOR push.
4. Merge dev-v1.0 into main / push to GitHub: user's call (never done by Claude).

## Baseline
verify-all @ab92e97: typecheck PASS, lint PASS, jest 17/17 PASS (3 suites), android JS bundle PASS. No pre-existing failures.

## Tasks
- [x] T01 Design system: fonts, icon font, tokens, UI kit — w1 — done c9fcd61..add0fd1 (gate PASS)
- [x] T02 Domain + API for stats/history/schedule — w1 — done 336338d..dac07f7 (gate PASS)
- [x] T03 Hooks: useRemote, useStoreStatus, useShopProfile — w2 — deps T02 — done 1225adf..26a1a4c (gate PASS)
- [x] T04 App shell, tab bar, back handling, Login redesign — w3 — deps T01 T03 — done 80d79a2..5e8709e (gate PASS)
- [x] T05 Orders screen, OrderCard, RejectSheet, StoreSwitch — w4 — deps T04 — done b9b88e2..362b6a7 (gate PASS)
- [x] T06 History + OrderDetailsSheet — w5 — deps T04 — done abb7e34..3232b85 (gate PASS)
- [x] T07 Insights — w6 — deps T04 — done ca876a0..de1c0b0 (gate PASS)
- [x] T08 Account, Store timings, Order alerts — w7 — deps T04 — done d0a76bb..0210cd3 (gate PASS)
- [x] T09 Integrate: verify-all, AC1 diff, docs — w8 — deps T05-T08 — done df61c9a..5e896ef (gate PASS)
- [x] FIX1 Final-review cleanups (tokens, unused aliases) — w8 — done c73aa6b..baf2f07 (gate PASS)
<!-- one line per task, starting at column 0 with "- [", e.g.
  - [x] T01 Add Money type — w1 — done 1a2b3c4..5d6e7f8 (gate PASS)
  - [~] T02 Parse amounts — w2 — base=5d6e7f8 agent=<id> attempt=1
  - [ ] T03 Wire checkout — w3 — deps T02
  - [!] T04 Refund flow — blocked: <reason>
  - [-] T05 Legacy export — dropped: <ruling>
-->

## Acceptance walk (2026-10-06)
- AC1 engine diff empty (git diff ab92e97 -- android/app/src/main/java specs src/native src/api/client.ts) · AC2 orders.test call order + failure
- AC3/AC4 shell.test · AC5 orders.test header + schedule.test + hooks.test · AC6/AC7 orders.test · AC8 history.test + api.test
- AC9 insights.test · AC10/AC11/AC12 account.test + hooks.test(save keeps manualOffline) · AC13 shell.test login + App.test
- AC14 tokens/fonts: ui.test + FIX1 no-hex check; on-device look UNVERIFIED · AC15 verify-all PASS, jest 95/95, bundle OK

## Open questions
- none blocking. Carried from vendor-app-v1: real counter-phone test (Xiaomi/Oppo/Vivo/Realme), release keystore,
  backend VENDOR push + Firebase app registration, Handover-at-rider-arrival live test.
- User to test live: Online/Offline switch and Store timings save (Claude must not write to prd).
