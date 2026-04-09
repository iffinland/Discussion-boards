import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import TopicAccordion from '../components/forum/TopicAccordion';
import HomeSkeleton from '../features/forum/components/HomeSkeleton';
import { useForumData } from '../hooks/useForumData';
import {
  canAccessSubTopic,
  resolveAccessLabel,
} from '../services/forum/forumAccess';
import {
  buildForumStructureSearchIndex,
  createSearchHaystack,
  searchForumStructure,
  tokenizeSearchQuery,
} from '../services/forum/forumSearch';
import {
  buildQortalShareLink,
  copyToClipboard,
} from '../services/qortal/share';
import { getAccountNames } from '../services/qortal/walletService';
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

const ACTIVE_SUBTOPIC_LIMIT = 6;
const TOPIC_DESCRIPTION_MAX_LENGTH = 250;

const sortSubTopics = (items: SubTopic[]) => {
  return [...items].sort((a, b) => {
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
};

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
    helper: 'Moderators, admins and SysOps can create sub-topics.',
  },
  {
    value: 'admins',
    label: 'Admins only',
    helper: 'Only admins and SysOps can create sub-topics.',
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

const Home = ({ searchQuery }: HomeProps) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    currentUser,
    authenticatedAddress,
    roleRegistry,
    users,
    topicDirectoryIndex,
    topics,
    subTopics,
    createTopic,
    reorderTopics,
    createSubTopic,
    updateTopicSettings,
    updateSubTopicSettings,
    upsertRoleAssignment,
    removeRoleAssignment,
    isAuthReady,
  } = useForumData();

  const [openTopicId, setOpenTopicId] = useState<string | null>(null);

  const [topicTitle, setTopicTitle] = useState('');
  const [topicDescription, setTopicDescription] = useState('');
  const [topicStatus, setTopicStatus] = useState<'open' | 'locked'>('open');
  const [topicAccess, setTopicAccess] = useState<TopicAccess>('everyone');
  const [topicAllowedAddresses, setTopicAllowedAddresses] = useState('');
  const [topicFeedback, setTopicFeedback] = useState<string | null>(null);
  const [openCreatePanel, setOpenCreatePanel] = useState<'main' | 'sub' | null>(
    null
  );

  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [subTopicTitle, setSubTopicTitle] = useState('');
  const [subTopicDescription, setSubTopicDescription] = useState('');
  const [subTopicAccess, setSubTopicAccess] = useState<TopicAccess>('everyone');
  const [subTopicAllowedAddresses, setSubTopicAllowedAddresses] = useState('');
  const [subTopicFeedback, setSubTopicFeedback] = useState<string | null>(null);
  const [roleAddress, setRoleAddress] = useState('');
  const [roleType, setRoleType] = useState<'SysOp' | 'Admin' | 'Moderator'>(
    'Admin'
  );
  const [roleFeedback, setRoleFeedback] = useState<string | null>(null);
  const [roleNamesByAddress, setRoleNamesByAddress] = useState<
    Record<string, string>
  >({});
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
  const [managedSubTopicId, setManagedSubTopicId] = useState<string | null>(
    null
  );
  const [managedSubTopicTitle, setManagedSubTopicTitle] = useState('');
  const [managedSubTopicDescription, setManagedSubTopicDescription] =
    useState('');
  const [managedSubTopicStatus, setManagedSubTopicStatus] = useState<
    'open' | 'locked'
  >('open');
  const [managedSubTopicVisibility, setManagedSubTopicVisibility] = useState<
    'visible' | 'hidden'
  >('visible');
  const [managedSubTopicAccess, setManagedSubTopicAccess] =
    useState<TopicAccess>('everyone');
  const [managedSubTopicAllowedAddresses, setManagedSubTopicAllowedAddresses] =
    useState('');
  const [managementFeedback, setManagementFeedback] = useState<string | null>(
    null
  );
  const [draggedTopicId, setDraggedTopicId] = useState<string | null>(null);
  const [dragOverTopicId, setDragOverTopicId] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const selectedTopicFromRoute = searchParams.get('topic');

  const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'SysOp';
  const isSysOp = currentUser.role === 'SysOp';
  const canModerate = currentUser.role !== 'Member';

  const visibleTopicsWithSubTopics = useMemo(() => {
    return [...topics]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((topic) => ({
        ...topic,
        subTopics: sortSubTopics(
          subTopics.filter(
            (subTopic) =>
              subTopic.topicId === topic.id &&
              (canModerate ||
                canAccessSubTopic(
                  subTopic,
                  currentUser,
                  authenticatedAddress
                )) &&
              (canModerate || subTopic.visibility !== 'hidden')
          )
        ),
      }))
      .filter((topic) => canModerate || topic.visibility !== 'hidden');
  }, [authenticatedAddress, canModerate, currentUser, topics, subTopics]);

  const structureSearchIndex = useMemo(
    () =>
      topicDirectoryIndex
        ? {
            topicEntries: topicDirectoryIndex.topics.map((topic) => ({
              topicId: topic.topicId,
              haystack: createSearchHaystack([
                topic.title,
                topic.description,
                topic.status,
                topic.visibility,
                topic.subTopicAccess,
                ...topic.allowedAddresses,
              ]),
            })),
            subTopicEntries: topicDirectoryIndex.subTopics.map((subTopic) => ({
              subTopicId: subTopic.subTopicId,
              topicId: subTopic.topicId,
              haystack: createSearchHaystack([
                subTopic.title,
                subTopic.description,
                subTopic.access,
                ...subTopic.allowedAddresses,
                subTopic.status,
                subTopic.visibility,
                subTopic.isSolved ? 'solved' : 'unsolved',
                subTopic.authorUserId,
              ]),
            })),
          }
        : buildForumStructureSearchIndex(topics, subTopics, users),
    [topicDirectoryIndex, topics, subTopics, users]
  );

  const structureSearchResult = useMemo(
    () =>
      searchForumStructure(
        structureSearchIndex,
        visibleTopicsWithSubTopics,
        deferredSearchQuery
      ),
    [deferredSearchQuery, structureSearchIndex, visibleTopicsWithSubTopics]
  );

  const filteredTopicsWithSubTopics = structureSearchResult.topics;
  const hasActiveSearch = tokenizeSearchQuery(deferredSearchQuery).length > 0;

  const activeSubTopics = useMemo(() => {
    const userMap = new Map(users.map((user) => [user.id, user.displayName]));

    const allowedSubTopicIds = new Set(
      filteredTopicsWithSubTopics.flatMap((topic) =>
        topic.subTopics.map((subTopic) => subTopic.id)
      )
    );

    return [...subTopics]
      .filter((subTopic) => canModerate || subTopic.visibility !== 'hidden')
      .filter(
        (subTopic) =>
          canModerate ||
          canAccessSubTopic(subTopic, currentUser, authenticatedAddress)
      )
      .filter(
        (subTopic) => !hasActiveSearch || allowedSubTopicIds.has(subTopic.id)
      )
      .sort(
        (a, b) =>
          new Date(b.lastPostAt).getTime() - new Date(a.lastPostAt).getTime()
      )
      .slice(0, ACTIVE_SUBTOPIC_LIMIT)
      .map((subTopic) => ({
        ...subTopic,
        authorName: userMap.get(subTopic.authorUserId) ?? 'Unknown User',
      }));
  }, [
    canModerate,
    currentUser,
    filteredTopicsWithSubTopics,
    hasActiveSearch,
    authenticatedAddress,
    subTopics,
    users,
  ]);

  useEffect(() => {
    if (!selectedTopicFromRoute) {
      return;
    }

    const topicExists = topics.some(
      (topic) => topic.id === selectedTopicFromRoute
    );
    if (!topicExists) {
      return;
    }

    setOpenTopicId(selectedTopicFromRoute);
  }, [selectedTopicFromRoute, topics]);

  useEffect(() => {
    let active = true;

    const addresses = [
      roleRegistry.primarySysOpAddress,
      ...roleRegistry.sysOps,
      ...roleRegistry.admins,
      ...roleRegistry.moderators,
      ...topics.flatMap((topic) => topic.allowedAddresses),
      ...subTopics.flatMap((subTopic) => subTopic.allowedAddresses),
    ].filter(Boolean);

    if (addresses.length === 0) {
      setRoleNamesByAddress({});
      return () => {
        active = false;
      };
    }

    const uniqueAddresses = [...new Set(addresses)];

    const resolveRoleNames = async () => {
      const resolvedEntries = await Promise.all(
        uniqueAddresses.map(async (address) => {
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

      setRoleNamesByAddress(
        Object.fromEntries(
          resolvedEntries.filter((entry) => Boolean(entry[1].trim()))
        )
      );
    };

    void resolveRoleNames();

    return () => {
      active = false;
    };
  }, [roleRegistry, subTopics, topics]);

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

  const handleToggle = (topicId: string) => {
    setOpenTopicId((current) => {
      const nextTopicId = current === topicId ? null : topicId;
      const nextSearchParams = new URLSearchParams(searchParams);

      if (nextTopicId) {
        nextSearchParams.set('topic', nextTopicId);
      } else {
        nextSearchParams.delete('topic');
      }

      setSearchParams(nextSearchParams, { replace: true });
      return nextTopicId;
    });
  };

  const handleOpenThread = (subTopicId: string) => {
    navigate(`/thread/${subTopicId}`);
  };

  const handleShareTopic = async (topic: Topic) => {
    const shareUrl = buildQortalShareLink(`/?topic=${topic.id}`);

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

  const handleTopicDragStart = (topicId: string) => {
    setDraggedTopicId(topicId);
    setDragOverTopicId(topicId);
  };

  const handleTopicDragEnd = () => {
    setDraggedTopicId(null);
    setDragOverTopicId(null);
  };

  const handleTopicDrop = async (targetTopicId: string) => {
    if (!draggedTopicId || draggedTopicId === targetTopicId) {
      handleTopicDragEnd();
      return;
    }

    const fromIndex = filteredTopicsWithSubTopics.findIndex(
      (topic) => topic.id === draggedTopicId
    );
    const toIndex = filteredTopicsWithSubTopics.findIndex(
      (topic) => topic.id === targetTopicId
    );

    if (fromIndex < 0 || toIndex < 0) {
      handleTopicDragEnd();
      return;
    }

    const reorderedVisibleTopics = reorderList(
      filteredTopicsWithSubTopics,
      fromIndex,
      toIndex
    );
    const result = await reorderTopics(
      reorderedVisibleTopics.map((topic) => topic.id)
    );

    setManagementFeedback(
      result.ok
        ? 'Main topic order updated.'
        : (result.error ?? 'Unable to reorder main topics.')
    );
    handleTopicDragEnd();
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

  const handleCreateSubTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parentTopicId = selectedTopicId || topics[0]?.id;

    if (!parentTopicId) {
      setSubTopicFeedback('Please create a main topic first.');
      return;
    }

    const result = await createSubTopic({
      topicId: parentTopicId,
      title: subTopicTitle,
      description: subTopicDescription,
      access: subTopicAccess,
      allowedAddresses: parseAddressInput(subTopicAllowedAddresses),
    });

    if (!result.ok) {
      setSubTopicFeedback(result.error ?? 'Unable to create sub-topic.');
      return;
    }

    setSelectedTopicId(parentTopicId);
    setSubTopicTitle('');
    setSubTopicDescription('');
    setSubTopicAccess('everyone');
    setSubTopicAllowedAddresses('');
    setSubTopicFeedback('Sub-topic created successfully.');
    setOpenTopicId(parentTopicId);
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
    setRoleFeedback(`${roleType} role updated successfully.`);
  };

  const handleRemoveRole = async (address: string) => {
    const result = await removeRoleAssignment(address);
    setRoleFeedback(
      result.ok
        ? 'Role removed successfully.'
        : (result.error ?? 'Unable to remove forum role.')
    );
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
    setOpenTopicId(topic.id);
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

  const handleToggleSubTopicStatus = async (subTopic: SubTopic) => {
    const result = await updateSubTopicSettings({
      subTopicId: subTopic.id,
      title: subTopic.title,
      description: subTopic.description,
      status: subTopic.status === 'locked' ? 'open' : 'locked',
      visibility: subTopic.visibility,
      isPinned: subTopic.isPinned,
      isSolved: subTopic.isSolved,
      access: subTopic.access,
      allowedAddresses: subTopic.allowedAddresses,
    });

    setManagementFeedback(
      result.ok
        ? 'Sub-topic status updated.'
        : (result.error ?? 'Unable to update sub-topic.')
    );
  };

  const handleToggleSubTopicVisibility = async (subTopic: SubTopic) => {
    const result = await updateSubTopicSettings({
      subTopicId: subTopic.id,
      title: subTopic.title,
      description: subTopic.description,
      status: subTopic.status,
      visibility: subTopic.visibility === 'hidden' ? 'visible' : 'hidden',
      isPinned: subTopic.isPinned,
      isSolved: subTopic.isSolved,
      access: subTopic.access,
      allowedAddresses: subTopic.allowedAddresses,
    });

    setManagementFeedback(
      result.ok
        ? 'Sub-topic visibility updated.'
        : (result.error ?? 'Unable to update sub-topic.')
    );
  };

  const handleToggleSubTopicPin = async (subTopic: SubTopic) => {
    const result = await updateSubTopicSettings({
      subTopicId: subTopic.id,
      title: subTopic.title,
      description: subTopic.description,
      status: subTopic.status,
      visibility: subTopic.visibility,
      isPinned: !subTopic.isPinned,
      isSolved: subTopic.isSolved,
      access: subTopic.access,
      allowedAddresses: subTopic.allowedAddresses,
    });

    setManagementFeedback(
      result.ok
        ? subTopic.isPinned
          ? 'Sub-topic unpinned.'
          : 'Sub-topic pinned to the top.'
        : (result.error ?? 'Unable to update sub-topic pin.')
    );
  };

  const handleOpenSubTopicManager = (subTopic: SubTopic) => {
    setManagedSubTopicId((current) =>
      current === subTopic.id ? null : subTopic.id
    );
    setManagedSubTopicTitle(subTopic.title);
    setManagedSubTopicDescription(subTopic.description);
    setManagedSubTopicStatus(subTopic.status);
    setManagedSubTopicVisibility(subTopic.visibility);
    setManagedSubTopicAccess(subTopic.access);
    setManagedSubTopicAllowedAddresses(subTopic.allowedAddresses.join(', '));
    setManagementFeedback(null);
  };

  const handleSaveSubTopicManager = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!managedSubTopicId) {
      return;
    }

    const existingSubTopic = subTopics.find(
      (subTopic) => subTopic.id === managedSubTopicId
    );
    if (!existingSubTopic) {
      return;
    }

    const result = await updateSubTopicSettings({
      subTopicId: managedSubTopicId,
      title: managedSubTopicTitle,
      description: managedSubTopicDescription,
      status: managedSubTopicStatus,
      visibility: managedSubTopicVisibility,
      isPinned: existingSubTopic.isPinned,
      isSolved: existingSubTopic.isSolved,
      access: managedSubTopicAccess,
      allowedAddresses: parseAddressInput(managedSubTopicAllowedAddresses),
    });

    setManagementFeedback(
      result.ok
        ? 'Sub-topic settings updated.'
        : (result.error ?? 'Unable to update sub-topic.')
    );
  };

  if (!isAuthReady && topics.length === 0 && subTopics.length === 0) {
    return <HomeSkeleton />;
  }

  return (
    <div className="space-y-6">
      <section className="forum-card-accent p-5">
        <h2 className="text-brand-accent text-base font-semibold">
          Active Topics
        </h2>
        <ul className="mt-3 space-y-2">
          {activeSubTopics.map((subTopic) => (
            <li key={subTopic.id}>
              <button
                type="button"
                onClick={() => handleOpenThread(subTopic.id)}
                className="forum-pill-accent w-full rounded-lg px-3 py-2 text-left transition hover:border-cyan-200 hover:bg-cyan-50/80"
              >
                <p className="text-ui-strong text-sm font-semibold">
                  {subTopic.isSolved ? (
                    <span className="mr-2 inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 align-middle">
                      Solved
                    </span>
                  ) : null}
                  {subTopic.title}
                </p>
                <p className="text-ui-muted text-xs">
                  {subTopic.authorName} • Last activity{' '}
                  {new Date(subTopic.lastPostAt).toLocaleDateString('en-US')}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-brand-primary text-lg font-semibold">
          Main Topics
        </h2>
        {hasActiveSearch ? (
          <p className="text-ui-muted text-sm">
            Search results: {structureSearchResult.matchedTopicCount} topics and{' '}
            {structureSearchResult.matchedSubTopicCount} sub-topics.
          </p>
        ) : isAdmin ? (
          <p className="text-ui-muted text-sm">
            Drag main topics to change their persistent display order.
          </p>
        ) : null}
        {managementFeedback ? (
          <p className="text-ui-muted text-sm">{managementFeedback}</p>
        ) : null}
      </section>

      {isSysOp ? (
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
                    event.target.value as 'SysOp' | 'Admin' | 'Moderator'
                  )
                }
                className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="SysOp">SysOp</option>
                <option value="Admin">Admin</option>
                <option value="Moderator">Moderator</option>
              </select>
              <button
                type="submit"
                className="bg-brand-primary-solid rounded-md px-3 py-2 text-xs font-semibold text-white"
              >
                Save Role
              </button>
            </form>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div>
                <h3 className="text-ui-strong text-sm font-semibold">SysOps</h3>
                <ul className="mt-2 space-y-2">
                  {roleRegistry.sysOps.map((address) => (
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
                  {roleRegistry.sysOps.length === 0 ? (
                    <li className="text-ui-muted text-xs">
                      No extra SysOps added yet.
                    </li>
                  ) : null}
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
                        className="text-brand-accent-strong text-xs font-semibold"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                  {roleRegistry.admins.length === 0 ? (
                    <li className="text-ui-muted text-xs">
                      No admins added yet.
                    </li>
                  ) : null}
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
                  {roleRegistry.moderators.length === 0 ? (
                    <li className="text-ui-muted text-xs">
                      No moderators added yet.
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>

            {roleFeedback ? (
              <p className="text-ui-muted mt-3 text-xs">{roleFeedback}</p>
            ) : null}
          </article>
        </section>
      ) : null}

      <div className="space-y-4">
        {filteredTopicsWithSubTopics.map((topic) => (
          <div key={topic.id} className="space-y-2">
            <TopicAccordion
              topic={topic}
              users={users}
              walletNamesByAddress={roleNamesByAddress}
              isOpen={openTopicId === topic.id}
              isDragEnabled={isAdmin && !hasActiveSearch}
              isDragging={draggedTopicId === topic.id}
              isDragOver={dragOverTopicId === topic.id}
              onToggle={handleToggle}
              onOpenThread={handleOpenThread}
              onDragStart={handleTopicDragStart}
              onDragEnd={handleTopicDragEnd}
              onDragOverTopic={setDragOverTopicId}
              onDropTopic={handleTopicDrop}
              canManageTopic={isAdmin}
              canManageSubTopics={canModerate}
              onShareTopic={handleShareTopic}
              onManageTopic={handleOpenTopicManager}
              onManageSubTopic={handleOpenSubTopicManager}
              onToggleSubTopicPin={handleToggleSubTopicPin}
              onToggleSubTopicStatus={handleToggleSubTopicStatus}
              onToggleSubTopicVisibility={handleToggleSubTopicVisibility}
            />

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

            {topic.subTopics.some(
              (subTopic) => subTopic.id === managedSubTopicId
            ) ? (
              <form
                className="forum-card p-4 space-y-2"
                onSubmit={handleSaveSubTopicManager}
              >
                <h3 className="text-ui-strong text-sm font-semibold">
                  Manage Sub-Topic
                </h3>
                <input
                  value={managedSubTopicTitle}
                  onChange={(event) =>
                    setManagedSubTopicTitle(event.target.value)
                  }
                  placeholder="Sub-topic title"
                  className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <textarea
                  value={managedSubTopicDescription}
                  onChange={(event) =>
                    setManagedSubTopicDescription(event.target.value)
                  }
                  placeholder="Sub-topic description"
                  maxLength={TOPIC_DESCRIPTION_MAX_LENGTH}
                  className="bg-surface-card text-ui-strong min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <p className="text-ui-muted text-xs">
                  {managedSubTopicDescription.length}/
                  {TOPIC_DESCRIPTION_MAX_LENGTH}
                </p>
                <select
                  value={managedSubTopicStatus}
                  onChange={(event) =>
                    setManagedSubTopicStatus(
                      event.target.value as 'open' | 'locked'
                    )
                  }
                  className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="open">Open</option>
                  <option value="locked">Locked</option>
                </select>
                <select
                  value={managedSubTopicVisibility}
                  onChange={(event) =>
                    setManagedSubTopicVisibility(
                      event.target.value as 'visible' | 'hidden'
                    )
                  }
                  className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="visible">Visible</option>
                  <option value="hidden">Hidden</option>
                </select>
                <select
                  value={managedSubTopicAccess}
                  onChange={(event) =>
                    setManagedSubTopicAccess(event.target.value as TopicAccess)
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
                  Access: {resolveAccessLabel(managedSubTopicAccess)}
                </p>
                {managedSubTopicAccess === 'custom' ? (
                  <textarea
                    value={managedSubTopicAllowedAddresses}
                    onChange={(event) =>
                      setManagedSubTopicAllowedAddresses(event.target.value)
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
                    Save Sub-Topic Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => setManagedSubTopicId(null)}
                    className="bg-surface-card text-ui-muted rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold"
                  >
                    Close
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        ))}
        {filteredTopicsWithSubTopics.length === 0 ? (
          <div className="forum-card p-5">
            <p className="text-ui-strong text-sm font-semibold">
              No matches found
            </p>
            <p className="text-ui-muted mt-1 text-sm">
              Refine the search phrase or clear the search field.
            </p>
          </div>
        ) : null}
      </div>

      <section className="space-y-3 pt-2">
        <h2 className="text-brand-primary text-lg font-semibold">
          Create Content
        </h2>

        <article className="forum-card-primary overflow-hidden">
          <button
            type="button"
            onClick={() =>
              setOpenCreatePanel((current) =>
                current === 'main' ? null : 'main'
              )
            }
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
              {openCreatePanel === 'main' ? 'Close' : 'Open'}
            </span>
          </button>

          {openCreatePanel === 'main' ? (
            <div className="border-brand-primary bg-brand-primary-soft border-t px-4 py-4">
              {isAdmin ? (
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
              ) : (
                <p className="text-brand-accent-strong text-xs font-semibold">
                  Main-topic creation is available only to admins and the super
                  admin.
                </p>
              )}

              {topicFeedback ? (
                <p className="text-ui-muted mt-2 text-xs">{topicFeedback}</p>
              ) : null}
            </div>
          ) : null}
        </article>

        <article className="forum-card-accent overflow-hidden">
          <button
            type="button"
            onClick={() =>
              setOpenCreatePanel((current) =>
                current === 'sub' ? null : 'sub'
              )
            }
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <h3 className="text-brand-accent text-sm font-semibold">
                Create Sub-Topic
              </h3>
              <p className="text-ui-muted mt-0.5 text-xs">
                Members can post inside existing main topics.
              </p>
            </div>
            <span className="text-ui-muted text-xs font-semibold">
              {openCreatePanel === 'sub' ? 'Close' : 'Open'}
            </span>
          </button>

          {openCreatePanel === 'sub' ? (
            <div className="border-brand-accent bg-brand-accent-soft border-t px-4 py-4">
              <form className="space-y-2" onSubmit={handleCreateSubTopic}>
                <select
                  value={selectedTopicId}
                  onChange={(event) => setSelectedTopicId(event.target.value)}
                  className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select main topic</option>
                  {filteredTopicsWithSubTopics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>
                <input
                  value={subTopicTitle}
                  onChange={(event) => setSubTopicTitle(event.target.value)}
                  placeholder="Sub-topic title"
                  className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <textarea
                  value={subTopicDescription}
                  onChange={(event) =>
                    setSubTopicDescription(event.target.value)
                  }
                  placeholder="Sub-topic description"
                  maxLength={TOPIC_DESCRIPTION_MAX_LENGTH}
                  className="bg-surface-card text-ui-strong min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <p className="text-ui-muted text-xs">
                  {subTopicDescription.length}/{TOPIC_DESCRIPTION_MAX_LENGTH}
                </p>
                <select
                  value={subTopicAccess}
                  onChange={(event) =>
                    setSubTopicAccess(event.target.value as TopicAccess)
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
                      (option) => option.value === subTopicAccess
                    )?.helper
                  }
                </p>
                {subTopicAccess === 'custom' ? (
                  <textarea
                    value={subTopicAllowedAddresses}
                    onChange={(event) =>
                      setSubTopicAllowedAddresses(event.target.value)
                    }
                    placeholder="Comma-separated wallet addresses"
                    className="bg-surface-card text-ui-strong min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                ) : null}
                <button
                  type="submit"
                  className="bg-brand-primary-solid rounded-md px-3 py-2 text-xs font-semibold text-white"
                >
                  Create Sub-Topic
                </button>
              </form>

              {subTopicFeedback ? (
                <p className="text-ui-muted mt-2 text-xs">{subTopicFeedback}</p>
              ) : null}
            </div>
          ) : null}
        </article>

        {managementFeedback ? (
          <p className="text-ui-muted text-xs">{managementFeedback}</p>
        ) : null}
      </section>
    </div>
  );
};

export default Home;
