import type { Post, SubTopic, Topic } from "../../types";
import { requestQortal } from "../qortal/qortalClient";
import { getUserAccount } from "../qortal/walletService";

const FORUM_SERVICE = import.meta.env.VITE_QORTAL_QDN_SERVICE ?? "DOCUMENT";
const FORUM_IDENTIFIER_PREFIX = "qforum-2026-";
const TOPIC_PREFIX = `${FORUM_IDENTIFIER_PREFIX}topic-`;
const SUBTOPIC_PREFIX = `${FORUM_IDENTIFIER_PREFIX}subtopic-`;
const POST_PREFIX = `${FORUM_IDENTIFIER_PREFIX}post-`;
const VERIFY_RETRIES = 5;
const VERIFY_DELAY_MS = 1500;

interface SearchQdnResourceResult {
  name: string;
  identifier: string;
}

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

const toTopicIdentifier = (topicId: string) => `${TOPIC_PREFIX}${topicId}`;
const toSubTopicIdentifier = (subTopicId: string) => `${SUBTOPIC_PREFIX}${subTopicId}`;
const toPostIdentifier = (postId: string) => `${POST_PREFIX}${postId}`;

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
  const raw = await requestQortal<unknown>({
    action: "FETCH_QDN_RESOURCE",
    service: FORUM_SERVICE,
    name,
    identifier,
  });

  return parseJsonLike(raw);
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isTopic = (value: unknown): value is Topic => {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.createdByUserId === "string" &&
    typeof value.createdAt === "string"
  );
};

const isSubTopic = (value: unknown): value is SubTopic => {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.topicId === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.authorUserId === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.lastPostAt === "string"
  );
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
  if (!isObject(raw) || raw.type !== "topic" || !isTopic(raw.topic)) {
    return null;
  }

  const status = raw.status === "deleted" ? "deleted" : "active";
  return {
    version: 1,
    type: "topic",
    status,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    topic: raw.topic,
  };
};

const parseSubTopicPayload = (raw: unknown): SubTopicPayload | null => {
  if (!isObject(raw) || raw.type !== "subtopic" || !isSubTopic(raw.subTopic)) {
    return null;
  }

  const status = raw.status === "deleted" ? "deleted" : "active";
  return {
    version: 1,
    type: "subtopic",
    status,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    subTopic: raw.subTopic,
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
  await requestQortal<unknown>({
    action: "PUBLISH_QDN_RESOURCE",
    service: FORUM_SERVICE,
    name: ownerName,
    identifier,
    title,
    description,
    tags,
    base64: encodeBase64Json(payload),
  });
};

export const forumQdnService = {
  async loadForumData() {
    const [topicResults, subTopicResults, postResults] = await Promise.all([
      searchByPrefix(TOPIC_PREFIX),
      searchByPrefix(SUBTOPIC_PREFIX),
      searchByPrefix(POST_PREFIX),
    ]);

    const topicPayloads = await Promise.all(
      topicResults.map(async (item) => {
        try {
          const raw = await fetchResource(item.name, item.identifier);
          return parseTopicPayload(raw);
        } catch {
          return null;
        }
      })
    );

    const subTopicPayloads = await Promise.all(
      subTopicResults.map(async (item) => {
        try {
          const raw = await fetchResource(item.name, item.identifier);
          return parseSubTopicPayload(raw);
        } catch {
          return null;
        }
      })
    );

    const postPayloads = await Promise.all(
      postResults.map(async (item) => {
        try {
          const raw = await fetchResource(item.name, item.identifier);
          return parsePostPayload(raw);
        } catch {
          return null;
        }
      })
    );

    const topicMap = new Map<string, TopicPayload>();
    topicPayloads.filter(Boolean).forEach((payload) => {
      if (!payload) return;
      const current = topicMap.get(payload.topic.id);
      if (!current || payload.updatedAt > current.updatedAt) {
        topicMap.set(payload.topic.id, payload);
      }
    });

    const subTopicMap = new Map<string, SubTopicPayload>();
    subTopicPayloads.filter(Boolean).forEach((payload) => {
      if (!payload) return;
      const current = subTopicMap.get(payload.subTopic.id);
      if (!current || payload.updatedAt > current.updatedAt) {
        subTopicMap.set(payload.subTopic.id, payload);
      }
    });

    const postMap = new Map<string, PostPayload>();
    postPayloads.filter(Boolean).forEach((payload) => {
      if (!payload) return;
      const current = postMap.get(payload.post.id);
      if (!current || payload.updatedAt > current.updatedAt) {
        postMap.set(payload.post.id, payload);
      }
    });

    const topics = [...topicMap.values()]
      .filter((payload) => payload.status !== "deleted")
      .map((payload) => payload.topic);

    const subTopics = [...subTopicMap.values()]
      .filter((payload) => payload.status !== "deleted")
      .map((payload) => payload.subTopic)
      .filter((subTopic) => topics.some((topic) => topic.id === subTopic.topicId));

    const posts = [...postMap.values()]
      .filter((payload) => payload.status !== "deleted")
      .map((payload) => payload.post)
      .filter((post) => subTopics.some((subTopic) => subTopic.id === post.subTopicId));

    return { topics, subTopics, posts };
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
    const identifier = toPostIdentifier(post.id);
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
    const identifier = toPostIdentifier(post.id);
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
};
