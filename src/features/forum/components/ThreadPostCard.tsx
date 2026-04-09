import { useRef, useState } from 'react';

import UserRoleBadge from '../../../components/common/UserRoleBadge';
import RichTextContent from '../../../components/forum/RichTextContent';
import RichTextToolsModal from '../../../components/forum/RichTextToolsModal';
import {
  applyListFormat,
  applyWrapFormat,
  formatToTags,
  type RichTextFormatType,
} from '../../../services/forum/richText';
import type { Post, User, UserRole } from '../../../types';
import PostAttachmentList from './PostAttachmentList';
import PostActionsModal from './PostActionsModal';

type ThreadPostCardProps = {
  post: Post;
  author: User | undefined;
  authorRole: UserRole;
  repliedPost?: Post | null;
  repliedAuthorName?: string | null;
  highlighted?: boolean;
  replyContextHighlighted?: boolean;
  isOwner: boolean;
  canModerate: boolean;
  hasLiked: boolean;
  tipCount: number;
  onLike: (postId: string) => void;
  onReply: (post: Post) => void;
  onShare: (postId: string) => void;
  onSendTip: (post: Post) => void;
  onJumpToPost?: (postId: string) => void;
  onEdit: (postId: string, nextContent: string) => void;
  onDelete: (postId: string) => void;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const formatEditedDateTime = (value: string | null | undefined) =>
  value ? formatDateTime(value) : null;

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const ThreadPostCard = ({
  post,
  author,
  authorRole,
  repliedPost = null,
  repliedAuthorName = null,
  highlighted = false,
  replyContextHighlighted = false,
  isOwner,
  canModerate,
  hasLiked,
  tipCount,
  onLike,
  onReply,
  onShare,
  onSendTip,
  onJumpToPost,
  onEdit,
  onDelete,
}: ThreadPostCardProps) => {
  const displayName = author?.displayName ?? 'Unknown User';
  const avatarColor = author?.avatarColor ?? 'bg-cyan-500';
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(post.content);
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [isAvatarVisible, setIsAvatarVisible] = useState(true);
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
    if (format === 'unorderedList' || format === 'orderedList') {
      const textarea = editTextareaRef.current;
      if (!textarea) {
        return;
      }

      const result = applyListFormat({
        value: draftContent,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
        ordered: format === 'orderedList',
      });
      setDraftContent(result.value);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(
          result.nextSelectionStart,
          result.nextSelectionEnd
        );
      });
      return;
    }

    const [openTag, closeTag] = formatToTags[format];
    applyDraftFormatting(openTag, closeTag);
  };

  const handleDraftColor = (color: string) => {
    applyDraftFormatting(`[color=${color}]`, '[/color]');
  };

  return (
    <article
      id={`post-${post.id}`}
      className={[
        'forum-card-accent p-4 transition',
        highlighted
          ? 'ring-2 ring-cyan-300 ring-offset-2 ring-offset-slate-50'
          : '',
      ].join(' ')}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {author?.avatarUrl && isAvatarVisible ? (
            <img
              src={author.avatarUrl}
              alt={`${displayName} avatar`}
              className="h-10 w-10 rounded-full object-cover"
              onError={() => setIsAvatarVisible(false)}
            />
          ) : (
            <div
              className={`${avatarColor} flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold text-white`}
              aria-hidden="true"
            >
              {getInitials(displayName)}
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-ui-strong text-sm font-semibold">
                {displayName}
              </p>
              <UserRoleBadge role={authorRole} />
            </div>
            <p className="text-ui-muted text-xs">
              {formatDateTime(post.createdAt)}
            </p>
            {post.editedAt ? (
              <p className="mt-0.5 text-xs font-semibold text-amber-700">
                EDITED {formatEditedDateTime(post.editedAt)}
              </p>
            ) : null}
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
        <>
          {repliedPost ? (
            <button
              type="button"
              onClick={() => onJumpToPost?.(repliedPost.id)}
              className={[
                'mt-3 w-full rounded-lg border-l-4 px-3 py-2 text-left transition',
                replyContextHighlighted
                  ? 'border-cyan-400 bg-cyan-50 ring-1 ring-cyan-200'
                  : 'border-slate-300 bg-slate-50 hover:bg-slate-100',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-ui-strong text-xs font-semibold">
                  Replying to {repliedAuthorName ?? 'Member'}
                </p>
                <span className="text-xs font-semibold text-cyan-700">
                  Jump to post
                </span>
              </div>
              <RichTextContent
                value={repliedPost.content}
                className="text-ui-muted mt-1 text-xs leading-relaxed"
              />
            </button>
          ) : null}
          <RichTextContent
            value={post.content}
            className="text-ui-strong mt-3 text-sm leading-relaxed"
          />
          <PostAttachmentList attachments={post.attachments} />
        </>
      )}

      <div className="mt-4 flex items-center gap-4 text-xs text-slate-600">
        <span>Likes: {post.likes}</span>
        <span>Tips: {tipCount}</span>
      </div>

      <PostActionsModal
        isOpen={isActionsModalOpen}
        isOwner={isOwner}
        canModerate={canModerate}
        likes={post.likes}
        tipCount={tipCount}
        hasLiked={hasLiked}
        onClose={() => setIsActionsModalOpen(false)}
        onLike={() => onLike(post.id)}
        onReply={() => onReply(post)}
        onShare={() => onShare(post.id)}
        onSendTip={() => onSendTip(post)}
        onEdit={handleStartEdit}
        onDelete={() => onDelete(post.id)}
      />
    </article>
  );
};

export default ThreadPostCard;
