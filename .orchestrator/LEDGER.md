# LEDGER (append-only, one line per event)
<!-- format: - <UTC time> <event>. Rulings: "Ruling: <decision> — <why> — <cost if wrong>" -->
- 2026-10-12T06:01:41Z init run=vendor-app-v2 branch=orch/vendor-app-v2 base=ebd3bf3 owner=omkarkudke@gmail.com
- 2026-10-12 Ruling: size L -> 6 milestones (docs/ROADMAP.md); this run = M1 (History, Order details, Earnings) — why: each milestone ends green and is reviewable alone — cost if wrong: re-plan order of milestones
- 2026-10-12 Ruling: payout = gross − commission only (owner answer); commission from finance.commission when present else 10% estimate labelled "estimated" — why: owner rule + PC dashboard default — cost if wrong: one constant
- 2026-10-12 Ruling: no calls to GET /quickVerse/v2/order/{id} in M1 — why: vendor-origin access unverified; production read check blocked by classifier — cost if wrong: completed/rejected times show "—" until a later task adds it
- 2026-10-12 Ruling: sequential execution, no worktrees — why: cold jest cache in fresh worktrees timed out 2 tests at baseline; MainShell hot file — cost if wrong: ~45 min wall-clock
- 2026-10-12 Ruling R-H1: T05 rewrites history test "tapping an order opens its bill" into "opens its page"; T04 keeps 'Items total' and '2 × Veg Biryani' — why: bill moves to the Order details page — cost if wrong: none
- 2026-10-12 Ruling: auto-accept + PC sync designed in docs/AUTO-ACCEPT.md before any code (owner asked for full logic cases first) — cost if wrong: design revision before M2/M4
- 2026-10-12 plan written: M1 = 8 tasks (T00 orchestrator + T01–T07), 11 ACs, 12 risks; status awaiting-approval
- 2026-10-12T06:44:36Z owner approved M1 plan (examples E1–E8); status executing
- 2026-10-12T06:44:37Z dispatch T00
- 2026-10-12T06:46:09Z gate T00 FAIL (tamper missing-test) head=50bd8e4
- 2026-10-12T06:46:24Z gate T00 FAIL (tamper missing-test) head=50bd8e4
- 2026-10-12T06:46:46Z Ruling T00: brief TC1 named a non-existent test; corrected to 'Icon draws its glyph from the icon font'; report commit re-made without the reserved chore(orch) prefix — cost if wrong: none
- 2026-10-12T06:47:35Z gate T00 PASS 4e6bd5a..1c13b2a
- 2026-10-12T06:47:40Z dispatch T01
