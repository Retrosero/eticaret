/**
 * Offline Queue Store — Çevrimdışı aksiyonları kuyruğa al.
 *
 * Mobile offline olduğunda yapılan aksiyonlar (sipariş durumu güncelle,
 * stok güncelle, not ekle) burada birikir. Online olunca otomatik flush.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type QueuedAction =
  | { type: 'order.updateStatus'; payload: { orderId: string; status: string; note?: string }; createdAt: string }
  | { type: 'product.updateStock'; payload: { productId: string; quantity: number }; createdAt: string }
  | { type: 'order.addNote'; payload: { orderId: string; note: string }; createdAt: string };

const QUEUE_KEY = 'eticart_offline_queue';
const MAX_QUEUE_SIZE = 500;

interface OfflineQueueState {
  queue: QueuedAction[];
  online: boolean;

  /** Hydrate from storage */
  hydrate: () => Promise<void>;
  /** Aksiyon ekle */
  enqueue: (action: QueuedAction) => Promise<void>;
  /** Online olunca flush */
  flush: () => Promise<{ flushed: number; failed: number }>;
  /** Online durumunu güncelle */
  setOnline: (online: boolean) => void;
  /** Queue temizle */
  clear: () => Promise<void>;
}

export const useOfflineQueueStore = create<OfflineQueueState>((set, get) => ({
  queue: [],
  online: true,

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as QueuedAction[];
        set({ queue: parsed });
      }
    } catch {
      // ignore
    }
  },

  async enqueue(action) {
    const next = [...get().queue, action].slice(-MAX_QUEUE_SIZE);
    set({ queue: next });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  },

  async flush() {
    if (!get().online) return { flushed: 0, failed: 0 };
    const queue = get().queue;
    if (queue.length === 0) return { flushed: 0, failed: 0 };

    let flushed = 0;
    let failed = 0;
    const remaining: QueuedAction[] = [];

    for (const action of queue) {
      try {
        switch (action.type) {
          case 'order.updateStatus':
            await fetch(`/api/orders/${action.payload.orderId}/status`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: action.payload.status, note: action.payload.note }),
            });
            flushed++;
            break;
          case 'product.updateStock':
            await fetch(`/api/products/${action.payload.productId}/stock`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ quantity: action.payload.quantity }),
            });
            flushed++;
            break;
          case 'order.addNote':
            await fetch(`/api/orders/${action.payload.orderId}/notes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ note: action.payload.note }),
            });
            flushed++;
            break;
          default:
            // Unknown action — drop
            flushed++;
        }
      } catch {
        failed++;
        remaining.push(action);
      }
    }

    set({ queue: remaining });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    return { flushed, failed };
  },

  setOnline(online) {
    set({ online });
  },

  async clear() {
    set({ queue: [] });
    await AsyncStorage.removeItem(QUEUE_KEY);
  },
}));