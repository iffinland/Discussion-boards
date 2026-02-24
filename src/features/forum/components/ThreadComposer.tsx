import RichTextEditor from "../../../components/forum/RichTextEditor";

type ThreadComposerProps = {
  replyText: string;
  onReplyTextChange: (value: string) => void;
  onSubmit: () => void;
  onUploadImage: (file: File) => Promise<string>;
};

const ThreadComposer = ({
  replyText,
  onReplyTextChange,
  onSubmit,
  onUploadImage,
}: ThreadComposerProps) => {
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
