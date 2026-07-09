// Queue testleri ayrı dosyada
async function runQueueTests(expect, runTest, runDescribe) {
  await runDescribe('Email Queue', async () => {
    const {
      InMemoryQueue,
      createEmailQueueHandler,
      DEFAULT_ADAPTER_BY_EVENT,
      DEFAULT_TEMPLATE_BY_EVENT,
    } = await import('./dist/queue/index.js');
    const { SmtpClient, NotificationAdapterRegistry } =
      await import('./dist/index.js');

    await runTest('InMemoryQueue: enqueue + process', async () => {
      const processed = [];
      const handler = async (job) => {
        processed.push(job);
      };
      const q = new InMemoryQueue(handler);
      await q.enqueue({ jobId: 'j1', event: 'order.confirmation', data: {}, templateName: 't', adapterName: 'smtp' });
      await new Promise((r) => setTimeout(r, 50));
      expect(processed.length).toBe(1);
      expect(processed[0].jobId).toBe('j1');
      await q.close();
    });

    await runTest('InMemoryQueue: 3 iş ekle, hepsi işlenir', async () => {
      const processed = [];
      const handler = async (job) => {
        processed.push(job.jobId);
      };
      const q = new InMemoryQueue(handler);
      await q.enqueue({ jobId: 'j1', event: 'x', data: {}, templateName: 't', adapterName: 'smtp' });
      await q.enqueue({ jobId: 'j2', event: 'x', data: {}, templateName: 't', adapterName: 'smtp' });
      await q.enqueue({ jobId: 'j3', event: 'x', data: {}, templateName: 't', adapterName: 'smtp' });
      await q.process();
      expect(processed.length).toBe(3);
      expect(q.size()).toBe(0);
    });

    await runTest('createEmailQueueHandler: render + send', async () => {
      const registry = new NotificationAdapterRegistry();
      const smtp = new SmtpClient();
      smtp.configure({ smtp: { host: 'smtp.test.com', port: 587 } });
      smtp.transport = {
        sendMail: async (mail) => {
          expect(mail.subject).toContain('TRD-001');
          expect(mail.to).toContain('ali@test.com');
          expect(mail.text).toContain('Ali');
          return { messageId: 'q-msg-1', accepted: ['ali@test.com'], rejected: [] };
        },
      };
      registry.register(smtp);

      const templates = new Map();
      const { ORDER_CONFIRMATION_TEMPLATE } = await import('./dist/common/templates.js');
      templates.set('order_confirmation', ORDER_CONFIRMATION_TEMPLATE);

      const handler = createEmailQueueHandler({
        registry,
        templates,
        defaultFrom: { email: 'shop@test.com', name: 'Test Shop' },
        adapterByEvent: DEFAULT_ADAPTER_BY_EVENT,
        templateByEvent: DEFAULT_TEMPLATE_BY_EVENT,
      });

      await handler({
        jobId: 'job-x',
        event: 'order.confirmation',
        templateName: 'order_confirmation',
        adapterName: 'smtp',
        data: {
          orderNumber: 'TRD-001',
          customerName: 'Ali Yılmaz',
          total: '₺1.250,00',
          currency: 'TRY',
          orderUrl: 'https://shop.test/orders/1',
          to: { email: 'ali@test.com' },
        },
      });
    });

    await runTest('createEmailQueueHandler: alıcı yoksa return', async () => {
      const registry = new NotificationAdapterRegistry();
      const smtp = new SmtpClient();
      smtp.configure({ smtp: { host: 'smtp.test.com', port: 587 } });
      registry.register(smtp);

      const templates = new Map();
      const { ORDER_CONFIRMATION_TEMPLATE } = await import('./dist/common/templates.js');
      templates.set('order_confirmation', ORDER_CONFIRMATION_TEMPLATE);

      const handler = createEmailQueueHandler({
        registry,
        templates,
        defaultFrom: { email: 'shop@test.com' },
        adapterByEvent: DEFAULT_ADAPTER_BY_EVENT,
        templateByEvent: DEFAULT_TEMPLATE_BY_EVENT,
      });

      // Alıcı yok → sessizce log+return
      await handler({
        jobId: 'job-no-rec',
        event: 'order.confirmation',
        templateName: 'order_confirmation',
        adapterName: 'smtp',
        data: { orderNumber: 'X', customerName: 'Y' },
      });
    });

    await runTest('createEmailQueueHandler: retry on failure', async () => {
      const registry = new NotificationAdapterRegistry();
      const smtp = new SmtpClient();
      smtp.configure({ smtp: { host: 'smtp.test.com', port: 587 } });
      let attempts = 0;
      smtp.transport = {
        sendMail: async () => {
          attempts++;
          if (attempts < 3) throw new Error('SMTP temporary error');
          return { messageId: 'retry-msg', accepted: ['a@b.com'], rejected: [] };
        },
      };
      registry.register(smtp);

      const templates = new Map();
      const { ORDER_CONFIRMATION_TEMPLATE } = await import('./dist/common/templates.js');
      templates.set('order_confirmation', ORDER_CONFIRMATION_TEMPLATE);

      const handler = createEmailQueueHandler({
        registry,
        templates,
        defaultFrom: { email: 'shop@test.com' },
        maxRetries: 3,
        adapterByEvent: DEFAULT_ADAPTER_BY_EVENT,
        templateByEvent: DEFAULT_TEMPLATE_BY_EVENT,
      });

      await handler({
        jobId: 'retry-job',
        event: 'order.confirmation',
        templateName: 'order_confirmation',
        adapterName: 'smtp',
        data: {
          orderNumber: 'TRD-1',
          customerName: 'Ali',
          total: '100',
          currency: 'TRY',
          to: { email: 'a@b.com' },
        },
      });
      expect(attempts).toBe(3);
    });

    await runTest('createEmailQueueHandler: render hatası loglanır', async () => {
      const registry = new NotificationAdapterRegistry();
      const smtp = new SmtpClient();
      smtp.configure({ smtp: { host: 'smtp.test.com', port: 587 } });
      registry.register(smtp);

      const templates = new Map();
      templates.set('order_confirmation', null); // ← null template → render hatası

      const handler = createEmailQueueHandler({
        registry,
        templates,
        defaultFrom: { email: 'shop@test.com' },
        adapterByEvent: DEFAULT_ADAPTER_BY_EVENT,
        templateByEvent: DEFAULT_TEMPLATE_BY_EVENT,
      });

      // Şablon bulunamadı uyarısı → return, hata fırlamaz
      await handler({
        jobId: 'no-tpl',
        event: 'order.confirmation',
        templateName: 'order_confirmation',
        adapterName: 'smtp',
        data: { to: { email: 'a@b.com' } },
      });
    });
  });
}

export { runQueueTests };
