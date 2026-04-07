import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { generateForumEntityId } from '../../../services/forum/forumId';
import { canAccessSubTopic } from '../../../services/forum/forumAccess';
import { encodeQdnImageTag } from '../../../services/forum/richText';
import { threadPostCache } from '../../../services/forum/threadPostCache';
import { forumQdnService } from '../../../services/qdn/forumQdnService';
import type {
  ThreadSearchSnapshot,
  TopicDirectorySnapshot,
} from '../../../services/qdn/forumSearchIndexService';
import { forumSearchIndexService } from '../../../services/qdn/forumSearchIndexService';
import { forumRolesService } from '../../../services/qdn/forumRolesService';
import type {
  ForumRoleRegistry,
  Post,
  SubTopic,
  Topic,
  TopicAccess,
  User,
} from '../../../types';
import type { ForumMutationResult, ForumUploadImageResult } from '../types';

type UseForumCommandsParams = {
  currentUser: User;
  isAuthenticated: boolean;
  authenticatedAddress: string | null;
  roleRegistry: ForumRoleRegistry;
  topics: Topic[];
  subTopics: SubTopic[];
  posts: Post[];
  setTopicDirectoryIndex: Dispatch<
    SetStateAction<TopicDirectorySnapshot | null>
  >;
  setThreadSearchIndexes: Dispatch<
    SetStateAction<Record<string, ThreadSearchSnapshot>>
  >;
  setRoleRegistry: Dispatch<SetStateAction<ForumRoleRegistry>>;
  setUsers: Dispatch<SetStateAction<User[]>>;
  setTopics: Dispatch<SetStateAction<Topic[]>>;
  setSubTopics: Dispatch<SetStateAction<SubTopic[]>>;
  setPosts: Dispatch<SetStateAction<Post[]>>;
};

const ensureCurrentUserPresent = (users: User[], currentUser: User) => {
  return users.some((user) => user.id === currentUser.id)
    ? users
    : [currentUser, ...users];
};

const normalizeAddressList = (input: string[]) => {
  const seen = new Set<string>();
  const next: string[] = [];

  input.forEach((value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    next.push(normalized);
  });

  return next;
};

const isAdminRole = (role: User['role']) =>
  role === 'Admin' || role === 'SuperAdmin';
const isModeratorRole = (role: User['role']) =>
  role === 'Moderator' || role === 'Admin' || role === 'SuperAdmin';

const sortTopicsByOrder = (items: Topic[]) =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder);

const canCreateSubTopicForTopic = (
  topic: Topic,
  user: User,
  address: string | null
) => {
  if (user.role === 'SuperAdmin' || user.role === 'Admin') {
    return true;
  }

  if (topic.status === 'locked') {
    return false;
  }

  switch (topic.subTopicAccess) {
    case 'everyone':
      return true;
    case 'moderators':
      return isModeratorRole(user.role);
    case 'admins':
      return isAdminRole(user.role);
    case 'custom':
      return Boolean(address && topic.allowedAddresses.includes(address));
    default:
      return false;
  }
};

export const useForumCommands = ({
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
}: UseForumCommandsParams) => {
  const syncTopicDirectoryIndex = useCallback(
    async (nextTopics: Topic[], nextSubTopics: SubTopic[]) => {
      try {
        const snapshot =
          await forumSearchIndexService.publishTopicDirectoryIndex(
            nextTopics,
            nextSubTopics,
            currentUser.username
          );
        setTopicDirectoryIndex(snapshot);
      } catch {
        // Keep forum mutations successful even if index publish lags behind.
      }
    },
    [currentUser.username, setTopicDirectoryIndex]
  );

  const syncThreadSearchIndex = useCallback(
    async (subTopicId: string, nextPosts: Post[]) => {
      try {
        const snapshot = await forumSearchIndexService.publishThreadIndex(
          subTopicId,
          nextPosts,
          currentUser.username
        );
        setThreadSearchIndexes((current) => ({
          ...current,
          [subTopicId]: snapshot,
        }));
      } catch {
        // Keep forum mutations successful even if index publish lags behind.
      }
    },
    [currentUser.username, setThreadSearchIndexes]
  );

  const createTopic = useCallback(
    async (input: {
      title: string;
      description: string;
      status: Topic['status'];
      subTopicAccess: TopicAccess;
      allowedAddresses: string[];
    }): Promise<ForumMutationResult> => {
      const title = input.title.trim();
      const description = input.description.trim();
      const allowedAddresses = normalizeAddressList(input.allowedAddresses);

      if (!title || !description) {
        return { ok: false, error: 'Title and description are required.' };
      }

      if (!isAuthenticated) {
        return { ok: false, error: 'Authenticate with Qortal first.' };
      }

      if (!isAdminRole(currentUser.role)) {
        return {
          ok: false,
          error: 'Only admins and the super admin can create main topics.',
        };
      }

      if (input.subTopicAccess === 'custom' && allowedAddresses.length === 0) {
        return {
          ok: false,
          error: 'Add at least one wallet address for custom topic access.',
        };
      }

      const duplicate = topics.some(
        (topic) => topic.title.toLowerCase() === title.toLowerCase()
      );
      if (duplicate) {
        return { ok: false, error: 'A topic with this title already exists.' };
      }

      const createdAt = new Date().toISOString();
      const newTopic: Topic = {
        id: generateForumEntityId('topic', currentUser.username),
        title,
        description,
        createdByUserId: currentUser.id,
        createdAt,
        sortOrder:
          topics.length > 0
            ? Math.max(...topics.map((topic) => topic.sortOrder)) + 1
            : 0,
        status: input.status,
        visibility: 'visible',
        subTopicAccess: input.subTopicAccess,
        allowedAddresses,
      };

      try {
        await forumQdnService.publishTopic(newTopic, currentUser.username);
        const nextTopics = [newTopic, ...topics];
        setTopics((current) => [newTopic, ...current]);
        setUsers((current) => ensureCurrentUserPresent(current, currentUser));
        void syncTopicDirectoryIndex(nextTopics, subTopics);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : 'Failed to publish topic.',
        };
      }
    },
    [
      currentUser,
      isAuthenticated,
      subTopics,
      syncTopicDirectoryIndex,
      setTopics,
      setUsers,
      topics,
    ]
  );

  const reorderTopics = useCallback(
    async (orderedTopicIds: string[]): Promise<ForumMutationResult> => {
      if (!isAuthenticated) {
        return { ok: false, error: 'Authenticate with Qortal first.' };
      }

      if (!isAdminRole(currentUser.role)) {
        return {
          ok: false,
          error: 'Only admins and the super admin can reorder main topics.',
        };
      }

      if (orderedTopicIds.length !== topics.length) {
        return { ok: false, error: 'Topic reorder payload is incomplete.' };
      }

      const topicMap = new Map(topics.map((topic) => [topic.id, topic]));
      const reorderedTopics = orderedTopicIds.map((topicId, index) => {
        const topic = topicMap.get(topicId);
        if (!topic) {
          throw new Error('Topic reorder contains an unknown topic id.');
        }

        return {
          ...topic,
          sortOrder: index,
        };
      });

      try {
        await Promise.all(
          reorderedTopics.map((topic) =>
            forumQdnService.publishTopic(topic, currentUser.username)
          )
        );

        const nextTopics = sortTopicsByOrder(reorderedTopics);
        setTopics(nextTopics);
        void syncTopicDirectoryIndex(nextTopics, subTopics);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to reorder topics.',
        };
      }
    },
    [
      currentUser.role,
      currentUser.username,
      isAuthenticated,
      setTopics,
      subTopics,
      syncTopicDirectoryIndex,
      topics,
    ]
  );

  const createSubTopic = useCallback(
    async (input: {
      topicId: string;
      title: string;
      description: string;
      access: TopicAccess;
      allowedAddresses: string[];
    }): Promise<ForumMutationResult> => {
      const title = input.title.trim();
      const description = input.description.trim();
      const allowedAddresses = normalizeAddressList(input.allowedAddresses);

      if (!title || !description) {
        return { ok: false, error: 'Title and description are required.' };
      }

      if (!isAuthenticated) {
        return { ok: false, error: 'Authenticate with Qortal first.' };
      }

      if (!topics.some((topic) => topic.id === input.topicId)) {
        return { ok: false, error: 'Main topic not found.' };
      }

      const parentTopic = topics.find((topic) => topic.id === input.topicId);
      if (!parentTopic) {
        return { ok: false, error: 'Main topic not found.' };
      }

      if (
        !canCreateSubTopicForTopic(
          parentTopic,
          currentUser,
          authenticatedAddress
        )
      ) {
        return {
          ok: false,
          error:
            'You do not have permission to create a sub-topic under this main topic.',
        };
      }

      if (input.access === 'custom' && allowedAddresses.length === 0) {
        return {
          ok: false,
          error: 'Add at least one wallet address for custom sub-topic access.',
        };
      }

      const duplicate = subTopics.some(
        (subTopic) =>
          subTopic.topicId === input.topicId &&
          subTopic.title.toLowerCase() === title.toLowerCase()
      );
      if (duplicate) {
        return {
          ok: false,
          error:
            'This sub-topic title already exists under selected main topic.',
        };
      }

      const createdAt = new Date().toISOString();
      const newSubTopic: SubTopic = {
        id: generateForumEntityId('subtopic', currentUser.username),
        topicId: input.topicId,
        title,
        description,
        authorUserId: currentUser.id,
        createdAt,
        lastPostAt: createdAt,
        isPinned: false,
        pinnedAt: null,
        access: input.access,
        allowedAddresses,
        status: 'open',
        visibility: 'visible',
      };

      try {
        await forumQdnService.publishSubTopic(
          newSubTopic,
          currentUser.username
        );
        const nextSubTopics = [newSubTopic, ...subTopics];
        setSubTopics((current) => [newSubTopic, ...current]);
        setUsers((current) => ensureCurrentUserPresent(current, currentUser));
        void syncTopicDirectoryIndex(topics, nextSubTopics);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to publish sub-topic.',
        };
      }
    },
    [
      currentUser,
      authenticatedAddress,
      isAuthenticated,
      setSubTopics,
      setUsers,
      subTopics,
      syncTopicDirectoryIndex,
      topics,
    ]
  );

  const updateTopicSettings = useCallback(
    async (input: {
      topicId: string;
      status: Topic['status'];
      visibility: Topic['visibility'];
      subTopicAccess: TopicAccess;
      allowedAddresses: string[];
    }): Promise<ForumMutationResult> => {
      const target = topics.find((topic) => topic.id === input.topicId);
      if (!target) {
        return { ok: false, error: 'Main topic not found.' };
      }

      if (!isAuthenticated) {
        return { ok: false, error: 'Authenticate with Qortal first.' };
      }

      if (!isAdminRole(currentUser.role)) {
        return { ok: false, error: 'Only admins can manage main topics.' };
      }

      const allowedAddresses = normalizeAddressList(input.allowedAddresses);
      if (input.subTopicAccess === 'custom' && allowedAddresses.length === 0) {
        return {
          ok: false,
          error: 'Add at least one wallet address for custom topic access.',
        };
      }

      const updatedTopic: Topic = {
        ...target,
        status: input.status,
        visibility: input.visibility,
        subTopicAccess: input.subTopicAccess,
        allowedAddresses,
      };

      try {
        await forumQdnService.publishTopic(updatedTopic, currentUser.username);
        const nextTopics = topics.map((topic) =>
          topic.id === target.id ? updatedTopic : topic
        );
        setTopics((current) =>
          current.map((topic) =>
            topic.id === target.id ? updatedTopic : topic
          )
        );
        void syncTopicDirectoryIndex(nextTopics, subTopics);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to update main topic.',
        };
      }
    },
    [
      currentUser.role,
      currentUser.username,
      isAuthenticated,
      setTopics,
      subTopics,
      syncTopicDirectoryIndex,
      topics,
    ]
  );

  const updateSubTopicSettings = useCallback(
    async (input: {
      subTopicId: string;
      status: SubTopic['status'];
      visibility: SubTopic['visibility'];
      isPinned: boolean;
      access: TopicAccess;
      allowedAddresses: string[];
    }): Promise<ForumMutationResult> => {
      const target = subTopics.find(
        (subTopic) => subTopic.id === input.subTopicId
      );
      if (!target) {
        return { ok: false, error: 'Sub-topic not found.' };
      }

      if (!isAuthenticated) {
        return { ok: false, error: 'Authenticate with Qortal first.' };
      }

      if (!isModeratorRole(currentUser.role)) {
        return {
          ok: false,
          error:
            'Only moderators, admins and the super admin can manage sub-topics.',
        };
      }

      const allowedAddresses = normalizeAddressList(input.allowedAddresses);
      if (input.access === 'custom' && allowedAddresses.length === 0) {
        return {
          ok: false,
          error: 'Add at least one wallet address for custom sub-topic access.',
        };
      }

      const updatedSubTopic: SubTopic = {
        ...target,
        status: input.status,
        visibility: input.visibility,
        isPinned: input.isPinned,
        pinnedAt: input.isPinned
          ? (target.pinnedAt ?? new Date().toISOString())
          : null,
        access: input.access,
        allowedAddresses,
      };

      try {
        await forumQdnService.publishSubTopic(
          updatedSubTopic,
          currentUser.username
        );
        const nextSubTopics = subTopics.map((subTopic) =>
          subTopic.id === target.id ? updatedSubTopic : subTopic
        );
        setSubTopics((current) =>
          current.map((subTopic) =>
            subTopic.id === target.id ? updatedSubTopic : subTopic
          )
        );
        void syncTopicDirectoryIndex(topics, nextSubTopics);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to update sub-topic.',
        };
      }
    },
    [
      currentUser.role,
      currentUser.username,
      isAuthenticated,
      setSubTopics,
      subTopics,
      syncTopicDirectoryIndex,
      topics,
    ]
  );

  const upsertRoleAssignment = useCallback(
    async (input: {
      address: string;
      role: 'Admin' | 'Moderator';
    }): Promise<ForumMutationResult> => {
      const address = input.address.trim();

      if (!address) {
        return { ok: false, error: 'Wallet address is required.' };
      }

      if (!isAuthenticated) {
        return { ok: false, error: 'Authenticate with Qortal first.' };
      }

      if (
        currentUser.role !== 'SuperAdmin' ||
        authenticatedAddress !== roleRegistry.superAdminAddress
      ) {
        return {
          ok: false,
          error: 'Only the super admin can manage forum roles.',
        };
      }

      if (address === roleRegistry.superAdminAddress) {
        return {
          ok: false,
          error: 'The super admin address is fixed and cannot be reassigned.',
        };
      }

      const nextRegistry: ForumRoleRegistry = {
        ...roleRegistry,
        admins:
          input.role === 'Admin'
            ? normalizeAddressList([...roleRegistry.admins, address])
            : roleRegistry.admins.filter((entry) => entry !== address),
        moderators:
          input.role === 'Moderator'
            ? normalizeAddressList([...roleRegistry.moderators, address])
            : roleRegistry.moderators.filter((entry) => entry !== address),
        updatedAt: Date.now(),
      };

      try {
        const published = await forumRolesService.publishRoleRegistry(
          nextRegistry,
          currentUser.username
        );
        setRoleRegistry(published);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to update forum role registry.',
        };
      }
    },
    [
      authenticatedAddress,
      currentUser.role,
      currentUser.username,
      isAuthenticated,
      roleRegistry,
      setRoleRegistry,
    ]
  );

  const removeRoleAssignment = useCallback(
    async (address: string): Promise<ForumMutationResult> => {
      const normalizedAddress = address.trim();

      if (!normalizedAddress) {
        return { ok: false, error: 'Wallet address is required.' };
      }

      if (!isAuthenticated) {
        return { ok: false, error: 'Authenticate with Qortal first.' };
      }

      if (
        currentUser.role !== 'SuperAdmin' ||
        authenticatedAddress !== roleRegistry.superAdminAddress
      ) {
        return {
          ok: false,
          error: 'Only the super admin can manage forum roles.',
        };
      }

      if (normalizedAddress === roleRegistry.superAdminAddress) {
        return { ok: false, error: 'The super admin role cannot be removed.' };
      }

      const nextRegistry: ForumRoleRegistry = {
        ...roleRegistry,
        admins: roleRegistry.admins.filter(
          (entry) => entry !== normalizedAddress
        ),
        moderators: roleRegistry.moderators.filter(
          (entry) => entry !== normalizedAddress
        ),
        updatedAt: Date.now(),
      };

      try {
        const published = await forumRolesService.publishRoleRegistry(
          nextRegistry,
          currentUser.username
        );
        setRoleRegistry(published);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to update forum role registry.',
        };
      }
    },
    [
      authenticatedAddress,
      currentUser.role,
      currentUser.username,
      isAuthenticated,
      roleRegistry,
      setRoleRegistry,
    ]
  );

  const createPost = useCallback(
    async (input: {
      subTopicId: string;
      content: string;
    }): Promise<ForumMutationResult> => {
      const content = input.content.trim();

      if (!content) {
        return { ok: false, error: 'Post content is required.' };
      }

      if (!isAuthenticated) {
        return { ok: false, error: 'Authenticate with Qortal first.' };
      }

      if (!subTopics.some((subTopic) => subTopic.id === input.subTopicId)) {
        return { ok: false, error: 'Sub-topic not found.' };
      }

      const targetSubTopic = subTopics.find(
        (subTopic) => subTopic.id === input.subTopicId
      );
      if (!targetSubTopic) {
        return { ok: false, error: 'Sub-topic not found.' };
      }

      if (targetSubTopic.status === 'locked') {
        return { ok: false, error: 'This sub-topic is locked.' };
      }

      if (
        targetSubTopic.visibility === 'hidden' &&
        !isModeratorRole(currentUser.role)
      ) {
        return { ok: false, error: 'This sub-topic is hidden.' };
      }

      if (
        !canAccessSubTopic(targetSubTopic, currentUser, authenticatedAddress)
      ) {
        return {
          ok: false,
          error: 'You do not have access to post in this sub-topic.',
        };
      }

      const createdAt = new Date().toISOString();
      const newPost: Post = {
        id: generateForumEntityId('post', currentUser.username),
        subTopicId: input.subTopicId,
        authorUserId: currentUser.id,
        content,
        createdAt,
        likes: 0,
      };

      try {
        await forumQdnService.publishPost(newPost, currentUser.username);
        const nextPosts = [...posts, newPost];
        const nextSubTopics = subTopics.map((subTopic) =>
          subTopic.id === input.subTopicId
            ? { ...subTopic, lastPostAt: createdAt }
            : subTopic
        );
        setPosts((current) => {
          const next = [...current, newPost];
          threadPostCache.write(
            input.subTopicId,
            next.filter((post) => post.subTopicId === input.subTopicId)
          );
          return next;
        });
        setSubTopics((current) =>
          current.map((subTopic) =>
            subTopic.id === input.subTopicId
              ? { ...subTopic, lastPostAt: createdAt }
              : subTopic
          )
        );
        setUsers((current) => ensureCurrentUserPresent(current, currentUser));
        await syncThreadSearchIndex(input.subTopicId, nextPosts);
        void syncTopicDirectoryIndex(topics, nextSubTopics);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : 'Failed to publish post.',
        };
      }
    },
    [
      currentUser,
      authenticatedAddress,
      isAuthenticated,
      posts,
      setPosts,
      setSubTopics,
      setUsers,
      subTopics,
      syncThreadSearchIndex,
      syncTopicDirectoryIndex,
      topics,
    ]
  );

  const updatePost = useCallback(
    async (input: {
      postId: string;
      content: string;
    }): Promise<ForumMutationResult> => {
      const content = input.content.trim();
      if (!content) {
        return { ok: false, error: 'Post content is required.' };
      }

      if (!isAuthenticated) {
        return { ok: false, error: 'Authenticate with Qortal first.' };
      }

      const target = posts.find((post) => post.id === input.postId);
      if (!target) {
        return { ok: false, error: 'Post not found.' };
      }

      if (target.authorUserId !== currentUser.id) {
        return { ok: false, error: 'Only owner can edit this post.' };
      }

      const updatedPost: Post = { ...target, content };

      try {
        await forumQdnService.publishPost(updatedPost, currentUser.username);
        const nextPosts = posts.map((post) =>
          post.id === input.postId ? updatedPost : post
        );
        setPosts((current) => {
          const next = current.map((post) =>
            post.id === input.postId ? updatedPost : post
          );
          threadPostCache.write(
            updatedPost.subTopicId,
            next.filter((post) => post.subTopicId === updatedPost.subTopicId)
          );
          return next;
        });
        await syncThreadSearchIndex(updatedPost.subTopicId, nextPosts);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : 'Failed to update post.',
        };
      }
    },
    [currentUser, isAuthenticated, posts, setPosts, syncThreadSearchIndex]
  );

  const deletePost = useCallback(
    async (postId: string): Promise<ForumMutationResult> => {
      const target = posts.find((post) => post.id === postId);
      if (!target) {
        return { ok: false, error: 'Post not found.' };
      }

      if (!isAuthenticated) {
        return { ok: false, error: 'Authenticate with Qortal first.' };
      }

      if (
        target.authorUserId !== currentUser.id &&
        !isModeratorRole(currentUser.role)
      ) {
        return {
          ok: false,
          error: 'Only owner or moderator can delete this post.',
        };
      }

      try {
        await forumQdnService.deletePost(target, currentUser.username);
        const nextPosts = posts.filter((post) => post.id !== postId);
        setPosts((current) => {
          const next = current.filter((post) => post.id !== postId);
          threadPostCache.write(
            target.subTopicId,
            next.filter((post) => post.subTopicId === target.subTopicId)
          );
          return next;
        });
        await syncThreadSearchIndex(target.subTopicId, nextPosts);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : 'Failed to delete post.',
        };
      }
    },
    [currentUser, isAuthenticated, posts, setPosts, syncThreadSearchIndex]
  );

  const likePost = useCallback(
    (postId: string) => {
      if (!isAuthenticated) {
        return;
      }

      setPosts((current) => {
        const next = current.map((post) =>
          post.id === postId ? { ...post, likes: post.likes + 1 } : post
        );

        const target = next.find((post) => post.id === postId);
        if (target) {
          threadPostCache.write(
            target.subTopicId,
            next.filter((post) => post.subTopicId === target.subTopicId)
          );
          void forumQdnService.publishPost(target, currentUser.username);
          void syncThreadSearchIndex(target.subTopicId, next);
        }

        return next;
      });
    },
    [currentUser.username, isAuthenticated, setPosts, syncThreadSearchIndex]
  );

  const uploadPostImage = useCallback(
    async (file: File): Promise<ForumUploadImageResult> => {
      if (!isAuthenticated) {
        return { ok: false, error: 'Authenticate with Qortal first.' };
      }

      try {
        const reference = await forumQdnService.publishPostImage(
          file,
          currentUser.username
        );
        return {
          ok: true,
          imageTag: encodeQdnImageTag({
            name: reference.name,
            identifier: reference.identifier,
          }),
        };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : 'Failed to upload image.',
        };
      }
    },
    [currentUser.username, isAuthenticated]
  );

  return {
    createTopic,
    reorderTopics,
    createSubTopic,
    updateTopicSettings,
    updateSubTopicSettings,
    upsertRoleAssignment,
    removeRoleAssignment,
    createPost,
    updatePost,
    deletePost,
    likePost,
    uploadPostImage,
  };
};
