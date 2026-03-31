import type { Post, SubTopic, Topic } from "../../types";
import { generateForumEntityId } from "../forum/forumId";
import { ensureQdnResourceReady } from "./qdnReadiness";
import { requestQortal } from "../qortal/qortalClient";
import { getUserAccount } from "../qortal/walletService";

const FORUM_SERVICE = import.meta.env.VITE_QORTAL_QDN_SERVICE ?? "DOCUMENT";
const FORUM_IMAGE_SERVICE = import.meta.env.VITE_QORTAL_QDN_IMAGE_SERVICE ?? "IMAGE";
const FORUM_NAMESPACE =
  import.meta.env.VITE_QORTAL_QDN_IDENTIFIER?.trim() || "qdb";
const FORUM_IDENTIFIER_PREFIX = `${FORUM_NAMESPACE}-`;
const TOPIC_PREFIX = `${FORUM_IDENTIFIER_PREFIX}topic-`;
const SUBTOPIC_PREFIX = `${FORUM_IDENTIFIER_PREFIX}sub-`;
const POST_PREFIX = `${FORUM_IDENTIFIER_PREFIX}post-`;
const IMAGE_PREFIX = `${FORUM_IDENTIFIER_PREFIX}img-`;
const VERIFY_RETRIES = 5;
const VERIFY_DELAY_MS = 1500;
const IMAGE_PUBLISH_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_SAFE_QDN_IDENTIFIER_LENGTH = 64;
const imageUrlCache = new Map<string, string>();

interface SearchQdnResourceResult {
  name: string;
  identifier: string;
}

export type ForumPostImageReference = {
  service: string;
  name: string;
  identifier: string;
  filename: string;
};

type EntityStatus = "active" | "deleted";

type TopicPayload = {
  version: 1;
  type: "topic";
  status: EntityStatus;
  updatedAt: number;
  topic: Topic;
};

type SubTopicPayload = {
  version: 1;
  type: "subtopic";
  status: EntityStatus;
  updatedAt: number;
  subTopic: SubTopic;
};

type PostPayload = {
  version: 1;
  type: "post";
  status: EntityStatus;
  updatedAt: number;
  post: Post;
};

const encodeBase64Json = (value: unknown): string => {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  let binary = "";

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
  if (typeof raw !== "string") {
    return raw;
  }

  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return decodeBase64Json(trimmed);
  }
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

const toTopicIdentifier = (topicId: string) => `${TOPIC_PREFIX}${topicId}`;
const toSubTopicIdentifier = (subTopicId: string) => `${SUBTOPIC_PREFIX}${subTopicId}`;
const toPostSearchPrefix = () => POST_PREFIX;
const toPostIdentifier = (post: Post) => `${POST_PREFIX}${post.id}`;
const toImageIdentifier = (imageId: string) => `${IMAGE_PREFIX}${imageId}`;

const resolveOwnerName = async (providedName?: string): Promise<string> => {
  if (providedName?.trim()) {
    return providedName.trim();
  }

  const account = await getUserAccount();

  if (account.name?.trim()) {
    return account.name.trim();
  }

  throw new Error("Authenticated account has no Qortal name.");
};

const verifyPublication = async (
  ownerName: string,
  identifier: string,
  expectedType: TopicPayload["type"] | SubTopicPayload["type"] | PostPayload["type"]
) => {
  for (let attempt = 1; attempt <= VERIFY_RETRIES; attempt += 1) {
    try {
      const raw = await requestQortal<unknown>({
        action: "FETCH_QDN_RESOURCE",
        service: FORUM_SERVICE,
        name: ownerName,
        identifier,
      });

      const parsed = parseJsonLike(raw) as { type?: string } | null;
      if (parsed && parsed.type === expectedType) {
        return;
      }
    } catch {
      // Keep retrying.
    }

    if (attempt < VERIFY_RETRIES) {
      await sleep(VERIFY_DELAY_MS);
    }
  }

  throw new Error("Publish was submitted but resource could not be verified yet.");
};

const searchByPrefix = async (prefix: string): Promise<SearchQdnResourceResult[]> => {
  const search = await requestQortal<SearchQdnResourceResult[]>({
    action: "SEARCH_QDN_RESOURCES",
    service: FORUM_SERVICE,
    identifier: prefix,
    prefix: true,
    mode: "ALL",
    reverse: true,
    limit: 1000,
    offset: 0,
  });

  return Array.isArray(search) ? search : [];
};

const fetchResource = async (name: string, identifier: string): Promise<unknown> => {
  try {
    await ensureQdnResourceReady(FORUM_SERVICE, name, identifier);
  } catch {
    // Continue with direct fetch when readiness polling fails.
  }

  const raw = await requestQortal<unknown>({
    action: "FETCH_QDN_RESOURCE",
    service: FORUM_SERVICE,
    name,
    identifier,
  });

  return parseJsonLike(raw);
};

const mapLatestPayloads = <TPayload extends { updatedAt: number }, TKey>(
  payloads: Array<TPayload | null>,
  keyOf: (payload: TPayload) => TKey
) => {
  const nextMap = new Map<TKey, TPayload>();

  payloads.filter(Boolean).forEach((payload) => {
    if (!payload) return;
    const key = keyOf(payload);
    const current = nextMap.get(key);
    if (!current || payload.updatedAt > current.updatedAt) {
      nextMap.set(key, payload);
    }
  });

  return nextMap;
};

const fetchTopicPayloads = async () => {
  const topicResults = await searchByPrefix(TOPIC_PREFIX);
  return Promise.all(
    topicResults.map(async (item) => {
      try {
        const raw = await fetchResource(item.name, item.identifier);
        return parseTopicPayload(raw);
      } catch {
        return null;
      }
    })
  );
};

const fetchSubTopicPayloads = async () => {
  const subTopicResults = await searchByPrefix(SUBTOPIC_PREFIX);
  return Promise.all(
    subTopicResults.map(async (item) => {
      try {
        const raw = await fetchResource(item.name, item.identifier);
        return parseSubTopicPayload(raw);
      } catch {
        return null;
      }
    })
  );
};

const fetchPostPayloadsByPrefix = async (prefix: string) => {
  const postResults = await searchByPrefix(prefix);
  return Promise.all(
    postResults.map(async (item) => {
      try {
        const raw = await fetchResource(item.name, item.identifier);
        return parsePostPayload(raw);
      } catch {
        return null;
      }
    })
  );
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const sanitizeAddressList = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const next: string[] = [];

  value.forEach((entry) => {
    if (typeof entry !== "string") {
      return;
    }

    const normalized = entry.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    next.push(normalized);
  });

  return next;
};

const sanitizeTopic = (value: unknown): Topic | null => {
  if (!isObject(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    typeof value.createdByUserId !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    description: value.description,
    createdByUserId: value.createdByUserId,
    createdAt: value.createdAt,
    status: value.status === "locked" ? "locked" : "open",
    visibility: value.visibility === "hidden" ? "hidden" : "visible",
    subTopicAccess:
      value.subTopicAccess === "moderators" ||
      value.subTopicAccess === "admins" ||
      value.subTopicAccess === "custom"
        ? value.subTopicAccess
        : "everyone",
    allowedAddresses: sanitizeAddressList(value.allowedAddresses),
  };
};

const sanitizeSubTopic = (value: unknown): SubTopic | null => {
  if (!isObject(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.topicId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    typeof value.authorUserId !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.lastPostAt !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    topicId: value.topicId,
    title: value.title,
    description: value.description,
    authorUserId: value.authorUserId,
    createdAt: value.createdAt,
    lastPostAt: value.lastPostAt,
    status: value.status === "locked" ? "locked" : "open",
    visibility: value.visibility === "hidden" ? "hidden" : "visible",
  };
};

const isPost = (value: unknown): value is Post => {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.subTopicId === "string" &&
    typeof value.authorUserId === "string" &&
    typeof value.content === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.likes === "number"
  );
};

const parseTopicPayload = (raw: unknown): TopicPayload | null => {
  if (!isObject(raw) || raw.type !== "topic") {
    return null;
  }

  const topic = sanitizeTopic(raw.topic);
  if (!topic) {
    return null;
  }

  const status = raw.status === "deleted" ? "deleted" : "active";
  return {
    version: 1,
    type: "topic",
    status,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    topic,
  };
};

const parseSubTopicPayload = (raw: unknown): SubTopicPayload | null => {
  if (!isObject(raw) || raw.type !== "subtopic") {
    return null;
  }

  const subTopic = sanitizeSubTopic(raw.subTopic);
  if (!subTopic) {
    return null;
  }

  const status = raw.status === "deleted" ? "deleted" : "active";
  return {
    version: 1,
    type: "subtopic",
    status,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    subTopic,
  };
};

const parsePostPayload = (raw: unknown): PostPayload | null => {
  if (!isObject(raw) || raw.type !== "post" || !isPost(raw.post)) {
    return null;
  }

  const status = raw.status === "deleted" ? "deleted" : "active";
  return {
    version: 1,
    type: "post",
    status,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    post: raw.post,
  };
};

const publishPayload = async (
  ownerName: string,
  identifier: string,
  payload: TopicPayload | SubTopicPayload | PostPayload,
  title: string,
  description: string,
  tags: string[]
) => {
  assertIdentifierLength(identifier);

  await requestQortal<unknown>({
    action: "PUBLISH_QDN_RESOURCE",
    service: FORUM_SERVICE,
    name: ownerName,
    identifier,
    title,
    description,
    tags,
    data64: encodeBase64Json(payload),
  });
};

export const forumQdnService = {
  async loadForumStructure() {
    const [topicPayloads, subTopicPayloads] = await Promise.all([
      fetchTopicPayloads(),
      fetchSubTopicPayloads(),
    ]);

    const topicMap = mapLatestPayloads(topicPayloads, (payload) => payload.topic.id);
    const subTopicMap = mapLatestPayloads(
      subTopicPayloads,
      (payload) => payload.subTopic.id
    );

    const topics = [...topicMap.values()]
      .filter((payload) => payload.status !== "deleted")
      .map((payload) => payload.topic);

    const subTopics = [...subTopicMap.values()]
      .filter((payload) => payload.status !== "deleted")
      .map((payload) => payload.subTopic)
      .filter((subTopic) => topics.some((topic) => topic.id === subTopic.topicId));

    return { topics, subTopics };
  },

  async loadPostsBySubTopic(subTopicId: string) {
    const postPayloads = await fetchPostPayloadsByPrefix(toPostSearchPrefix());

    const postMap = mapLatestPayloads(postPayloads, (payload) => payload.post.id);
    const posts = [...postMap.values()]
      .filter((payload) => payload.status !== "deleted")
      .map((payload) => payload.post)
      .filter((post) => post.subTopicId === subTopicId);

    return posts;
  },

  async publishTopic(topic: Topic, ownerName?: string) {
    const resolvedOwner = await resolveOwnerName(ownerName);
    const identifier = toTopicIdentifier(topic.id);
    const payload: TopicPayload = {
      version: 1,
      type: "topic",
      status: "active",
      updatedAt: Date.now(),
      topic,
    };

    await publishPayload(
      resolvedOwner,
      identifier,
      payload,
      topic.title,
      topic.description,
      ["forum", "topic", "qforum"]
    );

    await verifyPublication(resolvedOwner, identifier, "topic");
  },

  async publishSubTopic(subTopic: SubTopic, ownerName?: string) {
    const resolvedOwner = await resolveOwnerName(ownerName);
    const identifier = toSubTopicIdentifier(subTopic.id);
    const payload: SubTopicPayload = {
      version: 1,
      type: "subtopic",
      status: "active",
      updatedAt: Date.now(),
      subTopic,
    };

    await publishPayload(
      resolvedOwner,
      identifier,
      payload,
      subTopic.title,
      subTopic.description,
      ["forum", "subtopic", "qforum"]
    );

    await verifyPublication(resolvedOwner, identifier, "subtopic");
  },

  async publishPost(post: Post, ownerName?: string) {
    const resolvedOwner = await resolveOwnerName(ownerName);
    const identifier = toPostIdentifier(post);
    const payload: PostPayload = {
      version: 1,
      type: "post",
      status: "active",
      updatedAt: Date.now(),
      post,
    };

    await publishPayload(
      resolvedOwner,
      identifier,
      payload,
      `Forum post ${post.id}`,
      "Qortal discussion board post",
      ["forum", "post", "qforum"]
    );

    await verifyPublication(resolvedOwner, identifier, "post");
  },

  async deletePost(post: Post, ownerName?: string) {
    const resolvedOwner = await resolveOwnerName(ownerName);
    const identifier = toPostIdentifier(post);
    const payload: PostPayload = {
      version: 1,
      type: "post",
      status: "deleted",
      updatedAt: Date.now(),
      post,
    };

    await publishPayload(
      resolvedOwner,
      identifier,
      payload,
      `Delete forum post ${post.id}`,
      "Qortal discussion board delete marker",
      ["forum", "post", "qforum", "delete"]
    );

    await verifyPublication(resolvedOwner, identifier, "post");
  },

  async publishPostImage(file: File, ownerName?: string): Promise<ForumPostImageReference> {
    const resolvedOwner = await resolveOwnerName(ownerName);
    const imageId = generateForumEntityId("image", resolvedOwner);
    const identifier = toImageIdentifier(imageId);
    assertIdentifierLength(identifier);

    await requestQortal<unknown>(
      {
        action: "PUBLISH_QDN_RESOURCE",
        service: FORUM_IMAGE_SERVICE,
        name: resolvedOwner,
        identifier,
        filename: file.name,
        file,
      },
      {
        timeoutMs: IMAGE_PUBLISH_TIMEOUT_MS,
      }
    );

    return {
      service: FORUM_IMAGE_SERVICE,
      name: resolvedOwner,
      identifier,
      filename: file.name,
    };
  },

  async getPostImageResourceUrl(reference: {
    service: string;
    name: string;
    identifier: string;
  }): Promise<string> {
    const cacheKey = `${reference.service}:${reference.name}:${reference.identifier}`;
    const cached = imageUrlCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      await ensureQdnResourceReady(
        reference.service,
        reference.name,
        reference.identifier
      );
    } catch {
      // Continue with direct URL fetch when readiness polling fails.
    }

    const resourceUrl = await requestQortal<string>({
      action: "GET_QDN_RESOURCE_URL",
      service: reference.service,
      name: reference.name,
      identifier: reference.identifier,
    });
    imageUrlCache.set(cacheKey, resourceUrl);
    return resourceUrl;
  },
};
