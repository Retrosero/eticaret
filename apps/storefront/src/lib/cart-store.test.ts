/**
 * cart-store.ts birim testleri.
 *
 * - addItem (demo modda): yeni kalem ekler, toplamları günceller
 * - updateItem (demo modda): miktar değiştirir, lineTotal yeniden hesaplanır
 * - removeItem (demo modda): kalemi siler, toplam yeniden hesaplanır
 *
 * Tüm testler demo modda çalışır (backend fetch'i yok).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore } from './cart-store';

// ---------------------------------------------------------------------------
// Yaşam döngüsü
// ---------------------------------------------------------------------------

beforeEach(() => {
  if (typeof window !== 'undefined') window.localStorage.clear();
  // Her test için temiz state
  useCartStore.getState().resetLocal();
  // Demo mod'a zorla
  useCartStore.setState({ isDemo: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Testler
// ---------------------------------------------------------------------------

describe('cart-store — addItem (demo)', () => {
  it('Yeni kalem ekler, itemCount ve subtotal günceller', async () => {
    await useCartStore.getState().addItem({
      productId: 'p-1',
      name: 'Test Ürün',
      sku: 'TST-001',
      quantity: 2,
      unitPriceKurus: 50_00, // 50,00 TL = 5000 kuruş
    });

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.name).toBe('Test Ürün');
    expect(state.items[0]?.quantity).toBe(2);
    expect(state.items[0]?.lineTotalKurus).toBe(10_000);
    expect(state.itemCount).toBe(2);
    expect(state.subtotalKurus).toBe(10_000);
    expect(state.grandTotalKurus).toBe(10_000);
  });

  it('Aynı üründen tekrar eklenirse miktar birleşir', async () => {
    const input = {
      productId: 'p-1',
      variantId: 'v-1',
      name: 'Test Ürün',
      quantity: 1,
      unitPriceKurus: 30_00,
    } as const;

    await useCartStore.getState().addItem(input);
    await useCartStore.getState().addItem(input);
    await useCartStore.getState().addItem(input);

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.quantity).toBe(3);
    expect(state.subtotalKurus).toBe(9_000);
    expect(state.itemCount).toBe(3);
  });

  it('Farklı ürünler ayrı kalemler olarak eklenir', async () => {
    await useCartStore.getState().addItem({
      productId: 'p-1',
      name: 'Ürün 1',
      quantity: 1,
      unitPriceKurus: 100_00,
    });
    await useCartStore.getState().addItem({
      productId: 'p-2',
      name: 'Ürün 2',
      quantity: 1,
      unitPriceKurus: 200_00,
    });

    expect(useCartStore.getState().items).toHaveLength(2);
    expect(useCartStore.getState().itemCount).toBe(2);
    expect(useCartStore.getState().subtotalKurus).toBe(300_00);
  });
});

describe('cart-store — updateItem (demo)', () => {
  beforeEach(async () => {
    await useCartStore.getState().addItem({
      productId: 'p-1',
      name: 'Test Ürün',
      quantity: 2,
      unitPriceKurus: 50_00,
    });
  });

  it('Miktarı günceller ve lineTotal yeniden hesaplar', async () => {
    const item = useCartStore.getState().items[0];
    if (item === undefined) throw new Error('item yok');

    await useCartStore.getState().updateItem(item.id, 5);

    const state = useCartStore.getState();
    expect(state.items[0]?.quantity).toBe(5);
    expect(state.items[0]?.lineTotalKurus).toBe(25_000);
    expect(state.itemCount).toBe(5);
    expect(state.subtotalKurus).toBe(25_000);
  });

  it('Miktar sıfıra düşerse kalemi siler', async () => {
    const item = useCartStore.getState().items[0];
    if (item === undefined) throw new Error('item yok');

    await useCartStore.getState().updateItem(item.id, 0);

    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().itemCount).toBe(0);
    expect(useCartStore.getState().subtotalKurus).toBe(0);
  });

  it('Negatif miktar ile updateItem çağrılırsa siler', async () => {
    const item = useCartStore.getState().items[0];
    if (item === undefined) throw new Error('item yok');

    await useCartStore.getState().updateItem(item.id, -2);

    expect(useCartStore.getState().items).toHaveLength(0);
  });
});

describe('cart-store — removeItem (demo)', () => {
  it('Kalemi siler ve toplamları yeniden hesaplar', async () => {
    await useCartStore.getState().addItem({
      productId: 'p-1',
      name: 'Ürün 1',
      quantity: 2,
      unitPriceKurus: 50_00,
    });
    await useCartStore.getState().addItem({
      productId: 'p-2',
      name: 'Ürün 2',
      quantity: 1,
      unitPriceKurus: 30_00,
    });

    const firstItem = useCartStore.getState().items[0];
    if (firstItem === undefined) throw new Error('item yok');

    await useCartStore.getState().removeItem(firstItem.id);

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.productId).toBe('p-2');
    expect(state.itemCount).toBe(1);
    expect(state.subtotalKurus).toBe(30_00);
  });

  it('Var olmayan ID ile çağrılırsa sessizce yok sayar', async () => {
    await useCartStore.getState().addItem({
      productId: 'p-1',
      name: 'Ürün 1',
      quantity: 1,
      unitPriceKurus: 50_00,
    });

    await useCartStore.getState().removeItem('non-existent-id');

    expect(useCartStore.getState().items).toHaveLength(1);
  });
});

describe('cart-store — clear ve reset', () => {
  it('clear (demo) tüm state\'i sıfırlar', async () => {
    await useCartStore.getState().addItem({
      productId: 'p-1',
      name: 'Ürün 1',
      quantity: 2,
      unitPriceKurus: 50_00,
    });

    await useCartStore.getState().clear();

    const state = useCartStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.itemCount).toBe(0);
    expect(state.subtotalKurus).toBe(0);
    expect(state.grandTotalKurus).toBe(0);
  });

  it('resetLocal state\'i initialState\'e döndürür', async () => {
    useCartStore.setState({ isLoading: true, error: 'test' });
    useCartStore.getState().resetLocal();

    const state = useCartStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.items).toHaveLength(0);
  });
});
