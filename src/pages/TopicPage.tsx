import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import RichTextEditor from '../components/forum/RichTextEditor';
import SubTopicList from '../components/forum/SubTopicList';
import { useForumData } from '../hooks/useForumData';
import {
  canAccessSubTopic,
  resolveAccessLabel,
} from '../services/forum/forumAccess';
import { forumSearchIndexService } from '../services/qdn/forumSearchIndexService';
import {
  buildQortalShareLink,
  copyToClipboard,
} from '../services/qortal/share';
import { getAccountNames } from '../services/qortal/walletService';
import type { PostAttachment, SubTopic, TopicAccess } from '../types';

type TopicPageProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
};

const TOPIC_DESCRIPTION_MAX_LENGTH = 250;

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

const canCreateSubTopicForTopic = (
  topicAccess: TopicAccess,
  topicStatus: SubTopic['status'] | 'open' | 'locked',
  role: 'SysOp' | 'Admin' | 'Moderator' | 'Member',
  address: string | null,
  allowedAddresses: string[]
) => {
  if (role === 'SysOp' || role === 'Admin') {
    return true;
  }

  if (topicStatus === 'locked') {
    return false;
  }

  switch (topicAccess) {
    case 'everyone':
      return true;
    case 'moderators':
      return role === 'Moderator';
    case 'admins':
      return false;
    case 'custom':
      return Boolean(address && allowedAddresses.includes(address));
    default:
      return false;
  }
};

const TopicPage = ({ searchQuery, onSearchQueryChange }: TopicPageProps) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    users,
    currentUser,
    authenticatedAddress,
    topics,
    subTopics,
    posts,
    threadSearchIndexes,
    createSubTopic,
    createPost,
    uploadPostImage,
    uploadPostAttachment,
    updateSubTopicSettings,
    reorderPinnedSubTopics,
  } = useForumData();
  const [walletNamesByAddress, setWalletNamesByAddress] = useState<
    Record<string, string>
  >({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<string | null>(null);
  const [subTopicTitle, setSubTopicTitle] = useState('');
  const [subTopicDescription, setSubTopicDescription] = useState('');
  const [firstPostContent, setFirstPostContent] = useState('');
  const [firstPostAttachments, setFirstPostAttachments] = useState<
    PostAttachment[]
  >([]);
  const [managementFeedback, setManagementFeedback] = useState<string | null>(
    null
  );
  const [managedSubTopicId, setManagedSubTopicId] = useState<string | null>(
    null
  );
  const [managedSubTopicTopicId, setManagedSubTopicTopicId] = useState('');
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
  const [draggedPinnedSubTopicId, setDraggedPinnedSubTopicId] = useState<
    string | null
  >(null);
  const [dragOverPinnedSubTopicId, setDragOverPinnedSubTopicId] = useState<
    string | null
  >(null);
  const [fetchedPostCountsBySubTopicId, setFetchedPostCountsBySubTopicId] =
    useState<Record<string, number>>({});

  const topic = useMemo(
    () => topics.find((item) => item.id === id),
    [id, topics]
  );
  const topicId = topic?.id ?? null;
  const canModerate = currentUser.role !== 'Member';
  const canReorderPinnedSubTopics =
    currentUser.role === 'SysOp' && searchQuery.trim().length === 0;
  const canCreateHere = topic
    ? canCreateSubTopicForTopic(
        topic.subTopicAccess,
        topic.status,
        currentUser.role,
        authenticatedAddress,
        topic.allowedAddresses
      )
    : false;

  const visibleSubTopics = useMemo(() => {
    if (!topic) {
      return [];
    }

    const normalizedSearch = searchQuery.trim().toLowerCase();
    const byTopic = subTopics.filter(
      (subTopic) => subTopic.topicId === topic.id
    );
    const allowed = byTopic.filter(
      (subTopic) =>
        (canModerate ||
          canAccessSubTopic(subTopic, currentUser, authenticatedAddress)) &&
        (canModerate || subTopic.visibility !== 'hidden')
    );

    if (!normalizedSearch) {
      return sortSubTopics(allowed);
    }

    return sortSubTopics(
      allowed.filter((subTopic) => {
        const authorName =
          users.find((user) => user.id === subTopic.authorUserId)
            ?.displayName ?? '';
        const haystack =
          `${subTopic.title} ${subTopic.description} ${authorName}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      })
    );
  }, [
    topic,
    searchQuery,
    subTopics,
    canModerate,
    currentUser,
    authenticatedAddress,
    users,
  ]);
  const pinnedSubTopicIds = useMemo(
    () =>
      visibleSubTopics
        .filter((subTopic) => subTopic.isPinned)
        .map((subTopic) => subTopic.id),
    [visibleSubTopics]
  );
  const localPostCountsBySubTopicId = useMemo(() => {
    const countsBySubTopicId: Record<string, number> = {};

    posts.forEach((post) => {
      countsBySubTopicId[post.subTopicId] =
        (countsBySubTopicId[post.subTopicId] ?? 0) + 1;
    });

    Object.entries(threadSearchIndexes).forEach(([subTopicId, snapshot]) => {
      const indexedCount = snapshot.posts.length;
      const currentCount = countsBySubTopicId[subTopicId] ?? 0;
      countsBySubTopicId[subTopicId] = Math.max(currentCount, indexedCount);
    });

    return countsBySubTopicId;
  }, [posts, threadSearchIndexes]);
  const postCountsBySubTopicId = useMemo(() => {
    const merged: Record<string, number> = { ...fetchedPostCountsBySubTopicId };
    Object.entries(localPostCountsBySubTopicId).forEach(
      ([subTopicId, count]) => {
        merged[subTopicId] = Math.max(merged[subTopicId] ?? 0, count);
      }
    );
    return merged;
  }, [fetchedPostCountsBySubTopicId, localPostCountsBySubTopicId]);

  useEffect(() => {
    if (!topic) {
      return;
    }

    let active = true;
    const addresses = [
      ...topic.allowedAddresses,
      ...visibleSubTopics.flatMap((subTopic) => subTopic.allowedAddresses),
    ];
    const uniqueAddresses = [...new Set(addresses.filter(Boolean))];

    if (uniqueAddresses.length === 0) {
      setWalletNamesByAddress({});
      return () => {
        active = false;
      };
    }

    const resolveNames = async () => {
      const resolvedEntries = await Promise.all(
        uniqueAddresses.map(async (address) => {
          try {
            const names = await getAccountNames(address);
            const primary = names.find((entry) => entry.trim())?.trim();
            return [address, primary ?? ''] as const;
          } catch {
            return [address, ''] as const;
          }
        })
      );

      if (!active) {
        return;
      }

      setWalletNamesByAddress(
        Object.fromEntries(
          resolvedEntries.filter((entry) => Boolean(entry[1].trim()))
        )
      );
    };

    void resolveNames();

    return () => {
      active = false;
    };
  }, [topic, visibleSubTopics]);

  useEffect(() => {
    let active = true;
    const missingSubTopicIds = visibleSubTopics
      .map((subTopic) => subTopic.id)
      .filter((subTopicId) => postCountsBySubTopicId[subTopicId] === undefined);

    if (missingSubTopicIds.length === 0) {
      return () => {
        active = false;
      };
    }

    const loadMissingPostCounts = async () => {
      const resolvedEntries = await Promise.all(
        missingSubTopicIds.map(async (subTopicId) => {
          try {
            const threadIndex =
              await forumSearchIndexService.loadThreadIndex(subTopicId);
            const indexCount = threadIndex?.posts.length ?? 0;
            const localCount = localPostCountsBySubTopicId[subTopicId] ?? 0;
            return [subTopicId, Math.max(indexCount, localCount)] as const;
          } catch {
            return [
              subTopicId,
              localPostCountsBySubTopicId[subTopicId] ?? 0,
            ] as const;
          }
        })
      );

      if (!active) {
        return;
      }

      setFetchedPostCountsBySubTopicId((current) => ({
        ...current,
        ...Object.fromEntries(resolvedEntries),
      }));
    };

    void loadMissingPostCounts();

    return () => {
      active = false;
    };
  }, [localPostCountsBySubTopicId, postCountsBySubTopicId, visibleSubTopics]);

  useEffect(() => {
    if (!topicId) {
      return;
    }

    onSearchQueryChange('');
  }, [onSearchQueryChange, topicId]);

  const uploadImageForTopicPost = useCallback(
    async (file: File): Promise<string> => {
      const result = await uploadPostImage(file);
      if (!result.ok || !result.imageTag) {
        throw new Error(result.error ?? 'Unable to upload image.');
      }

      return result.imageTag;
    },
    [uploadPostImage]
  );

  const uploadAttachmentForTopicPost = useCallback(
    async (file: File): Promise<PostAttachment> => {
      const result = await uploadPostAttachment(file);
      if (!result.ok || !result.attachment) {
        throw new Error(result.error ?? 'Unable to upload attachment.');
      }

      return result.attachment;
    },
    [uploadPostAttachment]
  );

  const handleOpenThread = (subTopicId: string) => {
    navigate(`/thread/${subTopicId}`);
  };

  const handlePinnedDragStart = (subTopicId: string) => {
    if (!canReorderPinnedSubTopics) {
      return;
    }

    if (!pinnedSubTopicIds.includes(subTopicId)) {
      return;
    }

    setDraggedPinnedSubTopicId(subTopicId);
    setDragOverPinnedSubTopicId(subTopicId);
  };

  const handlePinnedDragOver = (
    subTopicId: string,
    event: DragEvent<HTMLLIElement>
  ) => {
    if (!canReorderPinnedSubTopics) {
      return;
    }

    if (!pinnedSubTopicIds.includes(subTopicId)) {
      return;
    }

    event.preventDefault();
    setDragOverPinnedSubTopicId(subTopicId);
  };

  const handlePinnedDragEnd = () => {
    setDraggedPinnedSubTopicId(null);
    setDragOverPinnedSubTopicId(null);
  };

  const handlePinnedDrop = async (targetSubTopicId: string) => {
    if (
      !topic ||
      !canReorderPinnedSubTopics ||
      !draggedPinnedSubTopicId ||
      !pinnedSubTopicIds.includes(targetSubTopicId)
    ) {
      handlePinnedDragEnd();
      return;
    }

    if (draggedPinnedSubTopicId === targetSubTopicId) {
      handlePinnedDragEnd();
      return;
    }

    const fromIndex = pinnedSubTopicIds.findIndex(
      (subTopicId) => subTopicId === draggedPinnedSubTopicId
    );
    const toIndex = pinnedSubTopicIds.findIndex(
      (subTopicId) => subTopicId === targetSubTopicId
    );
    if (fromIndex < 0 || toIndex < 0) {
      handlePinnedDragEnd();
      return;
    }

    const reorderedPinnedSubTopicIds = reorderList(
      pinnedSubTopicIds,
      fromIndex,
      toIndex
    );
    const result = await reorderPinnedSubTopics({
      topicId: topic.id,
      orderedPinnedSubTopicIds: reorderedPinnedSubTopicIds,
    });
    setManagementFeedback(
      result.ok
        ? 'Pinned sub-topics order updated.'
        : (result.error ?? 'Unable to reorder pinned sub-topics.')
    );
    handlePinnedDragEnd();
  };

  const handleShareTopic = async () => {
    if (!topic) {
      return;
    }

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

  const handleCreateSubTopicWithFirstPost = async () => {
    if (!topic) {
      return;
    }

    const title = subTopicTitle.trim();
    const description = subTopicDescription.trim();
    const content = firstPostContent.trim();
    if (!title || !description || !content) {
      setCreateFeedback(
        'Sub-topic title, description and first post are required.'
      );
      return;
    }

    const createResult = await createSubTopic({
      topicId: topic.id,
      title,
      description,
      access: 'everyone',
      allowedAddresses: [],
    });

    if (!createResult.ok || !createResult.subTopicId) {
      setCreateFeedback(createResult.error ?? 'Unable to create sub-topic.');
      return;
    }

    const postResult = await createPost({
      subTopicId: createResult.subTopicId,
      content,
      attachments: firstPostAttachments,
    });

    if (!postResult.ok) {
      setCreateFeedback(
        postResult.error ??
          'Sub-topic was created, but the first post could not be published.'
      );
      return;
    }

    setSubTopicTitle('');
    setSubTopicDescription('');
    setFirstPostContent('');
    setFirstPostAttachments([]);
    setCreateFeedback(null);
    setIsCreateOpen(false);
    navigate(`/thread/${createResult.subTopicId}`);
  };

  const handleToggleSubTopicStatus = async (subTopic: SubTopic) => {
    const result = await updateSubTopicSettings({
      subTopicId: subTopic.id,
      topicId: subTopic.topicId,
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
      topicId: subTopic.topicId,
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
      topicId: subTopic.topicId,
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
    setManagedSubTopicTopicId(subTopic.topicId);
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
      topicId: managedSubTopicTopicId,
      title: managedSubTopicTitle,
      description: managedSubTopicDescription,
      status: managedSubTopicStatus,
      visibility: managedSubTopicVisibility,
      isPinned: existingSubTopic.isPinned,
      isSolved: existingSubTopic.isSolved,
      access: managedSubTopicAccess,
      allowedAddresses: managedSubTopicAllowedAddresses
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    });

    setManagementFeedback(
      result.ok
        ? 'Sub-topic settings updated.'
        : (result.error ?? 'Unable to update sub-topic.')
    );
  };

  if (!topic) {
    return (
      <div className="space-y-4">
        <h2 className="text-ui-strong text-lg font-semibold">
          Main topic not found
        </h2>
        <Link to="/" className="forum-link text-sm font-medium">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        <Link
          to="/"
          className="forum-link text-sm font-semibold"
        >
          Home
        </Link>
        <span className="text-ui-muted">/</span>
        <span className="text-ui-strong font-semibold">{topic.title}</span>
      </nav>

      <section className="forum-card-primary p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-ui-strong text-2xl font-semibold">
              {topic.title}
            </h2>
            <p className="text-ui-muted mt-1 text-sm">{topic.description}</p>
            <p className="text-ui-muted mt-2 text-xs">
              {visibleSubTopics.length} sub-topics
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen((current) => !current)}
              className="bg-brand-primary-solid rounded-md px-3 py-2 text-xs font-semibold text-white"
            >
              Create New Topic
            </button>
            <button
              type="button"
              onClick={handleShareTopic}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              Share Main Topic
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="bg-brand-primary-soft text-brand-primary-strong border-brand-primary rounded-md border px-2 py-1 text-xs font-semibold">
            {topic.status === 'locked' ? 'Locked' : 'Open'}
          </span>
          {topic.visibility === 'hidden' ? (
            <span className="text-ui-muted rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold">
              Hidden
            </span>
          ) : null}
          {topic.subTopicAccess !== 'everyone' ? (
            <span className="text-ui-muted rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold">
              Sub-topic access: {resolveAccessLabel(topic.subTopicAccess)}
            </span>
          ) : null}
        </div>
      </section>

      {isCreateOpen ? (
        <section className="forum-card p-4 space-y-3">
          <h3 className="text-ui-strong text-sm font-semibold">
            Create New Topic in {topic.title}
          </h3>
          {canCreateHere ? (
            <>
              <input
                value={subTopicTitle}
                onChange={(event) => setSubTopicTitle(event.target.value)}
                placeholder="Sub-topic title"
                className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                value={subTopicDescription}
                onChange={(event) => setSubTopicDescription(event.target.value)}
                placeholder="Sub-topic description"
                maxLength={TOPIC_DESCRIPTION_MAX_LENGTH}
                className="bg-surface-card text-ui-strong min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              />
              <p className="text-ui-muted text-xs">
                {subTopicDescription.length}/{TOPIC_DESCRIPTION_MAX_LENGTH}
              </p>
              <RichTextEditor
                value={firstPostContent}
                attachments={firstPostAttachments}
                onChange={setFirstPostContent}
                onAttachmentsChange={setFirstPostAttachments}
                onSubmit={handleCreateSubTopicWithFirstPost}
                onUploadImage={uploadImageForTopicPost}
                onUploadAttachment={uploadAttachmentForTopicPost}
                placeholder="Write the first post for this new sub-topic..."
                editorLabel="First post editor"
                submitLabel="Create Sub-Topic and Publish First Post"
              />
            </>
          ) : (
            <p className="text-ui-muted text-sm">
              You do not have permission to create sub-topics under this main
              topic.
            </p>
          )}
          {createFeedback ? (
            <p className="text-ui-muted text-xs">{createFeedback}</p>
          ) : null}
        </section>
      ) : null}

      {managementFeedback ? (
        <p
          className={
            managementFeedback.toLowerCase().includes('copied')
              ? 'fixed right-4 top-24 z-50 inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-lg'
              : 'text-ui-muted text-xs'
          }
        >
          {managementFeedback}
        </p>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-brand-primary text-base font-semibold">
          Sub-Topics
        </h3>
        {canReorderPinnedSubTopics && pinnedSubTopicIds.length > 1 ? (
          <p className="text-ui-muted text-xs">
            Drag pinned sub-topics to reorder how they appear at the top.
          </p>
        ) : null}
        {visibleSubTopics.length > 0 ? (
          <SubTopicList
            subTopics={visibleSubTopics}
            users={users}
            postCountsBySubTopicId={postCountsBySubTopicId}
            walletNamesByAddress={walletNamesByAddress}
            onOpenThread={handleOpenThread}
            canManageSubTopics={canModerate}
            onManageSubTopic={handleOpenSubTopicManager}
            onToggleSubTopicPin={handleToggleSubTopicPin}
            onToggleSubTopicStatus={handleToggleSubTopicStatus}
            onToggleSubTopicVisibility={handleToggleSubTopicVisibility}
            canReorderPinnedSubTopics={
              canReorderPinnedSubTopics && pinnedSubTopicIds.length > 1
            }
            draggedPinnedSubTopicId={draggedPinnedSubTopicId}
            dragOverPinnedSubTopicId={dragOverPinnedSubTopicId}
            onPinnedDragStart={handlePinnedDragStart}
            onPinnedDragOver={handlePinnedDragOver}
            onPinnedDrop={handlePinnedDrop}
            onPinnedDragEnd={handlePinnedDragEnd}
          />
        ) : (
          <div className="forum-card p-5">
            <p className="text-ui-strong text-sm font-semibold">
              No sub-topics found
            </p>
            <p className="text-ui-muted mt-1 text-sm">
              Create the first sub-topic for this main topic.
            </p>
          </div>
        )}
      </section>

      {managedSubTopicId ? (
        <form
          className="forum-card p-4 space-y-2"
          onSubmit={handleSaveSubTopicManager}
        >
          <h3 className="text-ui-strong text-sm font-semibold">
            Manage Sub-Topic
          </h3>
          <select
            value={managedSubTopicTopicId}
            onChange={(event) => setManagedSubTopicTopicId(event.target.value)}
            className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            {topics.map((item) => (
              <option key={item.id} value={item.id}>
                Move to Main Topic: {item.title}
              </option>
            ))}
          </select>
          <input
            value={managedSubTopicTitle}
            onChange={(event) => setManagedSubTopicTitle(event.target.value)}
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
            {managedSubTopicDescription.length}/{TOPIC_DESCRIPTION_MAX_LENGTH}
          </p>
          <select
            value={managedSubTopicStatus}
            onChange={(event) =>
              setManagedSubTopicStatus(event.target.value as 'open' | 'locked')
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
            <option value="everyone">Everyone</option>
            <option value="moderators">Moderators+</option>
            <option value="admins">Admins only</option>
            <option value="custom">Specific wallets</option>
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
  );
};

export default TopicPage;
