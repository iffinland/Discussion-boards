import { useState } from "react";

import type { Post, User } from "../../types";
import PostActionBar from "./PostActionBar";

type PostCardProps = {
  post: Post;
  author: User | undefined;
  isOwner: boolean;
  tipCount: number;
  onLike: (postId: string) => void;
  onReply: (post: Post) => void;
  onShare: (postId: string) => void;
  onSendTip: (postId: string) => void;
  onEdit: (postId: string, nextContent: string) => void;
  onDelete: (postId: string) => void;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const PostCard = ({
  post,
  author,
  isOwner,
  tipCount,
  onLike,
  onReply,
  onShare,
  onSendTip,
  onEdit,
  onDelete,
}: PostCardProps) => {
  const displayName = author?.displayName ?? "Unknown User";
  const avatarColor = author?.avatarColor ?? "bg-cyan-500";
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(post.content);

  const handleStartEdit = () => {
    setDraftContent(post.content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const value = draftContent.trim();
    if (!value) {
      return;
    }

    onEdit(post.id, value);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setDraftContent(post.content);
    setIsEditing(false);
  };

  return (
    <article className="forum-card-accent p-4">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`${avatarColor} flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white`}
            aria-hidden="true"
          >
            {getInitials(displayName)}
          </div>
          <div>
            <p className="text-ui-strong text-sm font-semibold">{displayName}</p>
            <p className="text-ui-muted text-xs">{formatDateTime(post.createdAt)}</p>
          </div>
        </div>
      </header>

      {isEditing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            className="bg-surface-card text-ui-strong min-h-24 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-cyan-300"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              className="bg-brand-primary-solid rounded-md px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-600"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="bg-surface-card text-ui-muted rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-ui-strong mt-3 whitespace-pre-wrap text-sm leading-relaxed">
          {post.content}
        </p>
      )}

      <PostActionBar
        likes={post.likes}
        tipCount={tipCount}
        isOwner={isOwner}
        onLike={() => onLike(post.id)}
        onReply={() => onReply(post)}
        onShare={() => onShare(post.id)}
        onSendTip={() => onSendTip(post.id)}
        onEdit={handleStartEdit}
        onDelete={() => onDelete(post.id)}
      />
    </article>
  );
};

export default PostCard;
