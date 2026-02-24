import type { SubTopic, User } from "../../types";

type SubTopicListProps = {
  subTopics: SubTopic[];
  users: User[];
  onOpenThread: (subTopicId: string) => void;
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const SubTopicList = ({ subTopics, users, onOpenThread }: SubTopicListProps) => {
  const usernameMap = new Map(users.map((user) => [user.id, user.displayName]));

  return (
    <div className="border-brand-primary overflow-hidden rounded-b-lg border-t">
      <div className="bg-brand-primary-soft text-brand-primary-strong hidden grid-cols-[2fr_1fr_1fr] px-4 py-2 text-xs font-semibold uppercase tracking-wide sm:grid">
        <span>Sub-topic</span>
        <span>Author</span>
        <span>Last Post</span>
      </div>

      <ul className="bg-surface-card border-brand-primary divide-y">
        {subTopics.map((subTopic) => (
          <li key={subTopic.id}>
            <button
              type="button"
              onClick={() => onOpenThread(subTopic.id)}
              className="grid w-full grid-cols-1 gap-1 px-4 py-3 text-left transition hover:bg-gradient-to-r hover:from-cyan-50 hover:to-orange-50/60 sm:grid-cols-[2fr_1fr_1fr] sm:gap-2"
            >
              <span className="text-ui-strong font-medium">{subTopic.title}</span>
              <span className="text-brand-primary-strong text-sm">
                {usernameMap.get(subTopic.authorUserId) ?? "Unknown User"}
              </span>
              <span className="text-ui-muted text-sm">
                {formatDate(subTopic.lastPostAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SubTopicList;
