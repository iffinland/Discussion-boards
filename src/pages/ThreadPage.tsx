import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import ThreadComposer from '../features/forum/components/ThreadComposer';
import ThreadSkeleton from '../features/forum/components/ThreadSkeleton';
import ThreadPostCard from '../features/forum/components/ThreadPostCard';
import { useThreadActions } from '../features/forum/hooks/useThreadActions';
import { useThreadDataQuery } from '../features/forum/hooks/useThreadDataQuery';
import { useForumData } from '../hooks/useForumData';
import {
  buildThreadPostSearchIndex,
  createSearchHaystack,
  searchThreadPosts,
  tokenizeSearchQuery,
} from '../services/forum/forumSearch';
import {
  canAccessSubTopic,
  resolveAccessLabel,
} from '../services/forum/forumAccess';
import {
  buildQortalShareLink,
  copyToClipboard,
} from '../services/qortal/share';

const THREAD_BATCH_SIZE = 12;

type ThreadPageProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
};

const ThreadPage = ({ searchQuery, onSearchQueryChange }: ThreadPageProps) => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const {
    users,
    currentUser,
    authenticatedAddress,
    topics,
    subTopics,
    posts,
    threadSearchIndexes,
    isAuthenticated,
    updateSubTopicSettings,
    toggleSubTopicSolved,
    createPost,
    uploadPostImage,
    uploadPostAttachment,
    updatePost,
    deletePost,
    likePost,
    isThreadPostsLoading,
    loadThreadPosts,
    isAuthReady,
  } = useForumData();
  const [threadLoadError, setThreadLoadError] = useState<string | null>(null);
  const [moderationFeedback, setModerationFeedback] = useState<string | null>(
    null
  );
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(
    null
  );
  const [replyContextPostId, setReplyContextPostId] = useState<string | null>(
    null
  );
  const [visibleCount, setVisibleCount] = useState<number>(THREAD_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const { subTopic, threadPosts, userMap, resolveAuthorDisplayName } =
    useThreadDataQuery({
      threadId: id,
      users,
      subTopics,
      posts,
    });
  const parentTopic = useMemo(
    () => topics.find((topic) => topic.id === subTopic?.topicId),
    [subTopic?.topicId, topics]
  );

  const {
    replyText,
    replyTarget,
    replyAttachments,
    setReplyText,
    setReplyAttachments,
    feedback,
    tipsByPostId,
    handleSubmitReply,
    handleReplyToPost,
    handleCancelReplyTarget,
    handleEditPost,
    handleDeletePost,
    handleSharePost,
    handleSendTip,
    uploadImageForReply,
    uploadAttachmentForReply,
  } = useThreadActions({
    threadId: id,
    createPost,
    uploadPostImage,
    uploadPostAttachment,
    updatePost,
    deletePost,
    resolveAuthorDisplayName,
  });

  const postSearchIndex = useMemo(
    () =>
      subTopic && threadSearchIndexes[subTopic.id]
        ? {
            entries: threadSearchIndexes[subTopic.id].posts.map((post) => ({
              postId: post.postId,
              haystack: createSearchHaystack([post.content, post.authorUserId]),
            })),
          }
        : buildThreadPostSearchIndex(threadPosts, users),
    [subTopic, threadPosts, threadSearchIndexes, users]
  );
  const filteredThreadPosts = useMemo(
    () => searchThreadPosts(postSearchIndex, threadPosts, deferredSearchQuery),
    [deferredSearchQuery, postSearchIndex, threadPosts]
  );
  const sharedPostId = useMemo(
    () => new URLSearchParams(location.search).get('post'),
    [location.search]
  );
  const threadPostMap = useMemo(
    () => new Map(threadPosts.map((post) => [post.id, post])),
    [threadPosts]
  );
  const visiblePosts = useMemo(
    () => filteredThreadPosts.slice(0, visibleCount),
    [filteredThreadPosts, visibleCount]
  );
  const displayPosts = useMemo(() => {
    if (!sharedPostId) {
      return visiblePosts;
    }

    if (visiblePosts.some((post) => post.id === sharedPostId)) {
      return visiblePosts;
    }

    const sharedPost = threadPostMap.get(sharedPostId);
    if (!sharedPost) {
      return visiblePosts;
    }

    return [...visiblePosts, sharedPost].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [sharedPostId, threadPostMap, visiblePosts]);

  const canLoadMore = visibleCount < filteredThreadPosts.length;
  const canModerate = currentUser.role !== 'Member';
  const hasSubTopicAccess = subTopic
    ? canAccessSubTopic(subTopic, currentUser, authenticatedAddress)
    : false;
  const hasActiveSearch = tokenizeSearchQuery(deferredSearchQuery).length > 0;
  const isComposerDisabled =
    !hasSubTopicAccess ||
    subTopic?.status === 'locked' ||
    subTopic?.visibility === 'hidden';
  const composerHelperText = !hasSubTopicAccess
    ? 'You do not have access to post in this sub-topic.'
    : subTopic?.visibility === 'hidden'
      ? 'This sub-topic is hidden.'
      : subTopic?.status === 'locked'
        ? 'This sub-topic is locked.'
        : null;

  const handleToggleSubTopicStatus = async () => {
    if (!subTopic) {
      return;
    }

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

    setModerationFeedback(
      result.ok
        ? 'Sub-topic status updated.'
        : (result.error ?? 'Unable to update sub-topic.')
    );
  };

  const handleToggleSubTopicVisibility = async () => {
    if (!subTopic) {
      return;
    }

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

    setModerationFeedback(
      result.ok
        ? 'Sub-topic visibility updated.'
        : (result.error ?? 'Unable to update sub-topic.')
    );
  };

  const handleToggleSubTopicPin = async () => {
    if (!subTopic) {
      return;
    }

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

    setModerationFeedback(
      result.ok
        ? subTopic.isPinned
          ? 'Sub-topic unpinned.'
          : 'Sub-topic pinned to the top.'
        : (result.error ?? 'Unable to update sub-topic.')
    );
  };

  const handleToggleSubTopicSolved = async () => {
    if (!subTopic) {
      return;
    }

    const result = await toggleSubTopicSolved(subTopic.id);
    setModerationFeedback(
      result.ok
        ? subTopic.isSolved
          ? 'Solved status cleared.'
          : 'Thread marked as solved.'
        : (result.error ?? 'Unable to update solved status.')
    );
  };

  useEffect(() => {
    if (!id) {
      return;
    }

    if (searchQuery) {
      onSearchQueryChange('');
    }
  }, [id, onSearchQueryChange, searchQuery]);

  useEffect(() => {
    if (!id || !subTopic) {
      return;
    }

    let active = true;
    void loadThreadPosts(id).then((result) => {
      if (!active) {
        return;
      }
      setThreadLoadError(
        result.ok ? null : (result.error ?? 'Unable to load thread posts.')
      );
    });

    return () => {
      active = false;
    };
  }, [id, loadThreadPosts, subTopic]);

  useEffect(() => {
    setVisibleCount(THREAD_BATCH_SIZE);
  }, [filteredThreadPosts.length, id]);

  useEffect(() => {
    if (!sharedPostId) {
      setHighlightedPostId(null);
      return;
    }

    const targetIndex = filteredThreadPosts.findIndex(
      (post) => post.id === sharedPostId
    );
    if (targetIndex >= 0) {
      setVisibleCount((current) => Math.max(current, targetIndex + 1));
    }
  }, [filteredThreadPosts, sharedPostId]);

  useEffect(() => {
    if (
      !sharedPostId ||
      !displayPosts.some((post) => post.id === sharedPostId)
    ) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const frameId = window.requestAnimationFrame(() => {
      const element = document.getElementById(`post-${sharedPostId}`);
      if (!element) {
        return;
      }

      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      setHighlightedPostId(sharedPostId);
      setReplyContextPostId(
        threadPostMap.get(sharedPostId)?.parentPostId ?? null
      );
      timeoutId = window.setTimeout(() => {
        setHighlightedPostId((current) =>
          current === sharedPostId ? null : current
        );
        setReplyContextPostId((current) =>
          current === threadPostMap.get(sharedPostId)?.parentPostId
            ? null
            : current
        );
      }, 3000);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [displayPosts, sharedPostId, threadPostMap]);

  const jumpToPost = (postId: string) => {
    const targetIndex = filteredThreadPosts.findIndex(
      (post) => post.id === postId
    );
    if (targetIndex >= 0) {
      setVisibleCount((current) => Math.max(current, targetIndex + 1));
    }

    window.requestAnimationFrame(() => {
      const element = document.getElementById(`post-${postId}`);
      if (!element) {
        return;
      }

      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      setHighlightedPostId(postId);
      window.setTimeout(() => {
        setHighlightedPostId((current) =>
          current === postId ? null : current
        );
      }, 3000);
    });
  };

  const handleShareThread = async () => {
    if (!id || typeof window === 'undefined') {
      return;
    }

    const shareUrl = buildQortalShareLink(`/thread/${id}`);
    try {
      await copyToClipboard(shareUrl);
      setModerationFeedback('Thread link copied to clipboard.');
      window.setTimeout(() => {
        setModerationFeedback((current) =>
          current === 'Thread link copied to clipboard.' ? null : current
        );
      }, 2400);
    } catch {
      setModerationFeedback('Unable to copy thread link to clipboard.');
    }
  };

  useEffect(() => {
    if (!canLoadMore || !loadMoreRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) {
          return;
        }

        setVisibleCount((current) =>
          Math.min(current + THREAD_BATCH_SIZE, filteredThreadPosts.length)
        );
      },
      {
        root: null,
        rootMargin: '280px 0px',
        threshold: 0.1,
      }
    );

    observer.observe(loadMoreRef.current);
    return () => {
      observer.disconnect();
    };
  }, [canLoadMore, filteredThreadPosts.length]);

  if (!isAuthReady && !subTopic && subTopics.length === 0) {
    return <ThreadSkeleton />;
  }

  if (!subTopic) {
    return (
      <div className="space-y-4">
        <h2 className="text-ui-strong text-lg font-semibold">
          Thread not found
        </h2>
        <Link to="/" className="forum-link text-sm font-medium">
          Back to topics
        </Link>
      </div>
    );
  }

  if (subTopic.visibility === 'hidden' && !canModerate) {
    return (
      <div className="space-y-4">
        <h2 className="text-ui-strong text-lg font-semibold">
          Thread not available
        </h2>
        <p className="text-ui-muted text-sm">This sub-topic is hidden.</p>
        <Link to="/" className="forum-link text-sm font-medium">
          Back to topics
        </Link>
      </div>
    );
  }

  if (!hasSubTopicAccess && !canModerate) {
    return (
      <div className="space-y-4">
        <h2 className="text-ui-strong text-lg font-semibold">
          Thread not available
        </h2>
        <p className="text-ui-muted text-sm">
          You do not have access to this sub-topic.
        </p>
        <Link to="/" className="forum-link text-sm font-medium">
          Back to topics
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
          className="text-brand-primary font-semibold transition hover:text-cyan-700 hover:underline"
        >
          Home
        </Link>
        {parentTopic ? (
          <>
            <span className="text-ui-muted">/</span>
            <Link
              to={`/?topic=${parentTopic.id}`}
              className="text-brand-primary font-semibold transition hover:text-cyan-700 hover:underline"
            >
              {parentTopic.title}
            </Link>
          </>
        ) : null}
      </nav>

      <section className="forum-card-primary p-5">
        <h2 className="text-ui-strong text-2xl font-semibold">
          {subTopic.isPinned ? (
            <span className="bg-brand-accent-soft text-brand-accent-strong border-brand-accent mr-3 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold align-middle">
              Pinned
            </span>
          ) : null}
          {subTopic.title}
        </h2>
        <p className="text-ui-muted mt-1 text-sm">{subTopic.description}</p>
        <p className="text-ui-muted mt-2 text-xs">
          {hasActiveSearch
            ? `${filteredThreadPosts.length} matching posts in this thread`
            : `${threadPosts.length} posts in this thread`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="bg-brand-primary-soft text-brand-primary-strong border-brand-primary rounded-full border px-2 py-1 text-xs font-semibold">
            {subTopic.status === 'locked' ? 'Locked' : 'Open'}
          </span>
          {subTopic.isPinned ? (
            <span className="bg-brand-primary-soft text-brand-primary-strong border-brand-primary rounded-full border px-2 py-1 text-xs font-semibold">
              Pinned
            </span>
          ) : null}
          {subTopic.isSolved ? (
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              Solved
            </span>
          ) : null}
          {subTopic.access !== 'everyone' ? (
            <span className="bg-brand-accent-soft text-brand-accent-strong border-brand-accent rounded-full border px-2 py-1 text-xs font-semibold">
              Access: {resolveAccessLabel(subTopic.access)}
            </span>
          ) : null}
          {subTopic.visibility === 'hidden' ? (
            <span className="bg-brand-accent-soft text-brand-accent-strong border-brand-accent rounded-full border px-2 py-1 text-xs font-semibold">
              Hidden
            </span>
          ) : null}
          {canModerate ? (
            <>
              <button
                type="button"
                onClick={handleToggleSubTopicPin}
                className="bg-surface-card text-ui-strong rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold"
              >
                {subTopic.isPinned ? 'Unpin Sub-Topic' : 'Pin Sub-Topic'}
              </button>
              <button
                type="button"
                onClick={handleToggleSubTopicStatus}
                className="bg-surface-card text-ui-strong rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold"
              >
                {subTopic.status === 'locked'
                  ? 'Unlock Sub-Topic'
                  : 'Lock Sub-Topic'}
              </button>
              <button
                type="button"
                onClick={handleToggleSubTopicVisibility}
                className="bg-surface-card text-ui-strong rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold"
              >
                {subTopic.visibility === 'hidden'
                  ? 'Show Sub-Topic'
                  : 'Hide Sub-Topic'}
              </button>
            </>
          ) : null}
          {isAuthenticated ? (
            <button
              type="button"
              onClick={handleToggleSubTopicSolved}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
            >
              {subTopic.isSolved ? 'Clear Solved' : 'Mark as Solved'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleShareThread}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
          >
            Share Thread
          </button>
        </div>
      </section>

      {feedback ? (
        <p
          className={
            feedback.toLowerCase().includes('copied')
              ? 'fixed right-4 top-24 z-50 inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-lg'
              : 'text-ui-muted text-xs'
          }
        >
          {feedback}
        </p>
      ) : null}
      {moderationFeedback ? (
        <p
          className={
            moderationFeedback.toLowerCase().includes('copied')
              ? 'fixed right-4 top-24 z-50 inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-lg'
              : 'text-ui-muted text-xs'
          }
        >
          {moderationFeedback}
        </p>
      ) : null}
      {threadLoadError ? (
        <p className="text-ui-muted text-xs">{threadLoadError}</p>
      ) : null}
      {isThreadPostsLoading ? (
        <p className="text-ui-muted text-xs">Loading thread data from QDN...</p>
      ) : null}

      <section className="space-y-3">
        {displayPosts.map((post) => (
          <ThreadPostCard
            key={post.id}
            post={post}
            author={userMap.get(post.authorUserId)}
            repliedPost={
              post.parentPostId
                ? (threadPostMap.get(post.parentPostId) ?? null)
                : null
            }
            repliedAuthorName={
              post.parentPostId
                ? resolveAuthorDisplayName(
                    threadPostMap.get(post.parentPostId)?.authorUserId ?? ''
                  )
                : null
            }
            highlighted={highlightedPostId === post.id}
            replyContextHighlighted={replyContextPostId === post.parentPostId}
            isOwner={post.authorUserId === currentUser.id}
            canModerate={canModerate}
            tipCount={tipsByPostId[post.id] ?? 0}
            onLike={likePost}
            onReply={handleReplyToPost}
            onShare={handleSharePost}
            onSendTip={handleSendTip}
            onJumpToPost={jumpToPost}
            onEdit={handleEditPost}
            onDelete={handleDeletePost}
          />
        ))}
        {canLoadMore ? (
          <div ref={loadMoreRef} className="h-6 w-full" aria-hidden="true" />
        ) : null}
        {displayPosts.length === 0 ? (
          <div className="forum-card p-5">
            <p className="text-ui-strong text-sm font-semibold">
              No matching posts
            </p>
            <p className="text-ui-muted mt-1 text-sm">
              Adjust the forum search field to search this thread differently.
            </p>
          </div>
        ) : null}
      </section>

      <ThreadComposer
        replyText={replyText}
        replyAttachments={replyAttachments}
        replyTargetAuthorName={
          replyTarget
            ? resolveAuthorDisplayName(replyTarget.authorUserId)
            : null
        }
        replyTargetContent={replyTarget?.content ?? null}
        onReplyTextChange={setReplyText}
        onReplyAttachmentsChange={setReplyAttachments}
        onSubmit={handleSubmitReply}
        onUploadImage={uploadImageForReply}
        onUploadAttachment={uploadAttachmentForReply}
        onCancelReplyTarget={handleCancelReplyTarget}
        disabled={isComposerDisabled}
        helperText={composerHelperText}
      />

      <Link to="/" className="forum-link inline-block text-sm font-medium">
        Back to topics
      </Link>
    </div>
  );
};

export default ThreadPage;
