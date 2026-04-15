import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useForumActions, useForumData } from '../hooks/useForumData';
import { canAccessSubTopic } from '../services/forum/forumAccess';
import { isThreadQuarantined } from '../services/forum/threadLoadQuarantine';
import {
  buildForumStructureSearchIndex,
  createSearchHaystack,
  searchForumStructure,
  tokenizeSearchQuery,
} from '../services/forum/forumSearch';
import { mapWithConcurrency } from '../services/qdn/qdnReadiness';
import {
  forumSearchIndexService,
  type ThreadSearchSnapshot,
} from '../services/qdn/forumSearchIndexService';
import { loadThreadIndexCached } from '../services/qdn/threadIndexCache';
import {
  buildQortalShareLink,
  copyToClipboard,
} from '../services/qortal/share';
import { getAccountNames } from '../services/qortal/walletService';
import { perfDebugTimeStart } from '../services/perf/perfDebug';
import type { SubTopic, Topic, TopicAccess } from '../types';

const parseAddressInput = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const reorderList = <T,>(items: T[], fromIndex: number, toIndex: number) => {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

const sortSubTopics = (items: SubTopic[]) =>
  [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }

    if (a.isPinned && b.isPinned) {
      const aPinnedAt = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
      const bPinnedAt = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
      if (aPinnedAt !== bPinnedAt) {
        return aPinnedAt - bPinnedAt;
      }
    }

    return new Date(b.lastPostAt).getTime() - new Date(a.lastPostAt).getTime();
  });

const topicAccessOptions: Array<{
  value: TopicAccess;
  label: string;
  helper: string;
}> = [
  {
    value: 'everyone',
    label: 'Everyone',
    helper: 'Any authenticated member can create sub-topics here.',
  },
  {
    value: 'moderators',
    label: 'Moderators+',
    helper: 'Moderators, admins and Super Admins can create sub-topics.',
  },
  {
    value: 'admins',
    label: 'Admins only',
    helper: 'Only admins and Super Admins can create sub-topics.',
  },
  {
    value: 'custom',
    label: 'Specific wallets',
    helper: 'Only listed wallet addresses can create sub-topics.',
  },
];

type HomeProps = {
  searchQuery: string;
};

type DisplayTopic = Topic & {
  subTopicCount: number;
  matchedSubTopics: SubTopic[];
  matchedPostCount: number;
};

const TOPIC_DESCRIPTION_MAX_LENGTH = 250;
const ACTIVE_SUBTOPIC_LIMIT = 8;
const SEARCH_THREAD_INDEX_MAX_CANDIDATES = 18;
const SEARCH_THREAD_INDEX_INITIAL_BATCH_SIZE = 6;
const SEARCH_THREAD_INDEX_BATCH_SIZE = 4;
const SEARCH_THREAD_INDEX_DEBOUNCE_MS = 250;
const ROLE_NAME_BATCH_SIZE = 6;
const roleLabelByType: Record<'SuperAdmin' | 'Admin' | 'Moderator', string> = {
  SuperAdmin: 'Super Admin',
  Admin: 'Admin',
  Moderator: 'Moderator',
};
const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const formatActiveTopicTime = (value: string, nowMs: number) => {
  const parsedMs = new Date(value).getTime();
  if (!Number.isFinite(parsedMs)) {
    return 'Unknown time';
  }

  const elapsedMs = Math.max(0, nowMs - parsedMs);
  if (elapsedMs < MINUTE_IN_MS) {
    return 'just now';
  }

  if (elapsedMs < HOUR_IN_MS) {
    const minutes = Math.floor(elapsedMs / MINUTE_IN_MS);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  if (elapsedMs < DAY_IN_MS) {
    const hours = Math.floor(elapsedMs / HOUR_IN_MS);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(elapsedMs / DAY_IN_MS);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const Home = ({ searchQuery }: HomeProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    currentUser,
    authenticatedAddress,
    roleRegistry,
    maintenanceState,
    users,
    topics,
    subTopics,
    posts,
    threadSearchIndexes,
    isAuthReady,
  } = useForumData();
  const {
    createTopic,
    reorderTopics,
    setMaintenanceMode,
    updateTopicSettings,
    upsertRoleAssignment,
    removeRoleAssignment,
  } = useForumActions();
  const [openCreatePanel, setOpenCreatePanel] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const [topicStatus, setTopicStatus] = useState<'open' | 'locked'>('open');
  const [topicAccess, setTopicAccess] = useState<TopicAccess>('everyone');
  const [topicAllowedAddresses, setTopicAllowedAddresses] = useState('');
  const [topicFeedback, setTopicFeedback] = useState<string | null>(null);
  const [managementFeedback, setManagementFeedback] = useState<string | null>(
    null
  );
  const [managedTopicId, setManagedTopicId] = useState<string | null>(null);
  const [managedTopicTitle, setManagedTopicTitle] = useState('');
  const [managedTopicDescription, setManagedTopicDescription] = useState('');
  const [managedTopicStatus, setManagedTopicStatus] = useState<
    'open' | 'locked'
  >('open');
  const [managedTopicVisibility, setManagedTopicVisibility] = useState<
    'visible' | 'hidden'
  >('visible');
  const [managedTopicAccess, setManagedTopicAccess] =
    useState<TopicAccess>('everyone');
  const [managedTopicAllowedAddresses, setManagedTopicAllowedAddresses] =
    useState('');
  const [roleAddress, setRoleAddress] = useState('');
  const [roleType, setRoleType] = useState<
    'SuperAdmin' | 'Admin' | 'Moderator'
  >('Admin');
  const [roleFeedback, setRoleFeedback] = useState<string | null>(null);
  const [maintenanceFeedback, setMaintenanceFeedback] = useState<string | null>(
    null
  );
  const [maintenanceMessageDraft, setMaintenanceMessageDraft] = useState('');
  const [roleNamesByAddress, setRoleNamesByAddress] = useState<
    Record<string, string>
  >({});
  const [draggedTopicId, setDraggedTopicId] = useState<string | null>(null);
  const [dragOverTopicId, setDragOverTopicId] = useState<string | null>(null);
  const [activeTopicsNowMs, setActiveTopicsNowMs] = useState<number>(() =>
    Date.now()
  );
  const [searchThreadIndexes, setSearchThreadIndexes] = useState<
    Record<string, ThreadSearchSnapshot>
  >({});
  const [searchThreadIndexFailures, setSearchThreadIndexFailures] = useState<
    Record<string, true>
  >({});
  const requestedRoleNameAddressesRef = useRef<Set<string>>(new Set());

  const isAdmin =
    currentUser.role === 'Admin' ||
    currentUser.role === 'SuperAdmin' ||
    currentUser.role === 'SysOp';
  const isSysOp = currentUser.role === 'SysOp';
  const isSuperAdmin = currentUser.role === 'SuperAdmin';
  const canManageRoles =
    currentUser.role === 'SysOp' ||
    currentUser.role === 'SuperAdmin' ||
    currentUser.role === 'Admin';
  const canCreateMainTopics = isAdmin;
  const assignableRoleOptions = useMemo(() => {
    if (isSysOp) {
      return [
        { value: 'SuperAdmin' as const, label: 'Super Admin' },
        { value: 'Admin' as const, label: 'Admin' },
        { value: 'Moderator' as const, label: 'Moderator' },
      ];
    }

    if (isSuperAdmin) {
      return [
        { value: 'Admin' as const, label: 'Admin' },
        { value: 'Moderator' as const, label: 'Moderator' },
      ];
    }

    return [{ value: 'Moderator' as const, label: 'Moderator' }];
  }, [isSuperAdmin, isSysOp]);
  useEffect(() => {
    setMaintenanceMessageDraft(maintenanceState.message);
  }, [maintenanceState.message]);
  const canModerate = currentUser.role !== 'Member';
  const normalizedSearchQuery = searchQuery.trim();
  const hasActiveSearch = normalizedSearchQuery.length > 0;
  const canReorderTopicsByDrag =
    (isSysOp || isSuperAdmin || currentUser.role === 'Admin') &&
    !hasActiveSearch;
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedDeferredSearchQuery = deferredSearchQuery.trim();
  const hasDeferredActiveSearch = normalizedDeferredSearchQuery.length > 0;
  const requestedSearchThreadIndexesRef = useRef<Set<string>>(new Set());

  const topicQueryParam = searchParams.get('topic');
  useEffect(() => {
    if (!topicQueryParam) {
      return;
    }

    const topicExists = topics.some((topic) => topic.id === topicQueryParam);
    if (!topicExists) {
      return;
    }

    navigate(`/topic/${topicQueryParam}`, { replace: true });
  }, [navigate, topicQueryParam, topics]);

  const visibleTopics = useMemo(
    () =>
      [...topics]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter((topic) => canModerate || topic.visibility !== 'hidden'),
    [canModerate, topics]
  );
  const visibleSubTopics = useMemo(
    () =>
      subTopics.filter(
        (subTopic) =>
          (canModerate || subTopic.visibility !== 'hidden') &&
          (canModerate ||
            canAccessSubTopic(subTopic, currentUser, authenticatedAddress))
      ),
    [authenticatedAddress, canModerate, currentUser, subTopics]
  );
  const subTopicsByTopicId = useMemo(() => {
    const grouped = new Map<string, SubTopic[]>();

    visibleSubTopics.forEach((subTopic) => {
      const current = grouped.get(subTopic.topicId) ?? [];
      current.push(subTopic);
      grouped.set(subTopic.topicId, current);
    });

    grouped.forEach((items, topicId) => {
      grouped.set(topicId, sortSubTopics(items));
    });

    return grouped;
  }, [visibleSubTopics]);

  const searchableThreadIndexes = useMemo(
    () => ({
      ...searchThreadIndexes,
      ...threadSearchIndexes,
    }),
    [searchThreadIndexes, threadSearchIndexes]
  );

  const structureTopics = useMemo(
    () =>
      visibleTopics.map((topic) => ({
        ...topic,
        subTopics: subTopicsByTopicId.get(topic.id) ?? [],
      })),
    [subTopicsByTopicId, visibleTopics]
  );
  const structureSearchIndex = useMemo(
    () =>
      buildForumStructureSearchIndex(visibleTopics, visibleSubTopics, users),
    [users, visibleSubTopics, visibleTopics]
  );
  const structureSearchResult = useMemo(
    () =>
      searchForumStructure(structureSearchIndex, structureTopics, searchQuery),
    [searchQuery, structureSearchIndex, structureTopics]
  );
  const searchThreadIndexCandidateIds = useMemo(() => {
    if (!hasDeferredActiveSearch) {
      return [];
    }

    const prioritizedIds: string[] = [];
    const seen = new Set<string>();
    const pushSubTopicId = (subTopicId: string) => {
      const normalizedId = subTopicId.trim();
      if (!normalizedId || seen.has(normalizedId)) {
        return;
      }

      seen.add(normalizedId);
      prioritizedIds.push(normalizedId);
    };

    const structureMatchedTopicIds = new Set(
      structureSearchResult.topics.map((topic) => topic.id)
    );

    visibleSubTopics
      .filter((subTopic) => structureMatchedTopicIds.has(subTopic.topicId))
      .forEach((subTopic) => {
        pushSubTopicId(subTopic.id);
      });

    sortSubTopics(visibleSubTopics).forEach((subTopic) => {
      pushSubTopicId(subTopic.id);
    });

    return prioritizedIds.slice(0, SEARCH_THREAD_INDEX_MAX_CANDIDATES);
  }, [hasDeferredActiveSearch, structureSearchResult.topics, visibleSubTopics]);

  useEffect(() => {
    if (
      !hasDeferredActiveSearch ||
      searchThreadIndexCandidateIds.length === 0
    ) {
      return;
    }

    const missingSubTopicIds = searchThreadIndexCandidateIds.filter(
      (subTopicId) =>
        !isThreadQuarantined(subTopicId) &&
        !searchableThreadIndexes[subTopicId] &&
        !searchThreadIndexFailures[subTopicId] &&
        !requestedSearchThreadIndexesRef.current.has(subTopicId)
    );

    if (missingSubTopicIds.length === 0) {
      return;
    }

    let active = true;
    missingSubTopicIds.forEach((subTopicId) => {
      requestedSearchThreadIndexesRef.current.add(subTopicId);
    });

    const maybeWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const loadBatch = async (subTopicIds: string[]) => {
      const resolved = await mapWithConcurrency(
        subTopicIds,
        async (subTopicId) => {
          try {
            const snapshot = await loadThreadIndexCached(
              subTopicId,
              forumSearchIndexService.loadThreadIndex
            );
            return [subTopicId, snapshot] as const;
          } catch {
            return [subTopicId, null] as const;
          }
        },
        2
      );

      if (!active) {
        return;
      }

      const nextIndexes: Record<string, ThreadSearchSnapshot> = {};
      const failedSubTopicIds: string[] = [];

      resolved.forEach(([subTopicId, snapshot]) => {
        if (!snapshot) {
          failedSubTopicIds.push(subTopicId);
          return;
        }

        nextIndexes[subTopicId] = snapshot;
      });

      if (Object.keys(nextIndexes).length > 0) {
        setSearchThreadIndexes((current) => ({
          ...current,
          ...nextIndexes,
        }));
      }

      if (failedSubTopicIds.length > 0) {
        setSearchThreadIndexFailures((current) => ({
          ...current,
          ...Object.fromEntries(failedSubTopicIds.map((id) => [id, true])),
        }));
      }
    };

    const loadMissingThreadIndexes = async () => {
      const endTiming = perfDebugTimeStart('home-search-thread-index-load', {
        queryLength: normalizedDeferredSearchQuery.length,
        candidateCount: searchThreadIndexCandidateIds.length,
        subTopicCount: missingSubTopicIds.length,
      });
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, SEARCH_THREAD_INDEX_DEBOUNCE_MS);
      });

      if (!active) {
        return;
      }

      await loadBatch(
        missingSubTopicIds.slice(0, SEARCH_THREAD_INDEX_INITIAL_BATCH_SIZE)
      );

      for (
        let startIndex = SEARCH_THREAD_INDEX_INITIAL_BATCH_SIZE;
        startIndex < missingSubTopicIds.length && active;
        startIndex += SEARCH_THREAD_INDEX_BATCH_SIZE
      ) {
        await new Promise<void>((resolve) => {
          if (typeof maybeWindow.requestIdleCallback === 'function') {
            maybeWindow.requestIdleCallback(() => resolve(), { timeout: 1500 });
            return;
          }

          window.setTimeout(resolve, 150);
        });

        if (!active) {
          return;
        }

        await loadBatch(
          missingSubTopicIds.slice(
            startIndex,
            startIndex + SEARCH_THREAD_INDEX_BATCH_SIZE
          )
        );
      }

      endTiming({
        queryLength: normalizedDeferredSearchQuery.length,
        loadedSubTopicCount: missingSubTopicIds.length,
      });
    };

    void loadMissingThreadIndexes();

    return () => {
      active = false;
    };
  }, [
    hasDeferredActiveSearch,
    normalizedDeferredSearchQuery.length,
    searchThreadIndexCandidateIds,
    searchableThreadIndexes,
    searchThreadIndexFailures,
  ]);

  const postMatchCountBySubTopicId = useMemo(() => {
    if (!hasActiveSearch) {
      return {} as Record<string, number>;
    }

    const tokens = tokenizeSearchQuery(searchQuery);
    if (tokens.length === 0) {
      return {} as Record<string, number>;
    }

    const userMap = new Map(users.map((user) => [user.id, user.displayName]));
    const matches = (content: string, authorUserId: string) => {
      const haystack = createSearchHaystack([
        content,
        userMap.get(authorUserId) ?? authorUserId,
        authorUserId,
      ]);
      return tokens.every((token) => haystack.includes(token));
    };

    const counts: Record<string, number> = {};
    const seenPostIds = new Set<string>();

    posts.forEach((post) => {
      if (!matches(post.content, post.authorUserId)) {
        return;
      }

      counts[post.subTopicId] = (counts[post.subTopicId] ?? 0) + 1;
      seenPostIds.add(post.id);
    });

    Object.entries(searchableThreadIndexes).forEach(
      ([subTopicId, snapshot]) => {
        snapshot.posts.forEach((post) => {
          if (seenPostIds.has(post.postId)) {
            return;
          }

          if (!matches(post.content, post.authorUserId)) {
            return;
          }

          counts[subTopicId] = (counts[subTopicId] ?? 0) + 1;
          seenPostIds.add(post.postId);
        });
      }
    );

    return counts;
  }, [hasActiveSearch, posts, searchQuery, searchableThreadIndexes, users]);

  const filteredTopics = useMemo<DisplayTopic[]>(() => {
    if (!hasActiveSearch) {
      return visibleTopics.map((topic) => ({
        ...topic,
        subTopicCount: subTopicsByTopicId.get(topic.id)?.length ?? 0,
        matchedSubTopics: [],
        matchedPostCount: 0,
      }));
    }

    const structureTopicMap = new Map(
      structureSearchResult.topics.map((topic) => [topic.id, topic])
    );
    const postMatchedSubTopicIds = new Set(
      Object.entries(postMatchCountBySubTopicId)
        .filter(([, count]) => count > 0)
        .map(([subTopicId]) => subTopicId)
    );
    const postMatchedTopicIds = new Set(
      visibleSubTopics
        .filter((subTopic) => postMatchedSubTopicIds.has(subTopic.id))
        .map((subTopic) => subTopic.topicId)
    );
    const topicIdsToInclude = new Set([
      ...structureTopicMap.keys(),
      ...postMatchedTopicIds,
    ]);

    return visibleTopics
      .filter((topic) => topicIdsToInclude.has(topic.id))
      .map((topic) => {
        const allTopicSubTopics = subTopicsByTopicId.get(topic.id) ?? [];
        const structureMatchedSubTopics =
          structureTopicMap.get(topic.id)?.subTopics ?? [];
        const matchedSubTopicsById = new Map(
          structureMatchedSubTopics.map((subTopic) => [subTopic.id, subTopic])
        );

        allTopicSubTopics.forEach((subTopic) => {
          if (!postMatchedSubTopicIds.has(subTopic.id)) {
            return;
          }
          matchedSubTopicsById.set(subTopic.id, subTopic);
        });

        const matchedSubTopics = sortSubTopics([
          ...matchedSubTopicsById.values(),
        ]);
        const matchedPostCount = matchedSubTopics.reduce(
          (count, subTopic) =>
            count + (postMatchCountBySubTopicId[subTopic.id] ?? 0),
          0
        );

        return {
          ...topic,
          subTopicCount: allTopicSubTopics.length,
          matchedSubTopics,
          matchedPostCount,
        };
      });
  }, [
    hasActiveSearch,
    postMatchCountBySubTopicId,
    structureSearchResult.topics,
    subTopicsByTopicId,
    visibleSubTopics,
    visibleTopics,
  ]);
  const matchedSubTopicCount = useMemo(
    () =>
      filteredTopics.reduce(
        (count, topic) => count + topic.matchedSubTopics.length,
        0
      ),
    [filteredTopics]
  );
  const matchedPostCount = useMemo(
    () =>
      filteredTopics.reduce(
        (count, topic) => count + topic.matchedPostCount,
        0
      ),
    [filteredTopics]
  );

  const activeSubTopics = useMemo(() => {
    const userMap = new Map(users.map((user) => [user.id, user.displayName]));
    const latestBySubTopicId = new Map<
      string,
      { authorUserId: string; createdAt: string }
    >();

    const trackLatest = (
      subTopicId: string,
      authorUserId: string,
      createdAt: string
    ) => {
      const nextMs = new Date(createdAt).getTime();
      if (!Number.isFinite(nextMs)) {
        return;
      }

      const current = latestBySubTopicId.get(subTopicId);
      const currentMs = current ? new Date(current.createdAt).getTime() : -1;
      if (!current || nextMs >= currentMs) {
        latestBySubTopicId.set(subTopicId, { authorUserId, createdAt });
      }
    };

    posts.forEach((post) => {
      trackLatest(post.subTopicId, post.authorUserId, post.createdAt);
    });
    Object.entries(threadSearchIndexes).forEach(([subTopicId, snapshot]) => {
      snapshot.posts.forEach((post) => {
        trackLatest(subTopicId, post.authorUserId, post.createdAt);
      });
    });

    return [...subTopics]
      .filter((subTopic) => canModerate || subTopic.visibility !== 'hidden')
      .filter(
        (subTopic) =>
          canModerate ||
          canAccessSubTopic(subTopic, currentUser, authenticatedAddress)
      )
      .sort(
        (a, b) =>
          new Date(b.lastPostAt).getTime() - new Date(a.lastPostAt).getTime()
      )
      .slice(0, ACTIVE_SUBTOPIC_LIMIT)
      .map((subTopic) => ({
        ...subTopic,
        lastPostAuthorName:
          userMap.get(
            latestBySubTopicId.get(subTopic.id)?.authorUserId ??
              subTopic.authorUserId
          ) ??
          latestBySubTopicId.get(subTopic.id)?.authorUserId ??
          subTopic.authorUserId ??
          'Unknown User',
        activeTimeLabel: formatActiveTopicTime(
          latestBySubTopicId.get(subTopic.id)?.createdAt ?? subTopic.lastPostAt,
          activeTopicsNowMs
        ),
      }));
  }, [
    activeTopicsNowMs,
    authenticatedAddress,
    canModerate,
    currentUser,
    posts,
    subTopics,
    threadSearchIndexes,
    users,
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveTopicsNowMs(Date.now());
    }, MINUTE_IN_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const addresses = [
      roleRegistry.primarySysOpAddress,
      ...roleRegistry.sysOps,
      ...roleRegistry.admins,
      ...roleRegistry.moderators,
    ].filter(Boolean);
    const uniqueAddresses = [...new Set(addresses)];

    if (uniqueAddresses.length === 0) {
      setRoleNamesByAddress({});
      return () => {
        active = false;
      };
    }

    const missingAddresses = uniqueAddresses.filter(
      (address) =>
        !roleNamesByAddress[address] &&
        !requestedRoleNameAddressesRef.current.has(address)
    );

    if (missingAddresses.length === 0) {
      return () => {
        active = false;
      };
    }

    missingAddresses.forEach((address) => {
      requestedRoleNameAddressesRef.current.add(address);
    });

    const maybeWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const resolveRoleNameBatch = async (batch: string[]) => {
      const resolvedEntries = await Promise.all(
        batch.map(async (address) => {
          try {
            const names = await getAccountNames(address);
            const primaryName = names.find((entry) => entry.trim())?.trim();
            return [address, primaryName ?? ''] as const;
          } catch {
            return [address, ''] as const;
          }
        })
      );

      if (!active) {
        return;
      }

      const nextResolved = Object.fromEntries(
        resolvedEntries.filter((entry) => Boolean(entry[1].trim()))
      );
      if (Object.keys(nextResolved).length === 0) {
        return;
      }

      setRoleNamesByAddress((current) => ({
        ...current,
        ...nextResolved,
      }));
    };

    const resolveRoleNames = async () => {
      await new Promise<void>((resolve) => {
        if (typeof maybeWindow.requestIdleCallback === 'function') {
          maybeWindow.requestIdleCallback(() => resolve(), { timeout: 1200 });
          return;
        }

        window.setTimeout(resolve, 120);
      });

      if (!active) {
        return;
      }

      for (
        let startIndex = 0;
        startIndex < missingAddresses.length && active;
        startIndex += ROLE_NAME_BATCH_SIZE
      ) {
        await resolveRoleNameBatch(
          missingAddresses.slice(startIndex, startIndex + ROLE_NAME_BATCH_SIZE)
        );

        if (
          !active ||
          startIndex + ROLE_NAME_BATCH_SIZE >= missingAddresses.length
        ) {
          continue;
        }

        await new Promise<void>((resolve) => {
          if (typeof maybeWindow.requestIdleCallback === 'function') {
            maybeWindow.requestIdleCallback(() => resolve(), { timeout: 1200 });
            return;
          }

          window.setTimeout(resolve, 120);
        });
      }
    };

    void resolveRoleNames();

    return () => {
      active = false;
    };
  }, [roleNamesByAddress, roleRegistry]);

  const renderRoleIdentity = (address: string) => {
    const displayName = roleNamesByAddress[address];

    return (
      <span className="min-w-0">
        <span className="text-ui-strong block truncate text-sm font-semibold">
          {displayName || address}
        </span>
        {displayName ? (
          <span className="text-ui-muted block truncate text-[11px]">
            {address}
          </span>
        ) : null}
      </span>
    );
  };

  const handleOpenTopic = (topicId: string) => {
    navigate(`/topic/${topicId}`);
  };

  const handleTopicDragStart = (topicId: string) => {
    if (!canReorderTopicsByDrag) {
      return;
    }

    setDraggedTopicId(topicId);
    setDragOverTopicId(topicId);
  };

  const handleTopicDragOver = (
    event: DragEvent<HTMLDivElement>,
    topicId: string
  ) => {
    if (!canReorderTopicsByDrag) {
      return;
    }

    event.preventDefault();
    setDragOverTopicId(topicId);
  };

  const handleTopicDragEnd = () => {
    setDraggedTopicId(null);
    setDragOverTopicId(null);
  };

  const handleTopicDrop = async (targetTopicId: string) => {
    if (!canReorderTopicsByDrag || !draggedTopicId) {
      handleTopicDragEnd();
      return;
    }

    if (draggedTopicId === targetTopicId) {
      handleTopicDragEnd();
      return;
    }

    const fromIndex = filteredTopics.findIndex(
      (topic) => topic.id === draggedTopicId
    );
    const toIndex = filteredTopics.findIndex(
      (topic) => topic.id === targetTopicId
    );
    if (fromIndex < 0 || toIndex < 0) {
      handleTopicDragEnd();
      return;
    }

    const reorderedTopics = reorderList(filteredTopics, fromIndex, toIndex);
    const result = await reorderTopics(
      reorderedTopics.map((topic) => topic.id)
    );

    setManagementFeedback(
      result.ok
        ? 'Main topic order updated.'
        : (result.error ?? 'Unable to reorder main topics.')
    );
    handleTopicDragEnd();
  };

  const handleOpenThread = (subTopicId: string) => {
    navigate(`/thread/${subTopicId}`);
  };

  const handleShareTopic = async (topic: Topic) => {
    const shareUrl = buildQortalShareLink(`/topic/${topic.id}`);

    try {
      await copyToClipboard(shareUrl);
      setManagementFeedback('Main topic link copied to clipboard.');
      window.setTimeout(() => {
        setManagementFeedback((current) =>
          current === 'Main topic link copied to clipboard.' ? null : current
        );
      }, 2400);
    } catch {
      setManagementFeedback('Unable to copy main topic link to clipboard.');
    }
  };

  const handleCreateTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = await createTopic({
      title: topicTitle,
      description: topicDescription,
      status: topicStatus,
      subTopicAccess: topicAccess,
      allowedAddresses: parseAddressInput(topicAllowedAddresses),
    });

    if (!result.ok) {
      setTopicFeedback(result.error ?? 'Unable to create main topic.');
      return;
    }

    setTopicTitle('');
    setTopicDescription('');
    setTopicStatus('open');
    setTopicAccess('everyone');
    setTopicAllowedAddresses('');
    setTopicFeedback('Main topic created successfully.');
  };

  const handleOpenTopicManager = (topic: Topic) => {
    setManagedTopicId((current) => (current === topic.id ? null : topic.id));
    setManagedTopicTitle(topic.title);
    setManagedTopicDescription(topic.description);
    setManagedTopicStatus(topic.status);
    setManagedTopicVisibility(topic.visibility);
    setManagedTopicAccess(topic.subTopicAccess);
    setManagedTopicAllowedAddresses(topic.allowedAddresses.join(', '));
    setManagementFeedback(null);
  };

  const handleSaveTopicManager = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!managedTopicId) {
      return;
    }

    const result = await updateTopicSettings({
      topicId: managedTopicId,
      title: managedTopicTitle,
      description: managedTopicDescription,
      status: managedTopicStatus,
      visibility: managedTopicVisibility,
      subTopicAccess: managedTopicAccess,
      allowedAddresses: parseAddressInput(managedTopicAllowedAddresses),
    });

    setManagementFeedback(
      result.ok
        ? 'Main topic settings updated.'
        : (result.error ?? 'Unable to update main topic.')
    );
  };

  const handleUpsertRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = await upsertRoleAssignment({
      address: roleAddress,
      role: roleType,
    });

    if (!result.ok) {
      setRoleFeedback(result.error ?? 'Unable to update forum role.');
      return;
    }

    setRoleAddress('');
    setRoleFeedback(`${roleLabelByType[roleType]} role updated successfully.`);
  };

  const handleRemoveRole = async (address: string) => {
    const result = await removeRoleAssignment(address);
    setRoleFeedback(
      result.ok
        ? 'Role removed successfully.'
        : (result.error ?? 'Unable to remove forum role.')
    );
  };

  const handleToggleMaintenanceMode = async () => {
    const nextEnabled = !maintenanceState.enabled;
    const result = await setMaintenanceMode({
      enabled: nextEnabled,
      message: maintenanceMessageDraft,
    });

    setMaintenanceFeedback(
      result.ok
        ? nextEnabled
          ? 'Maintenance mode enabled.'
          : 'Maintenance mode disabled.'
        : (result.error ?? 'Unable to update maintenance mode.')
    );
  };

  useEffect(() => {
    if (assignableRoleOptions.some((option) => option.value === roleType)) {
      return;
    }

    setRoleType(assignableRoleOptions[0]?.value ?? 'Moderator');
  }, [assignableRoleOptions, roleType]);

  if (!isAuthReady && topics.length === 0 && subTopics.length === 0) {
    return (
      <div className="space-y-4">
        <div className="forum-card p-5">
          <p className="text-ui-muted text-sm">Loading forum structure...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="forum-card-accent p-5">
        <h2 className="text-brand-accent text-base font-semibold">
          Active Topics
        </h2>
        {activeSubTopics.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {activeSubTopics.map((subTopic) => (
              <li key={subTopic.id}>
                <button
                  type="button"
                  onClick={() => handleOpenThread(subTopic.id)}
                  className="forum-pill-accent w-full rounded-lg px-3 py-2 text-left transition hover:border-cyan-200 hover:bg-cyan-50/80"
                >
                  <p className="text-ui-strong text-sm font-semibold">
                    {subTopic.isPinned ? (
                      <span className="mr-2 inline-flex rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 align-middle">
                        Pinned
                      </span>
                    ) : null}
                    {subTopic.status === 'locked' ? (
                      <span className="mr-2 inline-flex rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 align-middle">
                        Locked
                      </span>
                    ) : null}
                    {subTopic.isSolved ? (
                      <span className="mr-2 inline-flex rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 align-middle">
                        Solved
                      </span>
                    ) : null}
                    {subTopic.title}
                  </p>
                  <p className="text-ui-muted text-xs">
                    Last post by {subTopic.lastPostAuthorName} •{' '}
                    {subTopic.activeTimeLabel}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ui-muted mt-3 text-sm">
            No active sub-topics available yet.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-brand-primary text-lg font-semibold">
          Main Topics
        </h2>
        {hasActiveSearch ? (
          <p className="text-ui-muted text-sm">
            Search results: {filteredTopics.length} main topics,{' '}
            {matchedSubTopicCount} sub-topics, {matchedPostCount} posts.
          </p>
        ) : canReorderTopicsByDrag ? (
          <p className="text-ui-muted text-sm">
            Drag main topics to change their persistent display order.
          </p>
        ) : null}
        {managementFeedback ? (
          <p
            className={
              managementFeedback.toLowerCase().includes('copied')
                ? 'fixed right-4 top-24 z-50 inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-lg'
                : 'text-ui-muted text-sm'
            }
          >
            {managementFeedback}
          </p>
        ) : null}
      </section>

      <div className="space-y-4">
        {filteredTopics.map((topic) => (
          <div
            key={topic.id}
            className={[
              'space-y-2 rounded-lg',
              canReorderTopicsByDrag && dragOverTopicId === topic.id
                ? 'ring-2 ring-cyan-300 ring-offset-1 ring-offset-slate-50'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            draggable={canReorderTopicsByDrag}
            onDragStart={() => handleTopicDragStart(topic.id)}
            onDragOver={(event) => handleTopicDragOver(event, topic.id)}
            onDrop={() => void handleTopicDrop(topic.id)}
            onDragEnd={handleTopicDragEnd}
          >
            <article className="forum-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={() => handleOpenTopic(topic.id)}
                  className="forum-row-button min-w-0 flex-1 text-left"
                >
                  <h3 className="text-ui-strong text-lg font-semibold">
                    {topic.title}
                  </h3>
                  <p className="text-ui-muted mt-1 text-sm">
                    {topic.description}
                  </p>
                  <p className="text-ui-muted mt-2 text-xs">
                    {topic.subTopicCount} sub-topics
                  </p>
                  {hasActiveSearch ? (
                    <p className="text-ui-muted mt-1 text-xs">
                      {topic.matchedSubTopics.length} matching sub-topics •{' '}
                      {topic.matchedPostCount} matching posts
                    </p>
                  ) : null}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleShareTopic(topic)}
                    className="bg-surface-card text-ui-strong rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold"
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenTopic(topic.id)}
                    className="bg-brand-primary-solid rounded-md px-2 py-1 text-xs font-semibold text-white"
                  >
                    Open
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => handleOpenTopicManager(topic)}
                      className="bg-surface-card text-ui-strong rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold"
                    >
                      Manage
                    </button>
                  ) : null}
                </div>
              </div>

              {hasActiveSearch && topic.matchedSubTopics.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-ui-muted text-xs font-semibold">
                    Matching Sub-Topics
                  </p>
                  <ul className="space-y-2">
                    {topic.matchedSubTopics.map((subTopic) => (
                      <li key={subTopic.id}>
                        <button
                          type="button"
                          onClick={() => handleOpenThread(subTopic.id)}
                          className="forum-pill-accent w-full rounded-lg px-3 py-2 text-left transition hover:border-cyan-200 hover:bg-cyan-50/80"
                        >
                          <p className="text-ui-strong text-sm font-semibold">
                            {subTopic.title}
                          </p>
                          <p className="text-ui-muted text-xs">
                            {subTopic.description}
                          </p>
                          {(postMatchCountBySubTopicId[subTopic.id] ?? 0) >
                          0 ? (
                            <p className="text-ui-muted mt-1 text-[11px] font-semibold">
                              {postMatchCountBySubTopicId[subTopic.id]} matching
                              post
                              {postMatchCountBySubTopicId[subTopic.id] === 1
                                ? ''
                                : 's'}
                            </p>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>

            {managedTopicId === topic.id ? (
              <form
                className="forum-card p-4 space-y-2"
                onSubmit={handleSaveTopicManager}
              >
                <h3 className="text-ui-strong text-sm font-semibold">
                  Manage Main Topic
                </h3>
                <input
                  value={managedTopicTitle}
                  onChange={(event) => setManagedTopicTitle(event.target.value)}
                  placeholder="Main topic title"
                  className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <textarea
                  value={managedTopicDescription}
                  onChange={(event) =>
                    setManagedTopicDescription(event.target.value)
                  }
                  placeholder="Main topic description"
                  maxLength={TOPIC_DESCRIPTION_MAX_LENGTH}
                  className="bg-surface-card text-ui-strong min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <p className="text-ui-muted text-xs">
                  {managedTopicDescription.length}/
                  {TOPIC_DESCRIPTION_MAX_LENGTH}
                </p>
                <select
                  value={managedTopicStatus}
                  onChange={(event) =>
                    setManagedTopicStatus(
                      event.target.value as 'open' | 'locked'
                    )
                  }
                  className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="open">Open</option>
                  <option value="locked">Locked</option>
                </select>
                <select
                  value={managedTopicVisibility}
                  onChange={(event) =>
                    setManagedTopicVisibility(
                      event.target.value as 'visible' | 'hidden'
                    )
                  }
                  className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="visible">Visible</option>
                  <option value="hidden">Hidden</option>
                </select>
                <select
                  value={managedTopicAccess}
                  onChange={(event) =>
                    setManagedTopicAccess(event.target.value as TopicAccess)
                  }
                  className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  {topicAccessOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {managedTopicAccess === 'custom' ? (
                  <textarea
                    value={managedTopicAllowedAddresses}
                    onChange={(event) =>
                      setManagedTopicAllowedAddresses(event.target.value)
                    }
                    placeholder="Comma-separated wallet addresses"
                    className="bg-surface-card text-ui-strong min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="bg-brand-primary-solid rounded-md px-3 py-2 text-xs font-semibold text-white"
                  >
                    Save Topic Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => setManagedTopicId(null)}
                    className="bg-surface-card text-ui-muted rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ))}
        {filteredTopics.length === 0 ? (
          <div className="forum-card p-5">
            <p className="text-ui-strong text-sm font-semibold">
              {hasActiveSearch
                ? 'No matching results found'
                : 'No main topics found'}
            </p>
            <p className="text-ui-muted mt-1 text-sm">
              {hasActiveSearch
                ? 'Try a different search query.'
                : 'Create the first main topic to start forum structure.'}
            </p>
          </div>
        ) : null}
      </div>

      {canManageRoles ? (
        <section className="space-y-3">
          <h2 className="text-brand-primary text-lg font-semibold">
            Forum Roles
          </h2>

          <article className="forum-card-primary p-4">
            <div className="space-y-1">
              <p className="text-ui-strong text-sm font-semibold">
                Primary SysOp
              </p>
              {renderRoleIdentity(roleRegistry.primarySysOpAddress)}
              <p className="text-ui-muted text-xs break-all">
                Authenticated as: {authenticatedAddress ?? 'No wallet detected'}
              </p>
            </div>

            <form className="mt-4 space-y-2" onSubmit={handleUpsertRole}>
              <input
                value={roleAddress}
                onChange={(event) => setRoleAddress(event.target.value)}
                placeholder="Wallet address"
                className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={roleType}
                onChange={(event) =>
                  setRoleType(
                    event.target.value as 'SuperAdmin' | 'Admin' | 'Moderator'
                  )
                }
                className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                {assignableRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="bg-brand-primary-solid rounded-md px-3 py-2 text-xs font-semibold text-slate-900"
              >
                Save Role
              </button>
            </form>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <h3 className="text-ui-strong text-sm font-semibold">
                  Super Admins
                </h3>
                <ul className="mt-2 space-y-2">
                  {roleRegistry.sysOps.map((address) => (
                    <li
                      key={address}
                      className="bg-surface-card border-brand-primary flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      {renderRoleIdentity(address)}
                      {isSysOp ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveRole(address)}
                          className="text-brand-accent-strong text-xs font-semibold"
                        >
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-ui-strong text-sm font-semibold">Admins</h3>
                <ul className="mt-2 space-y-2">
                  {roleRegistry.admins.map((address) => (
                    <li
                      key={address}
                      className="bg-surface-card border-brand-primary flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      {renderRoleIdentity(address)}
                      <button
                        type="button"
                        onClick={() => handleRemoveRole(address)}
                        disabled={currentUser.role === 'Admin'}
                        className="text-brand-accent-strong text-xs font-semibold"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-ui-strong text-sm font-semibold">
                  Moderators
                </h3>
                <ul className="mt-2 space-y-2">
                  {roleRegistry.moderators.map((address) => (
                    <li
                      key={address}
                      className="bg-surface-card border-brand-primary flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      {renderRoleIdentity(address)}
                      <button
                        type="button"
                        onClick={() => handleRemoveRole(address)}
                        className="text-brand-accent-strong text-xs font-semibold"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {roleFeedback ? (
              <p className="text-ui-muted mt-3 text-xs">{roleFeedback}</p>
            ) : null}
          </article>
        </section>
      ) : null}

      {isSysOp ? (
        <section className="space-y-3">
          <h2 className="text-brand-primary text-lg font-semibold">
            Maintenance
          </h2>

          <article className="forum-card-primary p-4">
            <p className="text-ui-strong text-sm font-semibold">
              Public access
            </p>
            <p className="text-ui-muted mt-1 text-xs">
              {maintenanceState.enabled
                ? 'Maintenance mode is enabled for non-SysOp users.'
                : 'Forum is currently open for all users.'}
            </p>

            <textarea
              value={maintenanceMessageDraft}
              onChange={(event) =>
                setMaintenanceMessageDraft(event.target.value)
              }
              placeholder="Maintenance message shown to public users"
              className="bg-surface-card text-ui-strong mt-4 min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleToggleMaintenanceMode}
                className="bg-brand-primary-solid rounded-md px-3 py-2 text-xs font-semibold text-slate-900"
              >
                {maintenanceState.enabled
                  ? 'Disable Maintenance'
                  : 'Enable Maintenance'}
              </button>
            </div>

            {maintenanceFeedback ? (
              <p className="text-ui-muted mt-3 text-xs">
                {maintenanceFeedback}
              </p>
            ) : null}
          </article>
        </section>
      ) : null}

      {canCreateMainTopics ? (
        <section className="space-y-3 pt-2">
          <h2 className="text-brand-primary text-lg font-semibold">
            Create Content
          </h2>

          <article className="forum-card-primary overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenCreatePanel((current) => !current)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <h3 className="text-brand-primary text-sm font-semibold">
                  Create Main Topic
                </h3>
                <p className="text-ui-muted mt-0.5 text-xs">
                  Admin only main-topic creation.
                </p>
              </div>
              <span className="text-ui-muted text-xs font-semibold">
                {openCreatePanel ? 'Close' : 'Open'}
              </span>
            </button>

            {openCreatePanel ? (
              <div className="border-brand-primary bg-brand-primary-soft border-t px-4 py-4">
                <form className="space-y-2" onSubmit={handleCreateTopic}>
                  <input
                    value={topicTitle}
                    onChange={(event) => setTopicTitle(event.target.value)}
                    placeholder="Topic title"
                    className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                  <textarea
                    value={topicDescription}
                    onChange={(event) =>
                      setTopicDescription(event.target.value)
                    }
                    placeholder="Topic description"
                    maxLength={TOPIC_DESCRIPTION_MAX_LENGTH}
                    className="bg-surface-card text-ui-strong min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                  <p className="text-ui-muted text-xs">
                    {topicDescription.length}/{TOPIC_DESCRIPTION_MAX_LENGTH}
                  </p>
                  <select
                    value={topicStatus}
                    onChange={(event) =>
                      setTopicStatus(event.target.value as 'open' | 'locked')
                    }
                    className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="open">Open main topic</option>
                    <option value="locked">Locked main topic</option>
                  </select>
                  <select
                    value={topicAccess}
                    onChange={(event) =>
                      setTopicAccess(event.target.value as TopicAccess)
                    }
                    className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    {topicAccessOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-ui-muted text-xs">
                    {
                      topicAccessOptions.find(
                        (option) => option.value === topicAccess
                      )?.helper
                    }
                  </p>
                  {topicAccess === 'custom' ? (
                    <textarea
                      value={topicAllowedAddresses}
                      onChange={(event) =>
                        setTopicAllowedAddresses(event.target.value)
                      }
                      placeholder="Comma-separated wallet addresses"
                      className="bg-surface-card text-ui-strong min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    />
                  ) : null}
                  <button
                    type="submit"
                    className="bg-brand-primary-solid rounded-md px-3 py-2 text-xs font-semibold text-white"
                  >
                    Create Topic
                  </button>
                </form>

                {topicFeedback ? (
                  <p className="text-ui-muted mt-2 text-xs">{topicFeedback}</p>
                ) : null}
              </div>
            ) : null}
          </article>
        </section>
      ) : null}
    </div>
  );
};

export default Home;
