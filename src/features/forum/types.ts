export type ForumMutationResult = {
  ok: boolean;
  error?: string;
  subTopicId?: string;
};

export type ForumUploadImageResult = {
  ok: boolean;
  error?: string;
  imageTag?: string;
};

export type ForumUploadAttachmentResult = {
  ok: boolean;
  error?: string;
  attachment?: import('../../types').PostAttachment;
};
