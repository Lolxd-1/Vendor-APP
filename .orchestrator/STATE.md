# ORCHESTRATOR STATE
run: vendor-app-v1 · branch: main · created: 2026-10-05
status: done (offline scope) — live checks pending backend + device

## NEXT ACTION
Backend up -> `node scripts/smoke.mjs <shopId> [jwt]`. Then install
android/app/build/outputs/apk/release/app-release.apk on a phone/emulator and run the README checklist.
Emulator could not boot here (needs ~4 GB free RAM; 3.7 GB free while other programs were open).

## Handoff (read first in a new session)
- Read: this file, PLAN.md (original plan; Architecture section superseded below), README.md, docs/BACKEND-PUSH.md.
- Web reference repo (read-only, do not modify): ../quickverse-web-vendor-dashboard-dev (branch v1.5.2).
- Build env: JDK 17 at ../.tools/jdk17 (Android Studio's JDK 25 does not work). Windows MAX_PATH ->
  build from `subst Q:` + `QV_REAL_ROOT` (README "Windows: build from a short path"). Ask the user before
  running `subst` or any other system-level change.
- Emulator AVD name: `Medium_Phone_API_37.0` (needs ~4 GB free RAM). adb: %LOCALAPPDATA%\Android\Sdk\platform-tools.
- google-services.json in the repo root is NOT ours (only com.quickverse / com.quickverseadmin_ui); untracked.
- User decisions: package com.quickverse.vendor; scope = New/Preparing/Ready tabs; alarm full volume on
  Silent; expiry = log out like the website; web PC auto-print of phone accepts = deferred; RN stays 0.81.4.
- Never run order actions (accept/reject/ready/handover) or OTP requests against prd without the user's
  explicit OK — it is the live production backend.

## Architecture change (2026-10-05, from Plan-agent verification — supersedes PLAN.md "Architecture")
- Always-on watcher is NATIVE Kotlin (WatcherService, specialUse FGS): headless-JS timers fire every vsync
  (CPU/OEM kills), one unhandled rejection kills the task, Android 17 blocks background audio outside an FGS.
- REST poll = source of truth (OrderBook.kt); STOMP socket = "poll now" nudge only (frame content ignored),
  so the web's socket-merge rules (phantom inserts, forward-only frames) are unnecessary by construction.
- Notifee (archived 2026-04-07), background-actions, stompjs, zustand, AsyncStorage, RNFirebase: dropped.
  Native notifications; native Firebase SDK (PushService) as dormant wake-up.
- minSdk 26. RN stays 0.81.4 (team version); upgrade to 0.87+ later.

## Tasks
- [x] T00 Scaffold RN 0.81.4, git, orchestrate kit, JDK 17 portable
- [x] T01 OrderBook (Kotlin) + JUnit cases ported from web dashboardStore.test.ts
- [x] T02 JS API client + endpoints (login, OTP, accept/reject/ready/handover) + tests
- [x] T03 Ringer (alarm stream, max volume + restore, vibration, test beep)
- [x] T04 WatcherService + StompNudge + Api.kt + Session/Jwt + VendorRuntime
- [x] T05 Notifications (silent full-screen order alert, service, logged-out) + manifest + NSC
- [x] T06 Push (FCM wake-up, guarded) + BootReceiver + docs/BACKEND-PUSH.md
- [x] T07 UI: Login, Orders (New/Preparing/Ready), OrderCard, SetupChecklist
- [x] T08 Jest (17) + smoke script + README
- [x] T09 Gate: tsc, eslint, jest 17/17, gradle testDebugUnitTest 21/21, assembleDebug, assembleRelease

## Unverified (needs live backend / device)
- WS raw path /quickVerse/ws/websocket accepts STOMP CONNECT (smoke.mjs proves it).
- JWT lifetime; backend VENDOR push (docs/BACKEND-PUSH.md).
- `google-services.json` in repo root is for com.quickverse / com.quickverseadmin_ui only — a
  com.quickverse.vendor entry must be registered before it goes to android/app/.
