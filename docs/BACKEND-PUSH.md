# Backend work: wake the vendor app with a push on every new order

The vendor Android app (`com.quickverse.vendor`) already rings without this: it keeps a foreground
service that polls every 10s and listens on `/topic/vendor/{shopId}`. A push makes it ring even when
Android or the phone's battery saver has killed that service. The app treats a push as a **wake-up
only** — it then polls `GET /quickVerse/v2/order/{shopId}/orders` and rings for whatever is PENDING —
so duplicates, late or out-of-order pushes are harmless.

## 1. Accept vendor devices in the existing registry
`POST /quickVerse/v1/updateDeviceRegistry` (already used by the transporter app). The vendor app sends:

```
Headers: Authorization: Basic <shared>, Request-Origin: VENDOR, SessionKey: <vendor jwt>, phone: <phone>
{
  "phone": "9876543210", "role": "VENDOR", "shopId": "123",
  "deviceId": "<uuid per install>", "deviceType": "ANDROID", "deviceModel": "...", "deviceBrand": "...",
  "osVersion": "14", "appVersion": "1.0", "fcmToken": "<token>", "tokenType": "FCM",
  "lastActiveTimestamp": "<ISO>", "notificationEnabled": true,
  "latitude": 0, "longitude": 0, "loginTimestamp": "<ISO>"
}
```
Needed: accept `role: "VENDOR"` and store the token against the **shop** (`shopId`, or resolve it from
the vendor's phone). A shop may have several phones — keep every token. The app calls this after
login and whenever Firebase rotates the token. If the vendor's JWT should be sent differently, tell us.

## 2. Send a push for every new order
At the same point the backend publishes the new order to `/topic/vendor/{shopId}`, send to **all**
VENDOR tokens of that shop:

```json
{
  "message": {
    "token": "<fcm token>",
    "data": { "type": "NEW_ORDER", "orderId": "QV-1001", "shopId": "123" },
    "android": { "priority": "high", "ttl": "60s" }
  }
}
```
- **Data-only** (no `notification` block): the app plays its own looping alarm; a `notification`
  block would make Android show a silent duplicate instead of waking the app.
- **High priority** — that is what lets Android start the ringing service from the background.
- Short TTL (≈60s): a phone offline longer catches up through its poll anyway.
- Use high priority **only** for NEW_ORDER. FCM downgrades apps whose high-priority messages do not
  lead to a visible notification.

## 3. Logout / dead tokens
On logout the app deletes its FCM token. Your next send to it returns `UNREGISTERED` /
`INVALID_ARGUMENT` — delete that token row (standard FCM cleanup).

## 4. Firebase project
Register the Android app `com.quickverse.vendor` in the existing Firebase project `quickverse-app`,
download `google-services.json`, put it at `android/app/google-services.json` and rebuild. Without that
file the app builds and runs with push simply switched off.

## Test
With a vendor logged in on a phone: swipe the app away, `adb shell am kill com.quickverse.vendor`,
place an order for that shop → the phone must ring within seconds.
