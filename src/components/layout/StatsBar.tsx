import { useForumData } from "../../hooks/useForumData";

const StatsBar = () => {
  const { topics, subTopics, posts } = useForumData();

  return (
    <div className="bg-forum-stats border-brand-primary border-b">
      <div className="text-ui-muted mx-auto flex max-w-6xl flex-wrap items-center gap-5 px-4 py-2 text-xs sm:px-6">
        <span className="forum-pill-primary rounded-md px-2 py-1">
          Total Topics:{" "}
          <strong className="text-brand-primary-strong font-semibold">
            {topics.length}
          </strong>
        </span>
        <span className="forum-pill-accent rounded-md px-2 py-1">
          Total Sub-Topics:{" "}
          <strong className="text-brand-accent-strong font-semibold">
            {subTopics.length}
          </strong>
        </span>
        <span className="forum-pill-primary rounded-md px-2 py-1">
          Total Posts:{" "}
          <strong className="text-brand-primary-strong font-semibold">
            {posts.length}
          </strong>
        </span>
      </div>
    </div>
  );
};

export default StatsBar;
