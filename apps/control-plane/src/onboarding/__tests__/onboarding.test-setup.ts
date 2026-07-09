import { vi } from 'vitest';

vi.mock('axios', () => ({
  default: { post: vi.fn(), get: vi.fn() },
  post: vi.fn(),
  get: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn() },
  createTransport: vi.fn(),
}));

vi.mock('@eticart/observability/kvkk', () => ({
  maskEmail: (s: string) => s,
  maskPhone: (s: string) => s,
  maskTckn: (s: string) => s,
  maskAddress: (s: string) => s,
  maskKvkkFields: <T>(o: T) => o,
}));
