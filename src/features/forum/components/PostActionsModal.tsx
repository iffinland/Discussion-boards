type PostActionsModalProps = {
  isOpen: boolean;
  isOwner: boolean;
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
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Post actions"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-800">Post Actions</h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
          >
            Close
          </button>
        </div>

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
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PostActionsModal;
