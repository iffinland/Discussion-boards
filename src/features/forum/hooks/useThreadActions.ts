import { useCallback, useState } from 'react';

import {
  buildQortalShareLink,
  copyToClipboard,
} from '../../../services/qortal/share';
import type { Post, PostAttachment } from '../../../types';
import type {
  ForumMutationResult,
  ForumUploadAttachmentResult,
  ForumUploadImageResult,
} from '../types';

type UseThreadActionsParams = {
  threadId?: string;
  createPost: (input: {
    subTopicId: string;
    content: string;
    parentPostId?: string | null;
    attachments?: PostAttachment[];
  }) => Promise<ForumMutationResult>;
  uploadPostImage: (file: File) => Promise<ForumUploadImageResult>;
  uploadPostAttachment: (file: File) => Promise<ForumUploadAttachmentResult>;
  updatePost: (input: {
    postId: string;
    content: string;
  }) => Promise<ForumMutationResult>;
  deletePost: (postId: string) => Promise<ForumMutationResult>;
  resolveAuthorDisplayName: (authorUserId: string) => string;
};

export const useThreadActions = ({
  threadId,
  createPost,
  uploadPostImage,
  uploadPostAttachment,
  updatePost,
  deletePost,
  resolveAuthorDisplayName,
}: UseThreadActionsParams) => {
  const [replyText, setReplyText] = useState('');
  const [replyTarget, setReplyTarget] = useState<Post | null>(null);
  const [replyAttachments, setReplyAttachments] = useState<PostAttachment[]>(
    []
  );
  const [tipsByPostId, setTipsByPostId] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmitReply = useCallback(async () => {
    if (!threadId) {
      return;
    }

    const result = await createPost({
      subTopicId: threadId,
      content: replyText,
      parentPostId: replyTarget?.id ?? null,
      attachments: replyAttachments,
    });

    if (!result.ok) {
      setFeedback(result.error ?? 'Unable to publish post.');
      return;
    }

    setReplyText('');
    setReplyTarget(null);
    setReplyAttachments([]);
    setFeedback('Reply published.');
  }, [createPost, replyAttachments, replyTarget, replyText, threadId]);

  const handleReplyToPost = useCallback(
    (post: Post) => {
      const authorName = resolveAuthorDisplayName(post.authorUserId);
      setReplyTarget(post);
      setReplyText((current) => (current.trim() ? current : `@${authorName} `));
    },
    [resolveAuthorDisplayName]
  );

  const handleCancelReplyTarget = useCallback(() => {
    setReplyTarget(null);
  }, []);

  const handleEditPost = useCallback(
    async (postId: string, content: string) => {
      const result = await updatePost({ postId, content });
      if (!result.ok) {
        setFeedback(result.error ?? 'Unable to update post.');
        return;
      }

      setFeedback('Post updated.');
    },
    [updatePost]
  );

  const handleDeletePost = useCallback(
    async (postId: string) => {
      const result = await deletePost(postId);
      if (!result.ok) {
        setFeedback(result.error ?? 'Unable to delete post.');
        return;
      }

      setFeedback('Post deleted.');
    },
    [deletePost]
  );

  const handleSharePost = useCallback(
    async (postId: string) => {
      if (!threadId || typeof window === 'undefined') {
        return;
      }

      const shareUrl = buildQortalShareLink(
        `/thread/${threadId}?post=${postId}`
      );
      try {
        await copyToClipboard(shareUrl);
        setFeedback('Post link copied to clipboard.');
        window.setTimeout(() => {
          setFeedback((current) =>
            current === 'Post link copied to clipboard.' ? null : current
          );
        }, 2400);
      } catch {
        setFeedback('Unable to copy post link to clipboard.');
      }
    },
    [threadId]
  );

  const handleSendTip = useCallback((postId: string) => {
    setTipsByPostId((current) => ({
      ...current,
      [postId]: (current[postId] ?? 0) + 1,
    }));
  }, []);

  const uploadImageForReply = useCallback(
    async (file: File): Promise<string> => {
      const result = await uploadPostImage(file);
      if (!result.ok || !result.imageTag) {
        throw new Error(result.error ?? 'Unable to upload image.');
      }

      return result.imageTag;
    },
    [uploadPostImage]
  );

  const uploadAttachmentForReply = useCallback(
    async (file: File): Promise<PostAttachment> => {
      const result = await uploadPostAttachment(file);
      if (!result.ok || !result.attachment) {
        throw new Error(result.error ?? 'Unable to upload attachment.');
      }

      return result.attachment;
    },
    [uploadPostAttachment]
  );

  return {
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
  };
};
