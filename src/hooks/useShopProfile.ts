import { useEffect, useMemo, useState } from 'react';
import { getOrdersPage } from '../api/endpoints';
import type { Board } from '../domain/board';
import type { ShopDetails } from '../domain/order';

// There is no profile endpoint: the shop's details ride along inside every order (the web reads them the same way).
const found = new Map<string, ShopDetails>();
const asked = new Set<string>();

const withName = (d: ShopDetails | null | undefined): d is ShopDetails =>
  !!d && typeof d.name === 'string' && d.name.trim().length > 0;

export const useShopProfile = (shopId: string, board: Board): ShopDetails | null => {
  const fromBoard = useMemo(() => board.orders.map(e => e.order.shopDetails).find(withName) ?? null, [board.orders]);
  const [fetched, setFetched] = useState<ShopDetails | null>(() => found.get(shopId) ?? null);

  useEffect(() => {
    if (fromBoard) {
      found.set(shopId, fromBoard);
      return;
    }
    if (found.has(shopId) || asked.has(shopId)) return;
    asked.add(shopId);
    let alive = true;
    getOrdersPage(shopId, { timeRange: 'THIS_YEAR', page: 0 })
      .then(page => {
        const details = page.orders.map(o => o.shopDetails).find(withName);
        if (!details) return;
        found.set(shopId, details);
        if (alive) setFetched(details);
      })
      .catch(() => asked.delete(shopId)); // try again next time the screen opens
    return () => {
      alive = false;
    };
  }, [shopId, fromBoard]);

  return fromBoard ?? fetched;
};
