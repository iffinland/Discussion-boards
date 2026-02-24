import type { SubTopic, Topic, User } from "../../types";

import SubTopicList from "./SubTopicList";

type TopicAccordionProps = {
  topic: Topic & { subTopics: SubTopic[] };
  users: User[];
  isOpen: boolean;
  onToggle: (topicId: string) => void;
  onOpenThread: (subTopicId: string) => void;
};

const TopicAccordion = ({
  topic,
  users,
  isOpen,
  onToggle,
  onOpenThread,
}: TopicAccordionProps) => {
  const cardClasses = [
    "overflow-hidden rounded-lg transition",
    isOpen
      ? "forum-card-primary"
      : "forum-card hover:border-brand-accent hover:bg-brand-accent-soft",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cardClasses}>
      <button
        type="button"
        onClick={() => onToggle(topic.id)}
        className={[
          "flex w-full items-center justify-between px-5 py-4 text-left transition",
          isOpen ? "bg-brand-primary-soft" : "hover:bg-brand-accent-soft",
        ].join(" ")}
      >
        <div>
          <h3 className="text-ui-strong text-lg font-semibold">{topic.title}</h3>
          <p className="text-ui-muted mt-1 text-sm">{topic.description}</p>
        </div>
        <span
          className={[
            "rounded-md px-2 py-1 text-xs font-semibold",
            isOpen
              ? "bg-brand-primary-soft text-brand-primary-strong border-brand-primary border"
              : "bg-brand-accent-soft text-brand-accent-strong border-brand-accent border",
          ].join(" ")}
        >
          {isOpen ? "Close" : "Open"}
        </span>
      </button>
      {isOpen ? (
        <SubTopicList
          subTopics={topic.subTopics}
          users={users}
          onOpenThread={onOpenThread}
        />
      ) : null}
    </div>
  );
};

export default TopicAccordion;
