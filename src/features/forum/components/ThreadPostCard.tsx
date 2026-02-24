import { useRef, useState } from "react";

import RichTextContent from "../../../components/forum/RichTextContent";
import RichTextToolsModal from "../../../components/forum/RichTextToolsModal";
import {
  applyWrapFormat,
  formatToTags,
  type RichTextFormatType,
} from "../../../services/forum/richText";
import type { Post, User } from "../../../types";
import PostActionsModal from "./PostActionsModal";

type ThreadPostCardProps = {
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

const ThreadPostCard = ({
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
}: ThreadPostCardProps) => {
  const displayName = author?.displayName ?? "Unknown User";
  const avatarColor = author?.avatarColor ?? "bg-cyan-500";
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(post.content);
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  const applyDraftFormatting = (openTag: string, closeTag: string) => {
    const textarea = editTextareaRef.current;
    if (!textarea) {
      return;
    }

    const result = applyWrapFormat({
      value: draftContent,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      openTag,
      closeTag,
    });
    setDraftContent(result.value);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        result.nextSelectionStart,
        result.nextSelectionEnd
      );
    });
  };

  const handleDraftFormat = (format: RichTextFormatType) => {
    const [openTag, closeTag] = formatToTags[format];
    applyDraftFormatting(openTag, closeTag);
  };

  const handleDraftColor = (color: string) => {
    applyDraftFormatting(`[color=${color}]`, "[/color]");
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
        <button
          type="button"
          onClick={() => setIsActionsModalOpen(true)}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-cyan-300 hover:bg-cyan-50"
        >
          Actions
        </button>
      </header>

      {isEditing ? (
        <div className="mt-3 space-y-2">
          <div className="border-brand-primary bg-brand-primary-soft flex items-center gap-2 rounded-md border p-2">
            <button
              type="button"
              onClick={() => setIsToolsModalOpen(true)}
              className="forum-pill-primary text-brand-primary-strong rounded-md px-2 py-1 text-xs font-semibold"
            >
              Rich Text
            </button>
          </div>
          <textarea
            ref={editTextareaRef}
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
          <RichTextToolsModal
            isOpen={isToolsModalOpen}
            onClose={() => setIsToolsModalOpen(false)}
            onApplyFormat={handleDraftFormat}
            onApplyColor={handleDraftColor}
          />
        </div>
      ) : (
        <RichTextContent
          value={post.content}
          className="text-ui-strong mt-3 text-sm leading-relaxed"
        />
      )}

      <div className="mt-4 flex items-center gap-4 text-xs text-slate-600">
        <span>Likes: {post.likes}</span>
        <span>Tips: {tipCount}</span>
      </div>

      <PostActionsModal
        isOpen={isActionsModalOpen}
        isOwner={isOwner}
        likes={post.likes}
        tipCount={tipCount}
        onClose={() => setIsActionsModalOpen(false)}
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

export default ThreadPostCard;
