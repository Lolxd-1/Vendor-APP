# PLAN: Industry-standard vendor app UI (Swiggy/Zomato-grade, blue & white, Apple-minimal)
run: vendor-ui-v1 · branch: dev-v1.0 · base: ab92e97aaff47df88ffc7f6db17a8e60b5999492 · created: 2026-10-05T19:31:56Z

## Requirement (verbatim, condensed from the user's message of 2026-10-06)
> First make a Dev branch v1.0 ... main branch should be as it is. ... What we want is a Industry Standard app
> for this Vendor app. we want all the Necessary Options for the vendor than just our simple accept and handover.
> Rule no. Don't Break the Exisiting thing ... Make it exist first then you can make it better.
> ... redesign the Whole UI part. our basic foundations are clear. order comes, then when accepts it is on this
> second screen. and then hands over it is on the third slide. ... make this Industry Standard. on how the Swiggy and
> Zomato's Phone app is. all the buttons, all the theme etc ... Use the Theme Blue and White. It should be something
> like Apple Minimlastic Design ... all the bars, slides, all the corners ... properly curated for visibility. it should
> have all the info that is requied even for an uneducated Vendor ... settings, page, account profile etc etc. all the
> pages that are required. (use backend for this, have this fetched ... use the data we have from the backend and show
> them the best possible way.) ... Order should ring and it should ring it is not accepted ... don't break the flow.
> Use internet to find the best possible skill that has taste on how you can develop crazy UI's.

## Goal
Replace the 2-screen UI with a 4-tab, Swiggy/Zomato-style vendor app (Orders · History · Insights · Account + Store
timings + Order alerts pages) in a blue/white Apple-minimal design, fed only by existing backend endpoints, while the
native ringing engine and the New → Preparing → Ready → handed-over flow stay byte-for-byte unchanged.

## Non-goals
- Any change under `android/app/src/main/java/` or `specs/` (ringing, polling, socket, session, notifications).
- Features with no backend endpoint: menu / stock on-off, payouts, ratings, complaints, offers/ads, support chat.
- Dark mode, Hindi/Marathi translations, iOS, printing, React Native upgrade, new npm dependencies.
- Changing request paths, headers, or the meaning of existing endpoint calls.

## Acceptance criteria
- AC1 Ringing untouched: `git diff ab92e97 -- android/app/src/main/java specs` is empty at the end of the run.
- AC2 Existing flow preserved: Accept calls `acceptOrder(id, prep)` then `markLocal(id,'ACCEPTED',prep)` then `pollNow()`;
  Reject (reason ≥ 3 chars) → `rejectOrder` → `markLocal(id,'CLOSED',0)`; Mark ready → `markOrderReady` → `markLocal(id,'READY',0)`;
  Hand over enabled only when rider status is ARRIVED_AT_STORE → `handoverOrder` → `markLocal(id,'CLOSED',0)`.
  A failed call never calls `markLocal`, shows the same failure text as today, and re-enables the buttons.
- AC3 A newly arrived PENDING order switches the app to the Orders tab and its New segment, from any tab or page.
- AC4 Bottom tab bar with 4 tabs: Orders (badge = pending count), History, Insights, Account. Android back: closes the
  open page, else returns to Orders, else leaves the app (default behavior).
- AC5 Orders header shows shop name (from `shopDetails`, else "Shop #<id>"), "Shop #<id>", connection state as a word
  (Live / Connecting / No connection), and an Online/Offline switch. Going offline asks for confirmation first; the
  switch reflects `manualOfflineOverride` and the store-timings closure exactly like the web (`checkIsCurrentlyOfflineBySchedule`).
  When closed by store timings, the header says so ("Closed by store timings") instead of silently ignoring the switch.
- AC6 Order cards (all phases) show: order id, time since placed / prep countdown / time since ready, customer name,
  payment label, vendor amount (`amountExcludingDeliveryFee`), each item with qty and line price, and the instructions
  text when `orderDescription` is non-empty. Preparing/Ready show rider name, plain-words rider status, a Call button
  when a rider phone exists, and the 4-digit pickup code (`riderOtp`). Prep stepper uses `PREP_TIME_OPTIONS`, default 15.
  A preparing order past its prep time turns its border and button red and the button pulses (Zomato behavior).
- AC7 Reject opens a bottom sheet with preset reasons ("Item out of stock", "Kitchen is closing", "Too many orders right
  now") plus "Other reason" with a text box; an "Other" reason shorter than 3 characters shows
  "Reason must be at least 3 characters." and sends nothing.
- AC8 History: time chips Today / This week / This month (TODAY / LAST_WEEK / THIS_MONTH, default TODAY) and status chips
  All / Delivered / On the way / Rejected / Cancelled (none / COMPLETED / IN_TRANSIT / REJECTED / CANCELLED); pages load
  on scroll (page 0..totalPages-1), duplicates by orderId dropped; tapping a row opens an order-details sheet;
  loading, empty ("No orders in this period") and error-with-retry states.
- AC9 Insights: today's numbers from `dashboard-stats` (orders, revenue, completion %, avg accept time, avg prep time)
  plus live New/Preparing/Ready counts from the board; pull-to-refresh; reloads when the tab is opened; error-with-retry.
- AC10 Account: shop profile (logo or initial, name, category, Shop #id, owner, phone, address, usual hours) from
  `shopDetails` (board orders first, else history page 0 of THIS_YEAR), rows to Store timings and Order alerts,
  Test sound, signed-in phone, app version, Log out with today's confirmation text.
- AC11 Store timings page lists Mon..Sun as "Open all day" / "Closed all day" / "Closed <from> – <to>"; editing a day
  saves the whole week via `/v1/vendor-schedules/configure` with `manualOfflineOverride` = its current value (never
  silently flips the store online).
- AC12 Order alerts page: connection state + "last checked" time, all 3 phone-setup checks with a tick or a Fix button,
  Test sound, App info button, the Xiaomi/Oppo/Vivo/Realme autostart tip. The Orders screen still shows a warning
  banner while any check is missing.
- AC13 Login: same OTP flow and validation messages; new look (+91 prefix field, 4 OTP boxes); "Send OTP" text kept.
- AC14 Design: Plus Jakarta Sans (bundled), Lucide icon font subset (bundled), tokens below; no shadows; touch targets
  ≥ 48 dp, primary buttons 56 dp; every status has an icon or word, never color alone.
- AC15 `orch.sh verify-all` passes (typecheck, lint, jest ≥ 17 old tests unchanged + new, Android JS bundle).

## Assumptions
- A1 Branch name "Dev branch v1.0" → `dev-v1.0` (git forbids spaces) · asked user: no (logged ruling)
- A2 Run autonomously (user: "now this is your Job") with rulings logged; no live order actions / OTP / production
  reads or writes from Claude — the user tests the Online switch and timings on a real shop · asked: no
- A3 Response shapes come from the web dashboard code (production reads were blocked) → parsers are tolerant · asked: no
- A4 English only, light theme only · asked: no
- A5 Sub-agents `orch-executor` are not registered in this harness (session started in the parent folder) → the
  orchestrator executes each brief itself under `.claude/agents/orch-executor.md` rules and gates every task (SKILL.md).

## Context map
- `App.tsx` — root: session ? board UI : Login. Listens to `qvSessionEnded`.
- `src/native/vendor.ts` — the ONLY bridge to the native engine (getBoard, markLocal, pollNow, playTestSound,
  getSetupStatus, openSetting, logout, onBoardChanged, onSessionEnded). Frozen.
- `src/api/client.ts` — `request<T>(method, path, {query, body})`; arrays in query become repeated keys; errors are
  `ApiError(message, status|null)`. Reuse; do not modify.
- `src/api/endpoints.ts` — order actions + OTP/login. Extend only (append).
- `src/domain/*` — pure rules: board parsing, riderOtp, canHandOver, riderStatusOf, isValidRejectReason,
  isValidIndianMobile, parseServerTime, formatDuration, elapsedLabel, prepRemainingMs. Reuse.
- `src/screens/*`, `src/components/*`, `src/ui/*` — the UI being redesigned.
- Web reference (read-only): `../quickverse-web-vendor-dashboard-dev` @ v1.5.2: `src/apis/*.ts`, `src/types/*.ts`,
  `src/utils/scheduleUtils.ts`, `src/hooks/useDashboardStats.ts`, `src/hooks/useSchedule.ts`.
Flow: native WatcherService polls + rings → `qvBoardChanged` → `getBoard()` → screens. Screen actions → REST
(endpoints.ts) → `markLocal` + `pollNow` → native board moves → ring stops. New screens read REST directly
(stats/history/schedule) through `request`.
Reuse: `src/api/client.ts:45 request`, `src/domain/orderRules.ts:6 riderOtp / :18 canHandOver / :11 riderStatusOf`,
`src/domain/time.ts:3 parseServerTime / :13 formatDuration / :22 elapsedLabel / :28 prepRemainingMs`,
`src/domain/board.ts:46 byPhase`, `src/config.ts` constants.

## Decisions
- D1 Zero new npm dependencies. Navigation = small in-app tab + page stack (`src/app/MainShell.tsx`) with BackHandler;
  sheets = RN `Modal` + `Animated`; toasts = `ToastAndroid`; calls = `Linking.openURL('tel:')`.
  Rejected: react-navigation / react-native-svg (native modules → new C++ builds on a Windows MAX_PATH-limited build).
- D2 Icons = Lucide (ISC) icon font, subset to the names used, bundled as `android/app/src/main/assets/fonts/QVIcons.ttf`
  and rendered through `<Icon name>` (Text with a codepoint). Regenerated by `scripts/make-fonts.py`.
- D3 Typeface = Plus Jakarta Sans (OFL), static instances 400/500/600/700 named `PlusJakartaSans-Regular|Medium|SemiBold|Bold`
  in `android/app/src/main/assets/fonts/`. Weight is chosen by family name only (never `fontWeight` with these families).
  Why: geometric Indian-delivery vernacular (Swiggy/Zomato faces) yet calm enough for Apple-minimal; has ₹ and tnum.
  Rejected: Inter (the generic default), system Roboto (reads as "unstyled Android").
- D4 Online/offline semantics copied from the web: operating-hours entries are CLOSURE windows; "00:00–00:00" = closed
  all day; a missing day = open; `manualOfflineOverride=true` = offline.
- D5 Saving timings preserves the current `manualOfflineOverride` (web sends false — would silently re-open a store).
- D6 Shop profile comes from `order.shopDetails` (no profile endpoint exists).

## Design plan (frontend-design skill, two passes)
Subject: a food-shop counter on a campus; the phone sits on the counter, read from arm's length by staff who may read
little English, often mid-rush. Primary job: never miss an order, act on it in one tap. Secondary: today's money,
past orders, open/close the shop.
Color (tokens, `src/ui/theme.ts`): bg #F3F5F9 · surface #FFFFFF · ink #0B1B34 · ink2 #55647A · ink3 #8B97A9 ·
line #E3E8F0 · blue #1557FF (pressed #0E43CC, soft #EAF0FF) · green #0B7F58 (soft #E6F5EE) · red #D42A33 (soft #FDECEC) ·
amber #A85F00 (soft #FFF3DE). White text only on blue/green/red (all ≥ 4.5:1).
Type: Plus Jakarta Sans. Scale (size/line): display 40/46 Bold tnum · largeTitle 30/36 Bold (-0.6) · title 20/26
SemiBold (-0.3) · headline 17/22 SemiBold · body 15/21 Regular · callout 14/19 Medium · footnote 13/18 Regular ·
caption 12/16 Medium. Numbers that tick use `fontVariant: ['tabular-nums']`.
Layout: left-aligned iOS large titles; 16 dp gutters; grouped lists (Account, Alerts, Timings) like iOS Settings;
order cards radius 20 with 1 px hairline, no shadows anywhere; sheets radius 28; buttons/chips radius 14; segmented 12.
Principles: (1) the boldness lives in ONE place — the incoming-order card gets a solid blue header band with a big
ticking timer; everything else is quiet white + hairlines. (2) Every state = icon + word (Live, Rider at your shop).
(3) One primary action per card, 56 dp, full width. (4) Motion only for attention or response: incoming pulse, late
"food ready" pulse, sheets sliding; respects reduce-motion.
Review vs defaults (pass 2): no ALL-CAPS eyebrows; no "A · B · C" meta strings (old header used one — replaced by
separate chips); no arrows in button text; no monospace data; no gradients; card radii differ by hierarchy; the Insights
hero number is kept on purpose (today's earnings IS the vendor's first question) but without gradient or KPI-grid kit.
```
Orders                              [● Online ⏻]      ┌ Bottom tabs ───────────────────┐
Tasty Bites          Shop #68246    (Live)            │ Orders(2)  History Insights Acct│
[ New 2 | Preparing 1 | Ready 0 ]                     └────────────────────────────────┘
┌ ███ (bell) New order        02:41 ███ ┐  ← blue band, white text
│ #QV12345678 · placed 7:42 pm          │
│ Rahul S.                       ₹245   │
│ Paid online                           │
│ 2  Veg Biryani               ₹200     │
│ 1  Coke                       ₹45     │
│ Ready in      [−]  15 min  [+]        │
│ [          Accept order          ]    │
│               Reject                  │
└───────────────────────────────────────┘
```

## Global constraints
- Conventions: functional components, `StyleSheet.create`, named exports, 2-space indent, single quotes, files in
  `src/{app,ui,screens,components,hooks,domain,api}`; comments explain why only; copy in sentence case, active verbs.
- Text: always through `<Txt variant>` (src/ui/Txt.tsx) so the bundled font applies; never raw `fontWeight` with it.
- Forbidden: new dependencies; edits to `android/app/src/main/java/**`, `specs/**`, `src/native/vendor.ts`,
  `src/api/client.ts`; changing existing endpoint functions; weakening or deleting existing tests; network calls in tests.
- Platform: RN 0.81.4, React 19.1, TypeScript 5.8, Jest 29 (preset react-native), Node ≥ 20, Android only.

## Verify (global)
```bash
npm run typecheck
npm run lint
npx jest --ci --silent
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output "${TMPDIR:-/tmp}/qv-verify.bundle" --assets-dest "${TMPDIR:-/tmp}/qv-verify-assets" > /dev/null
```

## Contracts
```text
# src/ui/theme.ts
export const colors: { bg, surface, ink, ink2, ink3, line, blue, bluePressed, blueSoft, green, greenSoft, red, redSoft,
  amber, amberSoft, onColor, scrim }            (hex strings above; onColor '#FFFFFF'; scrim 'rgba(11,27,52,0.45)')
export const fonts: { regular: 'PlusJakartaSans-Regular', medium: 'PlusJakartaSans-Medium',
  semibold: 'PlusJakartaSans-SemiBold', bold: 'PlusJakartaSans-Bold' }
export type TextVariant = 'display'|'largeTitle'|'title'|'headline'|'body'|'callout'|'footnote'|'caption'
export const type: Record<TextVariant, TextStyle>
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 }
export const radius = { s: 10, m: 14, l: 20, xl: 28, pill: 999 }
# src/ui/Txt.tsx       export const Txt: (p: TextProps & { variant?: TextVariant; color?: string; tabular?: boolean }) => JSX
# src/ui/Icon.tsx      export type IconName = keyof typeof ICONS ;  export const Icon: (p:{ name: IconName; size?: number; color?: string }) => JSX
# src/ui/iconMap.ts    export const ICONS: Record<string, string>   (generated; name -> one-char string)
# src/ui/Button.tsx    export const Button: (p:{ label: string; onPress: () => void; variant?: 'primary'|'secondary'|'danger'|'ghost'|'success';
#                        icon?: IconName; busy?: boolean; disabled?: boolean; size?: 'l'|'m'|'s'; pulse?: boolean }) => JSX
# src/ui/Sheet.tsx     export const Sheet: (p:{ visible: boolean; onClose: () => void; title?: string; children }) => JSX
# src/ui/Segmented.tsx export const Segmented: <K extends string>(p:{ items:{key:K;label:string;count?:number;alert?:boolean}[]; value:K; onChange:(k:K)=>void }) => JSX
# src/ui/Chip.tsx      export const Chip: (p:{ label: string; selected?: boolean; onPress?: () => void; icon?: IconName; tone?: Tone }) => JSX
#                      export type Tone = 'neutral'|'blue'|'green'|'red'|'amber'
# src/ui/Badge.tsx     export const StatusPill: (p:{ label: string; tone: Tone; icon?: IconName }) => JSX
# src/ui/List.tsx      export const Group: (p:{ title?: string; footer?: string; children }) => JSX
#                      export const Row: (p:{ icon?: IconName; iconTone?: Tone; title: string; subtitle?: string; value?: string;
#                        onPress?: () => void; right?: ReactNode; danger?: boolean; chevron?: boolean }) => JSX
# src/ui/EmptyState.tsx export const EmptyState: (p:{ icon: IconName; title: string; body?: string; action?: {label:string; onPress:()=>void} }) => JSX
# src/ui/LargeHeader.tsx export const LargeHeader: (p:{ title: string; subtitle?: ReactNode; right?: ReactNode; onBack?: () => void }) => JSX
# src/ui/useReducedMotion.ts export const useReducedMotion: () => boolean

# src/domain/order.ts (additive)
export interface ShopDetails { shopId?: string|number; name?: string; logo?: string; owner?: string; phone?: string|number;
  openingTime?: string; closingTime?: string; description?: string; category?: string;
  address?: { address?: string; city?: string; state?: string; postalCode?: string } | null }
Order gains optional: totalAmount?, deliveryFee?, totalItemCount?, orderDescription?, customerAddress?: unknown,
  shopDetails?: ShopDetails|null, stateLabel?
export type HistoryStatus = 'COMPLETED'|'IN_TRANSIT'|'REJECTED'|'CANCELLED'|'PENDING'|'ACCEPTED'|'READY_FOR_PICKUP'
export type TimeRange = 'TODAY'|'LAST_WEEK'|'THIS_MONTH'|'THIS_YEAR'

# src/domain/format.ts
export const money: (n: unknown) => string            // 245 -> '₹245', 245.5 -> '₹245.50', 12345 -> '₹12,345', bad -> '--'
export const clockTime: (t: unknown) => string        // server time -> '7:42 pm' ; bad -> '--'
export const dayTime: (t: unknown, now: number) => string // 'Today, 7:42 pm' | 'Yesterday, 7:42 pm' | '3 Oct, 7:42 pm' | '--'
export const minutesLabel: (sec: unknown) => string   // 0/bad -> '--', 45 -> '45 sec', 200 -> '3 min', 3900 -> '1 h 5 min'
export const paymentLabel: (m: unknown) => string     // /cod|cash/i -> 'Cash on delivery', empty -> 'Payment not shown', else 'Paid online'
export const riderStatusLabel: (s: string|undefined) => string // undefined -> 'Finding a rider', ARRIVED_AT_STORE -> 'Rider at your shop',
                                                       // other -> words, first letter capital ('PARTNER_ASSIGNED' -> 'Partner assigned')
export const historyStatusInfo: (state: unknown) => { label: string; tone: Tone; icon: IconName }
     // COMPLETED Delivered green circle-check · IN_TRANSIT On the way blue bike · REJECTED Rejected red ban ·
     // CANCELLED Cancelled red circle-x · PENDING New blue bell · ACCEPTED Preparing amber chef-hat ·
     // READY_FOR_PICKUP Ready green package-check · other -> words, neutral, info
export const itemsSummary: (items: unknown) => string // [{name:'A',itemCount:2},{name:'B',itemCount:1}] -> '2 × A, 1 × B' ; [] -> 'No items'
export const initials: (name: unknown) => string      // 'Tasty Bites' -> 'TB', '' -> 'QV'

# src/domain/schedule.ts
export type DayKey = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'
export const DAYS: readonly DayKey[]                   // Mon..Sun
export interface ClosedSlot { openTime: string; closeTime: string }   // backend names; a CLOSURE window, 'HH:mm'
export type Week = Partial<Record<DayKey, ClosedSlot>>
export interface StoreSchedule { manualOffline: boolean; week: Week }
export const parseSchedule: (payload: unknown) => StoreSchedule   // tolerant: bad json -> { manualOffline:false, week:{} }
export const isClosedBySchedule: (week: Week, now: Date) => boolean   // exact port of web checkIsCurrentlyOfflineBySchedule
export type StoreStatus = { online: boolean; reason: 'manual'|'schedule'|null }
export const storeStatus: (s: StoreSchedule|null, now: Date) => StoreStatus  // null -> {online:true, reason:null}
export const dayName: (d: DayKey) => string            // 'Mon' -> 'Monday'
export const slotLabel: (slot: ClosedSlot|undefined) => string // undefined -> 'Open all day', 00:00-00:00 -> 'Closed all day',
                                                       // else 'Closed 2:00 pm – 4:00 pm'
export const hhmmLabel: (hhmm: string) => string       // '14:00' -> '2:00 pm', '00:30' -> '12:30 am'
export const shiftHHMM: (hhmm: string, minutes: number) => string // wraps in 24h: ('23:30', 30) -> '00:00'

# src/domain/stats.ts
export interface TodayStats { orders: number; revenue: number; avgAcceptSec: number; avgPrepSec: number; completionRate: number }
export const parseStats: (payload: unknown) => TodayStats | null // payload.response.{totalOrdersToday, revenueToday,
                                                       // avgAcceptanceTimeSec, avgPreparationTimeSec, completionRate}; non-number -> 0; no response -> null

# src/domain/history.ts
export const mergeOrders: (prev: Order[], next: Order[]) => Order[]   // append, keep first copy per orderId

# src/api/endpoints.ts (append only)
export const getDashboardStats: (shopId: string) => Promise<TodayStats>
     GET /quickVerse/v2/order/{shopId}/dashboard-stats ; null parse -> throw ApiError("Could not load today's numbers", null)
export interface OrdersPage { orders: Order[]; totalPages: number }
export const getOrdersPage: (shopId: string, f: { statuses?: HistoryStatus[]; timeRange?: TimeRange; page: number }) => Promise<OrdersPage>
     GET /quickVerse/v2/order/{shopId}/orders  query: orderStatus (repeated, omitted when empty), timeRange, page
export const getSchedule: (shopId: string) => Promise<StoreSchedule>   GET /v1/vendor-schedules/shop/{shopId}
export const setManualOffline: (shopId: string, offline: boolean) => Promise<void>
     PATCH /v1/vendor-schedules/shop/{shopId}/manual-offline?manualOfflineOverride=<bool>
export const saveSchedule: (shopId: string, week: Week, manualOffline: boolean) => Promise<void>
     POST /v1/vendor-schedules/configure body {shopId, manualOfflineOverride: manualOffline, scheduleActive: true, operatingHours: JSON.stringify(week)}

# src/hooks/useRemote.ts
export const useRemote: <T>(load: (() => Promise<T>) | null, deps: unknown[]) =>
  { data: T | null; error: string | null; loading: boolean; reload: () => void }   // null load = idle; ignores results after unmount / stale
# src/hooks/useStoreStatus.ts
export const useStoreStatus: (shopId: string) => { schedule: StoreSchedule|null; status: StoreStatus; busy: boolean;
  error: string|null; setOnline: (online: boolean) => Promise<boolean>; save: (week: Week) => Promise<boolean>; reload: () => void }
# src/hooks/useShopProfile.ts
export const useShopProfile: (shopId: string, board: Board) => ShopDetails | null

# src/app/MainShell.tsx
export type TabKey = 'orders'|'history'|'insights'|'account'
export type PageKey = 'timings'|'alerts'
export const backAction: (s: { tab: TabKey; stack: PageKey[] }) => { tab: TabKey; stack: PageKey[] } | null  // null = let Android handle
export const MainShell: (p:{ session: Session }) => JSX
# src/screens/OrdersScreen.tsx  export const OrdersScreen: (p:{ session; board: Board; setup: SetupStatus; store: ReturnType<typeof useStoreStatus>;
#                                 shopName: string|null; segment: OrderPhase; onSegment: (p: OrderPhase) => void; onOpenAlerts: () => void }) => JSX
# Strings kept for existing tests: 'Send OTP', 'Shop #', 'No new orders'.
```

## Risks
| R | Scenario | Mitigation | Covering test (task) |
|---|---|---|---|
| R1 | Redesign changes when/what `markLocal` is called → order re-rings or never stops | OrderCard keeps the `run()` sequence verbatim; no native edits | orders.test :: accept/reject/ready/handover call order + failure path (T05); AC1 diff check (T09) |
| R2 | Malformed server order (no items, null rider/shop, strings for numbers) crashes a screen | all display helpers tolerant; `Array.isArray` guards | format.test :: bad inputs (T02); orders.test :: minimal order renders (T05) |
| R3 | Store goes offline by accident | confirm sheet before going offline; switch disabled while busy | store.test :: setOnline(false) only after confirm (T04/T03) |
| R4 | Schedule semantics inverted → shows Open when closed | exact port + web's own cases | schedule.test :: closure window, all-day, overnight, missing day (T02) |
| R5 | Saving timings re-opens a manually-offline store | preserve manualOffline | api.test :: saveSchedule body (T02) |
| R6 | History pages overlap → duplicate rows / React key crash | `mergeOrders` dedupe | history.test :: merge keeps first copy (T02) |
| R7 | Font/icon file missing → wrong glyphs | files named exactly like `fonts.*`; script asserts every ICONS name exists | make-fonts.py exit code (T01); emulator look (T09) |
| R8 | Back button exits app from a sub-page | `backAction` pure function | shell.test :: back from page, tab, root (T04) |
| R9 | Pending order arrives while on History → vendor never sees it | MainShell forces Orders/New on pending increase | shell.test :: pending increase switches tab (T04) |
| R10 | Stale async result overwrites newer filter (fast chip taps) | `useRemote` ignores stale responses (request id) | remote.test :: stale result ignored (T03) |
| R11 | Tests hit production | tests mock `fetch` globally (App.test adds mock) | all tests run offline (T04) |
| R12 | 1 s tick re-renders all screens | tick lives in OrdersScreen only; cards `memo` | manual check (T09) |

## Test matrix
| AC or R | Test (file :: name) | Task |
|---|---|---|
| AC14, R7 | __tests__/ui.test.tsx :: renders Txt/Icon/Button/Segmented/Row/EmptyState; Button disabled/busy | T01 |
| AC5, AC11, R4, R5 | __tests__/schedule.test.ts :: isClosedBySchedule / storeStatus / slotLabel / shiftHHMM ; api.test :: saveSchedule, setManualOffline | T02 |
| AC6, AC8, AC9, R2, R6 | __tests__/format.test.ts :: money/dayTime/minutesLabel/paymentLabel/riderStatusLabel/historyStatusInfo/itemsSummary ; history merge ; parseStats ; api.test :: getOrdersPage query, getDashboardStats | T02 |
| R10, AC10, R3 | __tests__/hooks.test.tsx :: useRemote stale/unmount ; useShopProfile board-first ; useStoreStatus setOnline/save | T03 |
| AC3, AC4, AC13, R8, R9, R11 | __tests__/App.test.tsx (existing 2 unchanged) + __tests__/shell.test.tsx :: backAction ; tab bar ; pending switch | T04 |
| AC2, AC6, AC7, AC12, R1 | __tests__/orders.test.tsx :: action sequences, failure keeps board, reject presets/other, late state, setup banner | T05 |
| AC8 | __tests__/history.test.tsx :: chips → query, empty, error retry, details sheet | T06 |
| AC9 | __tests__/insights.test.tsx :: renders stats + live counts, error retry | T07 |
| AC10, AC11, AC12 | __tests__/account.test.tsx :: profile, logout confirm, timings edit saves week, alerts checklist | T08 |
| AC1, AC15 | orch.sh verify-all + `git diff ab92e97 -- android/app/src/main/java specs` empty | T09 |

## Task DAG
| ID | Title | Deps | Wave | Write-set | Risk | Model |
|---|---|---|---|---|---|---|
| T01 | Design system: fonts, icon font, tokens, UI kit | — | 1 | android/app/src/main/assets/fonts/, scripts/make-fonts.py, src/ui/, __tests__/ui.test.tsx, docs/DESIGN.md | med | sonnet |
| T02 | Domain + API for stats/history/schedule | — | 1 | src/domain/, src/api/endpoints.ts, __tests__/schedule.test.ts, __tests__/format.test.ts, __tests__/api.test.ts | med | sonnet |
| T03 | Hooks: useRemote, useStoreStatus, useShopProfile | T02 | 2 | src/hooks/, __tests__/hooks.test.tsx | med | sonnet |
| T04 | App shell, tab bar, back handling, Login redesign | T01 T03 | 3 | App.tsx, src/app/, src/screens/LoginScreen.tsx, src/screens/OrdersScreen.tsx (props only), __tests__/App.test.tsx, __tests__/shell.test.tsx | high | opus |
| T05 | Orders screen, OrderCard, RejectSheet, setup banner | T04 | 4 | src/screens/OrdersScreen.tsx, src/components/OrderCard.tsx, src/components/RejectSheet.tsx, src/components/SetupChecklist.tsx, src/components/StoreSwitch.tsx, __tests__/orders.test.tsx | high | opus |
| T06 | History screen + OrderDetailsSheet | T04 | 5 | src/screens/HistoryScreen.tsx, src/components/OrderDetailsSheet.tsx, src/app/MainShell.tsx, __tests__/history.test.tsx | med | sonnet |
| T07 | Insights screen | T04 | 6 | src/screens/InsightsScreen.tsx, src/app/MainShell.tsx, __tests__/insights.test.tsx | low | sonnet |
| T08 | Account, Store timings, Order alerts pages | T04 | 7 | src/screens/AccountScreen.tsx, src/screens/StoreTimingsScreen.tsx, src/screens/AlertsScreen.tsx, src/app/MainShell.tsx, __tests__/account.test.tsx | med | sonnet |
| T09 | Integrate: verify-all, AC1 diff, docs, Android build | T05–T08 | 8 | README.md, docs/DESIGN.md, LEARNING_LOG.md | low | sonnet |
(Sequential: one executor — the orchestrator itself, see A5. MainShell is a hot file → T06/T07/T08 serialized.)

## Rollback
Everything lives on `dev-v1.0`; `main` is untouched. Undo = `git switch main` (or revert individual task commits on
dev-v1.0). No backend, native, or data changes are made by this run.
