# Review (rereview): vendor-app-v2 (M1) final findings
VERDICT: APPROVE
HEAD: 3aa411c
## Critical
None.
## Important
None.
## Minor
None new.
## Checked
Critical 1 (stale cross-week data): resolved. EarningsScreen tags each result with `offset` and uses `data = remote.data?.offset === offset ? remote.data : null` for the spinner, error, summary, cards, refresh indicator and cap note. `useRemote` keeps old data across deps changes, but it is now hidden for another week. A failed week change shows "Couldn't load earnings" with Try again. A same-week failed reload keeps its numbers. The new earnings test presses "Previous week" with a pending then rejected promise and asserts that '₹404.50' and 'ID: A' are absent.
Important 1 (reload on return from Details): resolved. MainShell passes `active={nav.tab === 'earnings'}`. The tab stays mounted under the page, so `active` does not flip. The new shell test opens an order from Earnings, presses Back and asserts that the /orders call count is unchanged.
Minor 1 (numberOfLines): added on the Earnings Line, "Details", the History amount, OrderDetails Line value and step title, and the PeriodSheet radio. The OrderDetails label already had it.
Minor 2: OrderDetails uses `DEFAULT_COMMISSION_PCT`.
Minor 3: the cap notice reads "this" only for offset 0, and a test covers the past-week wording.
Minor 4: the error and "Showing the last numbers." are on separate lines, with a test for no "..".
Minor 6: History keeps `failed.current = {page, mode}` and Try again retries it. A test covers a failed refresh retrying page 0.
Minor 8: SearchField `hitSlop` is now 13, giving 44 dp.
Minor 9: the MainShell comment is updated.
Minors 5 and 7 were left as accepted. They are optional and not defects.
Regressions: the diff is limited to those fixes, with no new files, dependencies or contract changes. The `useRemote` request guard still drops stale answers, and any late answer for an old week carries its own offset tag, so it stays hidden.
