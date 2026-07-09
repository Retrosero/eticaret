/**
 * Gittigidiyor plugin — smoke test.
 */
import { describe, it, expect } from 'vitest';
import { manifest, handlers } from '../src/index.js';

describe('Gittigidiyor plugin', () => {
  it('manifest doğru', () => {
    expect(manifest.code).toBe('eticart-plugin-gittigidiyor');
    expect(manifest.name).toBe('Gittigidiyor Pazaryeri');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.category).toBe('marketplace');
    expect(manifest.slots[0]?.type).toBe('marketplace.adapter');
  });

  it('handlers mevcut', () => {
    expect(handlers.adapter).toBeDefined();
    expect(handlers.onProductCreated).toBeDefined();
    expect(handlers.onProductUpdated).toBeDefined();
    expect(handlers.onOrderShipped).toBeDefined();
  });

  it('adapter interface methods', () => {
    expect(typeof handlers.adapter.testConnection).toBe('function');
    expect(typeof handlers.adapter.pushProduct).toBe('function');
    expect(typeof handlers.adapter.updateStock).toBe('function');
    expect(typeof handlers.adapter.updatePrice).toBe('function');
    expect(typeof handlers.adapter.fetchOrders).toBe('function');
    expect(typeof handlers.adapter.updateShipment).toBe('function');
  });

  it('pricing tanımlı', () => {
    expect(manifest.pricing).toBeDefined();
    expect(manifest.pricing?.monthlyKurus).toBe(19900);
    expect(manifest.pricing?.hasTrial).toBe(true);
  });

  it('tags marketplace + TR', () => {
    expect(manifest.tags).toContain('gittigidiyor');
    expect(manifest.tags).toContain('turkiye');
  });
});