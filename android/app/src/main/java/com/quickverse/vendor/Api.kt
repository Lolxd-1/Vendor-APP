package com.quickverse.vendor

import android.os.Build
import android.util.Log
import java.util.concurrent.TimeUnit
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * The two backend calls the service makes without JS. Same headers as the web dashboard; the JWT
 * is NOT used for REST (the backend authenticates vendor REST with the shared Basic credential).
 */
object Api {
  const val BASE_URL = "http://prd.quickverse.in"
  private const val TAG = "QVApi"
  private const val BASIC_AUTH = "Basic cXZDYXN0bGVFbnRyeTpjYSR0bGVfUGVybWl0QDAx"
  private val JSON = "application/json".toMediaType()

  val http: OkHttpClient =
      OkHttpClient.Builder()
          .connectTimeout(15, TimeUnit.SECONDS)
          .readTimeout(15, TimeUnit.SECONDS)
          .writeTimeout(15, TimeUnit.SECONDS)
          .build()

  private fun Request.Builder.vendorHeaders() =
      header("Authorization", BASIC_AUTH)
          .header("Content-Type", "application/json")
          .header("Accept", "application/json")
          .header("Request-Origin", "VENDOR")

  /** Active board (PENDING/ACCEPTED/READY_FOR_PICKUP) or null on ANY failure ("no news"). */
  fun fetchActiveOrders(shopId: String): List<ServerOrder>? {
    val url =
        "$BASE_URL/quickVerse/v2/order/$shopId/orders"
            .toHttpUrl()
            .newBuilder()
            .addQueryParameter("orderStatus", "PENDING")
            .addQueryParameter("orderStatus", "ACCEPTED")
            .addQueryParameter("orderStatus", "READY_FOR_PICKUP")
            .build()
    return try {
      http.newCall(Request.Builder().url(url).vendorHeaders().get().build()).execute().use { res ->
        if (!res.isSuccessful) return null
        parseOrders(res.body?.string() ?: return null)
      }
    } catch (e: Exception) {
      Log.w(TAG, "poll failed: ${e.javaClass.simpleName}")
      null
    }
  }

  /** `{response:{orders:[...]}}` -> orders with a string orderId; null when malformed. */
  fun parseOrders(body: String): List<ServerOrder>? =
      try {
        val orders = JSONObject(body).optJSONObject("response")?.optJSONArray("orders")
        if (orders == null) {
          null
        } else {
          (0 until orders.length()).mapNotNull { i ->
            val o = orders.optJSONObject(i) ?: return@mapNotNull null
            val id = o.opt("orderId") as? String ?: return@mapNotNull null
            ServerOrder(id, o.opt("state") as? String, o.toString())
          }
        }
      } catch (_: Exception) {
        null
      }

  /** Registers this phone for new-order pushes (contract: docs/BACKEND-PUSH.md). */
  fun registerDevice(session: Session, deviceId: String, fcmToken: String, appVersion: String): Boolean {
    val now = java.time.Instant.now().toString()
    val body =
        JSONObject()
            .put("phone", session.phone)
            .put("role", "VENDOR")
            .put("shopId", session.shopId)
            .put("deviceId", deviceId)
            .put("deviceType", "ANDROID")
            .put("deviceModel", Build.MODEL)
            .put("deviceBrand", Build.BRAND)
            .put("osVersion", Build.VERSION.RELEASE)
            .put("appVersion", appVersion)
            .put("fcmToken", fcmToken)
            .put("tokenType", "FCM")
            .put("lastActiveTimestamp", now)
            .put("notificationEnabled", fcmToken.isNotEmpty())
            .put("latitude", 0)
            .put("longitude", 0)
            .put("loginTimestamp", now)
    val request =
        Request.Builder()
            .url("$BASE_URL/quickVerse/v1/updateDeviceRegistry")
            .vendorHeaders()
            .header("SessionKey", session.jwt)
            .header("phone", session.phone)
            .post(body.toString().toRequestBody(JSON))
            .build()
    return try {
      http.newCall(request).execute().use { it.isSuccessful }
    } catch (e: Exception) {
      Log.w(TAG, "device registry failed: ${e.javaClass.simpleName}")
      false
    }
  }
}
