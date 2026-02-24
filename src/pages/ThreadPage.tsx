import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import PostCard from "../components/forum/PostCard";
import RichTextEditor from "../components/forum/RichTextEditor";
import { useForumData } from "../hooks/useForumData";
import type { Post } from "../types";

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
  } = useForumData();

  const [replyText, setReplyText] = useState("");
  const [tipsByPostId, setTipsByPostId] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const subTopic = subTopics.find((item) => item.id === id);

  const threadPosts = useMemo(() => {
    return posts
      .filter((post) => post.subTopicId === id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [id, posts]);

  const userMap = useMemo(() => {
    return new Map(users.map((user) => [user.id, user]));
  }, [users]);

  const handleSubmitReply = async () => {
    if (!id) {
      return;
    }

    const result = await createPost({
      subTopicId: id,
      content: replyText,
    });

    if (!result.ok) {
      setFeedback(result.error ?? "Unable to publish post.");
      return;
    }

    setReplyText("");
    setFeedback("Reply published.");
  };

  const handleReplyToPost = (post: Post) => {
    const authorName = userMap.get(post.authorUserId)?.displayName ?? "Member";
    setReplyText(`@${authorName} `);
  };

  const handleEditPost = async (postId: string, content: string) => {
    const result = await updatePost({ postId, content });
    if (!result.ok) {
      setFeedback(result.error ?? "Unable to update post.");
      return;
    }

    setFeedback("Post updated.");
  };

  const handleDeletePost = async (postId: string) => {
    const result = await deletePost(postId);
    if (!result.ok) {
      setFeedback(result.error ?? "Unable to delete post.");
      return;
    }

    setFeedback("Post deleted.");
  };

  const handleSharePost = async (postId: string) => {
    if (!id || typeof window === "undefined" || !navigator.clipboard) {
      return;
    }

    const shareUrl = `${window.location.origin}${window.location.pathname}#/thread/${id}?post=${postId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setFeedback("Post link copied.");
    } catch {
      setFeedback("Unable to copy post link.");
    }
  };

  const handleSendTip = (postId: string) => {
    setTipsByPostId((current) => ({
      ...current,
      [postId]: (current[postId] ?? 0) + 1,
    }));
  };

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

      <section className="space-y-3">
        {threadPosts.map((post) => (
          <PostCard
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
      </section>

      <section>
        <h3 className="text-brand-primary mb-2 text-base font-semibold">Add Reply</h3>
        <RichTextEditor
          value={replyText}
          onChange={setReplyText}
          onSubmit={handleSubmitReply}
          placeholder="Share your thoughts with the community..."
        />
      </section>

      <Link to="/" className="forum-link inline-block text-sm font-medium">
        Back to topics
      </Link>
    </div>
  );
};

export default ThreadPage;
