import { useLocation } from 'react-router-dom';

import { useForumData } from '../../hooks/useForumData';

type StatsBarProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
};

const StatsBar = ({ searchQuery, onSearchQueryChange }: StatsBarProps) => {
  const { topics, subTopics, posts } = useForumData();
  const location = useLocation();
  const totalPosters = new Set(posts.map((post) => post.authorUserId)).size;
  const totalSubTopicStarters = new Set(
    subTopics.map((subTopic) => subTopic.authorUserId)
  ).size;
  const placeholder = location.pathname.startsWith('/thread/')
    ? 'Search posts in this thread'
    : location.pathname.startsWith('/topic/')
      ? 'Search sub-topics in this topic'
      : 'Search topics, sub-topics and posts';

  return (
    <div className="bg-forum-stats border-brand-primary border-b">
      <div className="text-ui-muted mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-xs sm:px-6">
        <span className="forum-pill-primary rounded-md px-2 py-1">
          Total Topics:{' '}
          <strong className="text-brand-primary-strong font-semibold">
            {topics.length}
          </strong>
        </span>
        <span className="forum-pill-primary rounded-md px-2 py-1">
          Total Sub-Topics:{' '}
          <strong className="text-brand-primary-strong font-semibold">
            {subTopics.length}
          </strong>
        </span>
        <span className="forum-pill-primary rounded-md px-2 py-1">
          Total Posts:{' '}
          <strong className="text-brand-primary-strong font-semibold">
            {posts.length}
          </strong>
        </span>
        <span className="forum-pill-primary rounded-md px-2 py-1">
          Total Posters:{' '}
          <strong className="text-brand-primary-strong font-semibold">
            {totalPosters}
          </strong>
        </span>
        <span className="forum-pill-primary rounded-md px-2 py-1">
          Sub-Topic Starters:{' '}
          <strong className="text-brand-primary-strong font-semibold">
            {totalSubTopicStarters}
          </strong>
        </span>
        <div className="ml-auto min-w-[220px] flex-1 sm:max-w-sm">
          <label className="sr-only" htmlFor="forum-search">
            Search forum
          </label>
          <input
            id="forum-search"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder={placeholder}
            className="bg-surface-card text-ui-strong placeholder:text-ui-muted w-full rounded-md border border-slate-200 px-3 py-2 text-xs"
          />
        </div>
      </div>
    </div>
  );
};

export default StatsBar;
