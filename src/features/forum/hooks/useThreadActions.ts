import { useCallback, useState } from 'react';

import {
  buildQortalShareLink,
  copyToClipboard,
} from '../../../services/qortal/share';
import { requestQortal } from '../../../services/qortal/qortalClient';
import {
  getQortBalance,
  resolveNameWalletAddress,
} from '../../../services/qortal/walletService';
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
  deletePost: (input: {
    postId: string;
    reason: string;
  }) => Promise<ForumMutationResult>;
  tipPost: (postId: string) => Promise<ForumMutationResult>;
  resolveAuthorDisplayName: (authorUserId: string) => string;
};

export const useThreadActions = ({
  threadId,
  createPost,
  uploadPostImage,
  uploadPostAttachment,
  updatePost,
  deletePost,
  tipPost,
  resolveAuthorDisplayName,
}: UseThreadActionsParams) => {
  const [replyText, setReplyText] = useState('');
  const [replyTarget, setReplyTarget] = useState<Post | null>(null);
  const [replyAttachments, setReplyAttachments] = useState<PostAttachment[]>(
    []
  );
  const [isTipModalOpen, setIsTipModalOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState('0');
  const [tipRecipientName, setTipRecipientName] = useState('');
  const [tipRecipientAddress, setTipRecipientAddress] = useState<string | null>(
    null
  );
  const [tipResolveError, setTipResolveError] = useState<string | null>(null);
  const [isResolvingTipRecipient, setIsResolvingTipRecipient] = useState(false);
  const [isSendingTip, setIsSendingTip] = useState(false);
  const [qortBalance, setQortBalance] = useState<number | null>(null);
  const [isTipBalanceLoading, setIsTipBalanceLoading] = useState(false);
  const [tipTargetPostId, setTipTargetPostId] = useState<string | null>(null);
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
      const reason = window.prompt('Provide a reason for deleting this post:');
      if (!reason?.trim()) {
        setFeedback('Delete cancelled: reason is required.');
        return;
      }

      const result = await deletePost({ postId, reason });
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

  const resolveTipRecipient = useCallback(async (recipientName: string) => {
    const normalizedName = recipientName.trim();
    if (!normalizedName) {
      setTipRecipientAddress(null);
      setTipResolveError('Recipient name is missing.');
      return null;
    }

    setIsResolvingTipRecipient(true);
    setTipResolveError(null);

    try {
      const address = await resolveNameWalletAddress(normalizedName);
      if (!address) {
        setTipRecipientAddress(null);
        setTipResolveError('Recipient wallet address could not be resolved.');
        return null;
      }

      setTipRecipientAddress(address);
      return address;
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Recipient wallet address lookup failed.';
      setTipRecipientAddress(null);
      setTipResolveError(message);
      return null;
    } finally {
      setIsResolvingTipRecipient(false);
    }
  }, []);

  const handleSendTip = useCallback(
    async (post: Post) => {
      const recipientName = post.authorUserId.trim();
      setTipTargetPostId(post.id);
      setTipRecipientName(recipientName);
      setTipAmount('0');
      setTipRecipientAddress(null);
      setTipResolveError(null);
      setIsTipModalOpen(true);

      setIsTipBalanceLoading(true);
      try {
        const balance = await getQortBalance();
        setQortBalance(balance);
      } catch {
        setQortBalance(null);
      } finally {
        setIsTipBalanceLoading(false);
      }

      void resolveTipRecipient(recipientName);
    },
    [resolveTipRecipient]
  );

  const closeTipModal = useCallback(() => {
    if (isSendingTip) {
      return;
    }

    setIsTipModalOpen(false);
  }, [isSendingTip]);

  const submitTip = useCallback(async () => {
    const parsedAmount = Number(tipAmount);
    const trimmedRecipientName = tipRecipientName.trim();

    if (!trimmedRecipientName) {
      setFeedback('Recipient name is missing.');
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFeedback('Enter a QORT amount greater than 0.');
      return;
    }

    if (typeof qortBalance === 'number' && parsedAmount > qortBalance) {
      setFeedback('Entered amount is higher than your wallet balance.');
      return;
    }

    const resolvedAddress =
      tipRecipientAddress ?? (await resolveTipRecipient(trimmedRecipientName));
    if (!resolvedAddress) {
      setFeedback('Recipient wallet address could not be resolved.');
      return;
    }

    try {
      setIsSendingTip(true);
      await requestQortal({
        action: 'SEND_COIN',
        coin: 'QORT',
        recipient: resolvedAddress,
        amount: parsedAmount,
      });

      if (tipTargetPostId) {
        const tipPersistResult = await tipPost(tipTargetPostId);
        if (!tipPersistResult.ok) {
          setFeedback(
            tipPersistResult.error ??
              `Tip sent to @${trimmedRecipientName}, but counter sync failed.`
          );
          return;
        }
      }

      setIsTipModalOpen(false);
      setTipAmount('0');
      setFeedback(`Tip sent to @${trimmedRecipientName}.`);
      try {
        const balance = await getQortBalance();
        setQortBalance(balance);
      } catch {
        // Keep last known balance if refresh fails.
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Tip transfer failed.';
      setFeedback(message);
    } finally {
      setIsSendingTip(false);
    }
  }, [
    qortBalance,
    resolveTipRecipient,
    tipAmount,
    tipRecipientAddress,
    tipRecipientName,
    tipPost,
    tipTargetPostId,
  ]);

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
    isTipModalOpen,
    tipAmount,
    tipRecipientName,
    tipRecipientAddress,
    tipResolveError,
    isResolvingTipRecipient,
    isSendingTip,
    isTipBalanceLoading,
    formattedTipBalance:
      typeof qortBalance === 'number' ? qortBalance.toFixed(8) : '0.00000000',
    handleSubmitReply,
    handleReplyToPost,
    handleCancelReplyTarget,
    handleEditPost,
    handleDeletePost,
    handleSharePost,
    handleSendTip,
    closeTipModal,
    setTipAmount,
    submitTip,
    uploadImageForReply,
    uploadAttachmentForReply,
  };
};
