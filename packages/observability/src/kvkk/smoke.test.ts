import { describe, it, expect } from 'vitest';
import {
  maskEmail,
  maskPhone,
  maskTckn,
  maskAddress,
  maskKvkkFields,
  safeLog,
} from './index.js';

describe('@eticart/observability/kvkk', () => {
  it('maskEmail: ilk harfi korur', () => {
    expect(maskEmail('john.doe@example.com')).toBe('j***@example.com');
    expect(maskEmail('a@b.com')).toBe('a***@b.com');
  });

  it('maskPhone: son 4 hane dışında maskeler', () => {
    expect(maskPhone('+905321234567')).toBe('+XX XXX XXX 4567');
    expect(maskPhone('5321234567')).toBe('+XX XXX XXX 4567');
  });

  it('maskTckn: son 2 hane dışında maskeler', () => {
    expect(maskTckn('12345678901')).toBe('*********01');
  });

  it('maskAddress: kısa adres tamamen maskelenir', () => {
    expect(maskAddress('Kısa adres')).toBe('***');
  });

  it('maskKvkkFields: bilinen alanları otomatik maskeler', () => {
    const out = maskKvkkFields({
      email: 'john.doe@example.com',
      phone: '+905321234567',
      name: 'John Doe',
      address: 'Atatürk Caddesi No 1 Daire 2 Kadıköy İstanbul',
    });
    expect(out?.email).toBe('j***@example.com');
    expect(out?.phone).toBe('+XX XXX XXX 4567');
    expect(out?.name).toBe('John Doe'); // name KVKK alanı sayılmaz
  });

  it('safeLog null ve primitives için null/aynı değeri döner', () => {
    expect(safeLog(null)).toBeNull();
    expect(safeLog(42 as unknown)).toBe(42);
  });
});
