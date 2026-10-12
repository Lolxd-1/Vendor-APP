# ORCHESTRATOR STATE
<!-- Source of truth for this run. Any agent or tool resuming work reads this first. -->
run: vendor-app-v2
owner: omkarkudke@gmail.com
branch: orch/vendor-app-v2
run-base: ebd3bf3f686da0548b065e53bb9b9ff349a7f6f7
status: executing
updated: 2026-10-12T06:50:48Z · Claude Code / claude-opus-5-5
<!-- status: recon | planning | awaiting-approval | executing | integrating | done | blocked -->

## NEXT ACTION
Owner approved M1 (2026-10-12). T00 (orchestrator does it: npm pack lucide-static
into the scratchpad, rebuild the icon font only), then dispatch T01..T07 one at a time in the main checkout.

## Baseline
At ebd3bf3: typecheck, lint, jest 95/95, android bundle all PASS. The FIRST jest run after npm ci timed out 2 tests
(cold Babel cache: shell.test, orders.test); warm reruns pass. Kotlin: `gradlew testDebugUnitTest` PASS with
JAVA_HOME=C:/Users/omkar/Downloads/quickverse-web-vendor-dashboard-dev/.tools/jdk17 and
ANDROID_HOME=C:/Users/omkar/AppData/Local/Android/Sdk (needed from M3 on).

## Tasks
- [x] T00 Icon font: search, calendar, chevron-down, hourglass — w0 — done 4e6bd5a..1c13b2a (gate PASS)
- [x] T01 Domain: order fields, period, payout, timeline — w1 — done 1333037..b598625 (gate PASS)
- [~] T02 API: CUSTOM range + getAllOrders — w2 — deps T01 — base=PENDING attempt=1
- [ ] T03 SearchField, CalendarRange, PeriodSheet — w3 — deps T00 T01
- [ ] T04 Order details page — w4 — deps T00 T01
- [ ] T05 History redesign — w5 — deps T02 T03
- [ ] T06 Earnings screen — w6 — deps T00 T01 T02
- [ ] T07 Shell: 5 tabs, order page, wiring — w7 — deps T04 T05 T06
<!-- one line per task, starting at column 0 with "- [". orch.sh dispatch, gate, review, accept and merge
  maintain the status and the key=value fields; edit by hand only to add tasks, or to mark [!] or [-]. -->

## Open questions
- Owner to confirm M1 examples E1–E8 (PLAN.md).
- Read-only shape check was blocked by the auto-mode classifier; the owner may run
  scratchpad/shape-check.mjs to confirm `finance` / `completedDate` on the vendor order list.
