# LEDGER (append-only, one line per event)
<!-- format: - <UTC time> <event>. Rulings: "Ruling: <decision> — <why> — <cost if wrong>" -->
- 2026-10-05T19:31:56Z init run=vendor-ui-v1 branch=dev-v1.0 base=ab92e97
- 2026-10-06 Ruling: branch named dev-v1.0 (user said 'Dev branch v1.0'; git forbids spaces) — why: closest valid name — cost if wrong: one git branch -m
- 2026-10-06 Ruling: previous run vendor-app-v1 marked done and archived — why: all 10 tasks [x] + emulator-verified; open items are device/backend, carried to STATE — cost if wrong: none (archive intact)
- 2026-10-06 Ruling: run autonomously without plan approval stop — why: user handed over the job ('now this is your Job') — cost if wrong: user redirects design after T01; rollback is git switch main
- 2026-10-06 Ruling: orchestrator executes briefs itself — why: orch-executor not registered in this session (started in parent folder); SKILL.md 'No subagents' path — cost if wrong: more main-session tokens
- 2026-10-06 Ruling: response shapes from web code, not live prd reads — why: production reads blocked by permission policy — cost if wrong: a field name mismatch shows '--' (parsers tolerant); user-run emulator test catches it
- 2026-10-06 Ruling: skip Menu/stock, payouts, ratings, complaints, support — why: no backend endpoints; faking would mislead vendors — cost if wrong: added later when endpoints exist
- 2026-10-06 Ruling: saveSchedule preserves manualOfflineOverride (web sends false) — why: web value would silently reopen a store — cost if wrong: none for vendors
- 2026-10-06 Ruling: Plus Jakarta Sans + Lucide icon font as bundled assets, zero npm deps — why: no native modules on a MAX_PATH-limited Windows build; brand-fit type — cost if wrong: swap TTFs
- 2026-10-06 plan written: 9 tasks, 15 ACs, 12 risks; status executing
- 2026-10-05T19:44:50Z dispatch T01 (self, A5)
- 2026-10-05T19:49:52Z T01 gate PASS c9fcd61..add0fd1; dispatch T02 (self)
- 2026-10-05T19:52:55Z T02 gate PASS 336338d..dac07f7; dispatch T03 (self)
- 2026-10-05T19:55:11Z T03 gate PASS 1225adf..26a1a4c; dispatch T04 (self)
- 2026-10-05T19:58:21Z Ruling: T04 high-risk review done by orchestrator (native-call parity check) — why: orch-reviewer not registered (A5) — cost if wrong: a moved subscription misbehaves; covered by shell.test + emulator test
- 2026-10-05T19:58:37Z T04 gate PASS 80d79a2..5e8709e; dispatch T05 (self)
