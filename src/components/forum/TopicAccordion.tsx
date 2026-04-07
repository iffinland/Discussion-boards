import type { SubTopic, Topic, User } from '../../types';

import SubTopicList from './SubTopicList';

type TopicAccordionProps = {
  topic: Topic & { subTopics: SubTopic[] };
  users: User[];
  isOpen: boolean;
  isDragEnabled?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onToggle: (topicId: string) => void;
  onOpenThread: (subTopicId: string) => void;
  onDragStart?: (topicId: string) => void;
  onDragEnd?: () => void;
  onDragOverTopic?: (topicId: string) => void;
  onDropTopic?: (topicId: string) => void;
  canManageTopic?: boolean;
  canManageSubTopics?: boolean;
  onManageTopic?: (topic: Topic) => void;
  onManageSubTopic?: (subTopic: SubTopic) => void;
  onToggleSubTopicPin?: (subTopic: SubTopic) => void;
  onToggleSubTopicStatus?: (subTopic: SubTopic) => void;
  onToggleSubTopicVisibility?: (subTopic: SubTopic) => void;
};

const TopicAccordion = ({
  topic,
  users,
  isOpen,
  isDragEnabled = false,
  isDragging = false,
  isDragOver = false,
  onToggle,
  onOpenThread,
  onDragStart,
  onDragEnd,
  onDragOverTopic,
  onDropTopic,
  canManageTopic = false,
  canManageSubTopics = false,
  onManageTopic,
  onManageSubTopic,
  onToggleSubTopicPin,
  onToggleSubTopicStatus,
  onToggleSubTopicVisibility,
}: TopicAccordionProps) => {
  const cardClasses = [
    'overflow-hidden rounded-lg transition',
    isDragEnabled ? 'cursor-grab' : '',
    isDragging ? 'opacity-60 ring-2 ring-cyan-200' : '',
    isDragOver ? 'ring-2 ring-brand-accent border-brand-accent' : '',
    isOpen
      ? 'forum-card-primary'
      : 'forum-card hover:border-brand-accent hover:bg-brand-accent-soft',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cardClasses}
      draggable={isDragEnabled}
      onDragStart={() => onDragStart?.(topic.id)}
      onDragEnd={() => onDragEnd?.()}
      onDragOver={(event) => {
        if (!isDragEnabled) {
          return;
        }

        event.preventDefault();
        onDragOverTopic?.(topic.id);
      }}
      onDrop={(event) => {
        if (!isDragEnabled) {
          return;
        }

        event.preventDefault();
        onDropTopic?.(topic.id);
      }}
    >
      <div
        className={[
          'flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition',
          isOpen ? 'bg-brand-primary-soft' : 'hover:bg-brand-accent-soft',
        ].join(' ')}
      >
        {isDragEnabled ? (
          <span
            className="text-ui-muted flex shrink-0 select-none items-center rounded-md border border-slate-200 px-2 py-2 text-xs font-semibold"
            aria-hidden="true"
            title="Drag to reorder"
          >
            Drag
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => onToggle(topic.id)}
          className="min-w-0 flex-1 text-left"
        >
          <div>
            <h3 className="text-ui-strong text-lg font-semibold">
              {topic.title}
            </h3>
            <p className="text-ui-muted mt-1 text-sm">{topic.description}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="bg-brand-primary-soft text-brand-primary-strong border-brand-primary rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                {topic.status === 'locked' ? 'Locked' : 'Open'}
              </span>
              <span className="bg-brand-accent-soft text-brand-accent-strong border-brand-accent rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                {topic.subTopicAccess === 'everyone' && 'Sub-topics: Everyone'}
                {topic.subTopicAccess === 'moderators' &&
                  'Sub-topics: Moderators+'}
                {topic.subTopicAccess === 'admins' && 'Sub-topics: Admins'}
                {topic.subTopicAccess === 'custom' &&
                  'Sub-topics: Custom wallets'}
              </span>
              {topic.visibility === 'hidden' ? (
                <span className="text-ui-muted text-[11px] font-semibold">
                  Hidden
                </span>
              ) : null}
              {topic.allowedAddresses.length > 0 ? (
                <span className="text-ui-muted text-[11px]">
                  {topic.allowedAddresses.length} allowed wallet
                  {topic.allowedAddresses.length === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {canManageTopic ? (
            <button
              type="button"
              onClick={() => onManageTopic?.(topic)}
              className="bg-surface-card text-ui-strong rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold"
            >
              Manage
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onToggle(topic.id)}
            className={[
              'rounded-md px-2 py-1 text-xs font-semibold',
              isOpen
                ? 'bg-brand-primary-soft text-brand-primary-strong border-brand-primary border'
                : 'bg-brand-accent-soft text-brand-accent-strong border-brand-accent border',
            ].join(' ')}
          >
            {isOpen ? 'Close' : 'Open'}
          </button>
        </div>
      </div>
      {isOpen ? (
        <SubTopicList
          subTopics={topic.subTopics}
          users={users}
          onOpenThread={onOpenThread}
          canManageSubTopics={canManageSubTopics}
          onManageSubTopic={onManageSubTopic}
          onToggleSubTopicPin={onToggleSubTopicPin}
          onToggleSubTopicStatus={onToggleSubTopicStatus}
          onToggleSubTopicVisibility={onToggleSubTopicVisibility}
        />
      ) : null}
    </div>
  );
};

export default TopicAccordion;
