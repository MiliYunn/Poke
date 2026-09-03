import { env } from '$env/dynamic/private';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type ReportPlan = 'free' | 'premium';

type UsageRecord = { count: number; updatedAt: string };
type UsageDatabase = { version: 1; wallets: Record<string, UsageRecord> };

const limits: Record<ReportPlan, number> = { free: 5, premium: 100 };
let operationQueue: Promise<unknown> = Promise.resolve();

function databasePath() {
  return env.REPORT_USAGE_FILE?.trim() || join(process.cwd(), '.poke-data', 'report-usage.json');
}

function planFor(wallet: string): ReportPlan {
  const premiumWallets = new Set(
    (env.POKE_PREMIUM_WALLETS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
  return premiumWallets.has(wallet.toLowerCase()) ? 'premium' : 'free';
}

async function readDatabase(): Promise<UsageDatabase> {
  try {
    const parsed = JSON.parse(await readFile(databasePath(), 'utf8')) as UsageDatabase;
    if (parsed.version === 1 && parsed.wallets && typeof parsed.wallets === 'object') return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return { version: 1, wallets: {} };
}

async function writeDatabase(database: UsageDatabase) {
  const path = databasePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function status(wallet: string, count: number) {
  const plan = planFor(wallet);
  const limit = limits[plan];
  return {
    wallet,
    plan,
    used: count,
    limit,
    remaining: Math.max(0, limit - count),
    blocked: count >= limit
  };
}

export async function getReportQuota(wallet: string) {
  return serialize(async () => {
    const database = await readDatabase();
    return status(wallet, database.wallets[wallet.toLowerCase()]?.count || 0);
  });
}

export async function consumeReportAttempt(wallet: string) {
  return serialize(async () => {
    const database = await readDatabase();
    const key = wallet.toLowerCase();
    const count = database.wallets[key]?.count || 0;
    const current = status(wallet, count);
    if (current.blocked) return { ...current, consumed: false };

    const nextCount = count + 1;
    database.wallets[key] = { count: nextCount, updatedAt: new Date().toISOString() };
    await writeDatabase(database);
    return { ...status(wallet, nextCount), consumed: true };
  });
}
