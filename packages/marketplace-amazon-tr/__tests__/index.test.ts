/**
 * Amazon TR plugin — smoke test.
 */
import { describe, it, expect } from 'vitest';
import { manifest, handlers } from '../src/index.js';

describe('Amazon TR plugin', () => {
  it('manifest doğru', () => {
    expect(manifest.code).toBe('eticart-plugin-amazon-tr');
    expect(manifest.name).toBe('Amazon Turkey Pazaryeri');
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
    expect(manifest.pricing?.monthlyKurus).toBe(29900);
  });

  it('tags amazon + TR', () => {
    expect(manifest.tags).toContain('amazon');
    expect(manifest.tags).toContain('turkiye');
    expect(manifest.tags).toContain('sp-api');
  });
});