# ORCHESTRATOR STATE
run: vendor-app-v1 · branch: main · created: 2026-10-05
status: in-progress

## NEXT ACTION
Implement remaining tasks below in order; gate each with: npx tsc --noEmit && npx eslint . && npx jest

## Tasks
- [x] T00 Scaffold RN 0.81.4, deps, git, orchestrate kit, JDK 17 portable (../.tools/jdk17)
- [x] T01 Core logic: domain/orderRules, store/orderStore, store/sessionStore, store/syncStatus
- [ ] T02 API client + endpoints
- [ ] T03 Native Ringer TurboModule (Kotlin) + JS wrapper
- [ ] T04 Sync: socket, poller, watcher (foreground service loop) + shift lifecycle
- [ ] T05 Notifications + ring controller + manifest/resources
- [ ] T06 Push (FCM, guarded) + docs/BACKEND-PUSH.md
- [ ] T07 UI: Login, Orders (tabs), cards, setup checklist
- [ ] T08 Tests (ported web cases + new), smoke script, README
- [ ] T09 Gate: tsc, eslint, jest, gradle assembleDebug + assembleRelease

## Open questions / unverified (needs live backend)
- WS raw path /quickVerse/ws/websocket; creationTime in socket frames; JWT lifetime.
