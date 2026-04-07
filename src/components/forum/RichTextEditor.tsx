import {
  type ChangeEvent,
  type FormEvent,
  useId,
  useRef,
  useState,
} from 'react';

import {
  applyWrapFormat,
  formatToTags,
  RICH_TEXT_IMAGE_LIMITS,
  type RichTextFormatType,
} from '../../services/forum/richText';
import RichTextToolsModal from './RichTextToolsModal';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onUploadImage?: (file: File) => Promise<string>;
  placeholder?: string;
};

const RichTextEditor = ({
  value,
  onChange,
  onSubmit,
  onUploadImage,
  placeholder = 'Write your reply...',
}: RichTextEditorProps) => {
  const editorId = useId();
  const fileInputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);
  const [editorInfo, setEditorInfo] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!value.trim()) {
      return;
    }

    onSubmit();
  };

  const applyFormatting = (openTag: string, closeTag: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const result = applyWrapFormat({
      value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      openTag,
      closeTag,
    });
    onChange(result.value);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        result.nextSelectionStart,
        result.nextSelectionEnd
      );
    });
  };

  const handleFormat = (format: RichTextFormatType) => {
    const [openTag, closeTag] = formatToTags[format];
    applyFormatting(openTag, closeTag);
  };

  const handleColor = (color: string) => {
    applyFormatting(`[color=${color}]`, '[/color]');
  };

  const insertImageTag = (imageSource: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const cursor = textarea.selectionEnd;
    const result = applyWrapFormat({
      value,
      selectionStart: cursor,
      selectionEnd: cursor,
      openTag: '[img]',
      closeTag: '[/img]',
      placeholder: imageSource,
    });

    onChange(result.value);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        result.nextSelectionEnd,
        result.nextSelectionEnd
      );
    });
  };

  const insertRawAtCursor = (snippet: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const nextValue = `${before}${snippet}${after}`;
    const cursor = start + snippet.length;

    onChange(nextValue);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const loadImageDimensions = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode image.'));
      img.src = dataUrl;
    });

    return { dataUrl, width: image.naturalWidth, height: image.naturalHeight };
  };

  const handleImageSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (
      !RICH_TEXT_IMAGE_LIMITS.acceptedTypes.includes(
        file.type as (typeof RICH_TEXT_IMAGE_LIMITS.acceptedTypes)[number]
      )
    ) {
      setEditorInfo('Unsupported image type. Use JPG, PNG, WEBP or GIF.');
      return;
    }

    if (file.size > RICH_TEXT_IMAGE_LIMITS.maxBytes) {
      setEditorInfo('Image is too large. Maximum allowed size is 2 MB.');
      return;
    }

    try {
      const loaded = await loadImageDimensions(file);
      if (
        loaded.width > RICH_TEXT_IMAGE_LIMITS.maxWidth ||
        loaded.height > RICH_TEXT_IMAGE_LIMITS.maxHeight
      ) {
        setEditorInfo('Image dimensions exceed 1920x1080 limit.');
        return;
      }

      if (onUploadImage) {
        setEditorInfo('Uploading image to QDN...');
        const imageTag = await onUploadImage(file);
        insertRawAtCursor(imageTag);
      } else {
        insertImageTag(loaded.dataUrl);
      }
      setEditorInfo(
        `Image inserted (${loaded.width}x${loaded.height}, ${(file.size / (1024 * 1024)).toFixed(2)} MB).`
      );
    } catch (error) {
      setEditorInfo(
        error instanceof Error
          ? error.message
          : 'Unable to insert selected image.'
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="forum-card-primary p-4">
      <div className="border-brand-primary bg-brand-primary-soft mb-3 rounded-md border p-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleFormat('bold')}
            className="forum-pill-primary text-brand-primary-strong rounded-md px-2 py-1 text-xs font-semibold"
          >
            Bold
          </button>
          <button
            type="button"
            onClick={() => handleFormat('italic')}
            className="forum-pill-primary text-brand-primary-strong rounded-md px-2 py-1 text-xs font-semibold"
          >
            Italic
          </button>
          <button
            type="button"
            onClick={() => handleFormat('underline')}
            className="forum-pill-primary text-brand-primary-strong rounded-md px-2 py-1 text-xs font-semibold"
          >
            Underline
          </button>
          <button
            type="button"
            onClick={() => handleFormat('quote')}
            className="forum-pill-primary text-brand-primary-strong rounded-md px-2 py-1 text-xs font-semibold"
          >
            Quote
          </button>
          <button
            type="button"
            onClick={() => setIsToolsModalOpen(true)}
            className="forum-pill-accent text-brand-accent-strong rounded-md px-2 py-1 text-xs font-semibold"
          >
            More Tools
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {[
            { label: 'Black', value: '#111827' },
            { label: 'Blue', value: '#2563EB' },
            { label: 'Green', value: '#16A34A' },
            { label: 'Red', value: '#DC2626' },
          ].map((color) => (
            <button
              key={color.value}
              type="button"
              onClick={() => handleColor(color.value)}
              className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            >
              <span
                className="h-3 w-3 rounded-full border border-slate-300"
                style={{ backgroundColor: color.value }}
                aria-hidden="true"
              />
              {color.label}
            </button>
          ))}
          <input
            ref={imageInputRef}
            id={fileInputId}
            type="file"
            accept={RICH_TEXT_IMAGE_LIMITS.acceptedTypes.join(',')}
            className="hidden"
            onChange={handleImageSelected}
          />
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="forum-pill-accent text-brand-accent-strong rounded-md px-2 py-1 text-xs font-semibold"
          >
            Add Image
          </button>
        </div>
        <p className="text-ui-muted mt-2 text-xs">
          Image limits: max 1920x1080, max 2 MB, types JPG/PNG/WEBP/GIF.
        </p>
      </div>

      {editorInfo ? (
        <p className="text-ui-muted mb-2 text-xs" role="status">
          {editorInfo}
        </p>
      ) : null}

      <label className="sr-only" htmlFor={editorId}>
        Reply editor
      </label>
      <textarea
        ref={textareaRef}
        id={editorId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="bg-surface-card text-ui-strong min-h-28 w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-cyan-300"
      />

      <div className="mt-3 flex items-center justify-between">
        <p className="text-ui-muted text-xs">
          Supported tags: [b], [i], [u], [quote], [color], [img]
        </p>
        <button
          type="submit"
          className="bg-brand-primary-solid rounded-md px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600"
        >
          Post Reply
        </button>
      </div>

      <RichTextToolsModal
        isOpen={isToolsModalOpen}
        onClose={() => setIsToolsModalOpen(false)}
        onApplyFormat={handleFormat}
        onApplyColor={handleColor}
      />
    </form>
  );
};

export default RichTextEditor;
