package com.quickverse.vendor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

object Notifications {
  private const val CH_SERVICE = "qv_service"
  private const val CH_ORDERS = "qv_orders"
  private const val CH_SESSION = "qv_session"
  const val ID_SERVICE = 1
  private const val ID_ORDERS = 2
  private const val ID_LOGGED_OUT = 3

  fun ensureChannels(context: Context) {
    val nm = context.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(
        NotificationChannel(CH_SERVICE, "Order listener", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shown while the app is listening for new orders"
          setShowBadge(false)
        })
    // SILENT on purpose: the Ringer loops the alarm itself; a channel sound would play once on top.
    nm.createNotificationChannel(
        NotificationChannel(CH_ORDERS, "New orders", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Full-screen alert while orders wait to be accepted"
          setSound(null, null)
          enableVibration(false)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        })
    nm.createNotificationChannel(
        NotificationChannel(CH_SESSION, "Account", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Login problems that stop orders from ringing"
        })
  }

  private fun openApp(context: Context, requestCode: Int): PendingIntent =
      PendingIntent.getActivity(
          context,
          requestCode,
          Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  fun serviceNotification(context: Context, text: String): Notification =
      NotificationCompat.Builder(context, CH_SERVICE)
          .setSmallIcon(R.drawable.ic_notification)
          .setContentTitle("QuickVerse Vendor")
          .setContentText(text)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setCategory(NotificationCompat.CATEGORY_SERVICE)
          .setContentIntent(openApp(context, ID_SERVICE))
          .build()

  fun updateService(context: Context, text: String) {
    context.getSystemService(NotificationManager::class.java).notify(ID_SERVICE, serviceNotification(context, text))
  }

  /** Heads-up when unlocked; opens the app over the lock screen like an incoming call when locked. */
  fun showOrdersAlert(context: Context, pending: Int) {
    val open = openApp(context, ID_ORDERS)
    val notification =
        NotificationCompat.Builder(context, CH_ORDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(if (pending == 1) "New order" else "$pending new orders")
            .setContentText("Tap to open and accept")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .setFullScreenIntent(open, true)
            .build()
    context.getSystemService(NotificationManager::class.java).notify(ID_ORDERS, notification)
  }

  fun cancelOrdersAlert(context: Context) {
    context.getSystemService(NotificationManager::class.java).cancel(ID_ORDERS)
  }

  fun showLoggedOut(context: Context) {
    val notification =
        NotificationCompat.Builder(context, CH_SESSION)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Logged out — orders will NOT ring")
            .setContentText("Your session expired. Tap to log in again.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openApp(context, ID_LOGGED_OUT))
            .build()
    context.getSystemService(NotificationManager::class.java).notify(ID_LOGGED_OUT, notification)
  }

  fun cancelLoggedOut(context: Context) {
    context.getSystemService(NotificationManager::class.java).cancel(ID_LOGGED_OUT)
  }
}
