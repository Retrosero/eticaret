/**
 * Production Migration Script.
 *
 * Coolify / Docker Compose container başlangıcında çağrılır.
 * `prisma migrate deploy` komutunu çalıştırarak tüm bekleyen
 * migration'ları uygular (production'da `migrate dev` KULLANILMAZ).
 *
 * Çalıştırma: `node dist/scripts/migrate-deploy.js` (build sonrası)
 * veya:      `tsx scripts/migrate-deploy.ts` (geliştirme)
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const log = (...args: unknown[]) => console.log('[migrate]', ...args);

const cwd = resolve(__dirname, '..');

if (!process.env['DATABASE_URL']) {
  log('⚠️  DATABASE_URL tanımlı değil, migration atlanıyor.');
  process.exit(0);
}

try {
  log('Migration başlıyor…');
  log(`CWD: ${cwd}`);

  // Prisma migrate deploy — production-safe (idempotent, lock'lı)
  execSync('npx prisma migrate deploy --schema=./prisma/schema.prisma', {
    cwd,
    stdio: 'inherit',
    env: { ...process.env },
  });

  log('✅ Migration tamamlandı.');
  process.exit(0);
} catch (err: any) {
  log('❌ Migration hatası:', err?.message ?? err);
  process.exit(1);
}