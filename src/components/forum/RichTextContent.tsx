import { useEffect, useMemo, useState, type MouseEvent } from "react";

import {
  extractQdnImageTags,
  stripQdnImageTags,
  toRichTextHtml,
} from "../../services/forum/richText";
import { forumQdnService } from "../../services/qdn/forumQdnService";
import ImagePreviewModal from "./ImagePreviewModal";

type RichTextContentProps = {
  value: string;
  className?: string;
};

const RichTextContent = ({ value, className }: RichTextContentProps) => {
  const [resolvedValue, setResolvedValue] = useState(value);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) {
      return;
    }

    if (target.dataset.previewImage !== "true") {
      return;
    }

    const source = target.dataset.fullSrc ?? target.getAttribute("src");
    if (!source) {
      return;
    }

    setPreviewImageSrc(source);
  };

  useEffect(() => {
    let active = true;
    const tags = extractQdnImageTags(value);

    if (tags.length === 0) {
      setResolvedValue(value);
      return () => {
        active = false;
      };
    }

    setResolvedValue(stripQdnImageTags(value));

    const resolveImages = async () => {
      let nextValue = value;
      const resolvedUrlCache = new Map<string, string | null>();

      for (const tag of tags) {
        const key = `${tag.reference.name}:${tag.reference.identifier}`;
        let resourceUrl = resolvedUrlCache.get(key) ?? null;

        if (!resolvedUrlCache.has(key)) {
          try {
            resourceUrl = await forumQdnService.getPostImageResourceUrl(tag.reference);
          } catch {
            resourceUrl = null;
          }
          resolvedUrlCache.set(key, resourceUrl);
        }

        nextValue = nextValue.split(tag.rawTag).join(
          resourceUrl ? `[img]${resourceUrl}[/img]` : ""
        );
      }

      if (active) {
        setResolvedValue(nextValue);
      }
    };

    void resolveImages();
    return () => {
      active = false;
    };
  }, [value]);

  const html = useMemo(() => toRichTextHtml(resolvedValue), [resolvedValue]);

  return (
    <>
      <div
        className={className}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <ImagePreviewModal
        isOpen={previewImageSrc !== null}
        imageSrc={previewImageSrc}
        onClose={() => setPreviewImageSrc(null)}
      />
    </>
  );
};

export default RichTextContent;
