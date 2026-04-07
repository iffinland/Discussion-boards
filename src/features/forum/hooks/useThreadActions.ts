import { useCallback, useState } from 'react';

import type { Post } from '../../../types';
import type { ForumMutationResult, ForumUploadImageResult } from '../types';

type UseThreadActionsParams = {
  threadId?: string;
  createPost: (input: {
    subTopicId: string;
    content: string;
  }) => Promise<ForumMutationResult>;
  uploadPostImage: (file: File) => Promise<ForumUploadImageResult>;
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
  updatePost,
  deletePost,
  resolveAuthorDisplayName,
}: UseThreadActionsParams) => {
  const [replyText, setReplyText] = useState('');
  const [tipsByPostId, setTipsByPostId] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmitReply = useCallback(async () => {
    if (!threadId) {
      return;
    }

    const result = await createPost({
      subTopicId: threadId,
      content: replyText,
    });

    if (!result.ok) {
      setFeedback(result.error ?? 'Unable to publish post.');
      return;
    }

    setReplyText('');
    setFeedback('Reply published.');
  }, [createPost, replyText, threadId]);

  const handleReplyToPost = useCallback(
    (post: Post) => {
      const authorName = resolveAuthorDisplayName(post.authorUserId);
      setReplyText(`@${authorName} `);
    },
    [resolveAuthorDisplayName]
  );

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
      if (!threadId || typeof window === 'undefined' || !navigator.clipboard) {
        return;
      }

      const shareUrl = `${window.location.origin}${window.location.pathname}#/thread/${threadId}?post=${postId}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
        setFeedback('Post link copied.');
      } catch {
        setFeedback('Unable to copy post link.');
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

  return {
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
    uploadImageForReply,
  };
};
