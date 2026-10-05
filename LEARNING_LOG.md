# Learning log — QuickVerse Vendor app

## 2026-10-06 — Live end-to-end test on the Android emulator

### What we did
We tested the finished QuickVerse Vendor app against the real (live) backend, on an Android emulator,
for shop 68246. Every item on the device checklist passed except "Handover unlocks when the rider
arrives", which needs a real rider. No code bugs were found, so no code was changed.

### The map
```
Customer app / website ──places order──▶ QuickVerse backend (prd.quickverse.in)
                                            │            │
                       live socket "nudge"  │            │  REST "list my orders" (every 10s)
                                            ▼            ▼
                     ┌──────────── Vendor app (phone) ─────────────┐
                     │ WatcherService (always on, Kotlin)           │
                     │   ├─ StompNudge: socket = "check now!"       │
                     │   ├─ Api + OrderBook: the real order list    │
                     │   └─ Ringer: alarm sound while any order New │
                     │ BootReceiver: restarts watcher after reboot  │
                     │ Screens (React Native): Login, New/Preparing/│
                     │   Ready tabs, Accept/Reject/Ready buttons    │
                     └──────────────────────────────────────────────┘
Web dashboard ──accept/reject──▶ backend ──▶ phone notices on next check ──▶ stops ringing
```

### Results
| # | Check | Result |
|---|---|---|
| 1 | OTP login → "Live" | Pass |
| 2 | Rings on Silent with the screen locked; screen wakes itself | Pass (volume 2→7, back to 2 after) |
| 3 | Accept on phone stops ring | Pass |
| 4 | Two orders keep ringing until both are handled | Pass |
| 5 | Accept on web dashboard stops the phone | Pass (almost instant) |
| 6 | Customer cancels → ring stops | Pass |
| 7 | Reject with reason (empty reason blocked) | Pass |
| 8 | Mark ready → Ready tab; Handover locked until rider arrives | Pass (rider-arrived part not testable) |
| 9 | Connection lost → reconnects by itself | Pass (a real 2-minute backend outage) |
| 10 | Phone restarted → still rings | Pass (rang for an order placed while it was off) |
| 11 | Test sound ~2s, never silences a real ring | Pass (exactly 2.0s; ignored during a ring) |
| 12 | Log out → nothing rings | Pass |

### What was hard, and how it was solved
- **Low memory on the PC.** The emulator needs ~2–3 GB; we closed programs and it booted.
- **2-hour limit** on programs Claude starts in the background, so the emulator shut down twice.
  Fix: you start the emulator yourself (no limit); Claude only watches and taps through adb.
- **Live backend went down** (502 errors, 22:44–22:46). Not our bug — the app showed
  "No connection — retrying" and recovered by itself, which turned into a free test.
- **Two people pressing buttons at once** made results confusing; we agreed who taps what.

### Still open (outside the checklist)
- Test on a real shop phone, ideally Xiaomi / Oppo / Vivo / Realme (they kill background apps harder).
- Make a permanent release signing key and back it up before shops install the app.
- Backend work for push notifications (docs/BACKEND-PUSH.md).
- Backend note: the live socket accepts connections with no login token at all.

### Three concepts learned
1. **Alarm stream** — Android has separate volume sliders; alarms play even on Silent, so the app rings
   on the alarm stream.
2. **Full-screen intent** — the "this is urgent" pass (used by phone calls and alarm clocks) that lets an
   app light up a locked screen.
3. **Source of truth vs. nudge** — the 10-second order check is the truth; the live socket only says
   "check now". If the socket breaks, orders still ring, just a few seconds later.

### Check your understanding
If the live socket stops working for an hour but the 10-second check still works, will the shop miss
an order? What changes for them?
