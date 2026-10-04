package com.quickverse.vendor

/** The three board columns, ranked so local moves can only ever go forward. */
enum class Phase(val rank: Int) {
  PENDING(0),
  ACCEPTED(1),
  READY_FOR_PICKUP(2);

  companion object {
    /** Trimmed, case-insensitive; anything that is not a board column (terminal, junk) is null. */
    fun of(raw: String?): Phase? = entries.firstOrNull { it.name == raw?.trim()?.uppercase() }
  }
}

/** One order as the server listed it. [json] is the untouched server object, for the UI. */
data class ServerOrder(val id: String, val state: String?, val json: String)

data class BoardOrder(val id: String, val phase: Phase, val json: String, val localAt: Long?, val localPrep: Int?)

/**
 * The shop's board, with the REST poll as the source of truth (the socket only triggers polls,
 * so no frame can ever insert, revive or move an order on its own).
 *
 * What this device did itself wins for [GRACE_MS] — or for longer when a poll's list was fetched
 * before that action — because the server can lag (replica/cache). Without this, an accepted order
 * would flash back into Pending and RING again (web dashboard bugs I9/C2/TC23/TC11b).
 *
 * Not thread-safe: the watcher touches it from its single worker thread only.
 */
class OrderBook {
  private data class LocalMove(val phase: Phase?, val at: Long, val prep: Int?) // phase null = closed here

  private val moves = LinkedHashMap<String, LocalMove>()
  private var board: List<BoardOrder> = emptyList()

  fun orders(): List<BoardOrder> = board

  fun pendingCount(): Int = board.count { it.phase == Phase.PENDING }

  fun shouldRing(): Boolean = pendingCount() > 0

  /**
   * Applies one poll. A failed or malformed poll ([serverOrders] == null) is "no news" and never
   * wipes the board. Returns true if the board changed.
   */
  fun applyPoll(serverOrders: List<ServerOrder>?, fetchStartedAt: Long, now: Long): Boolean {
    if (serverOrders == null) return false
    prune(now)

    val listedIds = HashSet<String>()
    val next = ArrayList<BoardOrder>()
    for (o in serverOrders) {
      if (!listedIds.add(o.id)) continue // duplicate in one list
      val serverPhase = Phase.of(o.state) ?: continue // terminal / unknown: not on the board
      val move = moves[o.id]?.takeIf { it.isAuthoritative(fetchStartedAt, now) }
      if (move != null && move.phase == null) continue // rejected / handed over here
      val phase = if (move?.phase != null && move.phase.rank > serverPhase.rank) move.phase else serverPhase
      next += BoardOrder(o.id, phase, o.json, move?.at, move?.prep)
    }
    // An order this device moved forward that the lagging list omits stays put while the move is
    // fresh — otherwise an accepted order vanishes and comes back.
    for (old in board) {
      if (old.id in listedIds) continue
      val move = moves[old.id] ?: continue
      if (move.phase != null && move.isAuthoritative(fetchStartedAt, now)) {
        next += old.copy(phase = maxOf(old.phase, move.phase, compareBy { it.rank }))
      }
    }
    val changed = next != board
    board = next
    return changed
  }

  /** This device accepted / marked ready ([phase]) or rejected / handed over ([phase] == null). */
  fun markLocal(id: String, phase: Phase?, now: Long, prep: Int? = null): Boolean {
    moves.remove(id) // re-insert keeps insertion order == age order for pruning
    moves[id] = LocalMove(phase, now, prep)
    val before = board
    board =
        if (phase == null) board.filterNot { it.id == id }
        else board.map { if (it.id == id && phase.rank >= it.phase.rank) it.copy(phase = phase, localAt = now, localPrep = prep) else it }
    return board != before
  }

  fun clear() {
    moves.clear()
    board = emptyList()
  }

  private fun LocalMove.isAuthoritative(fetchStartedAt: Long, now: Long) =
      now - at < GRACE_MS || fetchStartedAt < at

  private fun prune(now: Long) {
    val it = moves.entries.iterator()
    while (it.hasNext()) {
      val e = it.next()
      if (now - e.value.at > FORGET_MS || moves.size > MAX_MOVES) it.remove() else break
    }
  }

  companion object {
    const val GRACE_MS = 120_000L
    private const val FORGET_MS = 30 * 60_000L
    private const val MAX_MOVES = 2000
  }
}
