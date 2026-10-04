// Backend smoke check for the vendor app — run the moment the backend is up:
//   node scripts/smoke.mjs <shopId> [jwt]
// Proves the three things the app depends on that could not be tested offline:
//   1. SockJS endpoint is alive, 2. the raw WebSocket path speaks STOMP, 3. the active-orders poll shape.
// Read-only: sends no order actions and no OTP.
const BASE = 'http://prd.quickverse.in';
const WS_URL = 'ws://prd.quickverse.in/quickVerse/ws/websocket';
const HEADERS = {
  Authorization: 'Basic cXZDYXN0bGVFbnRyeTpjYSR0bGVfUGVybWl0QDAx',
  Accept: 'application/json',
  'Request-Origin': 'VENDOR',
};
const [shopId, jwt = ''] = process.argv.slice(2);
let failed = false;
const ok = (msg) => console.log(`PASS  ${msg}`);
const bad = (msg) => {
  failed = true;
  console.log(`FAIL  ${msg}`);
};

const info = await fetch(`${BASE}/quickVerse/ws/info`).catch((e) => e);
if (info instanceof Error || !info.ok) bad(`SockJS /info unreachable (${info.status ?? info.message})`);
else ok(`SockJS /info ${JSON.stringify(await info.json())}`);

await new Promise((resolve) => {
  const ws = new WebSocket(WS_URL);
  const timer = setTimeout(() => {
    bad('WebSocket: no STOMP reply within 10s');
    ws.close();
    resolve();
  }, 10_000);
  ws.onopen = () =>
    ws.send(`CONNECT\naccept-version:1.2,1.1,1.0\nhost:prd.quickverse.in\nheart-beat:0,0\nAuthorization:Bearer ${jwt}\n\n\0`);
  ws.onmessage = (e) => {
    const command = String(e.data).replace(/^\n+/, '').split('\n')[0];
    if (command === 'CONNECTED') ok('WebSocket path speaks STOMP (CONNECTED)');
    else if (command === 'ERROR') {
      // The path is right; the server rejected the (missing/expired) token.
      ok(`WebSocket path speaks STOMP (ERROR: ${String(e.data).split('\n').find((l) => l.startsWith('message:')) ?? 'no message'})`);
    } else bad(`WebSocket: unexpected first frame ${JSON.stringify(command)}`);
    clearTimeout(timer);
    ws.close();
    resolve();
  };
  ws.onerror = () => {
    clearTimeout(timer);
    bad(`WebSocket: cannot open ${WS_URL}`);
    resolve();
  };
});

if (!shopId) {
  console.log('SKIP  active orders (pass a shopId)');
} else {
  const url = `${BASE}/quickVerse/v2/order/${encodeURIComponent(shopId)}/orders?orderStatus=PENDING&orderStatus=ACCEPTED&orderStatus=READY_FOR_PICKUP`;
  const res = await fetch(url, { headers: HEADERS }).catch((e) => e);
  if (res instanceof Error || !res.ok) bad(`active orders HTTP ${res.status ?? res.message}`);
  else {
    const body = await res.json();
    const orders = body?.response?.orders;
    if (!Array.isArray(orders)) bad(`active orders: no response.orders array (keys: ${Object.keys(body ?? {})})`);
    else {
      ok(`active orders: ${orders.length} listed`);
      const first = orders[0];
      if (first) {
        const missing = ['orderId', 'state', 'orderItem'].filter((k) => !(k in first));
        if (missing.length) bad(`order is missing fields the app reads: ${missing}`);
        else ok(`order shape: orderId=${typeof first.orderId} state=${first.state} items=${first.orderItem?.length}`);
      }
    }
  }
}
process.exit(failed ? 1 : 0);
