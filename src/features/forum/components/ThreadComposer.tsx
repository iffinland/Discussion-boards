import type { PostAttachment } from '../../../types';
import RichTextContent from '../../../components/forum/RichTextContent';
import RichTextEditor from '../../../components/forum/RichTextEditor';

type ThreadComposerProps = {
  replyText: string;
  replyAttachments: PostAttachment[];
  replyTargetAuthorName?: string | null;
  replyTargetContent?: string | null;
  title?: string;
  showTitle?: boolean;
  placeholder?: string;
  submitLabel?: string;
  onReplyTextChange: (value: string) => void;
  onReplyAttachmentsChange: (attachments: PostAttachment[]) => void;
  onSubmit: () => void;
  onUploadImage: (file: File) => Promise<string>;
  onUploadAttachment: (file: File) => Promise<PostAttachment>;
  onCancelReplyTarget?: () => void;
  disabled?: boolean;
  helperText?: string | null;
};

const ThreadComposer = ({
  replyText,
  replyAttachments,
  replyTargetAuthorName = null,
  replyTargetContent = null,
  title = 'Add New Post',
  showTitle = true,
  placeholder = 'Share your thoughts with the community...',
  submitLabel = 'Publish Post',
  onReplyTextChange,
  onReplyAttachmentsChange,
  onSubmit,
  onUploadImage,
  onUploadAttachment,
  onCancelReplyTarget,
  disabled = false,
  helperText = null,
}: ThreadComposerProps) => {
  if (disabled) {
    return (
      <section>
        {showTitle ? (
          <h3 className="text-brand-primary mb-2 text-base font-semibold">
            {title}
          </h3>
        ) : null}
        <div className="forum-card-accent p-4 text-sm text-slate-600">
          {helperText ?? 'Replies are currently disabled for this thread.'}
        </div>
      </section>
    );
  }

  return (
    <section>
      {showTitle ? (
        <h3 className="text-brand-primary mb-2 text-base font-semibold">
          {title}
        </h3>
      ) : null}
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
        attachments={replyAttachments}
        onChange={onReplyTextChange}
        onAttachmentsChange={onReplyAttachmentsChange}
        onSubmit={onSubmit}
        onUploadImage={onUploadImage}
        onUploadAttachment={onUploadAttachment}
        placeholder={placeholder}
        submitLabel={submitLabel}
      />
    </section>
  );
};

export default ThreadComposer;
