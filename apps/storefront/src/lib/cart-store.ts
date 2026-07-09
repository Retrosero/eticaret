/**
 * Storefront sepet store'u (Zustand + persist).
 *
 * - Tüm state istemci tarafında yaşar
 * - localStorage'a otomatik persist edilir (`eticart_cart` anahtarı)
 * - `api-client` üzerinden backend ile haberleşir
 * - Backend bağlantısı başarısız olursa `demo` moda düşer (local items)
 *
 * Server Component'lerde KULLANILMAZ — sadece Client Component içinde
 * `useCartStore` hook'u ile erişilir.
 */

'use client';

import {
  create,
  type StateCreator,
} from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getApiClient } from './api-client.js';

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

/** Sepetteki tek bir ürün kalemi. */
export interface CartItem {
  readonly id: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly name: string;
  readonly sku: string | null;
  readonly imageUrl: string | null;
  readonly quantity: number;
  readonly unitPriceKurus: number;
  readonly lineTotalKurus: number;
  readonly variantLabel?: string | null;
  readonly notes?: string | null;
}

/** Sepete ekleme isteği. */
export interface AddToCartInput {
  readonly productId: string;
  readonly variantId?: string | null;
  readonly name: string;
  readonly sku?: string | null;
  readonly imageUrl?: string | null;
  readonly quantity: number;
  readonly unitPriceKurus: number;
  readonly variantLabel?: string | null;
}

/** Backend'den gelen sepet yanıt yapısı (sadece ihtiyacımız alanlar). */
interface BackendCartResponse {
  readonly id?: string;
  readonly cartId?: string;
  readonly items?: ReadonlyArray<{
    readonly id?: string;
    readonly productId?: string;
    readonly variantId?: string | null;
    readonly name?: string;
    readonly sku?: string | null;
    readonly imageUrl?: string | null;
    readonly quantity?: number;
    readonly unitPrice?: number | string;
    readonly finalUnitPrice?: number | string;
    readonly lineTotal?: number | string;
    readonly variantSnapshot?: Readonly<Record<string, unknown>> | null;
    readonly notes?: string | null;
  }>;
  readonly subtotal?: number | string;
  readonly discountTotal?: number | string;
  readonly shippingTotal?: number | string;
  readonly taxTotal?: number | string;
  readonly grandTotal?: number | string;
  readonly itemCount?: number;
  readonly currency?: string;
}

/** Store durumu. */
export interface CartState {
  /** Sepet kalemleri. */
  readonly items: ReadonlyArray<CartItem>;
  /** Backend sepet ID. */
  readonly cartId: string | null;
  /** Sepet kalem adedi (toplam quantity). */
  readonly itemCount: number;
  /** Ara toplam (kuruş). */
  readonly subtotalKurus: number;
  /** İndirim toplamı (kuruş). */
  readonly discountKurus: number;
  /** Kargo toplamı (kuruş). */
  readonly shippingKurus: number;
  /** Genel toplam (kuruş). */
  readonly grandTotalKurus: number;
  /** Para birimi (varsayılan TRY). */
  readonly currency: string;
  /** Yüklenme durumu (UI için). */
  readonly isLoading: boolean;
  /** Hata mesajı (varsa). */
  readonly error: string | null;
  /** Demo mod aktif mi (backend bağlantısı başarısız oldu mu)? */
  readonly isDemo: boolean;
}

/** Store aksiyonları. */
export interface CartActions {
  /** Backend'den sepeti getir. */
  fetchCart: () => Promise<void>;
  /** Yeni kalem ekle (varsa miktarı arttır). */
  addItem: (input: AddToCartInput) => Promise<void>;
  /** Kalem miktarını güncelle. */
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  /** Kalemi sil. */
  removeItem: (itemId: string) => Promise<void>;
  /** Sepeti temizle (hem state hem backend). */
  clear: () => Promise<void>;
  /** Yalnızca state'i temizle (örn. sipariş sonrası). */
  resetLocal: () => void;
}

export type CartStore = CartState & CartActions;

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function mapBackendItem(raw: NonNullable<BackendCartResponse['items']>[number]): CartItem {
  const lineTotal = toNumber(raw.lineTotal, 0);
  const quantity = toNumber(raw.quantity, 0);
  const unitPrice = toNumber(raw.unitPrice ?? raw.finalUnitPrice, 0);
  // `lineTotal` çoğu backend'de kuruş döner; emin değilsek safety:
  const lineTotalKurus = lineTotal > 1000 || quantity === 0 ? lineTotal : Math.round(lineTotal * 100);

  return {
    id: raw.id ?? `${raw.productId ?? 'unknown'}-${Math.random().toString(36).slice(2)}`,
    productId: raw.productId ?? '',
    variantId: raw.variantId ?? null,
    name: raw.name ?? '',
    sku: raw.sku ?? null,
    imageUrl: raw.imageUrl ?? null,
    quantity,
    unitPriceKurus: toNumber(raw.finalUnitPrice ?? raw.unitPrice, 0),
    lineTotalKurus,
    notes: raw.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Demo mod hesaplayıcısı
// ---------------------------------------------------------------------------

/**
 * Demo mod: sepetteki kalemlerden toplamları hesapla.
 */
function computeDemoTotals(
  items: ReadonlyArray<CartItem>,
): Pick<CartState, 'itemCount' | 'subtotalKurus' | 'discountKurus' | 'shippingKurus' | 'grandTotalKurus'> {
  let subtotal = 0;
  let itemCount = 0;
  for (const it of items) {
    subtotal += it.lineTotalKurus;
    itemCount += it.quantity;
  }
  // Demo'da kargo ücretsiz, indirim yok
  return {
    itemCount,
    subtotalKurus: subtotal,
    discountKurus: 0,
    shippingKurus: 0,
    grandTotalKurus: subtotal,
  };
}

// ---------------------------------------------------------------------------
// Store creator
// ---------------------------------------------------------------------------

const initialState: CartState = {
  items: [],
  cartId: null,
  itemCount: 0,
  subtotalKurus: 0,
  discountKurus: 0,
  shippingKurus: 0,
  grandTotalKurus: 0,
  currency: 'TRY',
  isLoading: false,
  error: null,
  isDemo: false,
};

const cartStoreCreator: StateCreator<CartStore, [], [], CartStore> = (set, get) => ({
  ...initialState,

  async fetchCart(): Promise<void> {
    set({ isLoading: true, error: null });
    try {
      const client = getApiClient();
      const response = await client.get<BackendCartResponse>('/api/store/cart');
      const items = (response.items ?? []).map(mapBackendItem);
      set({
        items,
        cartId: response.cartId ?? response.id ?? null,
        itemCount: toNumber(response.itemCount, 0),
        subtotalKurus: toNumber(response.subtotal, 0),
        discountKurus: toNumber(response.discountTotal, 0),
        shippingKurus: toNumber(response.shippingTotal, 0),
        grandTotalKurus: toNumber(response.grandTotal, 0),
        currency: response.currency ?? 'TRY',
        isLoading: false,
        isDemo: false,
        error: null,
      });
    } catch (err) {
      // Backend hazır değil → demo mod aktif
      set({
        items: get().items,
        ...computeDemoTotals(get().items),
        currency: 'TRY',
        isLoading: false,
        isDemo: true,
        error:
          err instanceof Error
            ? `Demo mod: ${err.message}`
            : 'Demo mod aktif — backend bağlantısı bekleniyor',
      });
    }
  },

  async addItem(input: AddToCartInput): Promise<void> {
    const client = getApiClient();
    const isDemo = get().isDemo;

    if (isDemo) {
      // Demo modda: optimistic local update
      const existing = get().items.find(
        (it) => it.productId === input.productId && it.variantId === (input.variantId ?? null),
      );
      const newItems: CartItem[] = existing
        ? get().items.map((it) =>
            it.id === existing.id
              ? {
                  ...it,
                  quantity: it.quantity + input.quantity,
                  lineTotalKurus: it.unitPriceKurus * (it.quantity + input.quantity),
                }
              : it,
          )
        : [
            ...get().items,
            {
              id: `demo-${Math.random().toString(36).slice(2, 10)}`,
              productId: input.productId,
              variantId: input.variantId ?? null,
              name: input.name,
              sku: input.sku ?? null,
              imageUrl: input.imageUrl ?? null,
              quantity: input.quantity,
              unitPriceKurus: input.unitPriceKurus,
              lineTotalKurus: input.unitPriceKurus * input.quantity,
              variantLabel: input.variantLabel ?? null,
              notes: null,
            },
          ];
      set({
        items: newItems,
        ...computeDemoTotals(newItems),
        error: null,
      });
      return;
    }

    // Gerçek backend
    set({ isLoading: true, error: null });
    try {
      await client.post<BackendCartResponse>('/api/store/cart/items', {
        productId: input.productId,
        variantId: input.variantId ?? null,
        name: input.name,
        sku: input.sku ?? null,
        quantity: input.quantity,
        unitPrice: input.unitPriceKurus,
        variantSnapshot: input.variantLabel ? { label: input.variantLabel } : null,
      });
      await get().fetchCart();
    } catch (err) {
      set({
        isLoading: false,
        isDemo: true,
        error: err instanceof Error ? err.message : 'Sepete eklenemedi',
      });
    }
  },

  async updateItem(itemId: string, quantity: number): Promise<void> {
    if (quantity <= 0) {
      await get().removeItem(itemId);
      return;
    }

    if (get().isDemo) {
      const newItems = get().items.map((it) =>
        it.id === itemId
          ? { ...it, quantity, lineTotalKurus: it.unitPriceKurus * quantity }
          : it,
      );
      set({ items: newItems, ...computeDemoTotals(newItems) });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const client = getApiClient();
      await client.patch<unknown>(`/api/store/cart/items/${encodeURIComponent(itemId)}`, {
        quantity,
      });
      await get().fetchCart();
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Güncellenemedi',
      });
    }
  },

  async removeItem(itemId: string): Promise<void> {
    if (get().isDemo) {
      const newItems = get().items.filter((it) => it.id !== itemId);
      set({ items: newItems, ...computeDemoTotals(newItems), error: null });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const client = getApiClient();
      await client.delete<unknown>(`/api/store/cart/items/${encodeURIComponent(itemId)}`);
      await get().fetchCart();
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Silinemedi',
      });
    }
  },

  async clear(): Promise<void> {
    if (get().isDemo) {
      set({ ...initialState });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const client = getApiClient();
      const cartId = get().cartId;
      if (cartId !== null) {
        await client.delete<unknown>(`/api/store/cart/${encodeURIComponent(cartId)}`);
      }
      set({ ...initialState });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Sepet temizlenemedi',
      });
    }
  },

  resetLocal(): void {
    set({ ...initialState });
  },
});

// ---------------------------------------------------------------------------
// Persist ile store
// ---------------------------------------------------------------------------

/**
 * Zustand sepet store'u — `eticart_cart` anahtarıyla localStorage'a yazılır.
 *
 * SSR sırasında `localStorage`'a erişmediği için `skipHydration` opsiyonu
 * sağlanır. İstemci tarafında `useCartStore.persist.rehydrate()` ile manuel
 * hidrasyon çağrılabilir.
 */
export const useCartStore = create<CartStore>()(
  persist(cartStoreCreator, {
    name: 'eticart_cart',
    storage: createJSONStorage(() => {
      // SSR sırasında no-op storage kullan
      if (typeof window === 'undefined') {
        return {
          getItem: () => null,
          setItem: () => {
            // no-op
          },
          removeItem: () => {
            // no-op
          },
        };
      }
      return window.localStorage;
    }),
    // Sadece kalem verilerini persist et — yükleme durumları, hatalar ve
    // backend bağlantı bilgileri her oturumda sıfırlanmalı
    partialize: (state) => ({
      items: state.items,
      cartId: state.cartId,
      currency: state.currency,
    }),
    version: 1,
    skipHydration: true,
  }),
);

/**
 * Component mount olduktan sonra store'u hidre etmek için yardımcı.
 */
export function hydrateCartStore(): void {
  if (typeof window !== 'undefined') {
    void useCartStore.persist.rehydrate();
  }
}
