import AppModal from "../../../components/common/AppModal";

type PostActionsModalProps = {
  isOpen: boolean;
  isOwner: boolean;
  canModerate: boolean;
  likes: number;
  tipCount: number;
  onClose: () => void;
  onLike: () => void;
  onReply: () => void;
  onShare: () => void;
  onSendTip: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const actionButtonClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:border-cyan-300 hover:bg-cyan-50";

const dangerButtonClass =
  "w-full rounded-md border border-orange-300 bg-orange-50 px-3 py-2 text-left text-sm font-semibold text-orange-700 transition hover:bg-orange-100";

const PostActionsModal = ({
  isOpen,
  isOwner,
  canModerate,
  likes,
  tipCount,
  onClose,
  onLike,
  onReply,
  onShare,
  onSendTip,
  onEdit,
  onDelete,
}: PostActionsModalProps) => {
  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Post actions"
      title="Post Actions"
      maxWidthClassName="max-w-sm"
    >
      <div className="space-y-2">
        <button
          type="button"
          className={actionButtonClass}
          onClick={() => {
            onLike();
            onClose();
          }}
        >
          Like ({likes})
        </button>
        <button
          type="button"
          className={actionButtonClass}
          onClick={() => {
            onReply();
            onClose();
          }}
        >
          Reply
        </button>
        <button
          type="button"
          className={actionButtonClass}
          onClick={() => {
            onShare();
            onClose();
          }}
        >
          Share
        </button>
        <button
          type="button"
          className={actionButtonClass}
          onClick={() => {
            onSendTip();
            onClose();
          }}
        >
          Send Tip ({tipCount})
        </button>
        {isOwner ? (
          <>
            <button
              type="button"
              className={actionButtonClass}
              onClick={() => {
                onEdit();
                onClose();
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className={dangerButtonClass}
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              Delete
            </button>
          </>
        ) : canModerate ? (
          <button
            type="button"
            className={dangerButtonClass}
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            Moderation Delete
          </button>
        ) : null}
      </div>
    </AppModal>
  );
};

export default PostActionsModal;
