import { create } from 'zustand';

// Live-feed health for the header dot and the poll interval.
// `lastPromptAt` is delivery evidence: only a frame that arrived promptly counts, because a
// "connected" socket can still deliver late (the web dashboard's 30s Vercel bug).
interface SyncStatus {
  socketConnected: boolean;
  lastPromptAt: number | null;
  setSocketConnected: (connected: boolean) => void;
  markPromptFrame: (at: number) => void;
  reset: () => void;
}

export const useSyncStatus = create<SyncStatus>(set => ({
  socketConnected: false,
  lastPromptAt: null,
  setSocketConnected: socketConnected => set({ socketConnected }),
  markPromptFrame: at => set({ lastPromptAt: at }),
  reset: () => set({ socketConnected: false, lastPromptAt: null }),
}));
