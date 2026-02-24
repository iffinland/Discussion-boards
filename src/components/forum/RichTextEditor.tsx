import { type FormEvent } from "react";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
};

const RichTextEditor = ({
  value,
  onChange,
  onSubmit,
  placeholder = "Write your reply...",
}: RichTextEditorProps) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!value.trim()) {
      return;
    }

    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="forum-card-primary p-4">
      <div className="border-brand-primary bg-brand-primary-soft mb-3 flex items-center gap-2 rounded-md border p-2">
        <button
          type="button"
          className="forum-pill-primary text-brand-primary-strong rounded-md px-2 py-1 text-xs font-semibold"
        >
          Bold
        </button>
        <button
          type="button"
          className="forum-pill-primary text-brand-primary-strong rounded-md px-2 py-1 text-xs font-semibold"
        >
          Italic
        </button>
        <button
          type="button"
          className="forum-pill-accent text-brand-accent-strong rounded-md px-2 py-1 text-xs font-semibold"
        >
          Image
        </button>
      </div>

      <label className="sr-only" htmlFor="reply-editor">
        Reply editor
      </label>
      <textarea
        id="reply-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="bg-surface-card text-ui-strong min-h-28 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-cyan-300"
      />

      <div className="mt-3 flex items-center justify-between">
        <p className="text-ui-muted text-xs">Toolbar buttons are visual for now.</p>
        <button
          type="submit"
          className="bg-brand-primary-solid rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600"
        >
          Post Reply
        </button>
      </div>
    </form>
  );
};

export default RichTextEditor;
