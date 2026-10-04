# QuickVerse Vendor (Android)

Rings the shop — loud, on the alarm channel, even on Silent — until a new order is accepted.
Same backend and rules as the web vendor dashboard. Android only.

## How it works
```
WatcherService (Kotlin foreground service, always on while logged in)
  ├─ polls GET /quickVerse/v2/order/{shopId}/orders (PENDING/ACCEPTED/READY) every 10s  ← source of truth
  ├─ STOMP socket /topic/vendor/{shopId}: any event = "poll now" (+3s)                 ← speed only
  ├─ OrderBook: board + "what this phone just did" (120s grace, no re-ring)            ← OrderBook.kt
  └─ ring while anything is PENDING: Ringer (alarm stream, max volume, vibration)
     + full-screen notification over the lock screen. Nothing else stops it.
Firebase push NEW_ORDER (optional) → starts the service when the phone killed it.
BootReceiver → resumes after reboot / app update.
React Native = screens only: Login (phone + OTP), New / Preparing / Ready tabs, setup checklist.
Accept / Reject / Ready / Handover are REST calls from JS, then `markLocal` tells the native board.
```
Session expiry logs the vendor out (same as the website) and posts "Logged out — orders will NOT ring".

## Prerequisites (Windows)
- Node ≥ 20, JDK **17** (not Android Studio's bundled JDK 25). A portable one lives in
  `..\.tools\jdk17`; point `JAVA_HOME` at it (or set Android Studio → Gradle JDK = 17).
- Android SDK (Android Studio). `android/local.properties`: `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`.
  Missing SDK pieces (platform 36, NDK 27.1, CMake) download automatically on first build.

## Run
```bash
npm install
npm start                      # Metro
npm run android                # debug build on emulator / USB phone
```

## Checks
```bash
npm run typecheck && npm run lint && npm test          # JS
cd android && ./gradlew testDebugUnitTest              # Kotlin (OrderBook, JWT, STOMP, parsing)
node scripts/smoke.mjs <shopId> [jwt]                  # backend contract, once the backend is up
```

## Release APK
1. Create the key once (back it up — losing it means vendors must uninstall to update):
   `keytool -genkeypair -v -keystore android/app/quickverse-vendor.keystore -alias quickverse-vendor -keyalg RSA -keysize 2048 -validity 10000`
2. `android/keystore.properties` (git-ignored):
   ```
   storeFile=quickverse-vendor.keystore
   storePassword=...
   keyAlias=quickverse-vendor
   keyPassword=...
   ```
3. `cd android && ./gradlew assembleRelease` → `android/app/build/outputs/apk/release/app-release.apk`
   (without keystore.properties the release APK is signed with the debug key — for testing only).

## Push (optional, needs backend work)
See `docs/BACKEND-PUSH.md`. Drop `google-services.json` into `android/app/` and rebuild; without it,
push is simply off.

## Phone setup (shown in-app when missing)
Notifications on · Full-screen alerts allowed (Android 14+) · Battery: Unrestricted ·
Xiaomi/Oppo/Vivo/Realme: Autostart on. Keep the counter phone on its charger.

## Device test checklist
- [ ] Login with OTP → "Live" dot, service notification "Live — waiting for orders"
- [ ] Place an order → rings within ~10s (≈2s with the socket), screen locked AND on Silent
- [ ] Accept (pick prep) → ring stops at once; order in Preparing with countdown
- [ ] Two orders → ring continues until both are handled
- [ ] Accept on the web dashboard → phone stops ringing within 10s
- [ ] Customer cancels → ring stops
- [ ] Reject with reason → gone, no re-ring
- [ ] Mark ready → Ready tab; Handover enabled only when rider ARRIVED_AT_STORE
- [ ] Wi-Fi off/on while idle → reconnects, orders placed meanwhile ring
- [ ] Swipe app away, reboot phone → still rings for a new order
- [ ] Test sound plays ~2s, never silences a real ring
- [ ] Log out → nothing rings

## Known limits
- Backend has no TLS: plain HTTP to `prd.quickverse.in` only (`network_security_config.xml`).
  When it gets HTTPS, switch `BASE_URL` (src/config.ts, Api.kt) and `WS_URL` (StompNudge.kt) to https/wss.
- React Native 0.81.4 to match the transporter app; plan an upgrade (0.87+) later.
- A force-stopped app cannot ring until opened again (Android rule).
