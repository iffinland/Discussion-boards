import { requestQortal } from '../qortal/qortalClient';
import { fetchWithQdnReadyFallback } from './qdnReadiness';
import { getUserAccount } from '../qortal/walletService';

const FORUM_SERVICE = import.meta.env.VITE_QORTAL_QDN_SERVICE ?? 'DOCUMENT';
const FORUM_NAMESPACE =
  import.meta.env.VITE_QORTAL_QDN_IDENTIFIER?.trim() || 'qdbm';
const MAINTENANCE_IDENTIFIER = `${FORUM_NAMESPACE}-maintenance`;
const VERIFY_RETRIES = 5;
const VERIFY_DELAY_MS = 1500;
const MAINTENANCE_CACHE_TTL_MS = 15 * 1000;

type SearchQdnResourceResult = {
  name: string;
  identifier: string;
};

export type ForumMaintenanceState = {
  enabled: boolean;
  message: string;
  updatedAt: number | null;
};

type MaintenancePayload = {
  version: 1;
  type: 'forum-maintenance';
  updatedAt: number;
  maintenance: {
    enabled: boolean;
    message: string;
  };
};

let maintenanceCache: {
  value: ForumMaintenanceState | null;
  updatedAt: number;
  inflight: Promise<ForumMaintenanceState> | null;
} = {
  value: null,
  updatedAt: 0,
  inflight: null,
};

const sleep = async (durationMs: number) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
};

const encodeBase64Json = (value: unknown): string => {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
};

const decodeBase64Json = (value: string): unknown => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const decoded = new TextDecoder().decode(bytes);
  return JSON.parse(decoded) as unknown;
};

const parseJsonLike = (raw: unknown): unknown => {
  if (typeof raw !== 'string') {
    return raw;
  }

  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return decodeBase64Json(trimmed);
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const defaultMaintenanceState = (): ForumMaintenanceState => ({
  enabled: false,
  message: 'Forum is under maintenance. Please check back later.',
  updatedAt: null,
});

const parseMaintenancePayload = (raw: unknown): MaintenancePayload | null => {
  if (
    !isObject(raw) ||
    raw.type !== 'forum-maintenance' ||
    !isObject(raw.maintenance)
  ) {
    return null;
  }

  return {
    version: 1,
    type: 'forum-maintenance',
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    maintenance: {
      enabled: raw.maintenance.enabled === true,
      message:
        typeof raw.maintenance.message === 'string' &&
        raw.maintenance.message.trim()
          ? raw.maintenance.message.trim()
          : defaultMaintenanceState().message,
    },
  };
};

const searchByIdentifier = async (
  identifier: string
): Promise<SearchQdnResourceResult[]> => {
  const search = await requestQortal<SearchQdnResourceResult[]>({
    action: 'SEARCH_QDN_RESOURCES',
    service: FORUM_SERVICE,
    identifier,
    prefix: true,
    mode: 'ALL',
    reverse: true,
    limit: 20,
    offset: 0,
  });

  return Array.isArray(search) ? search : [];
};

const fetchResource = async (name: string, identifier: string) => {
  const fetcher = () =>
    requestQortal<unknown>({
      action: 'FETCH_QDN_RESOURCE',
      service: FORUM_SERVICE,
      name,
      identifier,
    });

  const raw = await fetchWithQdnReadyFallback(
    FORUM_SERVICE,
    name,
    identifier,
    fetcher
  );
  return parseJsonLike(raw);
};

const resolveOwnerName = async (providedName?: string): Promise<string> => {
  if (providedName?.trim()) {
    return providedName.trim();
  }

  const account = await getUserAccount();
  if (account.name?.trim()) {
    return account.name.trim();
  }

  throw new Error('Authenticated account has no Qortal name.');
};

const verifyPublication = async (ownerName: string, identifier: string) => {
  for (let attempt = 1; attempt <= VERIFY_RETRIES; attempt += 1) {
    try {
      const raw = await requestQortal<unknown>({
        action: 'FETCH_QDN_RESOURCE',
        service: FORUM_SERVICE,
        name: ownerName,
        identifier,
      });

      const parsed = parseMaintenancePayload(parseJsonLike(raw));
      if (parsed) {
        return;
      }
    } catch {
      // Retry until exhausted.
    }

    if (attempt < VERIFY_RETRIES) {
      await sleep(VERIFY_DELAY_MS);
    }
  }

  throw new Error(
    'Maintenance state was submitted but could not be verified yet.'
  );
};

const pickLatest = (payloads: Array<MaintenancePayload | null>) =>
  payloads
    .filter((item): item is MaintenancePayload => item !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;

export const forumMaintenanceService = {
  createDefaultMaintenanceState: defaultMaintenanceState,

  async loadMaintenanceState(): Promise<ForumMaintenanceState> {
    const now = Date.now();
    if (
      maintenanceCache.value &&
      now - maintenanceCache.updatedAt <= MAINTENANCE_CACHE_TTL_MS
    ) {
      return maintenanceCache.value;
    }

    if (maintenanceCache.inflight) {
      return maintenanceCache.inflight;
    }

    const loadPromise = (async () => {
      const resources = await searchByIdentifier(MAINTENANCE_IDENTIFIER);
      const payloads = await Promise.all(
        resources.map(async (item) => {
          try {
            const raw = await fetchResource(item.name, item.identifier);
            return parseMaintenancePayload(raw);
          } catch {
            return null;
          }
        })
      );

      const latest = pickLatest(payloads);
      return latest
        ? {
            enabled: latest.maintenance.enabled,
            message: latest.maintenance.message,
            updatedAt: latest.updatedAt,
          }
        : defaultMaintenanceState();
    })()
      .then((result) => {
        maintenanceCache = {
          value: result,
          updatedAt: Date.now(),
          inflight: null,
        };
        return result;
      })
      .catch((error) => {
        maintenanceCache = {
          ...maintenanceCache,
          inflight: null,
        };
        throw error;
      });

    maintenanceCache = {
      ...maintenanceCache,
      inflight: loadPromise,
    };

    return loadPromise;
  },

  async publishMaintenanceState(
    input: { enabled: boolean; message: string },
    ownerName?: string
  ): Promise<ForumMaintenanceState> {
    const resolvedOwner = await resolveOwnerName(ownerName);
    const payload: MaintenancePayload = {
      version: 1,
      type: 'forum-maintenance',
      updatedAt: Date.now(),
      maintenance: {
        enabled: input.enabled,
        message: input.message.trim() || defaultMaintenanceState().message,
      },
    };

    await requestQortal<unknown>({
      action: 'PUBLISH_QDN_RESOURCE',
      service: FORUM_SERVICE,
      name: resolvedOwner,
      identifier: MAINTENANCE_IDENTIFIER,
      title: 'Forum maintenance state',
      description: 'Forum maintenance mode toggle and message',
      tags: ['forum', 'maintenance', 'qdb'],
      data64: encodeBase64Json(payload),
    });

    await verifyPublication(resolvedOwner, MAINTENANCE_IDENTIFIER);

    const state: ForumMaintenanceState = {
      enabled: payload.maintenance.enabled,
      message: payload.maintenance.message,
      updatedAt: payload.updatedAt,
    };

    maintenanceCache = {
      value: state,
      updatedAt: payload.updatedAt,
      inflight: null,
    };

    return state;
  },
};
