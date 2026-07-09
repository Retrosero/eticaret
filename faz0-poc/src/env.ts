/**
 * env.ts — .env dosyasını en erken aşamada yükler.
 *
 * Her script'in ilk import satırı bu dosyaya yönlendirilir; böylece
 * süreç başında ortam değişkenleri Node'a tanıtılır.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(): void {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.substring(0, eq).trim();
      const value = trimmed.substring(eq + 1).trim();
      // Mevcut süreç ortamındaki değer, dosyadakini eziyor mu?
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env yoksa sessizce devam et
  }
}

loadEnvFile();

export const CONTROL_DATABASE_URL =
  process.env.CONTROL_DATABASE_URL ?? 'postgresql://control_app:control_app_secret@localhost:5432/control';

export const APP_DATABASE_URL =
  process.env.APP_DATABASE_URL ?? 'postgresql://app_owner:app_owner_secret@localhost:5432/app';
