# FIX1 report
Implemented all final-review findings except Minor 5 and 7 (rulings, no code).
- Critical 1: EarningsScreen tags results with offset; `data` ignored unless `data.offset === offset` (spinner / "Couldn't load earnings").
- Important 1: MainShell `active={nav.tab === 'earnings'}`. Minor 9: comment updated.
- Minor 1: numberOfLines={1} in Earnings Line/Details, History row amount, OrderDetails Line value and step title, PeriodSheet radio.
- Minor 2: OrderDetails uses DEFAULT_COMMISSION_PCT. Minor 3: "this"/"the" week. Minor 4: two separate texts.
- Minor 6: HistoryScreen `failed` ref remembers page/mode; footer Try again retries it. Minor 8: SearchField hitSlop 13 (44dp).
Tests: TC1-TC5 added (earnings x3, shell x1, history x1). Verify: all 5 steps PASS.
