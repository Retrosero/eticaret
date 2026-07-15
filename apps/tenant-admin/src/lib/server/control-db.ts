import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function interpolateSql(sql: string, params: unknown[]): string {
  let result = sql;
  for (let index = params.length; index >= 1; index -= 1) {
    const pattern = new RegExp(`\\$${index}(?!\\d)`, 'g');
    result = result.replace(pattern, sqlValue(params[index - 1]));
  }
  return result;
}

async function runPsql(sql: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    'docker',
    ['exec', 'eticart-postgres', 'psql', '-U', 'eticart', '-d', 'eticart_control', '-t', '-A', '-F', '|', '-c', sql],
    { maxBuffer: 1024 * 1024 },
  );

  const significantStderr = (stderr ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('NOTICE:'))
    .join('\n');

  if (significantStderr) {
    throw new Error(significantStderr);
  }

  return stdout.trim();
}

export async function queryControlRows<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const statement = interpolateSql(sql, params);
  const wrapped = `COPY (SELECT row_to_json(row_data) FROM (${statement}) AS row_data) TO STDOUT`;
  const stdout = await runPsql(wrapped);

  if (!stdout) return [];

  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export async function executeControlQuery(sql: string, params: unknown[] = []): Promise<void> {
  const statement = interpolateSql(sql, params);
  await runPsql(statement);
}
