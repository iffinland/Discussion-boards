import AppModal from '../../../components/common/AppModal';
import type { PostAttachment } from '../../../types';
import ThreadComposer from './ThreadComposer';

type PostComposerModalProps = {
  isOpen: boolean;
  title: string;
  placeholder: string;
  submitLabel: string;
  replyText: string;
  replyAttachments: PostAttachment[];
  replyTargetAuthorName?: string | null;
  replyTargetContent?: string | null;
  onReplyTextChange: (value: string) => void;
  onReplyAttachmentsChange: (attachments: PostAttachment[]) => void;
  onSubmit: () => Promise<boolean>;
  onUploadImage: (file: File) => Promise<string>;
  onUploadAttachment: (file: File) => Promise<PostAttachment>;
  onCancelReplyTarget?: () => void;
  onClose: () => void;
  disabled?: boolean;
  helperText?: string | null;
};

const PostComposerModal = ({
  isOpen,
  title,
  placeholder,
  submitLabel,
  replyText,
  replyAttachments,
  replyTargetAuthorName = null,
  replyTargetContent = null,
  onReplyTextChange,
  onReplyAttachmentsChange,
  onSubmit,
  onUploadImage,
  onUploadAttachment,
  onCancelReplyTarget,
  onClose,
  disabled = false,
  helperText = null,
}: PostComposerModalProps) => {
  const handleSubmit = async () => {
    const didPublish = await onSubmit();
    if (didPublish) {
      onClose();
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel={title}
      title={title}
      maxWidthClassName="max-w-4xl"
    >
      <div className="max-h-[78vh] overflow-y-auto pr-1">
        <ThreadComposer
          title={title}
          showTitle={false}
          placeholder={placeholder}
          submitLabel={submitLabel}
          replyText={replyText}
          replyAttachments={replyAttachments}
          replyTargetAuthorName={replyTargetAuthorName}
          replyTargetContent={replyTargetContent}
          onReplyTextChange={onReplyTextChange}
          onReplyAttachmentsChange={onReplyAttachmentsChange}
          onSubmit={() => void handleSubmit()}
          onUploadImage={onUploadImage}
          onUploadAttachment={onUploadAttachment}
          onCancelReplyTarget={onCancelReplyTarget}
          disabled={disabled}
          helperText={helperText}
        />
      </div>
    </AppModal>
  );
};

export default PostComposerModal;
