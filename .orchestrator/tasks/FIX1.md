# FIX1: Final-review fixes (Earnings week data, reloads, small polish)
Wave: 8 · Deps: T07 · Risk: med · Model: sonnet · Oracle: fail-before

## Goal
Every finding of `.orchestrator/reports/final-review.md` is fixed except Minor 5 and Minor 7 (rulings below):
Earnings never shows one week's money under another week's label, returning from an order page does not refetch
the week, and the listed polish items are done.

## Context
M1 final review. Read the findings file first; each item names files and lines. Earnings data comes from `useRemote`
(src/hooks/useRemote.ts), which keeps old `data` while a new request runs and after a failure — right for refreshing
the same week, wrong across weeks. The backend is production: Earnings may load only on tab open, pull and week change.

## Read first
- `.orchestrator/reports/final-review.md` (all findings)
- `src/screens/EarningsScreen.tsx`, `src/hooks/useRemote.ts`, `src/app/MainShell.tsx`
- `src/screens/HistoryScreen.tsx`, `src/screens/OrderDetailsScreen.tsx`, `src/components/PeriodSheet.tsx`, `src/ui/SearchField.tsx`
- `__tests__/earnings.test.tsx`, `__tests__/shell.test.tsx`, `__tests__/history.test.tsx`

## Write-set
- modify: src/screens/EarningsScreen.tsx
- modify: src/app/MainShell.tsx
- modify: src/screens/HistoryScreen.tsx
- modify: src/screens/OrderDetailsScreen.tsx
- modify: src/components/PeriodSheet.tsx
- modify: src/ui/SearchField.tsx
- test: __tests__/earnings.test.tsx
- test: __tests__/shell.test.tsx
- test: __tests__/history.test.tsx

## Steps
1. Critical 1: tag each Earnings result with its week (`getAllOrders(...).then(res => ({ ...res, offset }))`) and
   treat `data.offset !== offset` as no data (spinner while loading; "Couldn't load earnings" + Try again on error).
   Same-week reloads still keep the shown numbers.
2. Important 1: MainShell passes `active={nav.tab === 'earnings'}` (drop `&& !page`). Change nothing else there except
   the stale comment (Minor 9): it must say five tabs and list the timings, alerts and order pages.
3. Minor 1: `numberOfLines={1}` on every single-line text the finding lists (Earnings line labels and values, "Details",
   the History row amount, timeline step titles, period radio labels).
4. Minor 2: OrderDetailsScreen's estimated note uses `DEFAULT_COMMISSION_PCT` instead of a hard-coded 10.
5. Minor 3: the cap notice says "of this week" only when offset is 0, otherwise "of the week".
6. Minor 4: show the error and 'Showing the last numbers.' as two separate texts (no "..").
7. Minor 6: History remembers the mode and page of a failed request; the footer "Try again" retries that request
   (a failed pull-to-refresh retries page 0).
8. Minor 8: the SearchField clear button gets a 44×44 touch target.

## Test cases
- TC1 `test: switching weeks never shows the previous week's numbers`: week 0 resolves [A, B] (as in the existing earnings tests); next call returns a pending promise; press 'Previous week' -> '₹404.50' and 'ID: A' absent; reject it with ApiError('No connection to the server', null) -> "Couldn't load earnings" shown, '₹404.50' absent
- TC2 `test: returning from an order page does not reload Earnings` (shell.test): fetch answers '/orders' with one COMPLETED order created inside the current settlement week; open the Earnings tab, open that order, press 'Back' -> the number of fetch calls whose URL contains '/orders' is the same as before opening the order
- TC3 `test: past weeks say of the week when capped`: press 'Previous week' with { orders: [A], complete: false } -> 'Showing the first 1,000 orders of the week'
- TC4 `test: a failed refresh keeps the numbers and says so once`: week 0 loads [A, B]; reload (active false -> true) rejects ApiError('Try again.', 500) -> '₹404.50' still shown, 'Showing the last numbers.' shown, no text contains '..'
- TC5 `test: a failed pull-to-refresh retries page 0`: page 0 [A1], totalPages 2; call the list's RefreshControl `onRefresh` with getOrdersPage rejecting once; press 'Try again' -> the last call has page 0

## Verify
```bash
npx jest __tests__/earnings.test.tsx __tests__/shell.test.tsx __tests__/history.test.tsx --ci --verbose
npm run typecheck
npm run lint
npx jest --ci --silent
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output "${TMPDIR:-/tmp}/qv-verify.bundle" --assets-dest "${TMPDIR:-/tmp}/qv-verify-assets" > /dev/null
```

## Done when
- [ ] every test case above passes via Verify; all other existing tests unchanged and passing
- [ ] each finding except Minor 5 and Minor 7 is addressed (say which line fixed it in the report)

## Out of scope
- Minor 5 (labels across midnight) and Minor 7 (calendar restart vs swap): rulings, no code.
- Anything not named in the findings file.

## Notes
Ruling (Minor 5): date labels computed at mount are acceptable for M1; revisit with AppState in M5.
Ruling (Minor 7): restarting the range at an earlier tap is the intended T03 behavior; `customPeriod` still swaps.
