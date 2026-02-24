import type { Post, SubTopic, Topic } from "../types";
import { forumPersistence, type ForumSnapshot } from "./forumPersistence";

type SyncPayload = {
  topics: Topic[];
  subTopics: SubTopic[];
  posts: Post[];
};

const toSnapshot = (payload: SyncPayload): ForumSnapshot => ({
  topics: payload.topics,
  subTopics: payload.subTopics,
  posts: payload.posts,
  updatedAt: new Date().toISOString(),
});

export const forumSync = {
  async resolveIdentity() {
    return forumPersistence.getAuthenticatedIdentity();
  },

  loadLocalOrNull() {
    return forumPersistence.readLocalSnapshot();
  },

  async loadRemoteOrNull(identityName?: string) {
    const publishName = forumPersistence.resolvePublishName(identityName);
    if (publishName) {
      const qdnSnapshot = await forumPersistence.fetchSnapshotFromQdn(publishName);
      if (qdnSnapshot) {
        return qdnSnapshot;
      }
    }

    return forumPersistence.fetchSnapshotFromConfiguredUrl();
  },

  async persist(payload: SyncPayload, identityName?: string) {
    const snapshot = toSnapshot(payload);

    forumPersistence.writeLocalSnapshot(snapshot);

    const publishEnabled = import.meta.env.VITE_ENABLE_QORTAL_PUBLISH !== "false";
    if (!publishEnabled) {
      return { ok: true as const };
    }

    const publishName = forumPersistence.resolvePublishName(identityName);
    if (!publishName) {
      return {
        ok: false as const,
        error:
          "No QDN name available. Configure VITE_QORTAL_QDN_NAME or use an authenticated Qortal name.",
      };
    }

    return forumPersistence.publishSnapshotToQortal(snapshot, publishName);
  },
};
