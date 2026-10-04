package com.quickverse.vendor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Cases ported from the web dashboard's dashboardStore.test.ts (ids in the names). */
class OrderBookTest {
  private val grace = OrderBook.GRACE_MS

  private fun o(id: String, state: String?) = ServerOrder(id, state, """{"orderId":"$id"}""")

  private fun OrderBook.phases() = orders().associate { it.id to it.phase }

  @Test
  fun `a listed PENDING order rings and leaves when the server moves it on`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "PENDING")), 0, 0)
    assertTrue(b.shouldRing())
    b.applyPoll(listOf(o("A", "ACCEPTED")), 10, 10) // accepted on another device
    assertFalse(b.shouldRing())
    assertEquals(Phase.ACCEPTED, b.phases()["A"])
  }

  @Test
  fun `TC8 a failed poll is no news and never wipes the board`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "PENDING")), 0, 0)
    assertFalse(b.applyPoll(null, 10, 10))
    assertEquals(1, b.pendingCount())
  }

  @Test
  fun `TC-N1a terminal states drop at once so the ring stops`() {
    for (terminal in listOf("CANCELLED", "COMPLETED", "REJECTED", "IN_TRANSIT", "cancelled ")) {
      val b = OrderBook()
      b.applyPoll(listOf(o("A", "PENDING")), 0, 0)
      b.applyPoll(listOf(o("A", terminal)), 10, 10)
      assertFalse(terminal, b.shouldRing())
      assertTrue(b.orders().isEmpty())
    }
  }

  @Test
  fun `TC20 TC21 casing and padding are normalised`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "pending"), o("B", " ACCEPTED ")), 0, 0)
    assertEquals(mapOf("A" to Phase.PENDING, "B" to Phase.ACCEPTED), b.phases())
  }

  @Test
  fun `TC23 a stale PENDING poll does not pull back an order this phone just accepted`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "PENDING")), 0, 0)
    b.markLocal("A", Phase.ACCEPTED, 1_000, prep = 15)
    assertFalse(b.shouldRing())
    b.applyPoll(listOf(o("A", "PENDING")), 2_000, 2_000)
    assertFalse("must not ring again", b.shouldRing())
    assertEquals(Phase.ACCEPTED, b.phases()["A"])
    assertEquals(15, b.orders().single().localPrep)
  }

  @Test
  fun `TC24 once the local move is older than the grace window a fresh server list wins`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "PENDING")), 0, 0)
    b.markLocal("A", Phase.ACCEPTED, 1_000)
    val later = 1_000 + grace + 1
    b.applyPoll(listOf(o("A", "PENDING")), later, later)
    assertTrue(b.shouldRing())
  }

  @Test
  fun `TC11d a list fetched BEFORE the action never reverts it however late it is applied`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "PENDING")), 0, 0)
    b.markLocal("A", Phase.ACCEPTED, 1_000)
    b.applyPoll(listOf(o("A", "PENDING")), 500, 1_000 + grace + 5_000)
    assertFalse(b.shouldRing())
  }

  @Test
  fun `TC11b a rejected order is not resurrected by a lagging poll`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "PENDING")), 0, 0)
    b.markLocal("A", null, 1_000)
    assertTrue(b.orders().isEmpty())
    b.applyPoll(listOf(o("A", "PENDING")), 2_000, 2_000)
    assertFalse(b.shouldRing())
  }

  @Test
  fun `TC11c after the grace window a fresh list is believed again`() {
    val b = OrderBook()
    b.markLocal("A", null, 1_000)
    val later = 1_000 + grace + 1
    b.applyPoll(listOf(o("A", "PENDING")), later, later)
    assertTrue(b.shouldRing())
  }

  @Test
  fun `accepted order omitted by a lagging list stays put while the move is fresh`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "PENDING")), 0, 0)
    b.markLocal("A", Phase.ACCEPTED, 1_000)
    b.applyPoll(emptyList(), 2_000, 2_000)
    assertEquals(Phase.ACCEPTED, b.phases()["A"])
    val later = 1_000 + grace + 1
    b.applyPoll(emptyList(), later, later)
    assertTrue(b.orders().isEmpty())
  }

  @Test
  fun `TC25 the guard is one-directional - a FORWARD move from the server still lands`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "PENDING")), 0, 0)
    b.markLocal("A", Phase.ACCEPTED, 1_000)
    b.applyPoll(listOf(o("A", "READY_FOR_PICKUP")), 2_000, 2_000)
    assertEquals(Phase.READY_FOR_PICKUP, b.phases()["A"])
  }

  @Test
  fun `a local move never goes backwards`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "READY_FOR_PICKUP")), 0, 0)
    b.markLocal("A", Phase.ACCEPTED, 1_000)
    assertEquals(Phase.READY_FOR_PICKUP, b.phases()["A"])
  }

  @Test
  fun `TC9 TC10 one copy per order and stable server order`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("B", "PENDING"), o("A", "PENDING"), o("B", "PENDING")), 0, 0)
    assertEquals(listOf("B", "A"), b.orders().map { it.id })
    assertFalse(b.applyPoll(listOf(o("B", "PENDING"), o("A", "PENDING")), 10, 10))
  }

  @Test
  fun `unknown states are not on the board and never ring`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "RIDER_ASSIGNED"), o("B", null), o("C", "")), 0, 0)
    assertTrue(b.orders().isEmpty())
  }

  @Test
  fun `clear forgets everything (logout)`() {
    val b = OrderBook()
    b.applyPoll(listOf(o("A", "PENDING")), 0, 0)
    b.markLocal("B", null, 0)
    b.clear()
    assertFalse(b.shouldRing())
    b.applyPoll(listOf(o("B", "PENDING")), 1, 1)
    assertTrue("a closed mark must not survive logout", b.shouldRing())
  }
}
