package com.quickverse.vendor

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.quickverse.vendor.specs.NativeVendorSpec
import org.json.JSONObject

class VendorModule(reactContext: ReactApplicationContext) : NativeVendorSpec(reactContext) {

  private val runtimeListener =
      object : VendorRuntime.Listener {
        override fun onBoardChanged() = emit("qvBoardChanged", null)

        override fun onSessionEnded(expired: Boolean) =
            emit("qvSessionEnded", Arguments.createMap().apply { putBoolean("expired", expired) })
      }

  init {
    VendorRuntime.addListener(runtimeListener)
  }

  override fun invalidate() {
    VendorRuntime.removeListener(runtimeListener)
    super.invalidate()
  }

  private fun emit(event: String, data: Any?) {
    if (!reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit(event, data)
  }

  override fun getName(): String = NAME

  override fun startSession(jwt: String, shopId: String, phone: String) =
      VendorRuntime.startSession(reactApplicationContext, Session(jwt, shopId, phone))

  override fun logout() = VendorRuntime.endSession(reactApplicationContext, expired = false)

  override fun getSession(): String? {
    val s = SessionStore.load(reactApplicationContext) ?: return null
    // App opened after a kill/force-stop: make sure the watcher is running again.
    WatcherService.start(reactApplicationContext)
    return JSONObject().put("jwt", s.jwt).put("shopId", s.shopId).put("phone", s.phone).toString()
  }

  override fun getBoard(): String = VendorRuntime.boardJson()

  override fun markLocal(orderId: String, action: String, prepMinutes: Double) {
    val phase =
        when (action) {
          "ACCEPTED" -> Phase.ACCEPTED
          "READY" -> Phase.READY_FOR_PICKUP
          "CLOSED" -> null
          else -> return
        }
    VendorRuntime.markLocal(reactApplicationContext, orderId, phase, prepMinutes.toInt().takeIf { it > 0 })
  }

  override fun pollNow() = WatcherService.start(reactApplicationContext)

  override fun playTestSound() = Ringer.playTest(reactApplicationContext)

  override fun getSetupStatus(): String {
    val ctx = reactApplicationContext
    val fullScreen =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
            ctx.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
    val battery = ctx.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(ctx.packageName)
    return JSONObject()
        .put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled())
        .put("fullScreen", fullScreen)
        .put("batteryUnrestricted", battery)
        .toString()
  }

  override fun openSetting(kind: String) {
    val ctx = reactApplicationContext
    val pkg = Uri.parse("package:${ctx.packageName}")
    val intent =
        when (kind) {
          "notifications" ->
              Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
          "fullScreen" ->
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
                  Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg)
              else return
          // Direct dialog: fine for a sideloaded APK (Play restricts it; see README).
          "battery" -> Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg)
          else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg)
        }
    try {
      ctx.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    } catch (_: Exception) {
      ctx.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  override fun addListener(eventName: String) = Unit

  override fun removeListeners(count: Double) = Unit

  companion object {
    const val NAME = "NativeVendor"
  }
}
