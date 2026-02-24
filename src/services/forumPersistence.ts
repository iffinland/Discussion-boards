import type { Post, SubTopic, Topic } from "../types";

export type ForumSnapshot = {
  topics: Topic[];
  subTopics: SubTopic[];
  posts: Post[];
  updatedAt: string;
};

const STORAGE_KEY = "discussion-boards-forum-snapshot";

type QortalIdentity = {
  address?: string;
  name?: string;
};

const readLocalSnapshot = (): ForumSnapshot | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ForumSnapshot;
  } catch {
    return null;
  }
};

const writeLocalSnapshot = (snapshot: ForumSnapshot) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
};

const encodeBase64Utf8 = (value: string) => {
  if (typeof window === "undefined") {
    return "";
  }

  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
};

const getQortalRequest = () => {
  if (typeof window === "undefined") {
    return null;
  }

  let maybeRequest: unknown = null;
  try {
    maybeRequest = (
      window as Window & {
        parent?: { qortalRequest?: unknown };
        qortalRequest?: unknown;
      }
    ).parent?.qortalRequest;
  } catch {
    maybeRequest = null;
  }

  if (typeof maybeRequest === "function") {
    return maybeRequest;
  }

  const localRequest = (window as Window & { qortalRequest?: unknown }).qortalRequest;
  return typeof localRequest === "function" ? localRequest : null;
};

const getNodeBaseUrl = () => {
  const envUrl = import.meta.env.VITE_QORTAL_NODE_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, "");
  }

  if (typeof window === "undefined") {
    return "";
  }

  return window.location.origin;
};

const resolvePublishName = (identityName?: string) => {
  const configured = import.meta.env.VITE_QORTAL_QDN_NAME?.trim();
  return configured || identityName || "";
};

const fetchFirstNameByAddress = async (address: string): Promise<string | null> => {
  const baseUrl = getNodeBaseUrl();
  if (!baseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/names/address/${address}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return null;
    }

    const names = (await response.json()) as Array<{ name?: string }>;
    return names[0]?.name?.trim() || null;
  } catch {
    return null;
  }
};

const getAuthenticatedIdentity = async (): Promise<QortalIdentity | null> => {
  const qortalRequest = getQortalRequest();
  if (!qortalRequest) {
    return null;
  }

  const accountActions = ["GET_USER_ACCOUNT", "GET_ACCOUNT"];
  let address = "";
  let name = "";

  for (const action of accountActions) {
    try {
      const account = (await qortalRequest({ action })) as {
        address?: string;
        name?: string;
      };
      if (account?.address && !address) {
        address = account.address;
      }
      if (account?.name && !name) {
        name = account.name;
      }
    } catch {
      // Try next action variant.
    }
  }

  if (!name && address) {
    const resolvedName = await fetchFirstNameByAddress(address);
    if (resolvedName) {
      name = resolvedName;
    }
  }

  if (!address && !name) {
    return null;
  }

  return { address, name };
};

const publishSnapshotToQortal = async (snapshot: ForumSnapshot, name: string) => {
  const qortalRequest = getQortalRequest();
  if (!qortalRequest) {
    return { ok: false as const, error: "qortalRequest is not available." };
  }

  const service = import.meta.env.VITE_QORTAL_QDN_SERVICE ?? "DOCUMENT";
  const identifier =
    import.meta.env.VITE_QORTAL_QDN_IDENTIFIER ?? "discussion-boards-beta";
  const filename = import.meta.env.VITE_QORTAL_QDN_FILENAME ?? "forum-state.json";

  try {
    await qortalRequest({
      action: "PUBLISH_QDN_RESOURCE",
      name,
      service,
      identifier,
      filename,
      title: "Discussion Boards Snapshot",
      description: "Forum state snapshot for beta testing",
      data64: encodeBase64Utf8(JSON.stringify(snapshot)),
    });

    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Qortal publish failed.",
    };
  }
};

const fetchSnapshotFromQdn = async (name: string): Promise<ForumSnapshot | null> => {
  const baseUrl = getNodeBaseUrl();
  if (!baseUrl) {
    return null;
  }

  const service = import.meta.env.VITE_QORTAL_QDN_SERVICE ?? "DOCUMENT";
  const identifier =
    import.meta.env.VITE_QORTAL_QDN_IDENTIFIER ?? "discussion-boards-beta";
  const filename = import.meta.env.VITE_QORTAL_QDN_FILENAME ?? "forum-state.json";
  const url = `${baseUrl}/arbitrary/${service}/${name}/${identifier}/${filename}`;

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ForumSnapshot;

    if (!Array.isArray(data.topics) || !Array.isArray(data.subTopics) || !Array.isArray(data.posts)) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
};

const fetchSnapshotFromConfiguredUrl = async (): Promise<ForumSnapshot | null> => {
  const url = import.meta.env.VITE_QORTAL_SNAPSHOT_URL;
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as ForumSnapshot;
    if (!Array.isArray(data.topics) || !Array.isArray(data.subTopics) || !Array.isArray(data.posts)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

export const forumPersistence = {
  readLocalSnapshot,
  writeLocalSnapshot,
  getAuthenticatedIdentity,
  resolvePublishName,
  publishSnapshotToQortal,
  fetchSnapshotFromQdn,
  fetchSnapshotFromConfiguredUrl,
};
