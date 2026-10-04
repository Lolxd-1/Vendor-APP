import { create } from 'zustand';
import type { Order, OrderPhase } from '../domain/order';
import { PHASE_RANK, isTerminalState, normalisePhase } from '../domain/orderRules';

// Port of the web dashboard's useDashboardStore (src/stores/useDashboardStore.ts). The rules and
// their reasons are unchanged; printing is gone and the per-order stamps live in memory.

// An order delivered by the socket survives a poll that does not list it yet for this long.
export const GRACE_MS = 120_000;
const CLOSED_MAX = 2000;

// __receivedAt: last evidence the order exists. __phaseAt: when it last moved column here.
export type StoredOrder = Order & { __receivedAt?: number; __phaseAt?: number };

// Orders that left this board for good, with when. A later frame for one would ring it again.
const closedAt = new Map<string, number>();
// When THIS device accepted / marked ready (ISO). Used for timers and the stale-poll guard.
const acceptedAt = new Map<string, string>();
const readyAt = new Map<string, string>();

const markClosed = (orderId: string, at: number): void => {
  if (closedAt.has(orderId)) return;
  closedAt.set(orderId, at);
  if (closedAt.size > CLOSED_MAX) {
    const oldest = closedAt.keys().next().value;
    if (oldest !== undefined) closedAt.delete(oldest);
  }
};

const blockedFromSocket = (orderId: string, phase: OrderPhase): boolean =>
  closedAt.has(orderId) || (phase === 'PENDING' && acceptedAt.has(orderId));

interface OrderState {
  pendingOrders: StoredOrder[];
  acceptedOrders: StoredOrder[];
  readyOrders: StoredOrder[];
  addPendingOrder: (order: Order) => void;
  reconcile: (serverOrders: unknown, receivedAt?: number) => void;
  upsertOrder: (order: Partial<Order> & { orderId: string }, phase: OrderPhase) => void;
  moveToAccepted: (orderId: string, preparationTime: number) => void;
  moveToReady: (orderId: string) => void;
  removeOrder: (orderId: string) => void;
  clearAll: () => void;
}

const holds = (state: Pick<OrderState, 'pendingOrders' | 'acceptedOrders' | 'readyOrders'>, orderId: string) =>
  [state.pendingOrders, state.acceptedOrders, state.readyOrders].some(list => list.some(o => o.orderId === orderId));

export const useOrderStore = create<OrderState>(set => ({
  pendingOrders: [],
  acceptedOrders: [],
  readyOrders: [],

  // REST poll. Merges with what the socket delivered instead of replacing it: deleting an order
  // the backend has not indexed yet would empty pendingOrders, stop the ring and lose the order.
  reconcile: (serverOrders, receivedAt) =>
    set(state => {
      // A failed or malformed poll carries no information — never wipe the board.
      if (!Array.isArray(serverOrders)) return state;
      const list = serverOrders.filter(
        (o): o is Order => typeof o === 'object' && o !== null && typeof (o as Order).orderId === 'string',
      );
      const allExisting = [...state.pendingOrders, ...state.acceptedOrders, ...state.readyOrders];
      const now = Date.now();

      const localPhase = new Map<string, OrderPhase>();
      for (const o of state.pendingOrders) localPhase.set(o.orderId, 'PENDING');
      for (const o of state.acceptedOrders) localPhase.set(o.orderId, 'ACCEPTED');
      for (const o of state.readyOrders) localPhase.set(o.orderId, 'READY_FOR_PICKUP');

      for (const o of list) {
        if (isTerminalState(o.state)) markClosed(o.orderId, now);
      }

      // The list was fetched before this order last moved here: older news, not a revert.
      const predatesLocalMove = (orderId: string): boolean => {
        if (receivedAt === undefined) return false;
        const local = allExisting.find(e => e.orderId === orderId);
        return local?.__phaseAt !== undefined && receivedAt < local.__phaseAt;
      };
      const closedLocally = (orderId: string): boolean => {
        const t = closedAt.get(orderId);
        return t !== undefined && (now - t < GRACE_MS || (receivedAt !== undefined && receivedAt < t));
      };
      // This device moved it forward recently: a poll showing an earlier phase is replica lag,
      // and believing it would restart the ring for an order the kitchen is already cooking.
      const movedHereRecently = (orderId: string, phase: OrderPhase): boolean => {
        if (phase === 'PENDING') return false;
        const iso = (phase === 'ACCEPTED' ? acceptedAt : readyAt).get(orderId);
        const t = iso ? Date.parse(iso) : NaN;
        return !Number.isNaN(t) && now - t < GRACE_MS;
      };
      const phaseOf = (o: Order): OrderPhase | null => {
        const serverPhase = normalisePhase(o.state);
        if (serverPhase === null || closedLocally(o.orderId)) return null;
        const local = localPhase.get(o.orderId);
        if (
          local &&
          PHASE_RANK[serverPhase] < PHASE_RANK[local] &&
          (movedHereRecently(o.orderId, local) || predatesLocalMove(o.orderId))
        ) {
          return local;
        }
        return serverPhase;
      };
      const smartMerge = (incoming: Order, phase: OrderPhase): StoredOrder => {
        const existing = allExisting.find(e => e.orderId === incoming.orderId);
        return {
          ...incoming,
          state: phase,
          acceptedDate: acceptedAt.get(incoming.orderId) || existing?.acceptedDate || incoming.acceptedDate,
          readyDate: readyAt.get(incoming.orderId) || existing?.readyDate || incoming.readyDate,
          preparationTime: existing?.preparationTime || incoming.preparationTime,
          // Refreshed on every listing: anchored to first receipt, a long-lived order was
          // deleted by the first poll that happened to omit it.
          __receivedAt: now,
          __phaseAt: localPhase.get(incoming.orderId) === phase ? existing?.__phaseAt : now,
        };
      };

      const listed = list.map(o => ({ order: o, phase: phaseOf(o) }));
      // The server has an opinion when it placed the order in a column or reported a known
      // terminal state. Only an unrecognised state is "no news" (the grace window applies).
      const serverIds = new Set(
        listed.filter(l => l.phase !== null || isTerminalState(l.order.state)).map(l => l.order.orderId),
      );
      const inColumn = (phase: OrderPhase) =>
        listed.filter(l => l.phase === phase).map(l => smartMerge(l.order, phase));
      const survivors = (orders: StoredOrder[]) =>
        orders
          .filter(o => !serverIds.has(o.orderId))
          .map(o => ({ ...o, __receivedAt: o.__receivedAt ?? now }))
          .filter(o => now - o.__receivedAt < GRACE_MS);

      return {
        pendingOrders: [...inColumn('PENDING'), ...survivors(state.pendingOrders)],
        acceptedOrders: [...inColumn('ACCEPTED'), ...survivors(state.acceptedOrders)],
        readyOrders: [...inColumn('READY_FOR_PICKUP'), ...survivors(state.readyOrders)],
      };
    }),

  addPendingOrder: order =>
    set(state => {
      if (holds(state, order.orderId) || blockedFromSocket(order.orderId, 'PENDING')) return state;
      const fresh: StoredOrder = { ...order, state: 'PENDING', __receivedAt: Date.now() };
      return { pendingOrders: [...state.pendingOrders, fresh] };
    }),

  // A phase change from the socket: merge AND move to the named column. Forward-only for an
  // order we hold — a stale PENDING re-broadcast must never restart the ring.
  upsertOrder: (order, phase) =>
    set(state => {
      const { orderId } = order;
      const inPending = state.pendingOrders.find(o => o.orderId === orderId);
      const inAccepted = state.acceptedOrders.find(o => o.orderId === orderId);
      const inReady = state.readyOrders.find(o => o.orderId === orderId);
      const existing = inPending ?? inAccepted ?? inReady;
      const currentPhase: OrderPhase | null = inPending
        ? 'PENDING'
        : inAccepted
          ? 'ACCEPTED'
          : inReady
            ? 'READY_FOR_PICKUP'
            : null;

      if (currentPhase !== null && PHASE_RANK[phase] < PHASE_RANK[currentPhase]) return state;
      if (currentPhase === null && blockedFromSocket(orderId, phase)) return state;

      const merged = {
        ...existing,
        ...order,
        state: phase,
        __receivedAt: existing?.__receivedAt ?? Date.now(),
        __phaseAt: currentPhase === phase ? existing?.__phaseAt : Date.now(),
      } as StoredOrder;
      const intoTarget = (list: StoredOrder[]) =>
        currentPhase === phase ? list.map(o => (o.orderId === orderId ? merged : o)) : [...list, merged];
      const without = (list: StoredOrder[]) => list.filter(o => o.orderId !== orderId);

      return {
        pendingOrders: phase === 'PENDING' ? intoTarget(state.pendingOrders) : without(state.pendingOrders),
        acceptedOrders: phase === 'ACCEPTED' ? intoTarget(state.acceptedOrders) : without(state.acceptedOrders),
        readyOrders: phase === 'READY_FOR_PICKUP' ? intoTarget(state.readyOrders) : without(state.readyOrders),
      };
    }),

  moveToAccepted: (orderId, preparationTime) =>
    set(state => {
      const order = state.pendingOrders.find(o => o.orderId === orderId);
      if (!order) return state;
      const now = new Date().toISOString();
      acceptedAt.set(orderId, now);
      return {
        pendingOrders: state.pendingOrders.filter(o => o.orderId !== orderId),
        acceptedOrders: [
          ...state.acceptedOrders,
          { ...order, state: 'ACCEPTED', preparationTime, acceptedDate: now, __phaseAt: Date.parse(now) },
        ],
      };
    }),

  moveToReady: orderId =>
    set(state => {
      const order = state.acceptedOrders.find(o => o.orderId === orderId);
      if (!order) return state;
      const now = new Date().toISOString();
      readyAt.set(orderId, now);
      return {
        acceptedOrders: state.acceptedOrders.filter(o => o.orderId !== orderId),
        readyOrders: [
          ...state.readyOrders,
          { ...order, state: 'READY_FOR_PICKUP', readyDate: now, __phaseAt: Date.parse(now) },
        ],
      };
    }),

  removeOrder: orderId =>
    set(state => {
      markClosed(orderId, Date.now());
      return {
        pendingOrders: state.pendingOrders.filter(o => o.orderId !== orderId),
        acceptedOrders: state.acceptedOrders.filter(o => o.orderId !== orderId),
        readyOrders: state.readyOrders.filter(o => o.orderId !== orderId),
      };
    }),

  clearAll: () => {
    closedAt.clear();
    acceptedAt.clear();
    readyAt.clear();
    set({ pendingOrders: [], acceptedOrders: [], readyOrders: [] });
  },
}));

export const isKnownOrder = (orderId: string): boolean => holds(useOrderStore.getState(), orderId);
