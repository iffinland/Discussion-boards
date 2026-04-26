import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from 'qapp-core';
import { createAvatarLink } from 'qapp-core';

import {
  getAccountNames,
  getUserAccount,
} from '../../../services/qortal/walletService';
import { forumQdnService } from '../../../services/qdn/forumQdnService';
import {
  forumMaintenanceService,
  type ForumMaintenanceState,
} from '../../../services/qdn/forumMaintenanceService';
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
import { perfDebugTimeStart } from '../../../services/perf/perfDebug';
import type {
  ForumRoleRegistry,
  Post,
  SubTopic,
  Topic,
  User,
} from '../../../types';

type ForumAuthMode = 'qortal';
type BootstrapSession = {
  user: User;
  authenticatedAddress: string | null;
  identityKey: string;
};

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

const toForumStructureFromTopicDirectory = (
  snapshot: TopicDirectorySnapshot
) => {
  const fallbackCreatedAt = new Date(0).toISOString();

  const topicsFromIndex: Topic[] = snapshot.topics.map((topic) => ({
    id: topic.topicId,
    title: topic.title,
    description: topic.description,
    createdByUserId: 'qdn-index',
    createdAt: fallbackCreatedAt,
    sortOrder: topic.sortOrder,
    status: topic.status,
    visibility: topic.visibility,
    subTopicAccess: topic.subTopicAccess,
    allowedAddresses: topic.allowedAddresses,
  }));

  const subTopicsFromIndex: SubTopic[] = snapshot.subTopics.map((subTopic) => ({
    id: subTopic.subTopicId,
    topicId: subTopic.topicId,
    title: subTopic.title,
    description: subTopic.description,
    authorUserId: subTopic.authorUserId || 'qdn-index',
    createdAt: subTopic.lastPostAt || fallbackCreatedAt,
    lastPostAt: subTopic.lastPostAt || fallbackCreatedAt,
    isPinned: subTopic.isPinned,
    pinnedAt: subTopic.pinnedAt,
    isSolved: subTopic.isSolved,
    solvedAt: subTopic.solvedAt,
    solvedByUserId: subTopic.solvedByUserId,
    access: subTopic.access,
    allowedAddresses: subTopic.allowedAddresses,
    status: subTopic.status,
    visibility: subTopic.visibility,
    lastModerationAction: subTopic.lastModerationAction ?? null,
    lastModerationReason: subTopic.lastModerationReason ?? null,
    lastModeratedByUserId: subTopic.lastModeratedByUserId ?? null,
    lastModeratedAt: subTopic.lastModeratedAt ?? null,
  }));

  return {
    topics: topicsFromIndex,
    subTopics: subTopicsFromIndex,
  };
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
  const [maintenanceState, setMaintenanceState] =
    useState<ForumMaintenanceState>(
      forumMaintenanceService.createDefaultMaintenanceState()
    );
  const [canBypassMaintenance, setCanBypassMaintenance] =
    useState<boolean>(false);
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

  const applyForumStructure = useCallback(
    (baseUsers: User[], nextTopics: Topic[], nextSubTopics: SubTopic[]) => {
      setTopics(nextTopics);
      setSubTopics(nextSubTopics);
      setUsers(
        mergeUsersFromForumData(baseUsers, nextTopics, nextSubTopics, [])
      );
      setPosts([]);
    },
    []
  );

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
      setMaintenanceState(
        forumMaintenanceService.createDefaultMaintenanceState()
      );
      setCanBypassMaintenance(false);
      setTopicDirectoryIndex(null);
      setThreadSearchIndexes({});
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

    const identityKey = identity || GUEST_USER.id;

    if (loadedIdentityRef.current === identityKey) {
      setIsAuthReady(true);
      return () => {
        active = false;
      };
    }

    const bootstrapQdnData = async () => {
      const endTiming = perfDebugTimeStart('initial-forum-data-load', {
        identityKey,
        mode: identity ? 'authenticated' : 'guest',
      });
      let session: BootstrapSession | null = null;

      try {
        setIsAuthReady(false);

        const authenticatedAddressPromise = identity
          ? address?.trim()
            ? Promise.resolve(address.trim())
            : getUserAccount()
                .then((account) => account.address?.trim() ?? '')
                .catch(() => '')
          : Promise.resolve('');

        const [maintenanceResult, registryResult, addressResult] =
          await Promise.allSettled([
            forumMaintenanceService.loadMaintenanceState(),
            forumRolesService.loadRoleRegistry(),
            authenticatedAddressPromise,
          ]);

        if (!active) {
          return;
        }

        const nextMaintenanceState =
          maintenanceResult.status === 'fulfilled'
            ? maintenanceResult.value
            : forumMaintenanceService.createDefaultMaintenanceState();
        const nextRoleRegistry =
          registryResult.status === 'fulfilled'
            ? registryResult.value
            : createDefaultRoleRegistry();
        const nextAuthenticatedAddress =
          identity && addressResult.status === 'fulfilled'
            ? addressResult.value || null
            : null;

        const nextUser = identity
          ? {
              id: identity,
              username: identity,
              displayName: identity,
              address: nextAuthenticatedAddress,
              avatarUrl: createAvatarLink(identity),
              role: 'Member' as const,
              avatarColor: 'bg-cyan-600',
              joinedAt: new Date().toISOString(),
            }
          : GUEST_USER;

        session = {
          identityKey,
          authenticatedAddress: nextAuthenticatedAddress,
          user: identity
            ? {
                ...nextUser,
                role: resolveRoleForAddress(
                  nextAuthenticatedAddress,
                  nextRoleRegistry
                ),
              }
            : GUEST_USER,
        };

        const nextCanBypassMaintenance =
          session.user.role === 'SysOp' &&
          session.authenticatedAddress === nextRoleRegistry.primarySysOpAddress;

        setAuthenticatedAddress(session.authenticatedAddress);
        setRoleRegistry(nextRoleRegistry);
        setMaintenanceState(nextMaintenanceState);
        setCanBypassMaintenance(nextCanBypassMaintenance);
        setThreadSearchIndexes({});
        setCurrentUserId(session.user.id);
        loadedIdentityRef.current = identityKey;

        if (nextMaintenanceState.enabled && !nextCanBypassMaintenance) {
          setUsers([session.user]);
          setTopics([]);
          setSubTopics([]);
          setPosts([]);
          setTopicDirectoryIndex(null);
          endTiming({
            maintenanceMode: true,
            usedTopicDirectoryIndex: false,
          });
          setIsAuthReady(true);
          return;
        }

        const nextTopicDirectoryIndex =
          await forumSearchIndexService.loadTopicDirectoryIndex();
        if (!active) {
          return;
        }
        setTopicDirectoryIndex(nextTopicDirectoryIndex);

        if (nextTopicDirectoryIndex) {
          const indexedStructure = toForumStructureFromTopicDirectory(
            nextTopicDirectoryIndex
          );
          applyForumStructure(
            [session.user],
            indexedStructure.topics,
            indexedStructure.subTopics
          );
          endTiming({
            usedTopicDirectoryIndex: true,
            topicCount: indexedStructure.topics.length,
            subTopicCount: indexedStructure.subTopics.length,
          });
          setIsAuthReady(true);
        } else {
          const remoteData = await forumQdnService.loadForumStructureCached();
          if (!active) {
            return;
          }

          applyForumStructure(
            [session.user],
            remoteData.topics,
            remoteData.subTopics
          );
          endTiming({
            usedTopicDirectoryIndex: false,
            topicCount: remoteData.topics.length,
            subTopicCount: remoteData.subTopics.length,
          });
          setIsAuthReady(true);
        }
      } catch {
        endTiming({ error: true });
        if (!active) {
          return;
        }

        if (session && session.user.id !== GUEST_USER.id) {
          setAuthenticatedAddress(session.authenticatedAddress);
          setUsers([session.user]);
          setCurrentUserId(session.user.id);
        } else {
          setAuthenticatedAddress(null);
          setUsers([GUEST_USER]);
          setCurrentUserId(GUEST_USER.id);
        }
        setTopics([]);
        setSubTopics([]);
        setPosts([]);
        setRoleRegistry(createDefaultRoleRegistry());
        setMaintenanceState(
          forumMaintenanceService.createDefaultMaintenanceState()
        );
        setCanBypassMaintenance(false);
        setTopicDirectoryIndex(null);
        setThreadSearchIndexes({});
        loadedIdentityRef.current = session ? identityKey : null;
        setIsAuthReady(true);
      }
    };

    void bootstrapQdnData();

    return () => {
      active = false;
    };
  }, [
    activeAuthName,
    address,
    applyForumStructure,
    isLoadingUser,
    name,
    primaryName,
  ]);

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
    maintenanceState,
    canBypassMaintenance,
    threadSearchIndexes,
    setRoleRegistry,
    setTopicDirectoryIndex,
    setMaintenanceState,
    setThreadSearchIndexes,
    availableAuthNames,
    activeAuthName,
    setActiveAuthName,
  };
};
