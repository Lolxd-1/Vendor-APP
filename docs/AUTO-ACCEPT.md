# Auto-accept and print sync — logic design

Status: design for review (2026-10-12). Applies to the phone app (this repo) and the PC dashboard
(Vendor-Dashboard). Nothing here changes the backend.

## 1. What it does
A shop can let one device accept new orders without anyone tapping Accept (like Petpooja's auto-accept), and the
Bill + KOT print on whichever device has the printer — the PC or the phone. The manual flow (ring → Accept / Reject)
stays exactly as it is and is always available.

Three promises, in priority order:
1. **No false accepts** — never accept an order the shop has closed for, an order someone already handled, a stale
   or broken order, or one the staff stopped.
2. **No silent misses** — if auto-accept does not act, the order keeps ringing and the screen says why.
3. **One print per order** — never two KOTs for one order (two KOTs can mean the food is cooked twice). When the app
   cannot be sure, it does not print by itself; it shows "Not printed here" with a Print button.

## 2. Shop setups
| Setup | Who should auto-accept | Who prints |
|---|---|---|
| S1 Phone only (+ USB printer, or no printer) | phone | phone (if printer) |
| S2 PC with printer + phone | PC (phone optional as backup) | PC (also prints orders accepted on the phone) |
| S3 PC with printer, no phone | PC | PC |
| S4 Phone with printer + PC without printer | phone | phone (also prints orders accepted on the PC) |

## 3. Settings (per device, stored on that device, all OFF by default)
| Setting | PC dashboard | Phone app |
|---|---|---|
| Auto-accept new orders | off | off |
| Wait before auto-accepting | 10 s or 20 s (default 10 s) | 40 s, 60 s or 90 s (default 40 s) |
| Prep time for auto-accepted orders | 5–25 min (default 15) | 5–25 min (default 15) |
| Print orders accepted on other devices | off | off |

Why different waits: the PC is usually the printing station, so it acts first; a phone with auto-accept on only acts
when the PC did not (PC closed, PC asleep). The option lists never overlap, so the two are always at least 20 s apart.

During the wait the order rings as today. Its card shows "Auto-accepts in 0:32" and a **Don't auto-accept** button
(stops auto-accept for that order on this device; staff then accept or reject by hand).

## 4. When a device auto-accepts — all must be true at that moment
| # | Condition | Prevents |
|---|---|---|
| E1 | Auto-accept is on for this device and it is logged in | accepts nobody asked for |
| E2 | The order has been New on this device for at least the wait (counted from when this device first saw it, or from when auto-accept was switched on, whichever is later) | accepting before staff could react; a backlog accepted the moment the switch is turned on |
| E3 | The order was placed at most 15 min ago (unreadable time = not eligible) | accepting stale orders after the device was off |
| E4 | The order lists at least one item | accepting (and printing) a blank order |
| E5 | The store is open now: a store-status read from the last 2 min says not switched offline and not inside store timings (a failed read = not eligible, try again next cycle) | accepting after the vendor closed the shop |
| E6 | If this device prints on accept: its printer is ready (PC: print helper running and printer queue not in error; phone: USB printer attached and allowed) | an accepted order nobody in the kitchen sees |
| E7 | A server reply from the last 15 s still lists the order as New (PC fetches the list right before acting; phone acts right after its poll) | accepting an order already accepted, rejected or cancelled elsewhere |
| E8 | Nobody pressed Don't auto-accept for it on this device, and this device has tried it fewer than 2 times | fighting the staff; endless retries |
| E9 | Only one auto-accept at a time per device; on a PC only one browser tab acts | the same device accepting twice |

If any condition fails, the order simply keeps ringing for a person, and the Orders screen shows the reason
("Auto-accept paused: store is closed", "…: printer not ready", "…: checking connection").

## 5. What happens when it accepts
1. Accept with the device's prep time — through exactly the same code as the Accept button.
2. If this device prints on accept: Bill + KOT, once (the device's "already printed" memory).
3. Tell the staff: the card says "Auto-accepted", the phone plays a short chime and shows a notification, the PC
   shows a toast. Every decision goes into a "Recent auto-accept activity" list (last 50) in settings.

| Accept call result | What the device does |
|---|---|
| OK | done |
| Refused by the server (error reply) | read the order list again: Accepted → someone else took it, stop (no print here); still New → try once more after ≥ 10 s; second refusal → stop, keep ringing, alert "Auto-accept failed — accept it yourself" |
| No reply (timeout, connection lost) | wait for the next fresh read: still New → try once more; now Accepted → it may have been this device or another one, so **do not print by itself**; show "Not printed here" + Print |

## 6. Print sync (print orders accepted on another device)
On the device with the printer, with "Print orders accepted on other devices" on, an order prints by itself only if:
- P1 this device saw it as New and then saw it become Accepted (it was watching when it happened),
- P2 this device did not accept it itself,
- P3 it was accepted at most 10 min ago (server time; if missing, the moment this device saw the change),
- P4 it has not been printed on this device yet and it lists items.

Otherwise (the dashboard was opened after the order was accepted, or it is older) it does not print by itself; the
card shows "Accepted on another device · not printed here" with a Print button.

## 7. Real-world cases
| # | Situation | What happens | Guard |
|---|---|---|---|
| 1 | S1, phone auto-accept on, printer ready, shop open; order arrives | rings 40 s → server still says New → accepted (15 min) → ring stops → Bill + KOT print → chime | — |
| 2 | Staff press Accept (20 min) at 10 s | normal manual accept; auto-accept never acts (not New any more) | E7 |
| 3 | Staff reject at 10 s | rejected; nothing else happens | E7 |
| 4 | Staff tap Don't auto-accept | keeps ringing until a person acts | E8 |
| 5 | Customer cancels during the wait | order disappears; nothing accepted | E7 |
| 6 | Order arrives just after the vendor went offline | not auto-accepted; rings; "paused: store is closed" | E5 |
| 7 | Order arrives inside store timings' closed hours | same as 6 | E5 |
| 8 | Store-status read fails (bad network) | not accepted this cycle; tried again on the next poll while the order is still New and young | E5 |
| 9 | Printer unplugged / out of permission, phone prints on accept | not auto-accepted; rings; "paused: printer not ready" | E6 |
| 10 | S2: phone has no printer, PC prints phone orders | phone may auto-accept; PC prints it through print sync | E6 not applied |
| 11 | S2, both PC and phone have auto-accept on | PC accepts at ~10 s; phone's fresh read at ~40 s says Accepted → phone does nothing | waits never overlap + E7 |
| 12 | S2, PC browser closed, phone auto-accept on as backup | phone accepts at ~40 s; PC opened later shows "not printed here" + Print | P1 |
| 13 | Two phones both with auto-accept on | both wait 40 s; small chance both send Accept within the same second — settings screen says to keep it on one device; the backend must refuse a second accept (backend ask) | documented |
| 14 | Accept call times out but the server did accept | next read shows Accepted → no automatic print; "Not printed here" + Print | §5 |
| 15 | Accept refused, order still New | one more try after ≥ 10 s; then stop and alert | E8 |
| 16 | Accept refused because another device won | read shows Accepted → stop, no print on this device | §5 |
| 17 | Phone rebooted / app swiped away | the watcher restarts on its own; the wait restarts from when it sees the order; works with the screen off | native watcher |
| 18 | Phone was off 20 min; order still New when it comes back | placed > 15 min ago → not auto-accepted; rings for a person | E3 |
| 19 | Phone clock wrong by 1 h | every order looks old → never auto-accepted (rings normally); settings show "phone time looks wrong" | E3 (fails safe) |
| 20 | Logged out / session expired | nothing rings, nothing accepted | E1 |
| 21 | Rush: 4 orders within 30 s | each judged on its own; accepted one after another; prints queue one after another | E9 |
| 22 | Order arrives with no items | never auto-accepted; rings | E4 |
| 23 | Internet down | no reads → nothing accepted (orders can't arrive either); resumes when back | E5, E7 |
| 24 | Auto-accept switched on with 3 orders already ringing | each gets the full wait from the switch-on moment | E2 |
| 25 | Auto-accept switched off during the wait | nothing accepted | E1 |
| 26 | PC print sync: phone accepts, PC was watching | PC prints Bill + KOT once, toast "Printed — accepted on phone" | P1–P4 |
| 27 | PC accepts the order itself | normal accept print; print sync sees "accepted here" → no second print | P2 + memory |
| 28 | PC page reloaded after the phone accepted | no automatic print; card shows "not printed here" + Print | P1 |
| 29 | PC has two dashboard tabs open | only the leading tab acts; the shared "already printed" memory blocks a second print | E9, P4 |
| 30 | Print helper down when sync prints | print fails → toast + card "not printed" + Print | §5 |
| 31 | PC dashboard window in the background (browser slows timers) | auto-accept may act up to ~1 min late; the phone backup (if on) covers it | documented |
| 32 | Printer runs out of paper after an auto-accept | order stays accepted; card + notification "Not printed — Reprint"; with "paused: printer not ready" further orders ring | E6, §5 |
| 33 | Both PC and phone have printers and both print orders accepted elsewhere | each prints orders the other accepted → two KOTs; settings say to turn print sync on for one device only | documented |

## 8. Limits we cannot remove without backend work (backend asks)
- No shared "auto-accept is on at this shop" setting: devices cannot see each other's settings, so cases 13 and 33
  are prevented by setting rules and on-screen advice, not by code.
- Please confirm the accept endpoint refuses an order that is no longer PENDING (protects case 13).
- A per-order "printed" flag on the server would let every device know an order was printed.
- Whether customers see the shop as closed during store timings depends on the backend/customer app (not visible
  in these repos); test once on a test shop.

## 9. How it is tested
- The decision (E1–E9, §5, P1–P4) is one pure function on each platform — `decideAutoAccept` (TypeScript, PC) and
  `AutoAcceptPolicy.decide` (Kotlin, phone) — with the cases above as a shared table of inputs and expected results.
  Both test suites run the same table.
- The existing accept, ring and print tests stay unchanged and must keep passing; with auto-accept off, nothing new
  runs.
- Before shops use it: a test shop run of cases 1, 2, 4, 6, 9, 11, 12, 14 (simulated with airplane mode), 17, 26, 28.

## 10. Rollout
Off by default everywhere. Turn it on at one test shop, watch "Recent auto-accept activity" for a day, then enable
shop by shop. Turning the switch off is the instant rollback; no data or backend changes are involved.
