import RichTextEditor from "../../../components/forum/RichTextEditor";

type ThreadComposerProps = {
  replyText: string;
  onReplyTextChange: (value: string) => void;
  onSubmit: () => void;
};

const ThreadComposer = ({
  replyText,
  onReplyTextChange,
  onSubmit,
}: ThreadComposerProps) => {
  return (
    <section>
      <h3 className="text-brand-primary mb-2 text-base font-semibold">Add Reply</h3>
      <RichTextEditor
        value={replyText}
        onChange={onReplyTextChange}
        onSubmit={onSubmit}
        placeholder="Share your thoughts with the community..."
      />
    </section>
  );
};

export default ThreadComposer;
