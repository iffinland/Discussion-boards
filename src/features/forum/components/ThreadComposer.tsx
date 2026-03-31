import RichTextEditor from "../../../components/forum/RichTextEditor";

type ThreadComposerProps = {
  replyText: string;
  onReplyTextChange: (value: string) => void;
  onSubmit: () => void;
  onUploadImage: (file: File) => Promise<string>;
  disabled?: boolean;
  helperText?: string | null;
};

const ThreadComposer = ({
  replyText,
  onReplyTextChange,
  onSubmit,
  onUploadImage,
  disabled = false,
  helperText = null,
}: ThreadComposerProps) => {
  if (disabled) {
    return (
      <section>
        <h3 className="text-brand-primary mb-2 text-base font-semibold">Add Reply</h3>
        <div className="forum-card-accent p-4 text-sm text-slate-600">
          {helperText ?? "Replies are currently disabled for this thread."}
        </div>
      </section>
    );
  }

  return (
    <section>
      <h3 className="text-brand-primary mb-2 text-base font-semibold">Add Reply</h3>
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
