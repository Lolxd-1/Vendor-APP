# QuickVerse Vendor app — feature map and roadmap

Written 2026-10-12. Benchmark: the Zomato and Swiggy restaurant partner apps. Only features the current backend can
support honestly are planned; the rest is a list for the backend team.

## Feature map
| Area | Today | Plan |
|---|---|---|
| Live orders: ring until accepted, accept with prep time, reject with reason, ready, hand over at rider arrival | done | keep unchanged |
| Online / offline switch (close the store) | done | M6: clearer confirm sheet, closed banner on every tab |
| Store timings | done, entered as *closed* hours | M6: entered as opening hours ("Opens 9:00 am · Closes 10:00 pm"), "same for every day"; same data the PC uses |
| Order history | basic list | **M1**: search, period picker (presets + calendar), day groups with totals, clean rows |
| Order details: timeline + per-order payout | missing | **M1**: Placed → Accepted → Food ready (late or on time vs promised prep) → Delivered/Rejected/Cancelled; Gross → Commission → Net receivable |
| Earnings (weekly payouts, order-wise cards) | missing | **M1**: 5th tab; Mon–Sun settlement week paid the next Monday (same as the PC dashboard) |
| Print on the PC when the phone accepts ("sync with PC") | missing | **M2** (PC dashboard repo) |
| Auto-accept (Petpooja style) | missing | **M2** PC, **M4** phone — see docs/AUTO-ACCEPT.md |
| Print from the phone over a USB cable | missing | **M3** (native USB, ESC/POS: Epson TM-T82X 80 mm, 58 mm option) |
| Analytics: sales, orders, AOV, rejections and lost sales, accept and prep speed, late orders, peak hours, top items | today only | **M5** |
| Report download (PDF statement, Excel/CSV of orders) to the phone, share to WhatsApp | missing | **M5** |
| Menu / item in-stock switch | no endpoint | backend ask |
| Ratings, reviews, customer complaints | no endpoint | backend ask |
| Settlement data (UTR, paid date, deductions) | only `isSettled` | backend ask |
| Exact commission per order | admin endpoints have it (`finance.commission`); vendor list unconfirmed | app uses it when present, else "Estimated at 10%" |
| "Close for 30 min" with auto-reopen, two shifts per day | backend stores one closed window per day | backend ask |
| Offers / ads, staff logins, support chat | none | later |

## Milestones (each is its own branch, all checks green, merged by the owner)
| # | Milestone | Repo | Native code |
|---|---|---|---|
| M1 | History redesign, Order details (timeline + payout), Earnings tab | app | no |
| M2 | PC dashboard: print orders accepted on the phone, PC auto-accept | Vendor-Dashboard | — |
| M3 | Phone USB printing: printer setup page, print on Accept, Reprint | app | yes |
| M4 | Phone auto-accept (+ phone prints orders accepted on the PC) | app | yes |
| M5 | Analytics + report download (PDF, CSV) | app | small (save/share file) |
| M6 | Store hours as opening hours, store-closing improvements | app | no |

## Backend asks (collected)
1. Confirm that accept refuses an order that is no longer PENDING.
2. Send `finance` (commission, commissionRate) on `GET /quickVerse/v2/order/{shopId}/orders`, plus settlement details.
3. A per-order "printed" flag; a shop-level auto-accept setting (lets devices coordinate).
4. Item stock on/off, ratings and complaints endpoints for vendors.
5. Timed closures with auto-reopen; more than one closed window per day.
6. HTTPS/WSS for prd.quickverse.in; token checks on the live socket and on vendor REST calls (today a shared Basic
   credential).
