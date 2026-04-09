import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from 'qapp-core';
import { createAvatarLink } from 'qapp-core';

import {
  getAccountNames,
  getUserAccount,
} from '../../../services/qortal/walletService';
import { forumQdnService } from '../../../services/qdn/forumQdnService';
import {
  forumSearchIndexService,
  type ThreadSearchSnapshot,
  type TopicDirectorySnapshot,
} from '../../../services/qdn/forumSearchIndexService';
import {
  createDefaultRoleRegistry,
  forumRolesService,
  resolveRoleForAddress,
} from '../../../services/qdn/forumRolesService';
import { isQortalRequestAvailable } from '../../../services/qortal/qortalClient';
import type {
  ForumRoleRegistry,
  Post,
  SubTopic,
  Topic,
  User,
} from '../../../types';

type ForumAuthMode = 'qortal';

const GUEST_USER: User = {
  id: 'qortal-guest',
  username: 'qortal-guest',
  displayName: 'Guest',
  address: null,
  avatarUrl: null,
  role: 'Member',
  avatarColor: 'bg-slate-400',
  joinedAt: new Date(0).toISOString(),
};

const toUniqueNames = (input: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const next: string[] = [];

  input.forEach((value) => {
    const normalized = value?.trim();
    if (!normalized) {
      return;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    next.push(normalized);
  });

  return next;
};

const mergeUsersFromForumData = (
  baseUsers: User[],
  topics: Topic[],
  subTopics: SubTopic[],
  posts: Post[]
) => {
  const nextUsers = [...baseUsers];
  const seen = new Set(nextUsers.map((user) => user.id));

  const authorIds = new Set<string>();
  topics.forEach((topic) => authorIds.add(topic.createdByUserId));
  subTopics.forEach((subTopic) => authorIds.add(subTopic.authorUserId));
  posts.forEach((post) => authorIds.add(post.authorUserId));

  authorIds.forEach((id) => {
    if (!id || seen.has(id)) {
      return;
    }

    nextUsers.push({
      id,
      username: id,
      displayName: id,
      address: null,
      avatarUrl: createAvatarLink(id),
      role: 'Member',
      avatarColor: 'bg-cyan-500',
      joinedAt: new Date().toISOString(),
    });
    seen.add(id);
  });

  return nextUsers;
};

export const useForumDataQuery = () => {
  const auth = useAuth();
  const { address, name, primaryName, isLoadingUser, authenticateUser } = auth;
  const [users, setUsers] = useState<User[]>([GUEST_USER]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [subTopics, setSubTopics] = useState<SubTopic[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>(GUEST_USER.id);
  const [availableAuthNames, setAvailableAuthNames] = useState<string[]>([]);
  const [activeAuthName, setActiveAuthName] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [authenticatedAddress, setAuthenticatedAddress] = useState<
    string | null
  >(null);
  const [roleRegistry, setRoleRegistry] = useState<ForumRoleRegistry>(
    createDefaultRoleRegistry()
  );
  const [topicDirectoryIndex, setTopicDirectoryIndex] =
    useState<TopicDirectorySnapshot | null>(null);
  const [threadSearchIndexes, setThreadSearchIndexes] = useState<
    Record<string, ThreadSearchSnapshot>
  >({});
  const loadedIdentityRef = useRef<string | null>(null);
  const authMode: ForumAuthMode = 'qortal';

  const currentUser = useMemo(() => {
    const baseUser =
      users.find((user) => user.id === currentUserId) ?? users[0];

    if (baseUser.id === GUEST_USER.id) {
      return baseUser;
    }

    return {
      ...baseUser,
      address: authenticatedAddress,
      role: resolveRoleForAddress(authenticatedAddress, roleRegistry),
    };
  }, [authenticatedAddress, currentUserId, roleRegistry, users]);

  useEffect(() => {
    let active = true;

    const syncAccountNames = async () => {
      const normalizedAddress = address?.trim();
      const primary = primaryName?.trim();
      const authName = name?.trim();
      const known = toUniqueNames([primary, authName]);

      if (!normalizedAddress) {
        if (!active) {
          return;
        }
        setAvailableAuthNames(known);
        setActiveAuthName((current) => current ?? known[0] ?? null);
        return;
      }

      try {
        const resolved = await getAccountNames(normalizedAddress);
        if (!active) {
          return;
        }

        const merged = toUniqueNames([...known, ...resolved]);
        setAvailableAuthNames(merged);
        setActiveAuthName((current) => {
          if (current && merged.includes(current)) {
            return current;
          }

          if (primary && merged.includes(primary)) {
            return primary;
          }

          if (authName && merged.includes(authName)) {
            return authName;
          }

          return merged[0] ?? null;
        });
      } catch {
        if (!active) {
          return;
        }

        setAvailableAuthNames(known);
        setActiveAuthName((current) => current ?? known[0] ?? null);
      }
    };

    void syncAccountNames();

    return () => {
      active = false;
    };
  }, [address, name, primaryName]);

  useEffect(() => {
    let active = true;
    const hasAuthSignal = Boolean(
      address?.trim() || name?.trim() || primaryName?.trim() || isLoadingUser
    );
    const isQortal = isQortalRequestAvailable() || hasAuthSignal;

    if (!isQortal) {
      loadedIdentityRef.current = null;
      setUsers([GUEST_USER]);
      setTopics([]);
      setSubTopics([]);
      setPosts([]);
      setCurrentUserId(GUEST_USER.id);
      setAuthenticatedAddress(null);
      setAvailableAuthNames([]);
      setActiveAuthName(null);
      setRoleRegistry(createDefaultRoleRegistry());
      setIsAuthReady(true);
      return () => {
        active = false;
      };
    }

    const identity =
      activeAuthName?.trim() ||
      primaryName?.trim() ||
      name?.trim() ||
      address?.trim() ||
      '';

    if (isLoadingUser) {
      setIsAuthReady(false);
      return () => {
        active = false;
      };
    }

    if (!identity) {
      if (loadedIdentityRef.current === GUEST_USER.id) {
        setIsAuthReady(true);
        return () => {
          active = false;
        };
      }

      const bootstrapGuestData = async () => {
        try {
          setIsAuthReady(false);

          const [structureResult, registryResult, topicDirectoryIndexResult] =
            await Promise.allSettled([
              forumQdnService.loadForumStructure(),
              forumRolesService.loadRoleRegistry(),
              forumSearchIndexService.loadTopicDirectoryIndex(),
            ]);

          if (!active) {
            return;
          }

          const nextRoleRegistry =
            registryResult.status === 'fulfilled'
              ? registryResult.value
              : createDefaultRoleRegistry();

          setAuthenticatedAddress(null);
          setRoleRegistry(nextRoleRegistry);
          setTopicDirectoryIndex(
            topicDirectoryIndexResult.status === 'fulfilled'
              ? topicDirectoryIndexResult.value
              : null
          );
          setThreadSearchIndexes({});

          if (structureResult.status !== 'fulfilled') {
            setUsers([GUEST_USER]);
            setTopics([]);
            setSubTopics([]);
            setPosts([]);
            setCurrentUserId(GUEST_USER.id);
            loadedIdentityRef.current = GUEST_USER.id;
            return;
          }

          const remoteData = structureResult.value;
          const mergedUsers = mergeUsersFromForumData(
            [GUEST_USER],
            remoteData.topics,
            remoteData.subTopics,
            []
          );

          setUsers(mergedUsers);
          setTopics(remoteData.topics);
          setSubTopics(remoteData.subTopics);
          setPosts([]);
          setCurrentUserId(GUEST_USER.id);
          loadedIdentityRef.current = GUEST_USER.id;
        } catch {
          if (!active) {
            return;
          }

          setUsers([GUEST_USER]);
          setTopics([]);
          setSubTopics([]);
          setPosts([]);
          setCurrentUserId(GUEST_USER.id);
          setAuthenticatedAddress(null);
          setRoleRegistry(createDefaultRoleRegistry());
          setTopicDirectoryIndex(null);
          setThreadSearchIndexes({});
          loadedIdentityRef.current = GUEST_USER.id;
        } finally {
          if (active) {
            setIsAuthReady(true);
          }
        }
      };

      void bootstrapGuestData();
      return () => {
        active = false;
      };
    }

    if (loadedIdentityRef.current === identity) {
      setIsAuthReady(true);
      return () => {
        active = false;
      };
    }

    const bootstrapQdnData = async () => {
      let qortalUser: User | null = null;

      try {
        setIsAuthReady(false);

        const authenticatedAddress =
          address?.trim() ||
          (await getUserAccount()
            .then((account) => account.address?.trim() ?? '')
            .catch(() => ''));

        qortalUser = {
          id: identity,
          username: identity,
          displayName: identity,
          address: authenticatedAddress,
          avatarUrl: createAvatarLink(identity),
          role: resolveRoleForAddress(authenticatedAddress, roleRegistry),
          avatarColor: 'bg-cyan-600',
          joinedAt: new Date().toISOString(),
        };

        const [structureResult, registryResult, topicDirectoryIndexResult] =
          await Promise.allSettled([
            forumQdnService.loadForumStructure(),
            forumRolesService.loadRoleRegistry(),
            forumSearchIndexService.loadTopicDirectoryIndex(),
          ]);
        const nextRoleRegistry =
          registryResult.status === 'fulfilled'
            ? registryResult.value
            : createDefaultRoleRegistry();

        qortalUser = {
          ...qortalUser,
          role: resolveRoleForAddress(authenticatedAddress, nextRoleRegistry),
        };

        setAuthenticatedAddress(authenticatedAddress || null);
        setRoleRegistry(nextRoleRegistry);
        setTopicDirectoryIndex(
          topicDirectoryIndexResult.status === 'fulfilled'
            ? topicDirectoryIndexResult.value
            : null
        );
        setThreadSearchIndexes({});
        setUsers([qortalUser]);
        setCurrentUserId(qortalUser.id);

        if (!active) {
          return;
        }

        if (structureResult.status !== 'fulfilled') {
          setTopics([]);
          setSubTopics([]);
          setPosts([]);
          setThreadSearchIndexes({});
          loadedIdentityRef.current = identity;
          return;
        }

        const remoteData = structureResult.value;
        const mergedUsers = mergeUsersFromForumData(
          [qortalUser],
          remoteData.topics,
          remoteData.subTopics,
          []
        );

        setUsers(mergedUsers);
        setTopics(remoteData.topics);
        setSubTopics(remoteData.subTopics);
        setPosts([]);
        setThreadSearchIndexes({});
        setCurrentUserId(qortalUser.id);
        loadedIdentityRef.current = identity;
      } catch {
        if (!active) {
          return;
        }

        if (qortalUser) {
          setAuthenticatedAddress(qortalUser.address?.trim() ?? null);
          setUsers([qortalUser]);
          setCurrentUserId(qortalUser.id);
        } else {
          setAuthenticatedAddress(null);
          setUsers([GUEST_USER]);
          setCurrentUserId(GUEST_USER.id);
        }
        setTopics([]);
        setSubTopics([]);
        setPosts([]);
        setTopicDirectoryIndex(null);
        setThreadSearchIndexes({});
        loadedIdentityRef.current = qortalUser ? identity : null;
      } finally {
        if (active) {
          setIsAuthReady(true);
        }
      }
    };

    void bootstrapQdnData();

    return () => {
      active = false;
    };
  }, [activeAuthName, address, isLoadingUser, name, primaryName, roleRegistry]);

  const authenticate = useCallback(async () => {
    await authenticateUser();
  }, [authenticateUser]);

  const isAuthenticated =
    authMode === 'qortal' && currentUser.id !== GUEST_USER.id;

  return {
    users,
    setUsers,
    topics,
    setTopics,
    subTopics,
    setSubTopics,
    posts,
    setPosts,
    currentUser,
    isAuthReady,
    authMode,
    isAuthenticated,
    authenticate,
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
  };
};
