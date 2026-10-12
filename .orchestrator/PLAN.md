# PLAN: M1 — History redesign, Order details (timeline + payout), Earnings tab
run: vendor-app-v2 · branch: orch/vendor-app-v2 · base: ebd3bf3f686da0548b065e53bb9b9ff349a7f6f7 · created: 2026-10-12T06:01:41Z
Milestone 1 of 6 (docs/ROADMAP.md). M2–M6 are planned as their own runs after this one merges.

## Requirement (verbatim, condensed from the user's messages of 2026-10-12)
> 3. Third but small feature. I have seen this, in zomato's app. Order payout per order wise. along with the timeline.
> order placed by cusotmer, it got assigned then accepted, the timeline with proper time and the time in between them.
> if there is delay on the preaparation, it should be there as well. etc etc. and then the final amount for that
> specific amount. I have screenshot of the order wise details on earning part of them. the earning should be proper
> and maintained. really well.
> 4. Redesign our History page as well. it should be proper. and free of bugs. shouldn't have any text or alignment
> issues. should be industry standard. search the best practices.
> (Payout question) What does QuickVerse deduct from the vendor on a delivered order? -> "Commission only"
> Many api calls are sensitive ... Use the apis where it is required. we don't want any sloppy and unnecssary code.

## Plain-language summary
History becomes searchable, gets a date picker (Today, Yesterday, Last 7 days, This month, Last month, any dates),
groups orders by day with totals, and every row keeps its text on clean single lines. Tapping an order opens a full
page: its timeline (placed → accepted → food ready, on time or how late → delivered) and what the shop earns from it
(gross − commission = net). A new Earnings tab shows this week's payout (paid the next Monday, same rule as the PC
dashboard) and each delivered order like the Zomato screenshot. Ringing, accepting and the native engine do not
change. If QuickVerse does not send the real commission, the app says "estimated (10%)". Undo: don't merge the branch.

## Goal
Ship a Zomato-grade History, Order details and Earnings experience using only the existing read-only order endpoint.

## Examples (to be confirmed by the requester)
| # | Situation | Today | After this change |
|---|---|---|---|
| E1 | Vendor opens History | flat list, two rows of chips, amount and status squeezed on the right | search box; one row with a date button and status chips; orders under "Today · 18 orders · ₹4,560 delivered"; each row: id + amount on line 1, time + customer + status on line 2, items on line 3, nothing wraps |
| E2 | Vendor types "4815438" | no search | only orders whose id (or customer name) contains it |
| E3 | Vendor picks "Last 7 days", then "Rejected" | only Today / This week / This month | rejected orders of the last 7 days, grouped by day; any dates via the calendar |
| E4 | Vendor taps a delivered order | small sheet with the bill | full page: Placed 7:38 pm → Accepted 7:39 pm ("took 1 min to accept") → Food ready 7:55 pm ("cooked in 16 min · 1 min late" in red, promised 15) → Delivered; bill; payout "Gross revenue ₹245 · Commission (10%, estimated) −₹24.50 · Net receivable ₹220.50 · To be paid" |
| E5 | Vendor opens Earnings | no such screen | "This week 12 Oct – 18 Oct · Payout on Mon, 19 Oct", Net receivable, Gross, Commission, To be paid, Settled; delivered orders as cards like the screenshot; ‹ goes to last week |
| E6 | (must not change) a new order arrives while an order page or Earnings is open | jumps to Orders > New and rings | still jumps to Orders > New (the order page closes) and rings exactly as before |
| E7 | (unhappy) no internet on History or Earnings | History shows error + Try again | both show "Couldn't load …" + Try again; nothing crashes; no half-loaded week shown as complete |
| E8 | An order where QuickVerse sent the commission | — | "Commission (8%)" with the backend amount, no "estimated" |

## Non-goals
- Any change under `android/`, `specs/`, `src/native/`, or to accept/reject/ready/handover behavior.
- New endpoints or calls to `GET /quickVerse/v2/order/{id}` (unverified for the vendor app; revisit after the shape check).
- Vendor-editable commission %, CSV/PDF export (M5), printing (M3), analytics (M5), store hours (M6).
- New npm dependencies (no date-picker, list or chart libraries).

## Acceptance criteria
- AC1 History rows and groups: default Today + All; first request `getOrdersPage(shopId, { statuses: [], timeRange: 'TODAY', page: 0 })`; sticky day headers ("Today", "Yesterday", "Mon, 6 Oct"; unreadable time -> "Earlier") with "N orders · ₹X delivered" (sum of `amountExcludingDeliveryFee` of COMPLETED in that group); row = `#id` + amount (line 1), time · customer + status pill (line 2), items (line 3), every text single-line; a11y label `Order <id>, <status>, <amount>` (E1)
- AC2 History period: a period button (label of the current period) opens "Show orders from": Today, Yesterday, Last 7 days, This month, Last month, Custom dates; picking reloads page 0 with `queryOf(period)` and the current status; custom dates via a calendar (future days disabled, reversed picks swapped) send CUSTOM `fromTime 'YYYY-MM-DDT00:00:00'`, `toTime 'YYYY-MM-DDT23:59:59'` (E3)
- AC3 History status chips All / Delivered / On the way / Rejected / Cancelled -> [] / COMPLETED / IN_TRANSIT / REJECTED / CANCELLED, reload page 0 (unchanged mapping) (E3)
- AC4 History search filters loaded orders by id or customer name (case-insensitive, trimmed); "No orders match …" empty state with a "Search older orders" button while more pages exist (E2)
- AC5 History paging and states: infinite scroll, duplicate ids dropped, pull-to-refresh, loading skeleton, "No orders in this period", error with "Try again" (first page and later pages); answers to superseded requests are ignored (E7)
- AC6 Tapping a History row calls `onOpenOrder(order)` (E4)
- AC7 Order details page per `timelineOf` and `payoutOf`: back button, status pill (+ Settled / To be paid for delivered), date · payment · customer, timeline with times and details, items `n × name` with line prices and "Items total", payout block (delivered) or "No payout for this order" (rejected/cancelled) or "Payout after delivery" (in progress), customer note, rider with Call (E4, E8)
- AC8 Earnings tab: current Mon–Sun week, label + range + "Payout on Mon, 19 Oct"; ‹ › week navigation (› off on the current week); data `getAllOrders(shopId, { statuses: ['COMPLETED'], ...rangeQuery(week) })`; summary (Net receivable, Gross revenue, Commission, To be paid, Settled, order count), estimated note, order cards like the screenshot with Details -> `onOpenOrder`; empty, error + Try again, "Showing the first 1,000 orders of this week" when capped; reloads when the tab is opened and on pull (E5, E7)
- AC9 Shell: tabs Orders · History · Earnings · Insights · Account; opening an order shows the Order details page without the tab bar; Android back closes it; a newly arrived pending order closes it and shows Orders > New (E6)
- AC10 Nothing else changes: all existing tests pass except the one History test this plan rewrites (ruling R-H1); `git diff ebd3bf3 -- android specs src/native src/api/client.ts` is empty (E6)
- AC11 `orch.sh verify-all` passes (typecheck, lint, jest, Android JS bundle)

## Assumptions
- A1 Vendor orders carry `isSettled` (the PC dashboard's type has it); missing -> "To be paid" · asked: no
- A2 `finance`, `completedDate`, `rejectedDate` may be absent on the vendor list; everything degrades (times "—", commission estimated). A read-only shape check was blocked by the safety classifier; the user can run it · asked: yes (pending)
- A3 Estimated commission = 10% (PC dashboard default; admin pricing default for food) · asked: yes ("commission only")
- A4 Settlement week Mon 00:00 – next Mon 00:00, paid that Monday, bucketed by `creationTime` (PC dashboard rule) · asked: no
- A5 English, light theme · asked: no

## Context map
- `src/app/MainShell.tsx` — tabs + page stack, back handling, "new pending -> Orders > New" (MainShell.tsx:67-76); hot file, T07 only
- `src/app/TabBar.tsx` — the 4 tabs (TABS at :9)
- `src/screens/HistoryScreen.tsx` — today's History (chips, FlatList, request-id guard :47-68); rewritten by T05
- `src/components/OrderDetailsSheet.tsx` — old bill sheet, used only by HistoryScreen; deleted by T05
- `src/screens/InsightsScreen.tsx` — pattern for "reload when tab becomes active" (:22-27) and `useRemote`
- `src/api/endpoints.ts` — `getOrdersPage` (:61); append-only except the CUSTOM params
- `src/domain/*` — format (money, clockTime, dayTime, minutesLabel, paymentLabel, historyStatusInfo, itemsSummary), time (parseServerTime), history (mergeOrders), order types
- `src/ui/*` — Txt, Icon (+iconMap), Button, Chip, StatusPill, Sheet, Group/Row, LargeHeader, EmptyState, theme tokens
- Web reference (read-only): Vendor-Dashboard `src/utils/analytics/{period,commission,report}.ts` (settlement week, paise rounding), `src/pages/OrderHistory.tsx:31` (CUSTOM time format)
Flow: Screen -> `getOrdersPage`/`getAllOrders` (GET /quickVerse/v2/order/{shopId}/orders) -> domain (`payoutOf`, `timelineOf`, `queryOf`) -> UI. MainShell owns navigation; History/Earnings call `onOpenOrder`; MainShell pushes page 'order'.
Reuse: `src/domain/format.ts:15 money`, `:31 clockTime`, `:40 dayTime`, `:51 minutesLabel`, `:59 paymentLabel`, `:85 historyStatusInfo`, `:91 itemsSummary`; `src/domain/time.ts:3 parseServerTime`; `src/domain/history.ts:4 mergeOrders`; `src/hooks/useRemote.ts:10 errorText`, `:18 useRemote`; `src/ui/Sheet.tsx`, `src/ui/List.tsx Group/Row`, `src/ui/Badge.tsx StatusPill`.
Recon notes: .orchestrator/recon/ (analytics.md has the PC dashboard's money/period rules).

## Decisions
- D1 Earnings is a 5th tab — why: earnings is a vendor's top question; Zomato's Payouts is top-level — rejected: a page under Insights (two taps, hidden)
- D2 Order details is a page on MainShell's stack, not a Modal — why: the new-order rule clears the stack; a Modal would stay on top of Orders > New (E6)
- D3 Payout = gross − commission (user: commission only); gross = `amountExcludingDeliveryFee` (same as the PC); commission = `finance.commission` when it is a number 0..gross, else 10% estimate in whole paise (PC formula) — rejected: vendor-typed % (needs persistence; a guess either way)
- D4 Period queries: Today and This month use backend presets TODAY / THIS_MONTH; all others CUSTOM with local `YYYY-MM-DDTHH:mm:ss` (PC format) — why: preset meanings for the rest are unknown; CUSTOM is explicit
- D5 Earnings fetches only COMPLETED orders of one week, at most 20 pages (1,000 orders), on open / refresh / week change, never on a timer — why: sensitive production backend
- D6 Sequential execution in the main checkout — why: a cold Jest cache in a fresh worktree timed out 2 tests in the baseline; MainShell is a hot file; waves are small
- D7 New icons (search, calendar, chevron-down, hourglass) are cut into QVIcons.ttf by T00 before any screen task

## Global constraints
- Conventions: functional components, `StyleSheet.create`, named exports, 2-space indent, single quotes, semicolons;
  all text through `<Txt variant>`; colors/spacing/radii only from `src/ui/theme.ts` (no hex in screens); every
  single-line text sets `numberOfLines={1}`; money uses `tabular` and its container `flexShrink: 0`; text columns in
  rows use `flex: 1, minWidth: 0`; touch targets ≥ 44 dp; icon-only buttons have `accessibilityLabel`; copy in
  sentence case; comments explain why, never what.
- Forbidden: new dependencies; edits to `android/**` (except T00's font file), `specs/**`, `src/native/**`,
  `src/api/client.ts`; changing existing endpoint functions other than T02's additive CUSTOM params; weakening or
  deleting existing tests (except ruling R-H1); network calls in tests; timers that poll the backend.
- Platform: React Native 0.81.4, React 19.1, TypeScript 5.8, Jest 29 (preset react-native, react-test-renderer),
  Node ≥ 20, Android only.

## Verify (global)
```bash
npm run typecheck
npm run lint
npx jest --ci --silent
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output "${TMPDIR:-/tmp}/qv-verify.bundle" --assets-dest "${TMPDIR:-/tmp}/qv-verify-assets" > /dev/null
```

## Verify (per task)
```bash
npm run typecheck
npm run lint
npx jest --ci --silent
```

## Contracts
```text
# src/domain/order.ts (additive)
export interface OrderFinance { commission?: number; commissionRate?: number }
Order gains optional: finance?: OrderFinance | null; completedDate?: string | null; rejectedDate?: string | null;
  isSettled?: boolean
export type TimeRange = 'TODAY' | 'LAST_WEEK' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM'

# src/domain/period.ts (new) — all dates local time; ranges are half-open [start, end)
export interface Range { start: Date; end: Date }
export type PresetKey = 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'LAST_MONTH'
export const PRESETS: readonly { key: PresetKey; label: string }[]
     // Today, Yesterday, Last 7 days, This month, Last month (in that order)
export interface Period { key: PresetKey | 'CUSTOM'; label: string; range: Range }
export const startOfDay: (d: Date) => Date
export const addDays: (d: Date, days: number) => Date
export const presetPeriod: (key: PresetKey, now: Date) => Period
export const customPeriod: (a: Date, b: Date) => Period      // whole days a..b inclusive (swapped if b < a); label = rangeLabel
export const settlementWeek: (now: Date, offset: number) => Range // Monday 00:00 of now's week + offset weeks; end = start + 7 days
export const toBackendTime: (d: Date) => string               // 'YYYY-MM-DDTHH:mm:ss'
export interface OrdersQuery { timeRange: TimeRange; fromTime?: string; toTime?: string }
export const queryOf: (p: Period) => OrdersQuery              // TODAY -> {timeRange:'TODAY'}; THIS_MONTH -> {timeRange:'THIS_MONTH'}; else rangeQuery(p.range)
export const rangeQuery: (r: Range) => OrdersQuery            // {timeRange:'CUSTOM', fromTime: toBackendTime(start), toTime: toBackendTime(end − 1 s)}
export const dayLabel: (d: Date) => string                    // 'Mon, 13 Oct'
export const rangeLabel: (r: Range) => string                 // '6 Oct – 12 Oct'; one day -> '6 Oct'; years differ -> '29 Dec 2025 – 4 Jan 2026'

# src/domain/payout.ts (new)
export const DEFAULT_COMMISSION_PCT = 10
export interface Payout { gross: number; commission: number; net: number; pct: number; estimated: boolean; settled: boolean }
export const commissionAt: (gross: number, pct: number) => number   // Math.round(Math.round(gross * 100) * pct / 100) / 100
export const payoutOf: (o: Order) => Payout | null                  // null unless state is COMPLETED and gross is a finite number ≥ 0
export interface PayoutSummary { orders: number; gross: number; commission: number; net: number; settled: number; toBePaid: number; estimated: boolean }
export const summarize: (orders: Order[]) => PayoutSummary

# src/domain/timeline.ts (new)
export type StepKey = 'placed' | 'accepted' | 'ready' | 'onTheWay' | 'delivered' | 'rejected' | 'cancelled'
export interface Step { key: StepKey; title: string; at: number | null; done: boolean; detail: string | null; tone: 'neutral' | 'green' | 'red' }
export const timelineOf: (o: Order) => Step[]

# src/api/endpoints.ts
export interface OrdersFilter { statuses?: HistoryStatus[]; timeRange?: TimeRange; fromTime?: string; toTime?: string }
export interface OrdersPage { orders: Order[]; totalPages: number; totalElements?: number }
export const getOrdersPage: (shopId: string, f: OrdersFilter & { page: number }) => Promise<OrdersPage>
     // query keys: orderStatus (repeated, omitted when empty), timeRange, fromTime + toTime only when timeRange === 'CUSTOM', page
export const getAllOrders: (shopId: string, f: OrdersFilter, maxPages?: number) => Promise<{ orders: Order[]; complete: boolean }>
     // maxPages default 20

# UI
src/ui/SearchField.tsx        export const SearchField: (p: { value: string; onChange: (v: string) => void; placeholder: string }) => JSX
src/ui/CalendarRange.tsx      export const CalendarRange: (p: { first: Date | null; last: Date | null; today: Date; onPick: (first: Date | null, last: Date | null) => void }) => JSX
src/components/PeriodSheet.tsx export const PeriodSheet: (p: { visible: boolean; value: Period; now: Date; onChange: (p: Period) => void; onClose: () => void }) => JSX
src/screens/OrderDetailsScreen.tsx export const OrderDetailsScreen: (p: { order: Order; onBack: () => void }) => JSX
src/screens/HistoryScreen.tsx      export const HistoryScreen: (p: { shopId: string; onOpenOrder: (o: Order) => void }) => JSX
src/screens/EarningsScreen.tsx     export const EarningsScreen: (p: { shopId: string; active: boolean; onOpenOrder: (o: Order) => void }) => JSX
src/app/MainShell.tsx  export type TabKey = 'orders' | 'history' | 'earnings' | 'insights' | 'account'
                       export type PageKey = 'timings' | 'alerts' | 'order'   (backAction unchanged)
Strings kept for existing tests: 'Send OTP', 'Shop #', 'No new orders', 'No orders in this period', 'Try again',
  'Items total', '2 × Veg Biryani' (n × name item lines), chip labels All/Delivered/On the way/Rejected/Cancelled.
```

## Risks
| R | Scenario | Mitigation | Covering test (task) |
|---|---|---|---|
| R1 | Fast filter/search/period changes mix pages of two filters | request-id guard kept; `mergeOrders` dedupe | history.test :: ignores an answer to an older filter (T05) |
| R2 | Unreadable `creationTime` crashes grouping or sorts wrongly | group "Earlier", keep server order | history.test :: unreadable times go to Earlier (T05) |
| R3 | Float money (98.01 × 10%) shows ₹9.8000001 | whole-paise rounding, `round2` everywhere | payout.test :: rounds commission to whole paise (T01) |
| R4 | Estimated commission presented as fact | "estimated" on every estimated figure + note | payout.test, earnings.test, order-details.test (T01/T06/T04) |
| R5 | Earnings hammers the backend | COMPLETED only, ≤ 20 pages, no timers | api.test :: getAllOrders stops at maxPages (T02); earnings.test :: one load per week (T06) |
| R6 | Order page stays open when a new order arrives | page on MainShell stack, cleared by the existing rule | shell.test :: a new order closes the order page (T07) |
| R7 | Custom range boundaries off by a day / timezone | local time, end − 1 s | period.test :: custom range and backend times (T01) |
| R8 | Text overflow or misalignment (user's complaint) | single-line texts, `flexShrink: 0` money, `minWidth: 0` columns | review + emulator screenshots (Phase 4) |
| R9 | Settlement week wrong on Sunday night / Monday 00:00 | explicit tests | period.test :: settlement week edges (T01) |
| R10 | Late/on-time rule disagrees with the vendor's view | promised = `preparationTime`; late only from 1 full minute | timeline.test :: late by whole minutes (T01) |
| R11 | Deleting OrderDetailsSheet breaks an importer | only HistoryScreen imports it (grep) | typecheck (T05) |
| R12 | Calendar lets a future day or a reversed range through | future disabled; swap | period-sheet.test (T03) |

## Test matrix
| AC or R | Test (file :: name) | Task |
|---|---|---|
| AC2, R7, R9 | __tests__/period.test.ts :: presets, custom range and backend times, settlement week edges, labels | T01 |
| AC7, AC8, R3, R4 | __tests__/payout.test.ts :: backend commission, estimated 10%, rounds commission to whole paise, summary | T01 |
| AC7, R10 | __tests__/timeline.test.ts :: delivered on time, late by whole minutes, rejected, cancelled, in progress, missing times | T01 |
| AC2, AC8, R5 | __tests__/api.test.ts :: CUSTOM sends fromTime and toTime, presets send no times, getAllOrders merges pages, stops at maxPages | T02 |
| AC2, R12 | __tests__/period-sheet.test.tsx :: presets, calendar picks, future disabled, reversed swap, search field clear | T03 |
| AC7, R4 | __tests__/order-details.test.tsx :: timeline, bill, payout states, note and rider | T04 |
| AC1–AC6, R1, R2, R11 | __tests__/history.test.tsx :: existing 4 kept + groups, period, search, open order, stale answer | T05 |
| AC8, R4, R5 | __tests__/earnings.test.tsx :: summary, cards, week navigation, empty, error, capped | T06 |
| AC9, R6, AC10 | __tests__/shell.test.tsx :: five tabs, opens order page, back closes it, new order closes it | T07 |
| AC10, AC11 | verify-all + `git diff ebd3bf3 -- android specs src/native src/api/client.ts` (fonts excepted) | Phase 4 |

## Task DAG
| ID | Title | Deps | Wave | Write-set | Risk | Model | Oracle |
|---|---|---|---|---|---|---|---|
| T00 | Icon font: search, calendar, chevron-down, hourglass | — | 0 | scripts/make-fonts.py, android/app/src/main/assets/fonts/QVIcons.ttf, src/ui/iconMap.ts | low | orchestrator | none |
| T01 | Domain: order fields, period, payout, timeline | — | 1 | src/domain/order.ts, src/domain/period.ts, src/domain/payout.ts, src/domain/timeline.ts, __tests__/period.test.ts, __tests__/payout.test.ts, __tests__/timeline.test.ts | med | sonnet | fail-before |
| T02 | API: CUSTOM range + getAllOrders | T01 | 2 | src/api/endpoints.ts, __tests__/api.test.ts | med | sonnet | fail-before |
| T03 | SearchField, CalendarRange, PeriodSheet | T00 T01 | 3 | src/ui/SearchField.tsx, src/ui/CalendarRange.tsx, src/components/PeriodSheet.tsx, __tests__/period-sheet.test.tsx | med | sonnet | fail-before |
| T04 | Order details page | T00 T01 | 4 | src/screens/OrderDetailsScreen.tsx, __tests__/order-details.test.tsx | med | sonnet | fail-before |
| T05 | History redesign | T02 T03 | 5 | src/screens/HistoryScreen.tsx, src/components/OrderDetailsSheet.tsx (delete), __tests__/history.test.tsx | med | sonnet | fail-before |
| T06 | Earnings screen | T00 T01 T02 | 6 | src/screens/EarningsScreen.tsx, __tests__/earnings.test.tsx | med | sonnet | fail-before |
| T07 | Shell: 5 tabs, order page, wiring | T04 T05 T06 | 7 | src/app/MainShell.tsx, src/app/TabBar.tsx, __tests__/shell.test.tsx | high | opus | fail-before |
(Sequential, one executor at a time in the main checkout — D6. Ruling R-H1: T05 rewrites the History test "tapping
an order opens its bill" into "tapping an order opens its page" because the bill moves to the Order details page;
T04 keeps its two assertions 'Items total' and '2 × Veg Biryani'.)

## Release and approval
- Risk tier: med (T07 high: navigation next to the new-order rule). High-risk paths (orch.sh risk): none expected.
  Code-owner approval: the owner reviews the branch before merging.
- Release: no flag — read-only screens over an existing GET endpoint; the ringing engine is untouched.
- Data: none.

## Rollback
Everything is on `orch/vendor-app-v2`; `master` is untouched. Undo = don't merge, or revert the task commits. No
backend, native or data changes; the only binary change is the icon font (old glyphs keep their names).
