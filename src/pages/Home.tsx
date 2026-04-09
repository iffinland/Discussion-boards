import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useForumData } from '../hooks/useForumData';
import { canAccessSubTopic } from '../services/forum/forumAccess';
import {
  buildQortalShareLink,
  copyToClipboard,
} from '../services/qortal/share';
import { getAccountNames } from '../services/qortal/walletService';
import type { Topic, TopicAccess } from '../types';

const parseAddressInput = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

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

const TOPIC_DESCRIPTION_MAX_LENGTH = 250;
const ACTIVE_SUBTOPIC_LIMIT = 8;
const roleLabelByType: Record<'SysOp' | 'Admin' | 'Moderator', string> = {
  SysOp: 'Super Admin',
  Admin: 'Admin',
  Moderator: 'Moderator',
};

const Home = ({ searchQuery }: HomeProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    currentUser,
    authenticatedAddress,
    roleRegistry,
    users,
    topics,
    subTopics,
    createTopic,
    updateTopicSettings,
    upsertRoleAssignment,
    removeRoleAssignment,
    isAuthReady,
  } = useForumData();
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
  const [roleType, setRoleType] = useState<'SysOp' | 'Admin' | 'Moderator'>(
    'Admin'
  );
  const [roleFeedback, setRoleFeedback] = useState<string | null>(null);
  const [roleNamesByAddress, setRoleNamesByAddress] = useState<
    Record<string, string>
  >({});

  const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'SysOp';
  const isSysOp = currentUser.role === 'SysOp';
  const canModerate = currentUser.role !== 'Member';

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

  const filteredTopics = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return [...topics]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((topic) => canModerate || topic.visibility !== 'hidden')
      .filter((topic) => {
        if (!normalizedSearch) {
          return true;
        }

        const haystack = `${topic.title} ${topic.description}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      .map((topic) => ({
        ...topic,
        subTopicCount: subTopics.filter(
          (subTopic) => subTopic.topicId === topic.id
        ).length,
      }));
  }, [canModerate, searchQuery, subTopics, topics]);

  const activeSubTopics = useMemo(() => {
    const userMap = new Map(users.map((user) => [user.id, user.displayName]));

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
        authorName: userMap.get(subTopic.authorUserId) ?? 'Unknown User',
      }));
  }, [authenticatedAddress, canModerate, currentUser, subTopics, users]);

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
  }, [roleRegistry]);

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
        {searchQuery.trim() ? (
          <p className="text-ui-muted text-sm">
            Search results: {filteredTopics.length} main topics.
          </p>
        ) : null}
        {managementFeedback ? (
          <p
            className={
              managementFeedback.toLowerCase().includes('copied')
                ? 'fixed right-4 top-24 z-50 inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-lg'
                : 'text-ui-muted text-sm'
            }
          >
            {managementFeedback}
          </p>
        ) : null}
      </section>

      <div className="space-y-4">
        {filteredTopics.map((topic) => (
          <div key={topic.id} className="space-y-2">
            <article className="forum-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={() => handleOpenTopic(topic.id)}
                  className="min-w-0 flex-1 text-left"
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
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="bg-brand-primary-soft text-brand-primary-strong border-brand-primary rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                      {topic.status === 'locked' ? 'Locked' : 'Open'}
                    </span>
                    {topic.visibility === 'hidden' ? (
                      <span className="text-ui-muted rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold">
                        Hidden
                      </span>
                    ) : null}
                  </div>
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
              No main topics found
            </p>
            <p className="text-ui-muted mt-1 text-sm">
              Create the first main topic to start forum structure.
            </p>
          </div>
        ) : null}
      </div>

      {isSysOp ? (
        <section className="space-y-3">
          <h2 className="text-brand-primary text-lg font-semibold">
            Forum Roles
          </h2>

          <article className="forum-card-primary p-4">
            <div className="space-y-1">
              <p className="text-ui-strong text-sm font-semibold">
                Primary Super Admin
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
                <option value="SysOp">Super Admin</option>
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
                  Main-topic creation is available only to admins and Super
                  Admins.
                </p>
              )}

              {topicFeedback ? (
                <p className="text-ui-muted mt-2 text-xs">{topicFeedback}</p>
              ) : null}
            </div>
          ) : null}
        </article>
      </section>
    </div>
  );
};

export default Home;
