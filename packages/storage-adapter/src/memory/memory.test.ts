/**
 * InMemory depolama sürücüsü testleri.
 */

import { describe, it, expect } from 'vitest';

import { InMemoryStorageDriver } from './index.js';

const TENANT = 'a1b2c3d4-1234-5678-9abc-def012345678';

describe('InMemoryStorageDriver', () => {
  it('put sonrası exists ve get ile erişim', async () => {
    const d = new InMemoryStorageDriver();
    const buf = Buffer.from('merhaba dünya');
    const r = await d.put({
      tenantId: TENANT,
      logicalPath: 'products/sku1',
      filename: 'cover.jpg',
      body: buf,
      contentType: 'image/jpeg',
    });
    expect(r.key).toContain(`tenants/${TENANT}/products/sku1/cover.jpg`);
    expect(await d.exists(r.key)).toBe(true);
    const got = await d.get(r.key);
    const chunks: Buffer[] = [];
    for await (const c of got.stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    expect(Buffer.concat(chunks).toString('utf8')).toBe('merhaba dünya');
  });

  it('remove sonrası exists false', async () => {
    const d = new InMemoryStorageDriver();
    const r = await d.put({
      tenantId: TENANT,
      logicalPath: 'products/sku1',
      filename: 'cover.jpg',
      body: Buffer.from('x'),
      contentType: 'image/jpeg',
    });
    await d.remove(r.key);
    expect(await d.exists(r.key)).toBe(false);
  });

  it('maxBytes sınırını aşan dosya reddedilir', async () => {
    const d = new InMemoryStorageDriver();
    await expect(
      d.put({
        tenantId: TENANT,
        logicalPath: 'products/sku1',
        filename: 'cover.jpg',
        body: Buffer.alloc(1024),
        contentType: 'image/jpeg',
        maxBytes: 512,
      }),
    ).rejects.toThrow(/aşıyor/);
  });

  it('list prefix ile çalışır', async () => {
    const d = new InMemoryStorageDriver();
    await d.put({
      tenantId: TENANT,
      logicalPath: 'products/sku1',
      filename: 'a.jpg',
      body: Buffer.from('1'),
      contentType: 'image/jpeg',
    });
    await d.put({
      tenantId: TENANT,
      logicalPath: 'products/sku1',
      filename: 'b.jpg',
      body: Buffer.from('2'),
      contentType: 'image/jpeg',
    });
    const list = await d.list(`tenants/${TENANT}/products/sku1`);
    expect(list.length).toBe(2);
  });
});
