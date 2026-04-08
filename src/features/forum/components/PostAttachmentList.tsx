import { useEffect, useState } from 'react';

import { formatAttachmentSize } from '../../../services/forum/attachments';
import { forumQdnService } from '../../../services/qdn/forumQdnService';
import type { PostAttachment } from '../../../types';

type PostAttachmentListProps = {
  attachments: PostAttachment[];
};

const PostAttachmentList = ({ attachments }: PostAttachmentListProps) => {
  const [urlsById, setUrlsById] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    const resolveUrls = async () => {
      const entries = await Promise.all(
        attachments.map(async (attachment) => {
          try {
            const url = await forumQdnService.getQdnResourceUrl({
              service: attachment.service,
              name: attachment.name,
              identifier: attachment.identifier,
              filename: attachment.filename,
            });

            return [attachment.id, url] as const;
          } catch {
            return [attachment.id, ''] as const;
          }
        })
      );

      if (!active) {
        return;
      }

      setUrlsById(Object.fromEntries(entries.filter((entry) => entry[1])));
    };

    if (attachments.length > 0) {
      void resolveUrls();
    } else {
      setUrlsById({});
    }

    return () => {
      active = false;
    };
  }, [attachments]);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-ui-strong text-xs font-semibold">Attachments</p>
      <div className="mt-2 space-y-2">
        {attachments.map((attachment) => {
          const attachmentUrl = urlsById[attachment.id];

          return (
            <div
              key={attachment.id}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-ui-strong truncate text-xs font-semibold">
                  {attachment.filename}
                </p>
                <p className="text-ui-muted text-xs">
                  {attachment.mimeType} ·{' '}
                  {formatAttachmentSize(attachment.size)}
                </p>
              </div>
              {attachmentUrl ? (
                <a
                  href={attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-primary rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs font-semibold"
                >
                  Open
                </a>
              ) : (
                <span className="text-ui-muted text-xs font-semibold">
                  Loading...
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PostAttachmentList;
