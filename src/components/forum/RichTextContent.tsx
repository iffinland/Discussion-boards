import { useEffect, useMemo, useState, type MouseEvent } from 'react';

import {
  extractQdnImageTags,
  stripQdnImageTags,
  toRichTextHtml,
} from '../../services/forum/richText';
import { mapWithConcurrency } from '../../services/qdn/qdnReadiness';
import { forumQdnService } from '../../services/qdn/forumQdnService';
import { perfDebugLog } from '../../services/perf/perfDebug';
import ImagePreviewModal from './ImagePreviewModal';

type RichTextContentProps = {
  value: string;
  className?: string;
};

type ImageReference = {
  service: string;
  name: string;
  identifier: string;
  filename?: string;
};

const imageUrlCache = new Map<string, string | null>();
const imageUrlInflight = new Map<string, Promise<string | null>>();

const toImageReferenceKey = (reference: ImageReference) =>
  [
    reference.service,
    reference.name,
    reference.identifier,
    reference.filename ?? '',
  ].join(':');

const resolveImageUrlCached = async (reference: ImageReference) => {
  const cacheKey = toImageReferenceKey(reference);
  if (imageUrlCache.has(cacheKey)) {
    return imageUrlCache.get(cacheKey) ?? null;
  }

  const existingInflight = imageUrlInflight.get(cacheKey);
  if (existingInflight) {
    return existingInflight;
  }

  const requestPromise = forumQdnService
    .getPostImageResourceUrl(reference)
    .then((url) => {
      imageUrlCache.set(cacheKey, url);
      return url;
    })
    .catch(() => {
      imageUrlCache.set(cacheKey, null);
      return null;
    })
    .finally(() => {
      imageUrlInflight.delete(cacheKey);
    });

  imageUrlInflight.set(cacheKey, requestPromise);
  return requestPromise;
};

const RichTextContent = ({ value, className }: RichTextContentProps) => {
  const [resolvedValue, setResolvedValue] = useState(value);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) {
      return;
    }

    if (target.dataset.previewImage !== 'true') {
      return;
    }

    const source = target.dataset.fullSrc ?? target.getAttribute('src');
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
      const startedAt = performance.now();
      let nextValue = value;
      const uniqueReferencesByKey = new Map<string, ImageReference>();

      tags.forEach((tag) => {
        uniqueReferencesByKey.set(
          toImageReferenceKey(tag.reference),
          tag.reference
        );
      });

      const cacheHits = [...uniqueReferencesByKey.values()].reduce(
        (count, reference) =>
          imageUrlCache.has(toImageReferenceKey(reference)) ? count + 1 : count,
        0
      );
      const cacheMisses = uniqueReferencesByKey.size - cacheHits;

      const resolvedEntries = await mapWithConcurrency(
        [...uniqueReferencesByKey.entries()],
        async ([key, reference]) => {
          const resourceUrl = await resolveImageUrlCached(reference);
          return [key, resourceUrl] as const;
        },
        4
      );

      const resolvedByKey = new Map(resolvedEntries);

      tags.forEach((tag) => {
        const resourceUrl =
          resolvedByKey.get(toImageReferenceKey(tag.reference)) ?? null;
        nextValue = nextValue
          .split(tag.rawTag)
          .join(resourceUrl ? `[img]${resourceUrl}[/img]` : '');
      });

      if (active) {
        setResolvedValue(nextValue);
      }

      const elapsedMs = performance.now() - startedAt;
      const resolvedCount = resolvedEntries.filter(([, url]) => Boolean(url))
        .length;
      perfDebugLog('richtext-image-resolve', {
        tags: tags.length,
        uniqueReferences: uniqueReferencesByKey.size,
        cacheHits,
        cacheMisses,
        resolvedCount,
        elapsedMs: Number(elapsedMs.toFixed(1)),
      });
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
