# Recon: web vendor dashboard printing pipeline end to end
Root: C:/Users/omkar/Downloads/Feature/Vendor-Dashboard-prod-v1.6.0 (paths below relative to it). Abbrev: PA=src/utils/print/printAgent.ts, UPO=src/hooks/usePrintOrder.ts, PL=src/utils/print/printLedger.ts, BT=src/utils/print/billTemplates.ts, RF=src/utils/print/receiptFormat.ts, AG=print-agent/agent.ps1.

## Answer

### 1. Triggers
- Accept click (the ONLY auto-print): src/hooks/usePendingOrders.ts:26-39. `acceptOrder(...).unwrap()` -> `moveToAccepted` -> `await printBothOnAccept(fullOrder, prepTime)` (line 35). Wrapped: on throw, toast "Accepted, but auto-print failed — use Reprint" (:37).
- Accept FAILS (network etc): no print, no retry; `markAcceptUnconfirmed(orderId)` + toast (usePendingOrders.ts:45-48; comment :41-44 "Never auto-retry or auto-print on this path").
- Reprint buttons (manual): AcceptedOrderCard.tsx:180 (Bill), :187 (KOT); ReadyOrderCard.tsx:133 (both); OrderDetailsModal.tsx:156 (bill), :163 (kot).
- "Accepted but unprinted" detection: ONLY for this PC's own failed accept. AcceptedOrderCard.tsx:30 `needsPrint = !printedHere && wasAcceptUnconfirmed(order.orderId) && !wasPrinted(order.orderId)`; shows red banner "Bill + KOT not printed — accept was not confirmed on this PC" (:~70-80) with a button -> `handlePrintMissed` (:32-37) = `reprint(order,"both")` then `markPrinted`.
- Retry: no automatic retry anywhere. On total failure of auto-print the claim is released (UPO:59-62) so Reprint works; toast says "use Reprint". Timeout never falls back/retries (PA:243).
- No timer/poll-based printing: grep for print callers shows only usePendingOrders, AcceptedOrderCard, ReadyOrderCard, OrderDetailsModal use usePrintOrder.
- Itemless guard: UPO:17-23 `refuseItemless` blocks print when no orderItem (toast "Press Refresh, then Reprint"); used in printBothOnAccept (:40) and reprint (:82).

### 2. Browser -> agent
- URL: `http://127.0.0.1:<port>/print`, default port 1818 (PA:18, :137). Port from localStorage `qv_agent_port` (PA:124, :134). Agent binds `http://127.0.0.1:$Port/` only (AG:367-368, header AG:3).
- Endpoints (AG:409-424..): GET /status -> `{online:true,version}` ; GET /version ; GET /printers -> `{printers,real,detail:[{name,driver,port,isVirtual}]}` ; GET /queue -> `{queues:[{name,status,jobs,hasError,errorText}]}` ; POST /print ; OPTIONS -> 204; else 404 "not found".
- POST /print payload: `{ printer: string, text: string }` JSON, `Content-Type: application/json` (PA:160-164). Plain text; heading marker char 14 (BIG) inline. Agent: 1MB cap -> 413 (AG:~427), bad json -> 400, missing printer/text -> 400, print error -> 500 `print failed: <msg>`, ok -> 200 "ok".
- Auth: NO token. Only origin-locked CORS: AG:15-20 ALLOWED_ORIGINS = https://vendor-dashboard-quickverse.vercel.app, http://prd.quickverse.in, http://localhost:5173, http://127.0.0.1:5173. Send-Cors AG:71-85: no Origin header -> served with no CORS headers (curl etc. work, i.e. NOT enforced server-side); disallowed origin -> logs CORS-DENY and sends no ACAO header (browser blocks reading). Adds Access-Control-Allow-Private-Network (AG:82). Requests are never rejected server-side by origin (inferred from AG:75-84).
- Timeouts (client): print 20_000 ms (PA:153 PRINT_TIMEOUT_MS); /status 1500 (PA:108,194); /printers 2000 (PA:67); /queue 2500 (PA:268). Agent: spooler lookups 3000 ms (AG:117), print call 10000 ms (AG:120), HttpListener 15s entity/header/idle (AG:375-378). Single-threaded request loop (AG comment ~AG:326-329).
- Error handling (PA:155-189, 232-251): `printViaAgentDetailed` -> {ok} | {ok:false,error} | {timedOut:true,error:"printer did not answer in time — CHECK THE PRINTER before using Reprint"} | "helper unreachable — is print-agent running on THIS pc?". `printTextDetailed`: timeout -> where "failed" (no fallback, avoids duplicate); agent refused (non-unreachable) -> "failed" with reason; unreachable (regex /unreachable|failed to fetch|network/) -> browser fallback `printViaBrowser` (window.open 320x600, 80mm @page, calls window.print()) -> where "browser"; popup blocked -> "failed".
- UI on failure (UPO:50-74 accept, :92-107 reprint): all success -> toast "Bill + KOT sent to printer" / "Bill + KOT sent (Bill → X · KOT → Y)"; all failed -> toast.error "Print failed: <reason> — use Reprint" 6s; browser fallback -> toast "Print window opened — confirm to print"; partial -> "Partial print — Bill:agent, KOT:failed (...)". Header dot: Dashboard.tsx:55-82 polls checkAgentOnline + getAgentQueue every 30s; dot red if agent offline or selected queue hasError (Dashboard.tsx:159). Settings modal warns if agentVersion !== REQUIRED_AGENT_VERSION "1.4.0" (PrinterSettingsModal.tsx:188; PA:21).
- Bill and KOT on accept are sent in parallel via `Promise.all` (UPO:46-49); reprint "both" sends sequentially (UPO:86-91).

### 3. What is printed
- Width: COLS = 36 (RF:8 `export const COLS = 36`), NOT 42. Comments mentioning "42-column" are stale (AG:323). Agent measures widest line, never below 36 (AG:226,234,238), Consolas Bold (fallback Courier New) fitted to <=68mm in 72mm head (AG:225-244).
- Copies: 1 each per accept (no copies field anywhere; grep "copies" in AG not found). Bill + KOT both go out on accept (2 slips).
- Cut/feed: no ESC/POS cut or feed commands. Trailing 3 empty lines pushed in each template (BT:139-141 bill, :167-169 KOT). Cutting relies on printer driver (inferred).
- Rupee: no rupee glyph. Plain "Rs " only in bill Grand Total (BT:133 `Rs ${money(...)}`). Item columns are bare numbers `toFixed(2)` (RF:~48 money). Non-printable/unicode not otherwise handled; agent reads body as UTF-8 (AG:442) and draws via GDI.
- Heading: BIG marker "\u000E" (RF:15-17); `big("QuickVerse")` is the bill's first line (BT:117); agent draws such lines at 2x font centred (AG:297-302). Browser fallback converts to `.big` div (PA:212).
- Customer bill `buildCounterBill(order, prepTime)` BT:106-143, order:
  big "QuickVerse"; center(shop.name); address wrapped; GSTIN; FSSAI (only if set); line; center(payment headline: COD | PREPAID | PAYMENT: UNCONFIRMED, BT:44-54); `Order: <orderId>`; row(`Bill No.: <last 6 digits>`, Delivery/Pickup-capitalised fulfillmentOption, BT:24-31, 96-99); `Date: <creationTime, en-IN 12h dd/mm/yy>` (RF:~46-56); `Prep Time: N min`; line; item table (Item/Qty./Price/Amount; name col 15 wide, qty4 price8 amount9: BT:59-61); line; `Total Qty: n    Sub Total x`; row("Grand Total", `Rs invoiceAmount||subTotal`); line; center(`OTP: <last 4 digits of orderId>`) + "Show this to rider"; line; "Thanks - Powered by QuickVerse"; 3 blank lines.
- Kitchen KOT `buildKitchenKOT` BT:146-171: center("*** KITCHEN KOT - QuickVerse ***"); shop name; "=" line; `ORDER: <orderId>`; `<dateTime>  <fulfillment>`; `Prep: N min`; "=" line; same item table WITH prices; line; Total Qty/Sub Total; line; `Match Bill No.: <last6>`; 3 blank lines.
- Order fields used: orderId, creationTime, orderItem[].{name,itemCount,itemPrice}, amountExcludingDeliveryFee ?? totalAmount (subtotal), invoiceAmount, preparationTime, fulfillmentOption, paymentMethod, isSettled, shopDetails.{name,address.{address,city,state,postalCode}} (BT:11-22, 44-54, 67-75, 113-115). Fallbacks: shop name -> sessionStorage `vendorName` -> "Your Store". GSTIN/FSSAI from localStorage `qv_gstin`/`qv_fssai` (BT:19-20; saved PrinterSettingsModal.tsx:132-133). A single item missing price is derived from subtotal (BT:67-75). Item names wrap/hard-cut to 14 chars (BT:85-87).
- Other helpers: src/utils/print/itemsSummary.ts (167 lines) not read; not in the print path per grep (used by analytics/other, inferred).

### 4. Print ledger (PL)
- Dedupe key: orderId only. Keys: `qv_printed_<orderId>` (PL:13) in BOTH sessionStorage (value "1") and localStorage (value ISO timestamp, shared across windows) (PL:179-182). `wasPrinted` = either present (PL:184-186). `claimPrint` atomic test-and-set (PL:200-204), called before awaits in `printBothOnAccept` (UPO:41). `releasePrint`/`clearPrinted` removes both (PL:189-192, 207-209) when ALL slips fail.
- NOTE: reprint does not consult or set the ledger (UPO:81-112); only AcceptedOrderCard.handlePrintMissed calls markPrinted (AcceptedOrderCard.tsx:34).
- Expiry: localStorage flags pruned when older than PRINTED_TTL_MS = 2 days (PL:135, prune PL:162-176) on every REST reconcile (useDashboardStore.ts:110-111). sessionStorage never expires but pruneLedger caps total entries at 400 (PL:63, oldest first).
- Related stamps (sessionStorage): `order_<id>_acceptedAt`, `order_<id>_readyAt`, `order_<id>_acceptFailedAt` (PL:14; set useDashboardStore.ts:311, 333; PL:222-228).
- Ledger also blocks socket re-insertion into PENDING: useDashboardStore.ts:73-74 `blockedFromSocket`.

### 5. Printer settings
- Two logical printers, defaults both "EPSON TM-T82X Receipt" (PA:13-19): `counterPrinter` (bill) and `kitchenPrinter` (KOT), plus `agentPort`. Same queue by default = single-printer back-to-back. No kitchen queue/ routing beyond these two names.
- Stored in browser localStorage per PC/browser: `qv_counter_printer`, `qv_kitchen_printer`, `qv_agent_port` (PA:119-135); `qv_show_all_printers` ("1") (PA:49,57); `qv_gstin`, `qv_fssai`. Edited in src/components/dashboard/PrinterSettingsModal.tsx (opened via Dashboard `showPrinterSetup`). Not stored on backend (not found in any API call; inferred).
- Virtual printer filtering: PA:34-45 mirrors AG:95-105.

### 6. Order accepted on ANOTHER device (phone app)
Result: dashboard does NOT print it. It silently moves the card to Accepted (socket or poll), with NO "unprinted" indicator (indicator needs a local acceptFailedAt stamp), and a toast "<id> : Order Accepted".
- Socket: src/hooks/useOrderWebsocket.tsx:150-156: `else if (phase) { upsertOrder(data, phase); if (phase === "ACCEPTED") { toast.success(\`${data.orderId} : Order Accepted\` ...` -- no print call in that file (grep "print" only matches comments at :19,:142).
- Store: `upsertOrder` (useDashboardStore.ts:~262-300) just moves the order to the phase column. Poll `reconcile` (useDashboardStore.ts:96+) files server-ACCEPTED orders into acceptedOrders, no print.
- Unprinted flag: AcceptedOrderCard.tsx:30 `needsPrint = !printedHere && wasAcceptUnconfirmed(order.orderId) && !wasPrinted(order.orderId)` -> false for other-device accepts since `acceptFailedAt` is only written in usePendingOrders.ts:45. Staff can only press Bill/KOT Reprint manually (AcceptedOrderCard.tsx:180,187).
- If the order was never known locally and arrives as a status-only frame without items, it is ignored (useOrderWebsocket.tsx:146-148, uses isValidOrder).

### 7. How the agent prints
- Pure PowerShell, no installs, HttpListener (AG:1-9, 367). NOT ESC/POS raw. Uses Windows printer queue by name via GDI+: `System.Drawing.Printing.PrintDocument` (AG:254-259), PaperSize '80mm' 315x2000 (hundredths of inch), margins 5 (AG:258-259), `SingleBitPerPixelGridFit` hint (AG:264), Consolas Bold, optional double-strike offset `$dot` (AG:266 area), multi-page via `Get-PageBreaks`, `$doc.Print()` (AG:~313). Virtual queues (PDF/XPS) go via `Out-Printer` with temp file, heading marker stripped (AG:335-341).
- Routing by queue type, not name (AG:320-323). "Printer not found: <name>" if `PrinterSettings.IsValid` false (AG:256) or name not exact match in Get-Printer (AG:333-334).
- Printer model assumed: EPSON TM-T82X (default queue "EPSON TM-T82X Receipt", PA:16-17; README:12). RF:1-3 comments also name TVSE RP3200 Lite; shared Windows queue with PetPooja. 203dpi head mentioned AG:~241. 80mm roll, 72mm head, 68mm cap (AG:228).
- USB/driver notes (print-agent/README.md:4,10-12,23-24,39-41): browsers cannot do USB; print by queue NAME so USB001->USB002 renumber is safe; disable USB selective suspend; paper-out/USB loose -> Windows holds job in queue, fix then Reprint. Auto-start: Task Scheduler primary (AG:27-28), start-agent.vbs in shell:startup. Single-instance mutex `Global\QuickVersePrintAgent<port>` (AG:39). Logs agent.log beside script (AG:56). Updater: print-agent/updater.ps1 (signed manifest, twice daily Task Scheduler, only agent.ps1 and updater.ps1 allowed: updater.ps1:36).

### Diff vs QuickVerse-Dashboard-1.4.1/print-agent
- agent.ps1: IDENTICAL (diff empty, line-ending-normalised). Both v1.4.0 (AG:11 `$AGENT_VERSION = "1.4.0"`; same ALLOWED_ORIGINS).
- 1.4.1 has no src/utils/print dir (`ls` failed); only print-agent folder compared. Files differ: v1.6.0 additionally has print-agent/tests/Test-Updater.ps1; updater.ps1 and update-agent.vbs exist in both lists (updater.ps1 present in both per `ls`; only Test-Updater.ps1 is v1.6.0-only per `diff -rq`).
- README.md differs: 1.4.1 README says "v1.3.1-exp3", documents /status version "1.3.1-exp3", /printers `{printers,real,detail}`, /queue, agent.log; v1.6.0 README is stale ("v1.2.0", /printers `{printers}` only). Code of agent is the same, README of 1.4.1 is the more current doc.

## Key symbols
- `printBothOnAccept(order, prepTime)` · src/hooks/usePrintOrder.ts:36 · claim ledger, print bill+KOT in parallel, toasts.
- `reprint(order, kind="both")` · src/hooks/usePrintOrder.ts:81 · manual print, no ledger; returns true if no slip failed.
- `printTextDetailed(kind, text)` · src/utils/print/printAgent.ts:232 · agent first, browser fallback only if unreachable.
- `printViaAgentDetailed(printer, text)` · printAgent.ts:155 · POST /print, 20s abort.
- `getPrinterSettings()/savePrinterSettings(s)` · printAgent.ts:119/131 · localStorage settings.
- `buildCounterBill(order, prepTime?)` / `buildKitchenKOT(order, prepTime?)` · src/utils/print/billTemplates.ts:106/146 · return string of 36-col lines.
- `claimPrint/releasePrint/markPrinted/wasPrinted/clearPrinted` · src/utils/print/printLedger.ts:200/207/179/184/189.
- `markAcceptUnconfirmed/wasAcceptUnconfirmed` · printLedger.ts:222/226.
- `Print-Text`, `Print-Gdi`, `Send-Cors`, `Invoke-BoundedSpooler` · print-agent/agent.ps1:~320, :223, :71, :137.

## Conventions
- Constants in module scope, comments with tags like "exp2", "T09", "I10" · printAgent.ts:139.
- Ledger functions are total (never throw) · printLedger.ts:1-7.
- Tests: vitest-style `__tests__` next to code (src/utils/print/__tests__/*.test.ts, src/components/dashboard/__tests__/acceptedCardUnprinted.test.tsx); agent tests print-agent/tests/Test-Agent.ps1 (not run).
- Toasts via react-hot-toast.

## Commands
- Not determined (package.json scripts not read; not needed for question). Agent tests: print-agent/tests/Test-Agent.ps1, Test-Updater.ps1 (not run).

## Gaps
- Line numbers marked "~" are approximate (agent.ps1 /print handler ~:424-466; Print-Gdi $dot logic; upsertOrder range); not exact-verified.
- Did not read itemsSummary.ts, PrinterSettingsModal.tsx beyond grep, nor package.json scripts; no check of the QuickVerse-Dashboard-1.4.1 src (only print-agent exists there as far as searched).
- Whether backend/mobile app also prints on accept is outside these repos.
- The unrelated websocket "known" check around useOrderWebsocket.tsx:143-148 was read; the exact `normalisePhase` mapping was not.
