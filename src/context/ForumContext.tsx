import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useForumCommands } from '../features/forum/hooks/useForumCommands';
import { useForumDataQuery } from '../features/forum/hooks/useForumDataQuery';
import type {
  ForumMutationResult,
  ForumUploadImageResult,
} from '../features/forum/types';
import type {
  ThreadSearchSnapshot,
  TopicDirectorySnapshot,
} from '../services/qdn/forumSearchIndexService';
import { threadPostCache } from '../services/forum/threadPostCache';
import { forumSearchIndexService } from '../services/qdn/forumSearchIndexService';
import { forumQdnService } from '../services/qdn/forumQdnService';
import type {
  ForumRoleRegistry,
  Post,
  SubTopic,
  Topic,
  TopicAccess,
  User,
} from '../types';

type ForumAuthMode = 'qortal';

type ForumContextValue = {
  users: User[];
  currentUser: User;
  authenticatedAddress: string | null;
  roleRegistry: ForumRoleRegistry;
  availableAuthNames: string[];
  activeAuthName: string | null;
  topicDirectoryIndex: TopicDirectorySnapshot | null;
  threadSearchIndexes: Record<string, ThreadSearchSnapshot>;
  topics: Topic[];
  subTopics: SubTopic[];
  posts: Post[];
  authMode: ForumAuthMode;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  canSwitchUser: boolean;
  authenticate: () => Promise<void>;
  setCurrentUser: (userId: string) => void;
  createTopic: (input: {
    title: string;
    description: string;
    status: Topic['status'];
    subTopicAccess: TopicAccess;
    allowedAddresses: string[];
  }) => Promise<ForumMutationResult>;
  reorderTopics: (orderedTopicIds: string[]) => Promise<ForumMutationResult>;
  createSubTopic: (input: {
    topicId: string;
    title: string;
    description: string;
    access: TopicAccess;
    allowedAddresses: string[];
  }) => Promise<ForumMutationResult>;
  updateTopicSettings: (input: {
    topicId: string;
    status: Topic['status'];
    visibility: Topic['visibility'];
    subTopicAccess: TopicAccess;
    allowedAddresses: string[];
  }) => Promise<ForumMutationResult>;
  updateSubTopicSettings: (input: {
    subTopicId: string;
    status: SubTopic['status'];
    visibility: SubTopic['visibility'];
    isPinned: boolean;
    access: TopicAccess;
    allowedAddresses: string[];
  }) => Promise<ForumMutationResult>;
  createPost: (input: {
    subTopicId: string;
    content: string;
  }) => Promise<ForumMutationResult>;
  upsertRoleAssignment: (input: {
    address: string;
    role: 'Admin' | 'Moderator';
  }) => Promise<ForumMutationResult>;
  removeRoleAssignment: (address: string) => Promise<ForumMutationResult>;
  uploadPostImage: (file: File) => Promise<ForumUploadImageResult>;
  updatePost: (input: {
    postId: string;
    content: string;
  }) => Promise<ForumMutationResult>;
  deletePost: (postId: string) => Promise<ForumMutationResult>;
  likePost: (postId: string) => void;
  isThreadPostsLoading: boolean;
  loadThreadPosts: (subTopicId: string) => Promise<ForumMutationResult>;
};

const ForumContext = createContext<ForumContextValue | null>(null);

const mergePostsByLatestCreatedAt = (
  currentPosts: Post[],
  nextPosts: Post[]
) => {
  const merged = new Map(currentPosts.map((post) => [post.id, post]));
  nextPosts.forEach((post) => {
    const existing = merged.get(post.id);
    if (!existing || post.createdAt >= existing.createdAt) {
      merged.set(post.id, post);
    }
  });
  return [...merged.values()];
};

const postsFromThreadIndex = (snapshot: ThreadSearchSnapshot): Post[] => {
  return snapshot.posts.map((post) => ({
    id: post.postId,
    subTopicId: snapshot.subTopicId,
    authorUserId: post.authorUserId,
    content: post.content,
    createdAt: post.createdAt,
    likes: 0,
  }));
};

export const ForumProvider = ({ children }: { children: ReactNode }) => {
  const {
    users,
    setUsers,
    topics,
    setTopics,
    subTopics,
    setSubTopics,
    posts,
    setPosts,
    currentUser,
    authenticatedAddress,
    roleRegistry,
    topicDirectoryIndex,
    threadSearchIndexes,
    setRoleRegistry,
    setTopicDirectoryIndex,
    setThreadSearchIndexes,
    availableAuthNames,
    activeAuthName,
    setActiveAuthName,
    isAuthReady,
    authMode,
    isAuthenticated,
    authenticate,
  } = useForumDataQuery();
  const {
    createTopic,
    reorderTopics,
    createSubTopic,
    updateTopicSettings,
    updateSubTopicSettings,
    upsertRoleAssignment,
    removeRoleAssignment,
    createPost,
    uploadPostImage,
    updatePost,
    deletePost,
    likePost,
  } = useForumCommands({
    currentUser,
    isAuthenticated,
    authenticatedAddress,
    roleRegistry,
    topics,
    subTopics,
    posts,
    setTopicDirectoryIndex,
    setThreadSearchIndexes,
    setRoleRegistry,
    setUsers,
    setTopics,
    setSubTopics,
    setPosts,
  });
  const loadedThreadsRef = useRef<Set<string>>(new Set());
  const isBackgroundSyncingRef = useRef(false);
  const [isThreadPostsLoading, setIsThreadPostsLoading] = useState(false);
  const threadLoadStateKey = `${authenticatedAddress ?? 'guest'}:${activeAuthName ?? currentUser.id}`;

  const setCurrentUser = useCallback(
    (name: string) => {
      if (!name) {
        return;
      }
      setActiveAuthName(name);
    },
    [setActiveAuthName]
  );

  const loadThreadPosts = useCallback(
    async (subTopicId: string): Promise<ForumMutationResult> => {
      const normalizedId = subTopicId.trim();
      if (!normalizedId) {
        return { ok: false, error: 'Sub-topic id is required.' };
      }

      if (loadedThreadsRef.current.has(normalizedId)) {
        return { ok: true };
      }

      const cached = threadPostCache.read(normalizedId);
      if (cached?.posts.length) {
        setPosts((current) =>
          mergePostsByLatestCreatedAt(current, cached.posts)
        );
        if (!cached.isStale) {
          loadedThreadsRef.current.add(normalizedId);
          return { ok: true };
        }
      }

      setIsThreadPostsLoading(true);
      try {
        let loadedPosts: Post[] | null = null;

        try {
          const loadedThreadIndex =
            await forumSearchIndexService.loadThreadIndex(normalizedId);
          if (loadedThreadIndex) {
            setThreadSearchIndexes((current) => ({
              ...current,
              [normalizedId]: loadedThreadIndex,
            }));
            loadedPosts = postsFromThreadIndex(loadedThreadIndex);
          }
        } catch {
          // Fall back to direct QDN post loading when the thread index is unavailable.
        }

        if (!loadedPosts) {
          loadedPosts = await forumQdnService.loadPostsBySubTopic(normalizedId);
        }

        setPosts((current) =>
          mergePostsByLatestCreatedAt(current, loadedPosts)
        );
        threadPostCache.write(normalizedId, loadedPosts);
        loadedThreadsRef.current.add(normalizedId);
        return { ok: true };
      } catch (error) {
        if (cached?.posts.length) {
          loadedThreadsRef.current.add(normalizedId);
          return { ok: true };
        }

        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to load thread posts.',
        };
      } finally {
        setIsThreadPostsLoading(false);
      }
    },
    [setPosts, setThreadSearchIndexes]
  );

  const value = useMemo<ForumContextValue>(
    () => ({
      users,
      currentUser,
      authenticatedAddress,
      roleRegistry,
      availableAuthNames,
      activeAuthName,
      topicDirectoryIndex,
      threadSearchIndexes,
      topics,
      subTopics,
      posts,
      authMode,
      isAuthenticated,
      isAuthReady,
      authenticate,
      canSwitchUser: availableAuthNames.length > 1,
      setCurrentUser,
      createTopic,
      reorderTopics,
      createSubTopic,
      updateTopicSettings,
      updateSubTopicSettings,
      upsertRoleAssignment,
      removeRoleAssignment,
      createPost,
      uploadPostImage,
      updatePost,
      deletePost,
      likePost,
      isThreadPostsLoading,
      loadThreadPosts,
    }),
    [
      users,
      currentUser,
      authenticatedAddress,
      roleRegistry,
      topicDirectoryIndex,
      threadSearchIndexes,
      availableAuthNames,
      activeAuthName,
      topics,
      subTopics,
      posts,
      authMode,
      isAuthenticated,
      isAuthReady,
      authenticate,
      setCurrentUser,
      createTopic,
      reorderTopics,
      createSubTopic,
      updateTopicSettings,
      updateSubTopicSettings,
      upsertRoleAssignment,
      removeRoleAssignment,
      createPost,
      uploadPostImage,
      updatePost,
      deletePost,
      likePost,
      isThreadPostsLoading,
      loadThreadPosts,
    ]
  );

  useEffect(() => {
    loadedThreadsRef.current.clear();
  }, [threadLoadStateKey]);

  useEffect(() => {
    if (subTopics.length === 0 && posts.length === 0) {
      loadedThreadsRef.current.clear();
    }
  }, [posts.length, subTopics.length]);

  useEffect(() => {
    if (!isAuthReady || !isAuthenticated || subTopics.length === 0) {
      return;
    }

    const runBackgroundSync = async () => {
      if (isBackgroundSyncingRef.current) {
        return;
      }

      isBackgroundSyncingRef.current = true;
      try {
        const recentFromCache = threadPostCache.listRecentSubTopicIds(2);
        const recentActiveSubTopics = [...subTopics]
          .sort(
            (a, b) =>
              new Date(b.lastPostAt).getTime() -
              new Date(a.lastPostAt).getTime()
          )
          .slice(0, 2)
          .map((subTopic) => subTopic.id);

        const targets = Array.from(
          new Set([...recentFromCache, ...recentActiveSubTopics])
        );

        for (const subTopicId of targets) {
          const cached = threadPostCache.read(subTopicId);
          if (
            loadedThreadsRef.current.has(subTopicId) ||
            (cached && !cached.isStale)
          ) {
            continue;
          }

          try {
            const threadIndex =
              await forumSearchIndexService.loadThreadIndex(subTopicId);
            const postsForThread = threadIndex
              ? postsFromThreadIndex(threadIndex)
              : await forumQdnService.loadPostsBySubTopic(subTopicId);
            threadPostCache.write(subTopicId, postsForThread);
          } catch {
            // Ignore background sync errors.
          }
        }
      } finally {
        isBackgroundSyncingRef.current = false;
      }
    };

    const maybeWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof maybeWindow.requestIdleCallback === 'function') {
      const requestIdle = maybeWindow.requestIdleCallback;
      const idleId = requestIdle(
        () => {
          void runBackgroundSync();
        },
        { timeout: 2000 }
      );

      return () => {
        if (typeof maybeWindow.cancelIdleCallback === 'function') {
          maybeWindow.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(() => {
      void runBackgroundSync();
    }, 800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isAuthReady, isAuthenticated, subTopics]);

  return (
    <ForumContext.Provider value={value}>{children}</ForumContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useForumContext = () => {
  const context = useContext(ForumContext);

  if (!context) {
    throw new Error('useForumContext must be used within ForumProvider');
  }

  return context;
};
