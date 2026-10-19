# Backend work: make "Go offline" and store timings close the shop for customers

## The problem (seen live on 2026-10-16)
A vendor tapped **Go offline** in the vendor app. The app showed "You're offline", and the backend saved it:
`GET /v1/vendor-schedules/shop/{shopId}` returned `manualOfflineOverride: true`. **A customer could still see the shop
and place an order.**

The reason is that the customer side never reads the vendor-schedules record:
- The shop list (`GET /quickVerse/v3/regions/shops?regionId=`) returns only `storeActive`, `storeEnabled`,
  `openingTime`/`closingTime` and similar shop fields. It returned 152 shops, all with `storeActive: true`. It has
  no field derived from vendor-schedules.
- Order placement accepted an order for a shop whose record said offline.
- None of the four client repos (vendor app, vendor web dashboard, admin app, print agent) has any call that changes
  `storeActive`, `storeEnabled` or a shop's opening hours. Those flags can only be changed on the backend.

The vendor app and the web dashboard both write vendor-schedules correctly. The backend just has to honour it.
**No new endpoint is needed.**

## 1. The rule: when is a shop closed to customers?
A shop is **closed** when any of these is true. Evaluate them with the shop's local time (IST).
1. `storeActive == false` or `storeEnabled == false` (as today).
2. The vendor-schedules record has `manualOfflineOverride == true`. This is the vendor's "Go offline" switch, and it
   stays until the vendor goes online again.
3. The record has `scheduleActive == true` and today's entry in `operatingHoursJson` closes the shop right now.

For rule 3, each day's entry is a **closure window**, as the web dashboard reads it
(`Vendor-Dashboard/src/utils/scheduleUtils.ts`). The field names openTime/closeTime are misleading:
- Days are keyed `Mon`..`Sun`, each with `{ "openTime": "HH:mm", "closeTime": "HH:mm" }`.
- A day with **no entry** is open all day.
- `00:00`–`00:00` is closed all day.
- Otherwise the shop is closed from `openTime` to `closeTime`, both ends inclusive.
- If `openTime > closeTime`, the window wraps past midnight.

A shop with **no vendor-schedules record** is decided by rule 1 only. Today the GET returns 404 code `404-1` for such
a shop.

## 2. Where the rule must apply
1. **Placing an order.** Reject an order for a closed shop *before* payment is taken. Send HTTP 409 (or your usual
   error shape) with a clear message, e.g. `{"error":{"code":"SHOP_CLOSED","message":"This store is closed right now"}}`.
   This is the important part: it is what stops orders, whatever the customer app shows.
2. **The shop list and shop page** (`/quickVerse/v3/regions/shops` and the shop endpoint the customer app uses).
   Keep listing the shop, but add to each shop:
   - `acceptingOrders: boolean`, the rule above evaluated now.
   - `closedReason: "OFFLINE" | "TIMINGS" | null`.
   - `reopensAt: "<ISO time>" | null`: the end of the current closure window. `null` for OFFLINE, because only the
     vendor can reopen.

   The customer app then shows "Closed · opens at 6:30 pm" and disables Add to cart / Checkout.
3. **Customer app.** Read `acceptingOrders`, and show the SHOP_CLOSED error from step 1 if a cart was already open
   when the shop closed.

## 3. Writes that already exist (used by the vendor app and the web dashboard; no change needed)
| Action | Call |
|---|---|
| Go offline / online (record exists) | `PATCH /v1/vendor-schedules/shop/{shopId}/manual-offline?manualOfflineOverride=true|false` |
| First time, no record yet | `POST /v1/vendor-schedules/configure` `{shopId, manualOfflineOverride:true, scheduleActive:true, operatingHours:"{}"}` |
| Save store timings | `POST /v1/vendor-schedules/configure` `{shopId, manualOfflineOverride, scheduleActive:true, operatingHours:"<json>"}` |

Two backend fixes would help as well:
- The manual-offline PATCH answers **HTTP 500** for a shop that has no record. It should create the record, or return
  404 `404-1` like the GET does.
- Keep these calls reachable under `/quickVerse/...` as well. The live web dashboard only forwards `/quickVerse/*` to
  the backend (`vercel.json`), so its Store Status page cannot reach `/v1/vendor-schedules` in production today.

## 4. Test on the test shop (68246) before shops use it
1. Make 68246 visible to a test customer account.
2. In the vendor app tap **Go offline**. The customer app shows Closed, and placing an order is refused with
   SHOP_CLOSED.
3. Tap **Go online**. Ordering works again within a few seconds.
4. In Store timings, close today for the next 30 minutes. The shop is closed with "opens at …", then opens by itself
   when the window ends.
5. Make sure an order already placed before going offline still rings and can be accepted.
