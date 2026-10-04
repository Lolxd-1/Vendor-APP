package com.quickverse.vendor

import java.util.concurrent.TimeUnit
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

/** STOMP 1.2 text frames — just the four commands this app needs. */
object StompFrames {
  private const val NUL = '\u0000'

  fun connect(host: String, jwt: String) =
      "CONNECT\naccept-version:1.2,1.1,1.0\nhost:$host\nheart-beat:0,0\nAuthorization:Bearer $jwt\n\n$NUL"

  fun subscribe(destination: String) = "SUBSCRIBE\nid:sub-0\ndestination:$destination\nack:auto\n\n$NUL"

  /** Commands of every frame in one WebSocket message (heart-beat newlines are skipped). */
  fun commands(message: String): List<String> =
      message.split(NUL).mapNotNull { frame -> frame.trimStart('\n', '\r').substringBefore('\n').trim().ifEmpty { null } }
}

/**
 * Live "something changed for this shop" signal. Frame CONTENT is ignored on purpose: the REST
 * poll is the only source of truth, so a malformed / partial / stale frame can never ring an order
 * or revive one — the worst a broken socket can cost is latency (the 10s poll still runs).
 */
class StompNudge(private val session: Session, private val listener: Listener) {
  interface Listener {
    fun onShopEvent()

    fun onConnected()

    /** Closed or failed; the owner decides whether to reconnect. [rejected] = server sent ERROR. */
    fun onDisconnected(rejected: Boolean)
  }

  @Volatile private var socket: WebSocket? = null
  @Volatile private var closedByUs = false

  fun open() {
    // Pings keep nginx's 60s proxy idle timer from cutting a quiet connection.
    val client = Api.http.newBuilder().pingInterval(25, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).build()
    socket = client.newWebSocket(Request.Builder().url(WS_URL).build(), Callbacks())
  }

  fun close() {
    closedByUs = true
    socket?.close(1000, null)
    socket = null
  }

  private inner class Callbacks : WebSocketListener() {
    private var done = false

    override fun onOpen(webSocket: WebSocket, response: Response) {
      webSocket.send(StompFrames.connect(HOST, session.jwt))
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
      for (command in StompFrames.commands(text)) {
        when (command) {
          "CONNECTED" -> {
            webSocket.send(StompFrames.subscribe("/topic/vendor/${session.shopId}"))
            listener.onConnected()
          }
          "MESSAGE" -> listener.onShopEvent()
          "ERROR" -> {
            finish(rejected = true)
            webSocket.close(1000, null)
          }
        }
      }
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = finish(rejected = false)

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = finish(rejected = false)

    private fun finish(rejected: Boolean) {
      if (done) return
      done = true
      if (!closedByUs) listener.onDisconnected(rejected)
    }
  }

  companion object {
    private const val HOST = "prd.quickverse.in"
    // Spring serves a raw (non-SockJS) WebSocket at <sockjs-endpoint>/websocket.
    const val WS_URL = "ws://prd.quickverse.in/quickVerse/ws/websocket"
  }
}
