package com.quickverse.vendor

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * The always-on order watcher (foreground service, type specialUse). Polls the active board every
 * [POLL_MS] — the source of truth — and polls immediately whenever the STOMP socket reports any
 * event for the shop. The ring lives here too: Android 17 only lets audio play from a running
 * foreground service once the screen is off.
 *
 * Everything runs on ONE worker thread, so polls, socket events and reconnects never overlap.
 */
class WatcherService : Service() {
  private lateinit var worker: HandlerThread
  private lateinit var handler: Handler
  private var wakeLock: PowerManager.WakeLock? = null
  private var session: Session? = null
  private var socket: StompNudge? = null
  private var socketGeneration = 0
  private var statusText = ""

  private val pollTask = Runnable { poll() }
  private val followUpTask = Runnable { pollNow() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    Notifications.ensureChannels(this)
    statusText = "Connecting…"
    ServiceCompat.startForeground(
        this,
        Notifications.ID_SERVICE,
        Notifications.serviceNotification(this, statusText),
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0)
    // Polls must keep running with the screen off. Counter phones are usually on a charger.
    wakeLock =
        getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "quickverse:watcher").apply {
          setReferenceCounted(false)
          acquire()
        }
    worker = HandlerThread("qv-watcher").also { it.start() }
    handler = Handler(worker.looper)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    handler.post {
      val current = SessionStore.load(this)
      if (current == null) {
        stopSelf()
        return@post
      }
      if (current != session) {
        session = current
        openSocket()
        Push.register(this, current)
      }
      pollNow()
    }
    // Restarted by the system after a kill; onStartCommand re-reads the session.
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    socketGeneration++
    socket?.close()
    worker.quitSafely()
    VendorRuntime.setSocketConnected(false)
    Ringer.stop(this)
    Notifications.cancelOrdersAlert(this)
    wakeLock?.let { if (it.isHeld) it.release() }
    super.onDestroy()
  }

  private fun pollNow() {
    handler.removeCallbacks(pollTask)
    handler.post(pollTask)
  }

  private fun poll() {
    val s = session ?: return
    val startedAt = System.currentTimeMillis()
    if (Jwt.isExpired(s.jwt, startedAt)) {
      VendorRuntime.endSession(this, expired = true)
      return
    }
    val orders = Api.fetchActiveOrders(s.shopId)
    if (session != s) return // logged out while the request was in flight
    VendorRuntime.onPollResult(this, orders, startedAt)
    refreshStatus()
    handler.removeCallbacks(pollTask)
    handler.postDelayed(pollTask, POLL_MS)
  }

  private fun openSocket() {
    socket?.close()
    val generation = ++socketGeneration
    val s = session ?: return
    socket =
        StompNudge(
                s,
                object : StompNudge.Listener {
                  override fun onShopEvent() {
                    handler.post {
                      if (generation != socketGeneration) return@post
                      pollNow()
                      // The socket can run ahead of the REST read model; look again shortly.
                      handler.removeCallbacks(followUpTask)
                      handler.postDelayed(followUpTask, FOLLOW_UP_MS)
                    }
                  }

                  override fun onConnected() {
                    handler.post {
                      if (generation != socketGeneration) return@post
                      VendorRuntime.setSocketConnected(true)
                      pollNow() // orders may have arrived while we were disconnected
                    }
                  }

                  override fun onDisconnected(rejected: Boolean) {
                    handler.post {
                      if (generation != socketGeneration) return@post
                      VendorRuntime.setSocketConnected(false)
                      val s2 = session ?: return@post
                      if (rejected && Jwt.isExpired(s2.jwt, System.currentTimeMillis())) {
                        VendorRuntime.endSession(this@WatcherService, expired = true)
                        return@post
                      }
                      Log.i(TAG, "socket closed (rejected=$rejected); retrying")
                      handler.postDelayed({ if (generation == socketGeneration) openSocket() }, RECONNECT_MS)
                    }
                  }
                })
            .also { it.open() }
  }

  private fun refreshStatus() {
    val pending = VendorRuntime.pendingCount()
    val text =
        when {
          pending > 0 -> if (pending == 1) "1 order waiting" else "$pending orders waiting"
          VendorRuntime.pollFailing() -> "No connection — retrying"
          else -> "Live — waiting for orders"
        }
    if (text == statusText) return
    statusText = text
    Notifications.updateService(this, text)
  }

  companion object {
    private const val TAG = "QVWatcher"
    private const val POLL_MS = 10_000L
    private const val FOLLOW_UP_MS = 3_000L
    private const val RECONNECT_MS = 5_000L

    fun start(context: Context) {
      try {
        ContextCompat.startForegroundService(context, Intent(context, WatcherService::class.java))
      } catch (e: Exception) {
        // e.g. ForegroundServiceStartNotAllowedException from a background start without exemption.
        Log.e(TAG, "cannot start watcher", e)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, WatcherService::class.java))
    }
  }
}
