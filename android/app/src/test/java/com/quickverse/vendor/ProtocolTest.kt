package com.quickverse.vendor

import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class JwtTest {
  private fun token(payload: String) =
      "h." + Base64.getUrlEncoder().withoutPadding().encodeToString(payload.toByteArray()) + ".s"

  @Test
  fun `expired within the 30s skew`() {
    assertTrue(Jwt.isExpired(token("""{"exp":100}"""), now = 100_000))
    assertTrue(Jwt.isExpired(token("""{"exp":100}"""), now = 75_000))
    assertFalse(Jwt.isExpired(token("""{"exp":100}"""), now = 60_000))
  }

  @Test
  fun `fail-open on anything unparseable`() {
    assertFalse(Jwt.isExpired(null, 0))
    assertFalse(Jwt.isExpired("not-a-jwt", Long.MAX_VALUE / 2))
    assertFalse(Jwt.isExpired("a.%%%.c", Long.MAX_VALUE / 2))
    assertFalse(Jwt.isExpired(token("""{"sub":"x"}"""), Long.MAX_VALUE / 2))
  }
}

class StompFramesTest {
  @Test
  fun `connect carries the bearer token and ends with NUL`() {
    val f = StompFrames.connect("prd.quickverse.in", "abc")
    assertTrue(f.startsWith("CONNECT\n"))
    assertTrue(f.contains("\nAuthorization:Bearer abc\n"))
    assertTrue(f.endsWith("\n\n\u0000"))
  }

  @Test
  fun `commands of several frames and heart-beats`() {
    val msg = "\nCONNECTED\nversion:1.2\n\n\u0000\nMESSAGE\ndestination:/topic/vendor/1\n\n{\"orderId\":\"A\"}\u0000\n"
    assertEquals(listOf("CONNECTED", "MESSAGE"), StompFrames.commands(msg))
    assertEquals(emptyList<String>(), StompFrames.commands("\n"))
  }
}

class ApiParseTest {
  @Test
  fun `keeps orders with a string id and their raw json`() {
    val parsed =
        Api.parseOrders("""{"response":{"orders":[{"orderId":"A","state":"PENDING"},{"orderId":7},{"state":"X"}]}}""")!!
    assertEquals(1, parsed.size)
    assertEquals("A", parsed[0].id)
    assertEquals("PENDING", parsed[0].state)
    assertTrue(parsed[0].json.contains("\"orderId\":\"A\""))
  }

  @Test
  fun `malformed payload is no news (null), not an empty board`() {
    assertNull(Api.parseOrders("<html>502</html>"))
    assertNull(Api.parseOrders("""{"response":{}}"""))
    assertEquals(0, Api.parseOrders("""{"response":{"orders":[]}}""")!!.size)
  }
}
