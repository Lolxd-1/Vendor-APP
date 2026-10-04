// Backend has no TLS yet (nginx on plain HTTP). When it gets a certificate, switch both
// to https:// / wss:// — nothing else changes.
export const BASE_URL = 'http://prd.quickverse.in';

// Spring's SockJS endpoint also accepts a raw WebSocket on `<endpoint>/websocket`.
export const WS_URL = 'ws://prd.quickverse.in/quickVerse/ws/websocket';

// Shared static credential the web dashboard sends on every REST call (src/apis/index.ts).
// It is not a secret (it ships in the web bundle); tenant isolation is a backend concern.
export const BASIC_AUTH = 'Basic cXZDYXN0bGVFbnRyeTpjYSR0bGVfUGVybWl0QDAx';
export const REQUEST_ORIGIN = 'VENDOR';

export const REQUEST_TIMEOUT_MS = 15_000;

// Polling: fast unless the socket has proven prompt delivery recently.
export const POLL_FAST_MS = 10_000;
export const POLL_SLOW_MS = 30_000;
export const SOCKET_TRUST_WINDOW_MS = 120_000;
export const PROMPT_FRAME_MAX_MS = 5_000;
export const RESYNC_DEBOUNCE_MS = 3_000;
export const STOMP_RECONNECT_MS = 5_000;
export const EXPIRY_CHECK_MS = 60_000;

export const PREP_TIME_OPTIONS = [5, 10, 15, 20, 25] as const;
export const DEFAULT_PREP_TIME = 15;
export const MIN_REJECT_REASON = 3;

export const CHANNEL_ORDERS = 'orders_alert';
export const CHANNEL_SESSION = 'session_alert';
export const NOTIFICATION_ORDERS_ID = 'pending-orders';
