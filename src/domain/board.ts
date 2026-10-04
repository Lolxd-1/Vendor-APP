import type { Order, OrderPhase } from './order';

export interface BoardEntry {
  phase: OrderPhase;
  /** When THIS phone accepted / marked it ready (epoch ms), if it did. */
  localAt: number | null;
  localPrep: number | null;
  order: Order;
}

export interface Board {
  socket: boolean;
  lastPollOk: boolean | null;
  lastPollAt: number;
  orders: BoardEntry[];
}

export const EMPTY_BOARD: Board = { socket: false, lastPollOk: null, lastPollAt: 0, orders: [] };

const PHASES: readonly OrderPhase[] = ['PENDING', 'ACCEPTED', 'READY_FOR_PICKUP'];

// Native snapshot -> typed board. Anything malformed is dropped rather than crashing the UI.
export const parseBoard = (json: string): Board => {
  try {
    const raw = JSON.parse(json) as Partial<Board> & { orders?: unknown };
    const orders = Array.isArray(raw.orders)
      ? raw.orders.filter(
          (e): e is BoardEntry =>
            typeof e === 'object' &&
            e !== null &&
            PHASES.includes((e as BoardEntry).phase) &&
            typeof (e as BoardEntry).order?.orderId === 'string',
        )
      : [];
    return {
      socket: raw.socket === true,
      lastPollOk: typeof raw.lastPollOk === 'boolean' ? raw.lastPollOk : null,
      lastPollAt: typeof raw.lastPollAt === 'number' ? raw.lastPollAt : 0,
      orders,
    };
  } catch {
    return EMPTY_BOARD;
  }
};

export const byPhase = (board: Board, phase: OrderPhase): BoardEntry[] => board.orders.filter(e => e.phase === phase);
