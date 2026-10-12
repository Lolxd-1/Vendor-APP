# ORCHESTRATOR STATE
<!-- Source of truth for this run. Any agent or tool resuming work reads this first. -->
run: vendor-app-v2
owner: omkarkudke@gmail.com
branch: orch/vendor-app-v2
run-base: ebd3bf3f686da0548b065e53bb9b9ff349a7f6f7
status: done
updated: 2026-10-12T07:19:00Z · Claude Code / claude-opus-5-5
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
- [x] T02 API: CUSTOM range + getAllOrders — w2 — deps T01 — done 40aede8..fa27d89 (gate PASS)
- [x] T03 SearchField, CalendarRange, PeriodSheet — w3 — deps T00 T01 — done e0955a0..fe006f2 (gate PASS)
- [x] T04 Order details page — w4 — deps T00 T01 — done d5f9370..744165a (gate PASS)
- [x] T05 History redesign — w5 — deps T02 T03 — done 3fd0f87..282f152 (gate PASS)
- [x] T06 Earnings screen — w6 — deps T00 T01 T02 — done 5addc16..81108ab (gate PASS)
- [x] T07 Shell: 5 tabs, order page, wiring — w7 — deps T04 T05 T06 — done ecb005a..f4646a3 (gate PASS, review APPROVE)
- [x] FIX1 Final-review fixes (Earnings week data, reloads, polish) — w8 — deps T07 — done c7987e7..3aa411c (gate PASS)
<!-- one line per task, starting at column 0 with "- [". orch.sh dispatch, gate, review, accept and merge
  maintain the status and the key=value fields; edit by hand only to add tasks, or to mark [!] or [-]. -->

## Acceptance walk (2026-10-12)
- AC1 history.test: loads today's orders… / groups orders by day with totals / unreadable times go to Earlier
- AC2 period.test (presets, custom range, backend times) + period-sheet.test (7) + history.test: a period from the sheet reloads with its query + api.test: CUSTOM sends fromTime and toTime
- AC3 history.test: a status chip reloads from page 0 with that status · AC4 history.test: search filters… / no search match offers older orders
- AC5 history.test: an empty period / an error offers a retry / ignores an answer to an older filter / later page error / failed pull-to-refresh retries page 0
- AC6 history.test: tapping an order opens its page · AC7 order-details.test (8) + timeline.test + payout.test
- AC8 earnings.test (11 incl. switching weeks never shows the previous week's numbers) + api.test getAllOrders (4)
- AC9 shell.test: shows five tabs / opens an order from History and goes back / a new order closes the order page / returning … does not reload Earnings
- AC10 git diff ebd3bf3 -- android specs src/native src/api/client.ts = QVIcons.ttf only (planned, T00) · AC11 verify-all PASS, jest 161/161, bundle OK
- Device look: release APK built (arm64) at android/app/build/outputs/apk/release/app-release.apk; on-phone check with a real login is the owner's (OTP); emulator could not start (4 GB free RAM needed, 615 MB free)

## Open questions
- Owner to confirm M1 examples E1–E8 (PLAN.md).
- Read-only shape check was blocked by the auto-mode classifier; the owner may run
  scratchpad/shape-check.mjs to confirm `finance` / `completedDate` on the vendor order list.
