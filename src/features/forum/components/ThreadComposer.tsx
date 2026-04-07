import RichTextContent from '../../../components/forum/RichTextContent';
import RichTextEditor from '../../../components/forum/RichTextEditor';

type ThreadComposerProps = {
  replyText: string;
  replyTargetAuthorName?: string | null;
  replyTargetContent?: string | null;
  onReplyTextChange: (value: string) => void;
  onSubmit: () => void;
  onUploadImage: (file: File) => Promise<string>;
  onCancelReplyTarget?: () => void;
  disabled?: boolean;
  helperText?: string | null;
};

const ThreadComposer = ({
  replyText,
  replyTargetAuthorName = null,
  replyTargetContent = null,
  onReplyTextChange,
  onSubmit,
  onUploadImage,
  onCancelReplyTarget,
  disabled = false,
  helperText = null,
}: ThreadComposerProps) => {
  if (disabled) {
    return (
      <section>
        <h3 className="text-brand-primary mb-2 text-base font-semibold">
          Add Reply
        </h3>
        <div className="forum-card-accent p-4 text-sm text-slate-600">
          {helperText ?? 'Replies are currently disabled for this thread.'}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-brand-primary mb-2 text-base font-semibold">
        Add Reply
      </h3>
      {replyTargetAuthorName && replyTargetContent ? (
        <div className="forum-card-accent mb-3 border-l-4 border-cyan-300 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-ui-strong text-xs font-semibold">
              Replying to {replyTargetAuthorName}
            </p>
            {onCancelReplyTarget ? (
              <button
                type="button"
                onClick={onCancelReplyTarget}
                className="text-ui-muted rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold"
              >
                Cancel Reply
              </button>
            ) : null}
          </div>
          <RichTextContent
            value={replyTargetContent}
            className="text-ui-muted text-xs leading-relaxed"
          />
        </div>
      ) : null}
      <RichTextEditor
        value={replyText}
        onChange={onReplyTextChange}
        onSubmit={onSubmit}
        onUploadImage={onUploadImage}
        placeholder="Share your thoughts with the community..."
      />
    </section>
  );
};

export default ThreadComposer;
