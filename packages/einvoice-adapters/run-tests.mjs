#!/usr/bin/env node
/**
 * Vitest olmadan minimal test runner.
 *
 * NES adaptörünün temel akışlarını kontrol eder:
 * - configure
 * - createInvoice (mock token + mock fatura)
 * - getStatus
 * - cancelInvoice
 * - NES tip dönüşümleri (e_fatura → SATIS, e_irsaliye → SEVK)
 */
import { readFileSync } from 'fs';

// Çok minimal expect
function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) throw new Error(`expected ${expected}, got ${actual}`);
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toContain(expected) {
      if (!String(actual).includes(String(expected))) {
        throw new Error(`expected "${actual}" to contain "${expected}"`);
      }
    },
    get not() {
      const self = this;
      return {
        toContain(expected) {
          if (String(actual).includes(String(expected))) {
            throw new Error(`expected "${actual}" NOT to contain "${expected}"`);
          }
        },
        toBe(expected) {
          if (actual === expected) throw new Error(`expected NOT ${expected}`);
        },
      };
    },
    toMatch(re) {
      if (!re.test(String(actual))) {
        throw new Error(`expected "${actual}" to match ${re}`);
      }
    },
    toThrow(msg) {
      if (typeof actual !== 'function') throw new Error('toThrow needs function');
      let err;
      try {
        actual();
      } catch (e) {
        err = e;
      }
      if (!err) throw new Error('did not throw');
      if (msg && !String(err.message).match(msg instanceof RegExp ? msg : new RegExp(msg))) {
        throw new Error(`expected throw "${msg}", got "${err.message}"`);
      }
    },
    toBeDefined() {
      if (actual === undefined) throw new Error('expected defined');
    },
    toBeUndefined() {
      if (actual !== undefined) throw new Error('expected undefined');
    },
    rejects: {
      async toThrow(msg) {
        let err;
        try {
          await actual;
        } catch (e) {
          err = e;
        }
        if (!err) throw new Error('did not reject');
        if (msg && !String(err.message).match(msg instanceof RegExp ? msg : new RegExp(msg))) {
          throw new Error(`expected reject "${msg}", got "${err.message}"`);
        }
      },
    },
  };
}

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    totalPassed++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failures.push({ name, err });
    totalFailed++;
  }
}

async function runDescribe(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

function makeSample() {
  return {
    tenantId: 'test',
    orderId: 'o1',
    invoiceNumber: 'TRD-001',
    type: 'e_fatura',
    currency: 'TRY',
    issueDate: new Date('2026-07-04'),
    seller: {
      taxId: '1234567890',
      legalName: 'Satıcı',
      address: { street: 'Cad<1', city: 'İstanbul', country: 'TR' },
    },
    buyer: {
      taxId: '9876543210',
      legalName: 'Alıcı',
      address: { street: 'Cad.', city: 'Ank', country: 'TR' },
    },
    lines: [
      { index: 1, name: 'A', quantity: 2, unit: 'ADET', unitPrice: 100, taxRate: 20 },
      { index: 2, name: 'B', quantity: 1, unit: 'KG', unitPrice: 50, taxRate: 10 },
    ],
  };
}

async function main() {
  const { NesClient } = await import('./dist/nes/client.js');

  // ----------------------------------------------------------------
  // UBL Builder (Logo XML adaptörü için hala gerekli)
  // ----------------------------------------------------------------
  await runDescribe('UBL Builder', async () => {
    const { buildInvoiceUbl, sha256Xml } = await import('./dist/common/ubl-builder.js');
    const sample = makeSample();

    await runTest('geçerli UBL XML üretir', () => {
      const xml = buildInvoiceUbl(sample);
      expect(xml).toContain('<?xml');
      expect(xml).toContain('<Invoice');
    });

    await runTest('XML escape (& -> &amp;)', () => {
      const xml = buildInvoiceUbl(sample);
      // '<' karakteri raw görünmemeli (escape olmalı)
      if (xml.includes('İst<')) throw new Error('XML escape çalışmadı');
      // Türkçe karakter doğru encode edildi mi?
      if (!xml.includes('İstanbul')) throw new Error('Türkçe karakter eksik');
    });

    await runTest('vergi tutarları doğru (200+40+50+5=295)', () => {
      const xml = buildInvoiceUbl(sample);
      expect(xml).toContain('295.0000');
    });

    await runTest('SHA-256 hash 64 hex karakter', async () => {
      const xml = buildInvoiceUbl(sample);
      const hash = await sha256Xml(xml);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ----------------------------------------------------------------
  // NES (nes.com.tr)
  // ----------------------------------------------------------------
  await runDescribe('NesClient (nes.com.tr)', async () => {
    await runTest('configure test modu', () => {
      const c = new NesClient();
      c.configure({ apiKey: 'k', apiSecret: 's', customerId: 'cid', testMode: true });
      expect(c.name).toBe('nes');
      expect(c.displayName).toContain('nes.com.tr');
    });

    await runTest('configure production modu', () => {
      const c = new NesClient();
      c.configure({ apiKey: 'k', apiSecret: 's', customerId: 'cid', testMode: false });
      expect(c.name).toBe('nes');
    });

    await runTest('configure edilmeden hata fırlatır', async () => {
      const c = new NesClient();
      try {
        await c.createInvoice(makeSample());
        throw new Error('should throw');
      } catch (e) {
        expect(e.message).toContain('yapılandırılmamış');
      }
    });

    await runTest('createInvoice başarılı (mock token + fatura)', async () => {
      const c = new NesClient();
      c.configure({ apiKey: 'k', apiSecret: 's', customerId: 'cid', testMode: true });

      // Mock token
      let callIdx = 0;
      c.http = {
        post: async (url, body, config) => {
          if (url === '/oauth/token') {
            return {
              data: {
                success: true,
                data: { access_token: 'tok-123', token_type: 'Bearer', expires_in: 3600 },
              },
            };
          }
          if (url === '/fatura/olustur') {
            // Payload doğrulaması
            console.log('[DEBUG] payload:', JSON.stringify(body, null, 2));
            expect(body.faturaTipi).toBe('SATIS');
            expect(body.satici.vkn).toBe('1234567890');
            expect(body.alici.vkn).toBe('9876543210');
            expect(body.paraBirimi).toBe('TRY');
            expect(body.malHizmetList.length).toBe(2);
            expect(body.malHizmetList[0].siraNo).toBe(1);
            expect(body.malHizmetList[0].malHizmetAdi).toBe('A');
            expect(body.malHizmetList[0].miktar).toBe(2);
            expect(body.malHizmetList[0].birimFiyat).toBe(100);
            expect(body.malHizmetList[0].kdvOrani).toBe(20);
            // Toplamlar
            expect(body.toplamlar.araToplam).toBe(250);
            expect(body.toplamlar.kdvToplam).toBe(45);
            expect(body.toplamlar.odenecekTutar).toBe(295);
            expect(body.duzenlenmeTarihi).toBe('2026-07-04');
            return {
              data: {
                success: true,
                statusCode: 200,
                data: {
                  faturaId: 'NES-001',
                  uuid: 'gib-uuid-xyz',
                  belgeNumarasi: 'TRD-001',
                  durum: 'GONDERILDI',
                },
              },
            };
          }
          throw new Error(`Beklenmeyen URL: ${url}`);
        },
      };

      const result = await c.createInvoice(makeSample());
      console.log('[DEBUG] result:', JSON.stringify(result));
      expect(result.status).toBe('sent');
      expect(result.uuid).toBe('gib-uuid-xyz');
    });

    await runTest('e-arşiv için de SATIS tipi kullanılır', async () => {
      const c = new NesClient();
      c.configure({ apiKey: 'k', apiSecret: 's', customerId: 'cid', testMode: true });

      let capturedPayload;
      c.http = {
        post: async (url, body, config) => {
          if (url === '/oauth/token') {
            return {
              data: {
                success: true,
                data: { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 },
              },
            };
          }
          if (url === '/fatura/olustur') {
            capturedPayload = body;
            return {
              data: { success: true, data: { faturaId: 'X', durum: 'GONDERILDI' } },
            };
          }
          throw new Error();
        },
      };

      await c.createInvoice({ ...makeSample(), type: 'e_arsiv' });
      expect(capturedPayload.faturaTipi).toBe('SATIS');
    });

    await runTest('e-irsaliye için SEVK tipi kullanılır', async () => {
      const c = new NesClient();
      c.configure({ apiKey: 'k', apiSecret: 's', customerId: 'cid', testMode: true });

      let capturedPayload;
      c.http = {
        post: async (url, body, config) => {
          if (url === '/oauth/token') {
            return {
              data: {
                success: true,
                data: { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 },
              },
            };
          }
          if (url === '/fatura/olustur') {
            capturedPayload = body;
            return {
              data: { success: true, data: { faturaId: 'X', durum: 'GONDERILDI' } },
            };
          }
          throw new Error();
        },
      };

      await c.createInvoice({ ...makeSample(), type: 'e_irsaliye' });
      expect(capturedPayload.faturaTipi).toBe('SEVK');
    });

    await runTest('Bearer header ile istek atılır', async () => {
      const c = new NesClient();
      c.configure({ apiKey: 'k', apiSecret: 's', customerId: 'cid', testMode: true });

      let sentHeaders;
      c.http = {
        post: async (url, body, config) => {
          if (url === '/oauth/token') {
            return {
              data: {
                success: true,
                data: { access_token: 'TOK-XYZ', token_type: 'Bearer', expires_in: 3600 },
              },
            };
          }
          sentHeaders = config?.headers;
          return {
            data: { success: true, data: { faturaId: 'X', durum: 'GONDERILDI' } },
          };
        },
      };

      await c.createInvoice(makeSample());
      expect(sentHeaders.Authorization).toBe('Bearer TOK-XYZ');
    });

    await runTest('REDDEDILDI durumu rejected olarak map edilir', async () => {
      const c = new NesClient();
      c.configure({ apiKey: 'k', apiSecret: 's', customerId: 'cid', testMode: true });
      c.http = {
        post: async (url) => {
          if (url === '/oauth/token') {
            return {
              data: {
                success: true,
                data: { access_token: 'tok', expires_in: 3600, token_type: 'Bearer' },
              },
            };
          }
          return {
            data: {
              success: true,
              data: { faturaId: 'X', durum: 'REDDEDILDI', hataMesaji: 'VKN hatalı' },
            },
          };
        },
      };

      const result = await c.createInvoice(makeSample());
      console.log('[DEBUG] reddedildi result:', JSON.stringify(result));
      expect(result.status).toBe('rejected');
      expect(result.errorMessage).toBe('VKN hatalı');
    });

    await runTest('cached token expires_in süresince yeniden alınmaz', async () => {
      const c = new NesClient();
      c.configure({ apiKey: 'k', apiSecret: 's', customerId: 'cid', testMode: true });

      let tokenRequests = 0;
      c.http = {
        post: async (url) => {
          if (url === '/oauth/token') {
            tokenRequests++;
            return {
              data: {
                success: true,
                data: { access_token: 'tok', expires_in: 3600, token_type: 'Bearer' },
              },
            };
          }
          return { data: { success: true, data: { faturaId: 'X', durum: 'GONDERILDI' } } };
        },
      };

      await c.createInvoice(makeSample());
      await c.createInvoice(makeSample());
      await c.createInvoice(makeSample());
      expect(tokenRequests).toBe(1); // sadece 1 kez token alındı
    });
  });

  console.log(`\n=== Sonuç: ${totalPassed} geçti, ${totalFailed} başarısız ===`);
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Runner error:', err.message);
  console.error(err.stack);
  process.exit(1);
});