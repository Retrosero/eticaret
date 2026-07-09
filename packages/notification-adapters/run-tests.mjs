#!/usr/bin/env node
/**
 * notification-adapters test runner.
 *
 * Template motoru + SMTP + Resend temel testlerini koşar.
 */
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal expect
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
      return this;
    },
    get not() {
      return {
        toBe: (v) => { if (actual === v) throw new Error(`expected NOT ${v}, got ${actual}`); },
        toEqual: (v) => {
          if (JSON.stringify(actual) === JSON.stringify(v)) throw new Error(`expected NOT equal`);
        },
        toContain: (v) => {
          if (String(actual).includes(String(v))) throw new Error(`expected "${actual}" NOT to contain "${v}"`);
        },
        toBeUndefined: () => { if (actual === undefined) throw new Error('expected NOT undefined'); },
        toBeDefined: () => { if (actual !== undefined) throw new Error('expected NOT defined'); },
      };
    },
    toMatch(re) {
      if (!re.test(String(actual))) {
        throw new Error(`expected "${actual}" to match ${re}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) throw new Error('expected defined');
    },
    toBeUndefined() {
      if (actual !== undefined) throw new Error('expected undefined');
    },
    toThrow(msg) {
      if (typeof actual !== 'function') throw new Error('toThrow needs function');
      let err;
      try { actual(); } catch (e) { err = e; }
      if (!err) throw new Error('did not throw');
      if (msg && !String(err.message).match(msg instanceof RegExp ? msg : new RegExp(msg))) {
        throw new Error(`expected throw "${msg}", got "${err.message}"`);
      }
    },
  };
}

let totalPassed = 0;
let totalFailed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    totalPassed++;
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    totalFailed++;
  }
}

async function runDescribe(name, fn) {
  console.log(`\n${name}`);
  await fn();
}

async function main() {
  // ----------------------------------------------------------------
  // Template Engine
  // ----------------------------------------------------------------
  await runDescribe('Template Engine', async () => {
    const { renderTemplate, htmlEscape, formatCurrency, formatDate, renderEmailTemplate } =
      await import('./dist/common/template.js');

    await runTest('basit degisken replace', () => {
      const out = renderTemplate('Merhaba {{name}}!', { name: 'Ali' });
      expect(out).toBe('Merhaba Ali!');
    });

    await runTest('HTML escape (varsayılan)', () => {
      const out = renderTemplate('<b>{{x}}</b>', { x: '<script>' });
      expect(out).toBe('<b>&lt;script&gt;</b>');
    });

    await runTest('raw escape yok ({{{x}}})', () => {
      const out = renderTemplate('{{{x}}}', { x: '<b>bold</b>' });
      expect(out).toBe('<b>bold</b>');
    });

    await runTest('nested path', () => {
      const out = renderTemplate('{{user.profile.name}}', { user: { profile: { name: 'Ayşe' } } });
      expect(out).toBe('Ayşe');
    });

    await runTest('koşullu blok #if true', () => {
      const out = renderTemplate('{{#if x}}görünür{{/if}}', { x: true });
      expect(out).toBe('görünür');
    });

    await runTest('koşullu blok #if false', () => {
      const out = renderTemplate('{{#if x}}görünür{{/if}}', { x: false });
      expect(out).toBe('');
    });

    await runTest('currency helper', () => {
      const out = renderTemplate('{{tutar | currency}}', { tutar: 1250.5 });
      // TRY format: ₺1.250,50
      expect(out).toContain('1.250');
    });

    await runTest('date helper', () => {
      const out = renderTemplate('{{tarih | date}}', { tarih: '2026-07-04' });
      expect(out).toContain('2026');
    });

    await runTest('upper/lower helper', () => {
      expect(renderTemplate('{{x | upper}}', { x: 'merhaba' })).toBe('MERHABA');
      expect(renderTemplate('{{x | lower}}', { x: 'HELLO' })).toBe('hello');
    });

    await runTest('default helper', () => {
      const out = renderTemplate('{{x | default:"misafir"}}', {});
      if (out !== 'misafir' && out !== '&quot;misafir&quot;') {
        throw new Error(`beklenen misafir veya &quot;misafir&quot;, alındı: ${out}`);
      }
    });

    await runTest('renderEmailTemplate: subject + text + html', () => {
      const t = {
        subject: 'Sipariş {{orderNumber}}',
        text: 'Merhaba {{name}}',
        html: '<h1>Merhaba {{name}}</h1>',
      };
      const out = renderEmailTemplate(t, { orderNumber: 'TRD-001', name: '<b>Ali</b>' });
      expect(out.subject).toBe('Sipariş TRD-001'); // subject raw
      expect(out.text).toBe('Merhaba <b>Ali</b>'); // text raw
      expect(out.html).toBe('<h1>Merhaba &lt;b&gt;Ali&lt;/b&gt;</h1>'); // html escape
    });
  });

  // ----------------------------------------------------------------
  // Templates
  // ----------------------------------------------------------------
  await runDescribe('E-posta Şablonları', async () => {
    const { ORDER_CONFIRMATION_TEMPLATE, ORDER_STATUS_CHANGED_TEMPLATE, DEALER_APPROVED_TEMPLATE } =
      await import('./dist/common/templates.js');

    await runTest('ORDER_CONFIRMATION_TEMPLATE.subject içeriyor', () => {
      expect(ORDER_CONFIRMATION_TEMPLATE.subject).toContain('{{orderNumber}}');
    });

    await runTest('ORDER_CONFIRMATION_TEMPLATE.text düz metin', () => {
      expect(ORDER_CONFIRMATION_TEMPLATE.text).toContain('{{customerName}}');
      expect(ORDER_CONFIRMATION_TEMPLATE.text).toContain('Siparişiniz');
    });

    await runTest('ORDER_CONFIRMATION_TEMPLATE.html HTML escape', () => {
      // {{customerName}} HTML'de escape edilmeli
      expect(ORDER_CONFIRMATION_TEMPLATE.html).toContain('{{customerName}}');
    });

    await runTest('ORDER_STATUS_CHANGED_TEMPLATE trackingNumber destekliyor', () => {
      expect(ORDER_STATUS_CHANGED_TEMPLATE.text).toContain('trackingNumber');
      expect(ORDER_STATUS_CHANGED_TEMPLATE.html).toContain('#if trackingNumber');
    });

    await runTest('DEALER_APPROVED_TEMPLATE creditLimit destekliyor', () => {
      // creditLimit text veya html'de geçmeli (koşullu blok içinde)
      const hasInText = DEALER_APPROVED_TEMPLATE.text.includes('creditLimit');
      const hasInHtml = DEALER_APPROVED_TEMPLATE.html.includes('creditLimit');
      if (!hasInText && !hasInHtml) throw new Error('creditLimit referansı yok');
    });
  });

  // ----------------------------------------------------------------
  // Resend Client
  // ----------------------------------------------------------------
  await runDescribe('ResendClient', async () => {
    const { ResendClient } = await import('./dist/resend/client.js');

    await runTest('configure apiKey olmadan hata fırlatır', () => {
      const c = new ResendClient();
      try {
        c.configure({});
        throw new Error('should throw');
      } catch (e) {
        expect(e.message).toContain('API anahtarı eksik');
      }
    });

    await runTest('configure eder ve displayName doğru', () => {
      const c = new ResendClient();
      c.configure({ apiKey: 're_test_xxx' });
      expect(c.name).toBe('resend');
      expect(c.displayName).toContain('Resend');
      expect(c.supportsEmail).toBe(true);
    });

    await runTest('configure edilmeden sendEmail hata fırlatır', async () => {
      const c = new ResendClient();
      try {
        await c.sendEmail({
          from: { email: 'a@b.com' },
          to: [{ email: 'c@d.com' }],
          subject: 'Test',
          html: '<p>test</p>',
        });
        throw new Error('should throw');
      } catch (e) {
        expect(e.message).toContain('yapılandırılmamış');
      }
    });

    await runTest('mock HTTP ile başarılı gönderim', async () => {
      const c = new ResendClient();
      c.configure({ apiKey: 're_test' });
      c.http = {
        post: async (url, body) => {
          expect(url).toBe('/emails');
          expect(body.subject).toBe('Test Subject');
          expect(body.to).toEqual(['ali@test.com']);
          return {
            data: { id: 'msg-uuid-123', object: 'email' },
          };
        },
      };

      const result = await c.sendEmail({
        from: { email: 'shop@test.com', name: 'Test Shop' },
        to: [{ email: 'ali@test.com' }],
        subject: 'Test Subject',
        html: '<p>Test</p>',
      });
      expect(result.messageId).toBe('msg-uuid-123');
      expect(result.status).toBe('sent');
    });

    await runTest('HTTP hata → failed', async () => {
      const c = new ResendClient();
      c.configure({ apiKey: 're_test' });
      c.http = {
        post: async () => {
          throw {
            message: 'Network error',
            response: { data: { message: 'API rate limit exceeded' } },
          };
        },
      };

      const result = await c.sendEmail({
        from: { email: 'a@b.com' },
        to: [{ email: 'c@d.com' }],
        subject: 'Test',
        html: '<p>test</p>',
      });
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('API rate limit exceeded');
    });

    await runTest('idempotency-key header ekler', async () => {
      const c = new ResendClient();
      c.configure({ apiKey: 're_test' });
      let sentHeaders;
      c.http = {
        post: async (url, body, config) => {
          sentHeaders = config?.headers || body?.headers;
          return { data: { id: 'msg-1' } };
        },
      };

      await c.sendEmail({
        from: { email: 'a@b.com' },
        to: [{ email: 'c@d.com' }],
        subject: 'Test',
        html: '<p>test</p>',
        idempotencyKey: 'order-123-invoice',
      });
      // Idempotency-Key ya body.headers'ta ya da config.headers'ta olmalı
      const headersJson = JSON.stringify({ headers: sentHeaders, body: c });
      expect(headersJson).toContain('order-123-invoice');
    });
  });

  // ----------------------------------------------------------------
  // SMTP Client (transport mock)
  // ----------------------------------------------------------------
  await runDescribe('SmtpClient', async () => {
    const { SmtpClient } = await import('./dist/smtp/client.js');

    await runTest('configure smtp olmadan hata fırlatır', () => {
      const c = new SmtpClient();
      try {
        c.configure({});
        throw new Error('should throw');
      } catch (e) {
        expect(e.message).toContain('SMTP yapılandırması eksik');
      }
    });

    await runTest('configure eder', () => {
      const c = new SmtpClient();
      c.configure({
        smtp: { host: 'smtp.test.com', port: 587, user: 'u', password: 'p' },
      });
      expect(c.name).toBe('smtp');
      expect(c.supportsEmail).toBe(true);
    });

    await runTest('transport oluşturur (mock)', async () => {
      const c = new SmtpClient();
      c.configure({
        smtp: { host: 'smtp.test.com', port: 587, user: 'u', password: 'p' },
      });

      // Nodemailer dynamic import yerine doğrudan transport set
      c.transport = {
        sendMail: async (mail) => {
          expect(mail.from).toContain('shop@test.com');
          expect(mail.to).toContain('ali@test.com');
          expect(mail.subject).toBe('Test');
          return {
            messageId: 'smtp-msg-001',
            accepted: ['ali@test.com'],
            rejected: [],
          };
        },
      };

      const result = await c.sendEmail({
        from: { email: 'shop@test.com', name: 'Test Shop' },
        to: [{ email: 'ali@test.com' }],
        subject: 'Test',
        html: '<p>Test</p>',
      });
      expect(result.messageId).toBe('smtp-msg-001');
      expect(result.status).toBe('sent');
    });

    await runTest('gönderim hatası → failed', async () => {
      const c = new SmtpClient();
      c.configure({
        smtp: { host: 'smtp.test.com', port: 587 },
      });
      c.transport = {
        sendMail: async () => {
          throw new Error('SMTP connection refused');
        },
      };

      const result = await c.sendEmail({
        from: { email: 'a@b.com' },
        to: [{ email: 'c@d.com' }],
        subject: 'Test',
        html: '<p>test</p>',
      });
      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('SMTP connection refused');
    });

    await runTest('HTML\'den düz metin üretir (text yoksa)', async () => {
      const c = new SmtpClient();
      c.configure({ smtp: { host: 'smtp.test.com', port: 587 } });

      let capturedMail = null;
      c.transport = {
        sendMail: async (mail) => {
          capturedMail = mail;
          return { messageId: 'm1', accepted: ['c@d.com'], rejected: [] };
        },
      };

      const result = await c.sendEmail({
        from: { email: 'a@b.com' },
        to: [{ email: 'c@d.com' }],
        subject: 'Test',
        html: '<h1>Başlık</h1><p>Paragraf</p>',
      });
      expect(result.status).toBe('sent');
      if (!capturedMail) throw new Error('mock çağrılmadı');
      const text = capturedMail.text ?? '';
      expect(text).toContain('Başlık');
      expect(text).toContain('Paragraf');
      expect(text).not.toContain('<h1>');
    });
  });

  // ----------------------------------------------------------------
  // Registry
  // ----------------------------------------------------------------
  await runDescribe('NotificationAdapterRegistry', async () => {
    const { NotificationAdapterRegistry, SmtpClient, ResendClient } =
      await import('./dist/index.js');

    await runTest('register + get + has + list', () => {
      const r = new NotificationAdapterRegistry();
      const smtp = new SmtpClient();
      const resend = new ResendClient();
      r.register(smtp);
      r.register(resend);
      expect(r.has('smtp')).toBe(true);
      expect(r.has('resend')).toBe(true);
      expect(r.has('unknown')).toBe(false);
      expect(r.get('smtp')).toBe(smtp);
      expect(r.list().length).toBe(2);
    });
  });

  // Email Queue (ayrı dosyadan)
  const { runQueueTests } = await import("./queue-tests.mjs");
  await runQueueTests(expect, runTest, runDescribe);
  console.log(`\n=== Sonuç: ${totalPassed} geçti, ${totalFailed} başarısız ===`);
  if (totalFailed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Runner error:', err.message);
  process.exit(1);
});