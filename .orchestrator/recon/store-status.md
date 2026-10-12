# Recon: shop open/closed status across web dashboard, admin app, customer evidence
Paths: WEB = C:/Users/omkar/Downloads/Feature/Vendor-Dashboard-prod-v1.6.0/src ; ADMIN = C:/Users/omkar/Downloads/Feature/QuickVerse Admin App

## Answer
### (a) Web vendor dashboard
Endpoints (all RTK Query, WEB/apis/schedule.ts):
- GET `/v1/vendor-schedules/shop/{shopId}` · schedule.ts:11-14 · no query/body. Response VendorScheduleResponse (types/schedule.ts:32-42): id, shopId, manualOfflineOverride, scheduleActive, operatingHoursJson (STRING of JSON), createdBy?, createdAt, updatedBy?, updatedAt. transformResponse defaults operatingHoursJson to "{}" (schedule.ts:17-22).
- POST `/v1/vendor-schedules/configure` · schedule.ts:29-34 · body SaveScheduleRequest (types/schedule.ts:20-25): {shopId, manualOfflineOverride:boolean, scheduleActive:boolean, operatingHours: string = JSON.stringify(week)}. Returns VendorScheduleResponse.
- PATCH `/v1/vendor-schedules/shop/{shopId}/manual-offline` · schedule.ts:40-50 · query param `manualOfflineOverride=<bool>`, no body; response read as text (`responseHandler:"text"`).
- Cache tag "VendorSchedule" id=shopId; all three invalidate/provide it (schedule.ts:25,36,50).

Data shape: `OperatingHours = Record<DayOfWeek, TimeSlot>`, DayOfWeek "Mon".."Sun", TimeSlot {openTime,closeTime} "HH:mm" 24h (types/schedule.ts:2-17). Only recurring weekly per-day; NO dates, no one-off/upcoming closures, no reasons, no durations (not found anywhere in WEB schedule files).

Semantics (WEB/utils/scheduleUtils.ts:7-32):
- Entries are CLOSURE windows despite the openTime/closeTime names: function returns true ("offline") when now is INSIDE the window (:27-31). UI copy confirms: "Configure Weekly Offline Schedule" (WeeklyScheduleCard.tsx:88), "Add Offline Schedule" (StoreSchedule.tsx:140), "Closed" when day not active (WeeklyScheduleCard.tsx:169).
- No entry for today => ONLINE (scheduleUtils.ts:15).
- 00:00-00:00 => all-day closure (scheduleUtils.ts:18-20; UI label "All Day Closure" UpcomingScheduleList.tsx:64,74).
- Overnight: if start > end, offline when now>=start OR now<=end (scheduleUtils.ts:29-30). Comparison is string compare of "HH:mm", end inclusive. Overnight window is evaluated only against TODAY's key (the window's tail after midnight is NOT looked up under the previous day; (inferred) so e.g. Mon 22:00-02:00 covers Mon 00:00-02:00 and Mon 22:00+, not Tue 00:00-02:00).
- Uses device local clock `new Date()` (scheduleUtils.ts:8).
- Final online = manualOfflineOverride ? false : !offlineBySchedule (useShopOnlineStatus.ts:16-24; StoreSchedule.tsx:63-64). While schedule not loaded => online (useShopOnlineStatus.ts:17). `scheduleActive` is only SENT (always true, useSchedule.ts:62) and NEVER read by any WEB UI/logic (grep: only in types/schedule.ts and useSchedule.ts) so schedule is evaluated even if scheduleActive were false.
- StoreSchedule.tsx:12-38 has a DUPLICATE local copy of checkIsCurrentlyOfflineBySchedule (identical logic).
- Navbar badge uses useShopOnlineStatus (components/Navbar.tsx:2,17). No polling/timer found in hook; recomputed only when scheduleData changes (useMemo dep [scheduleData], useShopOnlineStatus.ts:25) (inferred: badge can go stale at clock boundaries).

Manual toggle (useSchedule.ts:22-46): handleToggleStoreStatus(isCurrentlyOnline) -> PATCH manualOfflineOverride = isCurrentlyOnline (online->true=offline). Toggle button StoreSchedule.tsx:106-121. Permanent until toggled back (no duration/timer).
Quirk: saving grid sends `manualOfflineOverride:false, scheduleActive:true` (useSchedule.ts:59-64), so saving schedule silently clears a manual offline (the new Vendor-APP notes this at src/api/endpoints.ts:85 and passes the current value instead).
Deleting a day = re-POST grid without that key (useSchedule.ts:80-86).

UI offers (all WEB):
- Toggle Online/Offline (StoreSchedule.tsx:106-121); feedback toasts "Store is now Offline/Online", errors auto-clear 2.5s (useSchedule.ts:33-44).
- "Add Offline Schedule" opens WeeklyScheduleCard: per-day switch (isActive), `<input type=time>` start/end, "All Day" toggle that stores 00:00/00:00 (WeeklyScheduleCard.tsx:11-16, 59-74, 150-165). Default times when new = current clock time for both (:22-25,43-44). Inactive days omitted from payload (:65-70). Save button label "Save Schedule" (:185).
- UpcomingSchedulesList: lists days with openTime&&closeTime, 12h format, Edit (just opens form, day arg ignored: StoreSchedule.tsx:66-69), Delete, expand after 4 (UpcomingScheduleList.tsx:31-36,49-50,81-94).
- NOT present: "close for 30 min", reasons, durations, dated closures.

### (b) Admin app (React Native)
No endpoint writes shop open/closed/schedule/commission-per-shop/payout. Findings:
- Shop list: GET `/quickVerse/v3/regions/shops?regionId={id}` with hardcoded Basic auth header · ADMIN/src/store/vendors/useVendorStore.ts:82-88. Vendor type fields: openingTime, closingTime (strings), preparationTime, storeActive:boolean, featured · useVendorStore.ts:44-52 (dup in src/types/index.ts:46-52).
- `storeActive` read only to filter: getActiveVendors -> `vendor.storeActive` (useVendorStore.ts:119). Never written to server. ShopDetails in orders store has openingTime, closingTime, storeActive?, storeEnabled? · ADMIN/src/store/orders/useOrdersStore.ts:29-35 (storeEnabled not otherwise referenced).
- openingTime/closingTime displayed only: ADMIN/src/screens/Orders/ViewOrderScreen.tsx:363-364 (from order response `response.shop`).
- No admin use of /v1/vendor-schedules or manualOffline (grep across ADMIN src, docs: none).
- Commission (global, per service type, not per shop): GET `/quickVerse/v3/pricing-configurations[?serviceType=FOOD|GROCERY]` · ADMIN/src/services/apis/pricingConfigService.ts:40-50; PUT `/quickVerse/v3/pricing-configurations/{id}` (:66-80 area, "PUT" doc at line 69-70). PricingConfig {id, serviceType, configKey (COMMISSION|COMMISSION_PERCENT|GST|...), actualValue, expectedValue, isActive, createdAt, updatedAt} · pricingConfigService.ts:3-24. UI: ADMIN/src/screens/Settings/ConfigurationsScreen.tsx:37-55,80,296-317,477-493.
- Per-order fields: commissionRate, commission, commissionGst (OrderDetailsModel.tsx:52-61; OrderSummaryCard.tsx:73-82); pricing.commissionRateActual (AssignTransporterScreen.tsx:90).
- Payout/finance: GET `/quickVerse/v2/order/finance?...` (ADMIN/src/apis/order.ts:96, hook useGetOrdersFinanceQuery :148), GET `/quickVerse/v2/order/stats?...` (order.ts:30); fields commissionCollected, vendorPayout, commissionPercent (OrderStatsScreen.tsx:58-66); client formula "Vendor Payout = Total Order Sales - Total Charges Collected" (:838). Read-only. No settlement endpoint found.
- Other order endpoints: /quickVerse/v2/orders (order.ts:43, optional vendorId), /quickVerse/v2/order/{id} (:67), /quickVerse/v2/order/history (:137), POST /v1/order-master/assignOrder|unAssignOrder (:104,:116).
- `isOnline` in admin refers to DELIVERY PARTNERS, not shops (deliveryPartnerService.ts:26; TransportersScreen.tsx:233-238).
- ADMIN/API_README.md:245 shows an `isActive` for a "vendor_001" example (doc only, not code-verified).

### (c) Customer app / backend evidence
- No customer app in the dirs I searched (QuickVerse-Dashboard-1.4.1 not read beyond grep for vendor-schedules/manualOffline: no hits there).
- Backend evidence is only indirect: shop payload exposes `storeActive` (+ `storeEnabled`, openingTime/closingTime) (ADMIN useVendorStore.ts:50; useOrdersStore.ts:34-35) — suggests a server-side shop-level flag, separate from vendor-schedules. No evidence found of the server computing closed state from vendor-schedules; open/closed is evaluated CLIENT-side in WEB (scheduleUtils.ts) and in the new Vendor-APP (src/domain/schedule.ts:50-66). Whether backend/customer app honor manualOfflineOverride is unknown.
- Vendor-APP v1 already implements same API: src/api/endpoints.ts:76-90, src/domain/schedule.ts:1-66 (comment: "closure window despite names openTime/closeTime; no entry = open all day").

### (d) Other vendor-facing endpoints in web dashboard (non-orders/schedule/auth)
None. All `url:` in WEB/src/apis: auth `/quickVerse/v1/requestOtp`, `/quickVerse/v1/login` (authentication.ts:10,27; env overridable VITE_REQUEST_OTP_URL / VITE_LOGIN_URL), orders `/quickVerse/v2/order/{id}/accept|reject|ready|handover` PATCH (dashboardApi.ts:8-35), GET `/quickVerse/v2/order/{shopId}/dashboard-stats` (dashboardApi.ts:42), GET `/quickVerse/v2/order/{shopId}/orders` (orderApi.ts:58). Also WebSocket SockJS `baseurl + "/quickVerse/ws"` (hooks/useOrderWebsocket.tsx:112) and local print agent http://127.0.0.1:{port}/printers|status|queue (utils/print/printAgent.ts:68,109,160,196,269). No menu/items/stock, profile, ratings, payouts. Base URL from `VITE_API_URL` (apis/index.ts:5).

## Gaps
- Server-side behaviour (backend source) not present; whether customer app checks storeActive/manualOfflineOverride/schedule unknown.
- Did not read QuickVerse-Dashboard-1.4.1 contents beyond grep.
- Exact line range of pricing PUT function approximate (pricingConfigService.ts ~66-85).
