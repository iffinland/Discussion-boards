import type { DragEvent } from 'react';

import UserRoleBadge from '../common/UserRoleBadge';
import type { SubTopic, User } from '../../types';
import { resolveAccessLabel } from '../../services/forum/forumAccess';

type SubTopicListProps = {
  subTopics: SubTopic[];
  users: User[];
  postCountsBySubTopicId?: Record<string, number>;
  walletNamesByAddress?: Record<string, string>;
  onOpenThread: (subTopicId: string) => void;
  canManageSubTopics?: boolean;
  onToggleSubTopicPin?: (subTopic: SubTopic) => void;
  onToggleSubTopicStatus?: (subTopic: SubTopic) => void;
  onToggleSubTopicVisibility?: (subTopic: SubTopic) => void;
  onManageSubTopic?: (subTopic: SubTopic) => void;
  canReorderPinnedSubTopics?: boolean;
  draggedPinnedSubTopicId?: string | null;
  dragOverPinnedSubTopicId?: string | null;
  onPinnedDragStart?: (subTopicId: string) => void;
  onPinnedDragOver?: (
    subTopicId: string,
    event: DragEvent<HTMLLIElement>
  ) => void;
  onPinnedDrop?: (subTopicId: string) => void;
  onPinnedDragEnd?: () => void;
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
const SUB_TOPIC_DESCRIPTION_MAX_LENGTH = 250;

const truncateDescription = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length <= SUB_TOPIC_DESCRIPTION_MAX_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, SUB_TOPIC_DESCRIPTION_MAX_LENGTH)}...`;
};

const PinnedBadge = () => (
  <span className="bg-brand-accent-soft text-brand-accent-strong border-brand-accent inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold">
    Pinned
  </span>
);

const SolvedBadge = () => (
  <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
    Solved
  </span>
);

const SubTopicList = ({
  subTopics,
  users,
  postCountsBySubTopicId = {},
  walletNamesByAddress = {},
  onOpenThread,
  canManageSubTopics = false,
  onToggleSubTopicPin,
  onToggleSubTopicStatus,
  onToggleSubTopicVisibility,
  onManageSubTopic,
  canReorderPinnedSubTopics = false,
  draggedPinnedSubTopicId = null,
  dragOverPinnedSubTopicId = null,
  onPinnedDragStart,
  onPinnedDragOver,
  onPinnedDrop,
  onPinnedDragEnd,
}: SubTopicListProps) => {
  const usernameMap = new Map(users.map((user) => [user.id, user.displayName]));
  const userMap = new Map(users.map((user) => [user.id, user]));

  return (
    <div className="border-brand-primary overflow-hidden rounded-b-lg border-t">
      <div className="bg-brand-primary-soft text-brand-primary-strong hidden grid-cols-[2fr_1fr_1fr] px-4 py-2 text-xs font-semibold uppercase tracking-wide sm:grid">
        <span>Sub-topic</span>
        <span>Author</span>
        <span>Last Post</span>
      </div>

      <ul className="bg-surface-card border-brand-primary divide-y">
        {subTopics.map((subTopic) => (
          <li
            key={subTopic.id}
            draggable={canReorderPinnedSubTopics && subTopic.isPinned}
            onDragStart={() => onPinnedDragStart?.(subTopic.id)}
            onDragOver={(event) => onPinnedDragOver?.(subTopic.id, event)}
            onDrop={() => onPinnedDrop?.(subTopic.id)}
            onDragEnd={onPinnedDragEnd}
            className={
              canReorderPinnedSubTopics &&
              subTopic.isPinned &&
              dragOverPinnedSubTopicId === subTopic.id
                ? 'bg-cyan-50/60 ring-2 ring-cyan-300 ring-inset'
                : ''
            }
          >
            <div className="px-4 py-3 transition hover:bg-gradient-to-r hover:from-cyan-50 hover:to-orange-50/60">
              <button
                type="button"
                onClick={() => onOpenThread(subTopic.id)}
                className="grid w-full grid-cols-1 gap-1 text-left sm:grid-cols-[2fr_1fr_1fr] sm:gap-2"
              >
                <span className="text-ui-strong font-medium">
                  {subTopic.isPinned ? (
                    <span className="mr-2 inline-flex align-middle">
                      <PinnedBadge />
                    </span>
                  ) : null}
                  {canReorderPinnedSubTopics &&
                  subTopic.isPinned &&
                  draggedPinnedSubTopicId === subTopic.id ? (
                    <span className="text-ui-muted mr-2 inline-flex align-middle text-[11px] font-semibold">
                      Dragging...
                    </span>
                  ) : null}
                  {subTopic.isSolved ? (
                    <span className="mr-2 inline-flex align-middle">
                      <SolvedBadge />
                    </span>
                  ) : null}
                  {subTopic.title}
                  <span className="text-ui-muted ml-2 text-xs">
                    {subTopic.status === 'locked' ? 'Locked' : 'Open'}
                    {subTopic.visibility === 'hidden' ? ' • Hidden' : ''}
                    {subTopic.access !== 'everyone'
                      ? ` • Access: ${resolveAccessLabel(subTopic.access)}`
                      : ''}
                  </span>
                </span>
                <span className="text-ui-muted block text-xs leading-relaxed">
                  {truncateDescription(subTopic.description)}
                </span>
                <span className="text-brand-primary-strong text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <span>
                      {usernameMap.get(subTopic.authorUserId) ?? 'Unknown User'}
                    </span>
                    <UserRoleBadge
                      role={
                        userMap.get(subTopic.authorUserId)?.role ?? 'Member'
                      }
                    />
                  </span>
                </span>
                <span className="text-ui-muted text-sm">
                  {formatDate(subTopic.lastPostAt)}
                  <span className="block text-xs">
                    Posts:{' '}
                    {postCountsBySubTopicId[subTopic.id] !== undefined
                      ? postCountsBySubTopicId[subTopic.id]
                      : '...'}
                  </span>
                </span>
              </button>

              {canManageSubTopics ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onManageSubTopic?.(subTopic)}
                    className="bg-surface-card text-ui-strong rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold"
                  >
                    Manage
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleSubTopicPin?.(subTopic)}
                    className="bg-surface-card text-ui-strong rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold"
                  >
                    {subTopic.isPinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleSubTopicStatus?.(subTopic)}
                    className="bg-surface-card text-ui-strong rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold"
                  >
                    {subTopic.status === 'locked' ? 'Unlock' : 'Lock'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleSubTopicVisibility?.(subTopic)}
                    className="bg-surface-card text-ui-strong rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold"
                  >
                    {subTopic.visibility === 'hidden' ? 'Show' : 'Hide'}
                  </button>
                  {subTopic.allowedAddresses.length > 0 ? (
                    <span className="flex flex-wrap items-center gap-1">
                      {subTopic.allowedAddresses.slice(0, 3).map((address) => (
                        <span
                          key={address}
                          className="text-ui-muted inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px]"
                          title={address}
                        >
                          {walletNamesByAddress[address] || address}
                        </span>
                      ))}
                      {subTopic.allowedAddresses.length > 3 ? (
                        <span className="text-ui-muted text-xs">
                          +{subTopic.allowedAddresses.length - 3} more
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SubTopicList;
