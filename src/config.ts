// Backend has no TLS yet (nginx, plain HTTP). When it gets a certificate, switch this and the
// native constants (Api.kt, StompNudge.kt, network_security_config.xml) to https/wss.
export const BASE_URL = 'http://prd.quickverse.in';

// Shared static credential the web dashboard sends on every REST call (src/apis/index.ts).
// Not a secret (it ships in the web bundle); tenant isolation is a backend concern.
export const BASIC_AUTH = 'Basic cXZDYXN0bGVFbnRyeTpjYSR0bGVfUGVybWl0QDAx';
export const REQUEST_ORIGIN = 'VENDOR';
export const REQUEST_TIMEOUT_MS = 15_000;

export const PREP_TIME_OPTIONS = [5, 10, 15, 20, 25] as const;
export const DEFAULT_PREP_TIME = 15;
export const MIN_REJECT_REASON = 3;
export const OTP_LENGTH = 4;
export const OTP_RESEND_SECONDS = 59;
