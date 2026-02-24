import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import ThreadComposer from "../features/forum/components/ThreadComposer";
import ThreadSkeleton from "../features/forum/components/ThreadSkeleton";
import ThreadPostCard from "../features/forum/components/ThreadPostCard";
import { useThreadActions } from "../features/forum/hooks/useThreadActions";
import { useThreadDataQuery } from "../features/forum/hooks/useThreadDataQuery";
import { useForumData } from "../hooks/useForumData";

const THREAD_BATCH_SIZE = 12;

const ThreadPage = () => {
  const { id } = useParams<{ id: string }>();
  const {
    users,
    currentUser,
    subTopics,
    posts,
    createPost,
    updatePost,
    deletePost,
    likePost,
    isThreadPostsLoading,
    loadThreadPosts,
    isAuthReady,
  } = useForumData();
  const [threadLoadError, setThreadLoadError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(THREAD_BATCH_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const { subTopic, threadPosts, userMap, resolveAuthorDisplayName } =
    useThreadDataQuery({
      threadId: id,
      users,
      subTopics,
      posts,
    });

  const {
    replyText,
    setReplyText,
    feedback,
    tipsByPostId,
    handleSubmitReply,
    handleReplyToPost,
    handleEditPost,
    handleDeletePost,
    handleSharePost,
    handleSendTip,
  } = useThreadActions({
    threadId: id,
    createPost,
    updatePost,
    deletePost,
    resolveAuthorDisplayName,
  });

  const visiblePosts = useMemo(
    () => threadPosts.slice(0, visibleCount),
    [threadPosts, visibleCount]
  );

  const canLoadMore = visibleCount < threadPosts.length;

  useEffect(() => {
    if (!id) {
      return;
    }

    let active = true;
    void loadThreadPosts(id).then((result) => {
      if (!active) {
        return;
      }
      setThreadLoadError(result.ok ? null : result.error ?? "Unable to load thread posts.");
    });

    return () => {
      active = false;
    };
  }, [id, loadThreadPosts]);

  useEffect(() => {
    setVisibleCount(THREAD_BATCH_SIZE);
  }, [id, threadPosts.length]);

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
          Math.min(current + THREAD_BATCH_SIZE, threadPosts.length)
        );
      },
      {
        root: null,
        rootMargin: "280px 0px",
        threshold: 0.1,
      }
    );

    observer.observe(loadMoreRef.current);
    return () => {
      observer.disconnect();
    };
  }, [canLoadMore, threadPosts.length]);

  if (!isAuthReady) {
    return <ThreadSkeleton />;
  }

  if (!subTopic) {
    return (
      <div className="space-y-4">
        <h2 className="text-ui-strong text-lg font-semibold">Thread not found</h2>
        <Link to="/" className="forum-link text-sm font-medium">
          Back to topics
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="forum-card-primary p-5">
        <h2 className="text-ui-strong text-2xl font-semibold">{subTopic.title}</h2>
        <p className="text-ui-muted mt-1 text-sm">{subTopic.description}</p>
        <p className="text-ui-muted mt-2 text-xs">{threadPosts.length} posts in this thread</p>
      </section>

      {feedback ? <p className="text-ui-muted text-xs">{feedback}</p> : null}
      {threadLoadError ? <p className="text-ui-muted text-xs">{threadLoadError}</p> : null}
      {isThreadPostsLoading ? (
        <p className="text-ui-muted text-xs">Loading thread data from QDN...</p>
      ) : null}

      <section className="space-y-3">
        {visiblePosts.map((post) => (
          <ThreadPostCard
            key={post.id}
            post={post}
            author={userMap.get(post.authorUserId)}
            isOwner={post.authorUserId === currentUser.id}
            tipCount={tipsByPostId[post.id] ?? 0}
            onLike={likePost}
            onReply={handleReplyToPost}
            onShare={handleSharePost}
            onSendTip={handleSendTip}
            onEdit={handleEditPost}
            onDelete={handleDeletePost}
          />
        ))}
        {canLoadMore ? (
          <div ref={loadMoreRef} className="h-6 w-full" aria-hidden="true" />
        ) : null}
      </section>

      <ThreadComposer
        replyText={replyText}
        onReplyTextChange={setReplyText}
        onSubmit={handleSubmitReply}
      />

      <Link to="/" className="forum-link inline-block text-sm font-medium">
        Back to topics
      </Link>
    </div>
  );
};

export default ThreadPage;
