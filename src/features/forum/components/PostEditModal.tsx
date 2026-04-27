import AppModal from '../../../components/common/AppModal';
import RichTextEditor from '../../../components/forum/RichTextEditor';
import type { PostAttachment } from '../../../types';

type PostEditModalProps = {
  isOpen: boolean;
  editText: string;
  onEditTextChange: (value: string) => void;
  onSubmit: () => Promise<boolean>;
  onUploadImage: (file: File) => Promise<string>;
  onClose: () => void;
};

const emptyAttachments: PostAttachment[] = [];

const PostEditModal = ({
  isOpen,
  editText,
  onEditTextChange,
  onSubmit,
  onUploadImage,
  onClose,
}: PostEditModalProps) => {
  const handleSubmit = async () => {
    const didUpdate = await onSubmit();
    if (didUpdate) {
      onClose();
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Edit Post"
      title="Edit Post"
      maxWidthClassName="max-w-4xl"
    >
      <div className="max-h-[78vh] overflow-y-auto pr-1">
        <RichTextEditor
          value={editText}
          attachments={emptyAttachments}
          onChange={onEditTextChange}
          onAttachmentsChange={() => undefined}
          onSubmit={() => void handleSubmit()}
          onUploadImage={onUploadImage}
          placeholder="Update your post..."
          editorLabel="Edit post editor"
          submitLabel="Save Changes"
          canManageAttachments={false}
        />
      </div>
    </AppModal>
  );
};

export default PostEditModal;
