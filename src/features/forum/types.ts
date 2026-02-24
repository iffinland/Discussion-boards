export type ForumMutationResult = {
  ok: boolean;
  error?: string;
};

export type ForumUploadImageResult = {
  ok: boolean;
  error?: string;
  imageTag?: string;
};
