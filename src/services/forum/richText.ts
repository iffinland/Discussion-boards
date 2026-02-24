export type RichTextFormatType = "bold" | "italic" | "underline" | "quote";

export type QdnImageTagReference = {
  service: "IMAGE";
  name: string;
  identifier: string;
  filename?: string;
};

export type ParsedQdnImageTag = {
  rawTag: string;
  reference: QdnImageTagReference;
};

export const RICH_TEXT_IMAGE_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  maxWidth: 1920,
  maxHeight: 1080,
  acceptedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
} as const;

type ApplyWrapFormatInput = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  openTag: string;
  closeTag: string;
  placeholder?: string;
};

export type ApplyWrapFormatResult = {
  value: string;
  nextSelectionStart: number;
  nextSelectionEnd: number;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const replacePatternRecursively = (
  value: string,
  pattern: RegExp,
  replacer: (...args: string[]) => string,
  maxPasses = 6
) => {
  let current = value;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const next = current.replace(pattern, replacer);
    if (next === current) {
      return next;
    }
    current = next;
  }
  return current;
};

const sanitizeImageSource = (value: string): string | null => {
  const source = value.trim();
  if (!source) {
    return null;
  }

  const normalized = source.toLowerCase();
  if (
    normalized.startsWith("https://") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("data:image/")
  ) {
    return source;
  }

  return null;
};

const QDN_IMAGE_TAG_PATTERN = /\[imgqdn\]([\s\S]*?)\[\/imgqdn\]/gi;

const decodeQdnTagPart = (value: string) => {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
};

const parseQdnImageTagPayload = (payload: string): QdnImageTagReference | null => {
  const [rawName, rawIdentifier] = payload.split("|");
  if (!rawName || !rawIdentifier) {
    return null;
  }

  const name = decodeQdnTagPart(rawName);
  const identifier = decodeQdnTagPart(rawIdentifier);
  if (!name || !identifier) {
    return null;
  }

  return {
    service: "IMAGE",
    name,
    identifier,
  };
};

export const encodeQdnImageTag = (reference: {
  name: string;
  identifier: string;
}) => {
  const name = encodeURIComponent(reference.name.trim());
  const identifier = encodeURIComponent(reference.identifier.trim());
  return `[imgqdn]${name}|${identifier}[/imgqdn]`;
};

export const extractQdnImageTags = (value: string): ParsedQdnImageTag[] => {
  const found: ParsedQdnImageTag[] = [];
  const pattern = new RegExp(QDN_IMAGE_TAG_PATTERN.source, "gi");
  let match = pattern.exec(value);

  while (match) {
    const rawTag = match[0];
    const payload = match[1] ?? "";
    const reference = parseQdnImageTagPayload(payload);
    if (reference) {
      found.push({ rawTag, reference });
    }
    match = pattern.exec(value);
  }

  return found;
};

export const stripQdnImageTags = (value: string) => {
  return value.replace(QDN_IMAGE_TAG_PATTERN, "");
};

export const applyWrapFormat = ({
  value,
  selectionStart,
  selectionEnd,
  openTag,
  closeTag,
  placeholder = "text",
}: ApplyWrapFormatInput): ApplyWrapFormatResult => {
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);

  if (!selected) {
    const nextValue = `${before}${openTag}${placeholder}${closeTag}${after}`;
    return {
      value: nextValue,
      nextSelectionStart: selectionStart + openTag.length,
      nextSelectionEnd: selectionStart + openTag.length + placeholder.length,
    };
  }

  const wrapped = `${openTag}${selected}${closeTag}`;
  const nextValue = `${before}${wrapped}${after}`;
  return {
    value: nextValue,
    nextSelectionStart: selectionStart + openTag.length,
    nextSelectionEnd: selectionStart + openTag.length + selected.length,
  };
};

export const formatToTags: Record<RichTextFormatType, [string, string]> = {
  bold: ["[b]", "[/b]"],
  italic: ["[i]", "[/i]"],
  underline: ["[u]", "[/u]"],
  quote: ["[quote]", "[/quote]"],
};

export const toRichTextHtml = (value: string): string => {
  let html = escapeHtml(value);

  html = replacePatternRecursively(
    html,
    /\[b\]([\s\S]*?)\[\/b\]/gi,
    (_full, content) => `<strong>${content}</strong>`
  );
  html = replacePatternRecursively(
    html,
    /\[i\]([\s\S]*?)\[\/i\]/gi,
    (_full, content) => `<em>${content}</em>`
  );
  html = replacePatternRecursively(
    html,
    /\[u\]([\s\S]*?)\[\/u\]/gi,
    (_full, content) => `<u>${content}</u>`
  );
  html = replacePatternRecursively(
    html,
    /\[quote\]([\s\S]*?)\[\/quote\]/gi,
    (_full, content) =>
      `<blockquote class="my-2 border-l-2 border-slate-300 pl-3 text-slate-600">${content}</blockquote>`
  );
  html = replacePatternRecursively(
    html,
    /\[color=(#[0-9a-fA-F]{6})\]([\s\S]*?)\[\/color\]/g,
    (_full, color, content) => `<span style="color:${color}">${content}</span>`
  );
  html = replacePatternRecursively(
    html,
    /\[img\]([\s\S]*?)\[\/img\]/gi,
    (_full, content) => {
      const safeSource = sanitizeImageSource(content);
      if (!safeSource) {
        return "";
      }

      return `<img src="${safeSource}" alt="Post image" loading="lazy" class="mt-2 max-h-48 w-auto max-w-full cursor-zoom-in rounded-md border border-slate-200 object-cover" data-preview-image="true" data-full-src="${safeSource}" />`;
    }
  );
  html = replacePatternRecursively(
    html,
    QDN_IMAGE_TAG_PATTERN,
    () => ""
  );

  return html.replace(/\n/g, "<br/>");
};
