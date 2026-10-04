package com.quickverse.vendor

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Firebase push is a WAKE-UP only: a NEW_ORDER message starts the watcher, whose poll decides what
 * rings. Inactive (no crash, no-op) until android/app/google-services.json is added and the backend
 * sends VENDOR pushes (docs/BACKEND-PUSH.md).
 */
object Push {
  private const val TAG = "QVPush"

  private fun configured(context: Context) = FirebaseApp.getApps(context).isNotEmpty()

  fun register(context: Context, session: Session) {
    if (!configured(context)) return
    val app = context.applicationContext
    FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
      Thread { send(app, session, token) }.start()
    }
  }

  fun send(context: Context, session: Session, token: String) {
    val ok = Api.registerDevice(session, SessionStore.deviceId(context), token, BuildConfig.VERSION_NAME)
    if (!ok) Log.w(TAG, "device registration not accepted")
  }

  /** Invalidates the token, so the backend's next send to it fails and it gets dropped. */
  fun unregister(context: Context) {
    if (!configured(context)) return
    FirebaseMessaging.getInstance().deleteToken()
  }
}

class PushService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    // High-priority FCM grants a foreground-service start exemption, so this works from a killed app.
    if (message.data["type"] == "NEW_ORDER" && SessionStore.load(this) != null) WatcherService.start(this)
  }

  override fun onNewToken(token: String) {
    SessionStore.load(this)?.let { Push.send(this, it, token) }
  }
}

/** Resumes the watcher after a reboot or an app update — no need to open the app. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if ((action == Intent.ACTION_BOOT_COMPLETED || action == Intent.ACTION_MY_PACKAGE_REPLACED) &&
        SessionStore.load(context) != null) {
      WatcherService.start(context)
    }
  }
}
