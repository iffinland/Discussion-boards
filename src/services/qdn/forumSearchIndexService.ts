import type { Post, SubTopic, Topic } from '../../types';
import { fetchWithQdnReadyFallback, mapWithConcurrency } from './qdnReadiness';
import { requestQortal } from '../qortal/qortalClient';
import { getUserAccount } from '../qortal/walletService';

const FORUM_SERVICE = import.meta.env.VITE_QORTAL_QDN_SERVICE ?? 'DOCUMENT';
const FORUM_NAMESPACE =
  import.meta.env.VITE_QORTAL_QDN_IDENTIFIER?.trim() || 'qdbm';
const TOPIC_DIRECTORY_IDENTIFIER = `${FORUM_NAMESPACE}-index-topics`;
const THREAD_INDEX_PREFIX = `${FORUM_NAMESPACE}-index-thread-`;
const VERIFY_RETRIES = 5;
const VERIFY_DELAY_MS = 1500;
const MAX_SAFE_QDN_IDENTIFIER_LENGTH = 64;

type SearchQdnResourceResult = {
  name: string;
  identifier: string;
};

export type TopicDirectorySnapshot = {
  updatedAt: number;
  topics: Array<{
    topicId: string;
    title: string;
    description: string;
    sortOrder: number;
    status: Topic['status'];
    visibility: Topic['visibility'];
    subTopicAccess: Topic['subTopicAccess'];
    allowedAddresses: string[];
  }>;
  subTopics: Array<{
    subTopicId: string;
    topicId: string;
    title: string;
    description: string;
    isPinned: boolean;
    pinnedAt: string | null;
    access: SubTopic['access'];
    allowedAddresses: string[];
    status: SubTopic['status'];
    visibility: SubTopic['visibility'];
    authorUserId: string;
    lastPostAt: string;
  }>;
};

export type ThreadSearchSnapshot = {
  subTopicId: string;
  updatedAt: number;
  posts: Array<{
    postId: string;
    authorUserId: string;
    parentPostId: string | null;
    content: string;
    createdAt: string;
  }>;
};

type TopicDirectoryPayload = {
  version: 1;
  type: 'topic-directory-index';
  updatedAt: number;
  snapshot: TopicDirectorySnapshot;
};

type ThreadIndexPayload = {
  version: 1;
  type: 'thread-search-index';
  updatedAt: number;
  snapshot: ThreadSearchSnapshot;
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

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const sleep = async (durationMs: number) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
};

const assertIdentifierLength = (identifier: string) => {
  if (identifier.length > MAX_SAFE_QDN_IDENTIFIER_LENGTH) {
    throw new Error(
      `Generated QDN identifier is too long (${identifier.length}). Maximum supported length is ${MAX_SAFE_QDN_IDENTIFIER_LENGTH}.`
    );
  }
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

const searchByPrefix = async (
  prefix: string
): Promise<SearchQdnResourceResult[]> => {
  const search = await requestQortal<SearchQdnResourceResult[]>({
    action: 'SEARCH_QDN_RESOURCES',
    service: FORUM_SERVICE,
    identifier: prefix,
    prefix: true,
    mode: 'ALL',
    reverse: true,
    limit: 1000,
    offset: 0,
  });

  return Array.isArray(search) ? search : [];
};

const fetchResource = async (
  name: string,
  identifier: string
): Promise<unknown> => {
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

const parseTopicDirectoryPayload = (
  raw: unknown
): TopicDirectoryPayload | null => {
  if (
    !isObject(raw) ||
    raw.type !== 'topic-directory-index' ||
    !isObject(raw.snapshot)
  ) {
    return null;
  }

  const topics = Array.isArray(raw.snapshot.topics) ? raw.snapshot.topics : [];
  const subTopics = Array.isArray(raw.snapshot.subTopics)
    ? raw.snapshot.subTopics
    : [];

  return {
    version: 1,
    type: 'topic-directory-index',
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    snapshot: {
      updatedAt:
        typeof raw.snapshot.updatedAt === 'number'
          ? raw.snapshot.updatedAt
          : Date.now(),
      topics: topics
        .filter((item) => isObject(item))
        .map((item) => ({
          topicId: typeof item.topicId === 'string' ? item.topicId : '',
          title: typeof item.title === 'string' ? item.title : '',
          description:
            typeof item.description === 'string' ? item.description : '',
          sortOrder:
            typeof item.sortOrder === 'number' &&
            Number.isFinite(item.sortOrder)
              ? item.sortOrder
              : Number.MAX_SAFE_INTEGER,
          status: (item.status === 'locked'
            ? 'locked'
            : 'open') as Topic['status'],
          visibility: (item.visibility === 'hidden'
            ? 'hidden'
            : 'visible') as Topic['visibility'],
          subTopicAccess: (item.subTopicAccess === 'moderators' ||
          item.subTopicAccess === 'admins' ||
          item.subTopicAccess === 'custom'
            ? item.subTopicAccess
            : 'everyone') as Topic['subTopicAccess'],
          allowedAddresses: Array.isArray(item.allowedAddresses)
            ? item.allowedAddresses.filter(
                (address): address is string =>
                  typeof address === 'string' && Boolean(address.trim())
              )
            : [],
        }))
        .filter((item) => item.topicId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      subTopics: subTopics
        .filter((item) => isObject(item))
        .map((item) => ({
          subTopicId:
            typeof item.subTopicId === 'string' ? item.subTopicId : '',
          topicId: typeof item.topicId === 'string' ? item.topicId : '',
          title: typeof item.title === 'string' ? item.title : '',
          description:
            typeof item.description === 'string' ? item.description : '',
          isPinned: item.isPinned === true,
          pinnedAt:
            typeof item.pinnedAt === 'string' && item.pinnedAt.trim()
              ? item.pinnedAt
              : null,
          access: (item.access === 'moderators' ||
          item.access === 'admins' ||
          item.access === 'custom'
            ? item.access
            : 'everyone') as SubTopic['access'],
          allowedAddresses: Array.isArray(item.allowedAddresses)
            ? item.allowedAddresses.filter(
                (address): address is string =>
                  typeof address === 'string' && Boolean(address.trim())
              )
            : [],
          status: (item.status === 'locked'
            ? 'locked'
            : 'open') as SubTopic['status'],
          visibility: (item.visibility === 'hidden'
            ? 'hidden'
            : 'visible') as SubTopic['visibility'],
          authorUserId:
            typeof item.authorUserId === 'string' ? item.authorUserId : '',
          lastPostAt:
            typeof item.lastPostAt === 'string' ? item.lastPostAt : '',
        }))
        .filter((item) => item.subTopicId && item.topicId),
    },
  };
};

const parseThreadIndexPayload = (raw: unknown): ThreadIndexPayload | null => {
  if (
    !isObject(raw) ||
    raw.type !== 'thread-search-index' ||
    !isObject(raw.snapshot)
  ) {
    return null;
  }

  const posts = Array.isArray(raw.snapshot.posts) ? raw.snapshot.posts : [];

  if (
    typeof raw.snapshot.subTopicId !== 'string' ||
    !raw.snapshot.subTopicId.trim()
  ) {
    return null;
  }

  return {
    version: 1,
    type: 'thread-search-index',
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    snapshot: {
      subTopicId: raw.snapshot.subTopicId,
      updatedAt:
        typeof raw.snapshot.updatedAt === 'number'
          ? raw.snapshot.updatedAt
          : Date.now(),
      posts: posts
        .filter((item) => isObject(item))
        .map((item) => ({
          postId: typeof item.postId === 'string' ? item.postId : '',
          authorUserId:
            typeof item.authorUserId === 'string' ? item.authorUserId : '',
          parentPostId:
            typeof item.parentPostId === 'string' ? item.parentPostId : null,
          content: typeof item.content === 'string' ? item.content : '',
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
        }))
        .filter((item) => item.postId),
    },
  };
};

const publishPayload = async (
  ownerName: string,
  identifier: string,
  payload: TopicDirectoryPayload | ThreadIndexPayload,
  title: string,
  description: string,
  tags: string[]
) => {
  assertIdentifierLength(identifier);

  await requestQortal<unknown>({
    action: 'PUBLISH_QDN_RESOURCE',
    service: FORUM_SERVICE,
    name: ownerName,
    identifier,
    title,
    description,
    tags,
    data64: encodeBase64Json(payload),
  });
};

const verifyPublication = async (
  ownerName: string,
  identifier: string,
  type: TopicDirectoryPayload['type'] | ThreadIndexPayload['type']
) => {
  for (let attempt = 1; attempt <= VERIFY_RETRIES; attempt += 1) {
    try {
      const raw = await requestQortal<unknown>({
        action: 'FETCH_QDN_RESOURCE',
        service: FORUM_SERVICE,
        name: ownerName,
        identifier,
      });
      const parsed = parseJsonLike(raw) as { type?: string } | null;
      if (parsed?.type === type) {
        return;
      }
    } catch {
      // Retry until exhausted.
    }

    if (attempt < VERIFY_RETRIES) {
      await sleep(VERIFY_DELAY_MS);
    }
  }

  throw new Error('Search index was submitted but could not be verified yet.');
};

const pickLatest = <TPayload extends { updatedAt: number }>(
  payloads: Array<TPayload | null>
) => {
  return (
    payloads
      .filter((item): item is TPayload => item !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
  );
};

export const forumSearchIndexService = {
  async loadTopicDirectoryIndex(): Promise<TopicDirectorySnapshot | null> {
    const resources = await searchByPrefix(TOPIC_DIRECTORY_IDENTIFIER);
    const payloads = await mapWithConcurrency(resources, async (item) => {
      try {
        const raw = await fetchResource(item.name, item.identifier);
        return parseTopicDirectoryPayload(raw);
      } catch {
        return null;
      }
    });

    return pickLatest(payloads)?.snapshot ?? null;
  },

  async publishTopicDirectoryIndex(
    topics: Topic[],
    subTopics: SubTopic[],
    ownerName?: string
  ) {
    const resolvedOwner = await resolveOwnerName(ownerName);
    const updatedAt = Date.now();
    const payload: TopicDirectoryPayload = {
      version: 1,
      type: 'topic-directory-index',
      updatedAt,
      snapshot: {
        updatedAt,
        topics: topics.map((topic) => ({
          topicId: topic.id,
          title: topic.title,
          description: topic.description,
          sortOrder: topic.sortOrder,
          status: topic.status,
          visibility: topic.visibility,
          subTopicAccess: topic.subTopicAccess,
          allowedAddresses: topic.allowedAddresses,
        })),
        subTopics: subTopics.map((subTopic) => ({
          subTopicId: subTopic.id,
          topicId: subTopic.topicId,
          title: subTopic.title,
          description: subTopic.description,
          isPinned: subTopic.isPinned,
          pinnedAt: subTopic.pinnedAt,
          access: subTopic.access,
          allowedAddresses: subTopic.allowedAddresses,
          status: subTopic.status,
          visibility: subTopic.visibility,
          authorUserId: subTopic.authorUserId,
          lastPostAt: subTopic.lastPostAt,
        })),
      },
    };

    await publishPayload(
      resolvedOwner,
      TOPIC_DIRECTORY_IDENTIFIER,
      payload,
      'Forum topic directory index',
      'Persistent forum search index for topics and sub-topics',
      ['forum', 'search', 'index', 'qdb']
    );
    await verifyPublication(
      resolvedOwner,
      TOPIC_DIRECTORY_IDENTIFIER,
      'topic-directory-index'
    );
    return payload.snapshot;
  },

  async loadThreadIndex(
    subTopicId: string
  ): Promise<ThreadSearchSnapshot | null> {
    const identifier = `${THREAD_INDEX_PREFIX}${subTopicId}`;
    const resources = await searchByPrefix(identifier);
    const payloads = await mapWithConcurrency(resources, async (item) => {
      try {
        const raw = await fetchResource(item.name, item.identifier);
        return parseThreadIndexPayload(raw);
      } catch {
        return null;
      }
    });

    return (
      pickLatest(
        payloads.filter((item) => item?.snapshot.subTopicId === subTopicId)
      )?.snapshot ?? null
    );
  },

  async publishThreadIndex(
    subTopicId: string,
    posts: Post[],
    ownerName?: string
  ) {
    const resolvedOwner = await resolveOwnerName(ownerName);
    const updatedAt = Date.now();
    const identifier = `${THREAD_INDEX_PREFIX}${subTopicId}`;
    const payload: ThreadIndexPayload = {
      version: 1,
      type: 'thread-search-index',
      updatedAt,
      snapshot: {
        subTopicId,
        updatedAt,
        posts: posts
          .filter((post) => post.subTopicId === subTopicId)
          .map((post) => ({
            postId: post.id,
            authorUserId: post.authorUserId,
            parentPostId: post.parentPostId,
            content: post.content,
            createdAt: post.createdAt,
          })),
      },
    };

    await publishPayload(
      resolvedOwner,
      identifier,
      payload,
      `Forum thread index ${subTopicId}`,
      'Persistent forum search index for a thread',
      ['forum', 'search', 'thread', 'index', 'qdb']
    );
    await verifyPublication(resolvedOwner, identifier, 'thread-search-index');
    return payload.snapshot;
  },
};
