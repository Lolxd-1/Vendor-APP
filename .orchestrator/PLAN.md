# QuickVerse Vendor — React Native Android app (ring until Accept)

## Context
The web vendor dashboard (`quickverse-web-vendor-dashboard-dev/`, branch v1.5.2) exists to ring a shop
loudly until it accepts an incoming order. Vendors miss orders on phones (today they patch it with
MacroDroid). We build the same flow as a native Android app in React Native, in a NEW folder, using
the team's existing mobile stack (the transporter app). Backend (Spring Boot, `http://prd.quickverse.in`)
is down for ~4h and the emulator is still installing, so this run builds and verifies everything that
can be verified offline; live checks run the moment the backend/phone is available.

## Decisions (user)
- Folder: `C:\Users\omkar\Downloads\quickverse-web-vendor-dashboard-dev\quickverse-vendor-app\` (new git repo).
  Orchestrate kit copied in; the real plan + tasks live in `quickverse-vendor-app/.orchestrator/`.
- Package `com.quickverse.vendor`, name "QuickVerse Vendor". Android only.
- Wake-up: live STOMP socket + adaptive REST poll + Firebase push (push optional at runtime; app works without it).
- Scope: Login (phone + 4-digit OTP) · Pending (ring, prep chips 5/10/15/20/25 default 15, Accept, Reject w/ reason >= 3)
  · Accepted (prep countdown, Mark Ready) · Ready (Mark Handed Over only when rider `ARRIVED_AT_STORE`) · Logout.
  Accepted/Ready cards show rider name/status and Rider OTP (last 4 digits of orderId, as on the printed bill).
- Ring: alarm stream, full volume (alarm volume forced to max while ringing, restored after), rings on
  Silent/Vibrate, until pending list is empty. Vibration + full-screen alert over lock screen.
- Session expiry: log out like the website (stop ring + service, clear session, delete push token,
  "Logged out — tap to log in" notification).
- Deferred (not this run): web PC auto-printing phone-accepted orders; Play Store listing; boot auto-start
  (push covers reboot); app icon art.

## Backend contract (frozen — from web code, verified in history)
Headers on every REST call: `Authorization: Basic cXZDYXN0bGVFbnRyeTpjYSR0bGVfUGVybWl0QDAx`,
`Content-Type`/`Accept: application/json`, `Request-Origin: VENDOR`. JWT is used ONLY on STOMP CONNECT.
- `POST /quickVerse/v1/requestOtp {phone}` -> `response.verificationId`
- `POST /quickVerse/v1/login {phone, otp, verificationId}` -> `{jwt, shopId, phone}`; errors `error.message`
- `GET /quickVerse/v2/order/{shopId}/orders?orderStatus=PENDING&orderStatus=ACCEPTED&orderStatus=READY_FOR_PICKUP` -> `response.orders[]`
- `PATCH /quickVerse/v2/order/{orderId}/accept?preparationTime=N` · `/reject?reason=` · `/ready` · `/handover`
- STOMP: `ws://prd.quickverse.in/quickVerse/ws/websocket` (SockJS raw path — UNVERIFIED until backend up),
  CONNECT `Authorization: Bearer <jwt>`, SUBSCRIBE `/topic/vendor/{shopId}`.
- Push registration (exists for transporters): `POST /quickVerse/v1/updateDeviceRegistry` with role `VENDOR`
  + `shopId` (backend must add VENDOR support — spec in `docs/BACKEND-PUSH.md`).

## Order rules to port verbatim (source: web `src/stores/useDashboardStore.ts`, `src/hooks/useOrderWebsocket.tsx`)
normalisePhase(status||state) · terminal {REJECTED,CANCELLED,COMPLETED,IN_TRANSIT} · new order = no status +
string orderId + non-empty `orderItem` · status-only frame never inserts · socket moves forward-only ·
closed-order memory (2000) blocks re-insert · reconcile: failed poll = no news, 120s grace for absent
orders refreshed on every confirmation, terminal-in-list drops at once, stale poll can't revert a local move
within 120s · never auto-retry Accept (failed accept keeps the order pending, warns "may have been accepted").
Ring = `pendingOrders.length > 0`; start idempotent, stop cancels in-flight start; stop on logout.
Poll: 10s, 30s only while a socket frame arrived promptly (<5s old) in the last 120s; resync on reconnect/foreground.

## Architecture (team stack — same libs/versions as the transporter app, nothing new)
RN 0.81.4 bare, TypeScript, New Arch + Hermes; SDK compile/target 36, min 24; Gradle 8.14.3; Kotlin 2.1.20;
NDK 27.1.12297006. Deps: zustand, @react-native-async-storage/async-storage, @stomp/stompjs +
text-encoding-polyfill, react-native-background-actions, @notifee/react-native, @react-native-firebase/app
+ messaging, react-native-safe-area-context. No navigation lib, no axios, no device-info.
```
index.js            polyfill, FCM background handler, notifee bg events, registerComponent
App.tsx             session ? <OrdersScreen/> : <LoginScreen/>
src/config.ts       BASE_URL, WS_URL, BASIC_AUTH, timings, channel ids
src/api/            client.ts (fetch + 15s timeout + ApiError), endpoints.ts
src/domain/         order.ts (types), orderRules.ts (phase/terminal/valid/classifyFrame)
src/store/          sessionStore.ts (persist + isTokenExpired), orderStore.ts (port of web store)
src/sync/           socket.ts (STOMP, RN flags), poller.ts, watcher.ts (foreground-service task loop)
src/alert/          ringer.ts (TurboModule wrapper + ring controller), notifications.ts (Notifee)
src/push/push.ts    FCM token -> updateDeviceRegistry; NEW_ORDER -> start watcher + immediate poll
src/screens/        LoginScreen.tsx, OrdersScreen.tsx (tabs Pending/Accepted/Ready + setup checklist)
src/components/     PendingCard, AcceptedCard, ReadyCard, SetupChecklist
specs/NativeRinger.ts + android/.../RingerModule.kt, RingerPackage.kt (MediaPlayer loop, USAGE_ALARM,
                    max alarm volume + restore, vibration, canUseFullScreenIntent + settings intent, test beep)
android manifest:   INTERNET, POST_NOTIFICATIONS, FOREGROUND_SERVICE(+_SPECIAL_USE), WAKE_LOCK, VIBRATE,
                    USE_FULL_SCREEN_INTENT; usesCleartextTraffic (backend has no TLS, team pattern);
                    MainActivity showWhenLocked/turnScreenOn; background-actions service -> specialUse
                    (+ PROPERTY_SPECIAL_USE_FGS_SUBTYPE); res/raw/order_ring.mp3 (web order-ring-v2.mp3) + keep.xml
google-services:    plugin applied ONLY if android/app/google-services.json exists; JS push guarded -> no crash without it
```
Gate at scaffold: inspect installed react-native-background-actions; if it cannot run as `specialUse`,
replace it with a ~60-line Kotlin HeadlessJsTaskService (same JS task loop).

## Execution (orchestrate kit, in the app folder)
0. Scaffold (main session): create folder; copy the orchestrate kit (`orchestrate-kit/orchestrate-kit/.claude`
   + `.opencode`, as its install.sh does) into it;
   `npx @react-native-community/cli@20.0.2 init QuickVerseVendor --version 0.81.4 --package-name com.quickverse.vendor`;
   git init; install deps; portable JDK 17 into `..\.tools\jdk17` (no admin); `android/local.properties` sdk.dir;
   baseline: tsc, jest, eslint, `gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`.
1. Write `.orchestrator/PLAN.md` / `STATE.md` / `tasks/*.md` (ACs, frozen contracts above, test matrix).
2. Waves (orch-executor subagents, gated by tsc + eslint + jest after each):
   W1 core logic + ported tests | api client | native Ringer module
   W2 socket + poller + watcher | notifications + manifest
   W3 push + docs/BACKEND-PUSH.md | UI screens/cards/checklist
   W4 scripts/smoke.mjs + README (run, build, release keystore) | final gate + orch-reviewer review
3. Final: `gradlew assembleRelease` with a generated release keystore (passwords in gitignored
   `android/keystore.properties`; user must back the keystore up). Nothing pushed anywhere.

## Verification
Offline now: `npx tsc --noEmit` · `npx eslint .` · `npx jest` (ported ~80 web cases + new ones: ring controller,
expiry logout, poll interval, frame classification, accept-failure keeps pending) · `gradlew assembleDebug` +
`assembleRelease` succeed.
When backend is up: `node scripts/smoke.mjs <shopId>` -> SockJS /info ok, STOMP CONNECT on the ws path, active-orders GET shape.
When phone/emulator is up (README checklist): login -> place test order -> rings with screen locked/silent ->
Accept stops ring -> Mark Ready -> Handover; customer cancel stops ring; kill app + push wakes it (after backend push lands).

## User action items
Firebase console: add Android app `com.quickverse.vendor` to project `quickverse-app`, drop
`google-services.json` in `android/app/`. Backend team: implement `docs/BACKEND-PUSH.md`. Back up the release keystore.
