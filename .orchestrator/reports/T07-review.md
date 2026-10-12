# Review (task): T07
VERDICT: APPROVE
REQUEST: 1294383561871791788908
HEAD: f4646a3
## Critical
None.
## Important
None.
## Minor
1. src/app/MainShell.tsx:39 · comment still says "four tabs" and lists only timings/alerts pages · now five tabs and an order page · optional comment touch-up (brief said additions only, so leaving it is defensible).
2. __tests__/shell.test.tsx:123-135 · TC2 closes the page via the 'Back' button, not hardwareBackPress; permitted by the brief Notes, and backAction is unchanged and covered by existing tests.
## Checked
Spec: Steps 1-4 implemented; TabKey/PageKey match the Contracts exactly; props match HistoryScreen/EarningsScreen/OrderDetailsScreen signatures.
Diff scope: MainShell changes are only the import lines, types, openOrder state, showOrder, tabs entries and order page; BackHandler, backAction, pending-count effect, AppState wiring untouched.
New-order rule: setNav resets stack to [] so the order page closes and Orders > New shows; stale openOrder is harmless because the page requires stack top 'order'.
Earnings active prop: nav.tab==='earnings' && !page, same pattern as Insights; reload on return from the order page is consistent.
Tests: TC1-TC3 present, assert real behavior (tab order, no TabBar while page open, tab selected after back, new-order closes page) and can fail; existing tests untouched; fetchMock extension matches the brief.
Security/data: no new entry points, no data written, no secrets or demo logic.
Slop: no dead code, debug output or needless abstraction.
