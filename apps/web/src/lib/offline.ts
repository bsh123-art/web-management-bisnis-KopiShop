'use client';

/**
 * Offline-first support for the POS terminal.
 *
 * Sales made while the connection is down are queued in IndexedDB with a
 * client-generated idempotency key, then replayed against `/orders/sync` once
 * the browser is back online. The key makes replays safe: the server returns
 * the original order instead of creating a duplicate.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { api, ApiError } from './api';
import type { PosCatalog } from './types';

const DB_NAME = 'kopi-pos';
const DB_VERSION = 1;

export interface QueuedOrder {
  idempotencyKey: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

interface KopiDB extends DBSchema {
  pendingOrders: { key: string; value: QueuedOrder; indexes: { createdAt: number } };
  cache: { key: string; value: { key: string; data: unknown; cachedAt: number } };
}

let dbPromise: Promise<IDBPDatabase<KopiDB>> | null = null;

const getDb = () => {
  if (typeof window === 'undefined') throw new Error('IndexedDB is only available in the browser');
  dbPromise ??= openDB<KopiDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pendingOrders')) {
        const store = db.createObjectStore('pendingOrders', { keyPath: 'idempotencyKey' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
      }
    },
  });
  return dbPromise;
};

export const newIdempotencyKey = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;

export async function enqueueOrder(payload: Record<string, unknown>, idempotencyKey: string): Promise<void> {
  const db = await getDb();
  await db.put('pendingOrders', { idempotencyKey, payload, createdAt: Date.now(), attempts: 0 });
}

export async function getPendingOrders(): Promise<QueuedOrder[]> {
  const db = await getDb();
  return db.getAllFromIndex('pendingOrders', 'createdAt');
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  return db.count('pendingOrders');
}

export async function clearPending(keys: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('pendingOrders', 'readwrite');
  await Promise.all(keys.map((key) => tx.store.delete(key)));
  await tx.done;
}

interface SyncResult {
  idempotencyKey?: string;
  status: 'synced' | 'duplicate' | 'failed';
  orderNumber?: string;
  error?: string;
}

export interface SyncReport {
  synced: number;
  duplicates: number;
  failed: number;
  remaining: number;
}

let syncing = false;

/** Replays the queue. Safe to call repeatedly — concurrent calls are ignored. */
export async function syncPendingOrders(): Promise<SyncReport | null> {
  if (syncing || typeof navigator !== 'undefined' && !navigator.onLine) return null;

  const pending = await getPendingOrders();
  if (pending.length === 0) return null;

  syncing = true;
  try {
    const response = await api.post<SyncResult[]>('/orders/sync', {
      orders: pending.map((entry) => entry.payload),
    });

    const results = response.data;
    const settled = results.filter((r) => r.status !== 'failed' && r.idempotencyKey).map((r) => r.idempotencyKey!);
    await clearPending(settled);

    // Record why an order could not sync so staff can act on it.
    const db = await getDb();
    for (const failure of results.filter((r) => r.status === 'failed' && r.idempotencyKey)) {
      const entry = await db.get('pendingOrders', failure.idempotencyKey!);
      if (entry) {
        await db.put('pendingOrders', { ...entry, attempts: entry.attempts + 1, lastError: failure.error });
      }
    }

    return {
      synced: results.filter((r) => r.status === 'synced').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      failed: results.filter((r) => r.status === 'failed').length,
      remaining: await pendingCount(),
    };
  } catch (err) {
    // Still offline or the server rejected the batch — keep everything queued.
    if (err instanceof ApiError && err.isOffline) return null;
    throw err;
  } finally {
    syncing = false;
  }
}

// --------------------------------------------------------------------------
// Catalog cache — lets the POS keep selling with no network at all
// --------------------------------------------------------------------------

const CATALOG_KEY = 'pos-catalog';

export async function cacheCatalog(catalog: PosCatalog): Promise<void> {
  const db = await getDb();
  await db.put('cache', { key: CATALOG_KEY, data: catalog, cachedAt: Date.now() });
}

export async function readCachedCatalog(): Promise<{ catalog: PosCatalog; cachedAt: number } | null> {
  try {
    const db = await getDb();
    const entry = await db.get('cache', CATALOG_KEY);
    return entry ? { catalog: entry.data as PosCatalog, cachedAt: entry.cachedAt } : null;
  } catch {
    return null;
  }
}
