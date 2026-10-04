package com.quickverse.vendor

import android.content.Context
import java.util.concurrent.CopyOnWriteArraySet
import org.json.JSONObject

/**
 * Process-wide state shared by the watcher service (writes from its worker thread) and the JS
 * bridge module (reads, local moves). Every access to the book goes through this lock.
 */
object VendorRuntime {
  interface Listener {
    fun onBoardChanged()

    fun onSessionEnded(expired: Boolean)
  }

  private val lock = Any()
  private val book = OrderBook()
  private var socketConnected = false
  private var lastPollOk: Boolean? = null
  private var lastPollAt = 0L
  private var alertedCount = 0
  private val listeners = CopyOnWriteArraySet<Listener>()

  fun addListener(l: Listener) = listeners.add(l)

  fun removeListener(l: Listener) = listeners.remove(l)

  fun pendingCount(): Int = synchronized(lock) { book.pendingCount() }

  fun pollFailing(): Boolean = synchronized(lock) { lastPollOk == false }

  fun onPollResult(context: Context, orders: List<ServerOrder>?, fetchStartedAt: Long) {
    val now = System.currentTimeMillis()
    synchronized(lock) {
      book.applyPoll(orders, fetchStartedAt, now)
      lastPollOk = orders != null
      lastPollAt = now
    }
    publish(context)
  }

  fun markLocal(context: Context, orderId: String, phase: Phase?, prep: Int?) {
    synchronized(lock) { book.markLocal(orderId, phase, System.currentTimeMillis(), prep) }
    publish(context)
  }

  fun setSocketConnected(connected: Boolean) {
    synchronized(lock) { socketConnected = connected }
    listeners.forEach { it.onBoardChanged() }
  }

  /**
   * THE ring rule (web Dashboardlayout.tsx): ring while anything is pending, stop at zero. Nothing
   * else stops it — no timeout, no dismiss. Ringer start/stop are idempotent.
   */
  private fun publish(context: Context) {
    val pending: Int
    val changed: Boolean
    synchronized(lock) {
      pending = book.pendingCount()
      changed = pending != alertedCount
      alertedCount = pending
    }
    if (changed) {
      if (pending > 0) {
        Ringer.start(context)
        Notifications.showOrdersAlert(context, pending)
      } else {
        Ringer.stop(context)
        Notifications.cancelOrdersAlert(context)
      }
    }
    listeners.forEach { it.onBoardChanged() }
  }

  /** Snapshot for the UI: `{socket, lastPollOk, lastPollAt, orders:[{phase, localAt, localPrep, order}]}`. */
  fun boardJson(): String =
      synchronized(lock) {
        val sb = StringBuilder()
        sb.append("{\"socket\":").append(socketConnected)
        sb.append(",\"lastPollOk\":").append(lastPollOk?.toString() ?: "null")
        sb.append(",\"lastPollAt\":").append(lastPollAt)
        sb.append(",\"orders\":[")
        book.orders().forEachIndexed { i, o ->
          if (i > 0) sb.append(',')
          sb.append("{\"phase\":").append(JSONObject.quote(o.phase.name))
          sb.append(",\"localAt\":").append(o.localAt?.toString() ?: "null")
          sb.append(",\"localPrep\":").append(o.localPrep?.toString() ?: "null")
          sb.append(",\"order\":").append(o.json).append('}')
        }
        sb.append("]}").toString()
      }

  /** Logout (manual or expired token): everything stops, nothing rings until the next login. */
  fun endSession(context: Context, expired: Boolean) {
    SessionStore.clear(context)
    synchronized(lock) {
      book.clear()
      socketConnected = false
      lastPollOk = null
      alertedCount = 0
    }
    WatcherService.stop(context)
    Ringer.stop(context)
    Notifications.cancelOrdersAlert(context)
    Push.unregister(context)
    if (expired) Notifications.showLoggedOut(context)
    listeners.forEach { it.onSessionEnded(expired) }
  }

  fun startSession(context: Context, session: Session) {
    SessionStore.save(context, session)
    synchronized(lock) {
      book.clear()
      lastPollOk = null
      alertedCount = 0
    }
    Notifications.cancelLoggedOut(context)
    WatcherService.start(context)
  }
}
