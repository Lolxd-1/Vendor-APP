package com.quickverse.vendor

import android.content.Context
import java.util.Base64
import java.util.UUID

data class Session(val jwt: String, val shopId: String, val phone: String)

/** Native storage so the watcher service can resume after a reboot without loading JS. */
object SessionStore {
  private const val PREFS = "qv_session"

  fun load(context: Context): Session? {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val jwt = p.getString("jwt", null) ?: return null
    val shopId = p.getString("shopId", null) ?: return null
    return Session(jwt, shopId, p.getString("phone", "") ?: "")
  }

  fun save(context: Context, session: Session) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString("jwt", session.jwt)
        .putString("shopId", session.shopId)
        .putString("phone", session.phone)
        .apply()
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .remove("jwt")
        .remove("shopId")
        .remove("phone")
        .apply()
  }

  /** Stable per-install id for the backend's device registry. */
  fun deviceId(context: Context): String {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return p.getString("deviceId", null) ?: UUID.randomUUID().toString().also { p.edit().putString("deviceId", it).apply() }
  }
}

object Jwt {
  private val EXP = Regex("\"exp\"\\s*:\\s*(\\d+)")

  /**
   * True when the token's `exp` (seconds) is within [skewSeconds] of [now].
   * FAIL-OPEN, like the web dashboard: a malformed token or one without `exp` is NOT expired —
   * never log a vendor out mid-shift because something could not be parsed.
   */
  fun isExpired(jwt: String?, now: Long, skewSeconds: Long = 30): Boolean =
      try {
        val parts = jwt?.split('.')
        if (parts == null || parts.size != 3) {
          false
        } else {
          val payload = String(Base64.getUrlDecoder().decode(parts[1].trimEnd('=')), Charsets.UTF_8)
          val exp = EXP.find(payload)?.groupValues?.get(1)?.toLongOrNull()
          exp != null && exp * 1000 <= now + skewSeconds * 1000
        }
      } catch (_: Exception) {
        false
      }
}
