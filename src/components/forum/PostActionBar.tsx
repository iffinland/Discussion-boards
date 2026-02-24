type PostActionBarProps = {
  likes: number;
  tipCount: number;
  isOwner: boolean;
  onLike: () => void;
  onReply: () => void;
  onShare: () => void;
  onSendTip: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const baseButtonClass =
  "rounded-md px-2.5 py-1.5 text-xs font-semibold transition";

const PostActionBar = ({
  likes,
  tipCount,
  isOwner,
  onLike,
  onReply,
  onShare,
  onSendTip,
  onEdit,
  onDelete,
}: PostActionBarProps) => {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onLike}
        className={`forum-pill-primary text-brand-primary-strong ${baseButtonClass}`}
      >
        Like ({likes})
      </button>

      <button
        type="button"
        onClick={onReply}
        className={`forum-pill-accent text-brand-accent-strong ${baseButtonClass}`}
      >
        Reply
      </button>

      <button
        type="button"
        onClick={onShare}
        className={`bg-surface-card text-ui-muted border border-slate-200 ${baseButtonClass}`}
      >
        Share
      </button>

      <button
        type="button"
        onClick={onSendTip}
        className={`forum-pill-accent text-brand-accent-strong ${baseButtonClass}`}
      >
        Send Tip ({tipCount})
      </button>

      {isOwner ? (
        <>
          <button
            type="button"
            onClick={onEdit}
            className={`forum-pill-primary text-brand-primary-strong ${baseButtonClass}`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className={`border border-orange-300 bg-orange-50 text-brand-accent-strong ${baseButtonClass}`}
          >
            Delete
          </button>
        </>
      ) : null}
    </div>
  );
};

export default PostActionBar;
