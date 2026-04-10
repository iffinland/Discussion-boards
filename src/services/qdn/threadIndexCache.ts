import type { ThreadSearchSnapshot } from './forumSearchIndexService';

const THREAD_INDEX_CACHE_TTL_MS = 60 * 1000;

type ThreadIndexCacheEntry = {
  snapshot: ThreadSearchSnapshot | null;
  cachedAt: number;
};

const cache = new Map<string, ThreadIndexCacheEntry>();
const inflight = new Map<string, Promise<ThreadSearchSnapshot | null>>();

const normalizeSubTopicId = (value: string) => value.trim();

const isFresh = (entry: ThreadIndexCacheEntry) => {
  return Date.now() - entry.cachedAt < THREAD_INDEX_CACHE_TTL_MS;
};

export const readThreadIndexCache = (subTopicId: string) => {
  const normalizedId = normalizeSubTopicId(subTopicId);
  if (!normalizedId) {
    return null;
  }

  const entry = cache.get(normalizedId);
  if (!entry || !isFresh(entry)) {
    return null;
  }

  return entry.snapshot;
};

export const writeThreadIndexCache = (
  subTopicId: string,
  snapshot: ThreadSearchSnapshot | null
) => {
  const normalizedId = normalizeSubTopicId(subTopicId);
  if (!normalizedId) {
    return;
  }

  cache.set(normalizedId, {
    snapshot,
    cachedAt: Date.now(),
  });
};

export const loadThreadIndexCached = async (
  subTopicId: string,
  loader: (subTopicId: string) => Promise<ThreadSearchSnapshot | null>
) => {
  const normalizedId = normalizeSubTopicId(subTopicId);
  if (!normalizedId) {
    return null;
  }

  const cachedEntry = cache.get(normalizedId);
  if (cachedEntry && isFresh(cachedEntry)) {
    return cachedEntry.snapshot;
  }

  const existingInflight = inflight.get(normalizedId);
  if (existingInflight) {
    return existingInflight;
  }

  const requestPromise = loader(normalizedId)
    .then((snapshot) => {
      writeThreadIndexCache(normalizedId, snapshot);
      return snapshot;
    })
    .finally(() => {
      inflight.delete(normalizedId);
    });

  inflight.set(normalizedId, requestPromise);
  return requestPromise;
};
