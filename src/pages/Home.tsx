import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import TopicAccordion from "../components/forum/TopicAccordion";
import HomeSkeleton from "../features/forum/components/HomeSkeleton";
import { useForumData } from "../hooks/useForumData";

const Home = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    users,
    topics,
    subTopics,
    createTopic,
    createSubTopic,
    isAuthReady,
  } = useForumData();

  const [openTopicId, setOpenTopicId] = useState<string | null>(null);

  const [topicTitle, setTopicTitle] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [topicFeedback, setTopicFeedback] = useState<string | null>(null);
  const [openCreatePanel, setOpenCreatePanel] = useState<"main" | "sub" | null>(
    null
  );

  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [subTopicTitle, setSubTopicTitle] = useState("");
  const [subTopicDescription, setSubTopicDescription] = useState("");
  const [subTopicFeedback, setSubTopicFeedback] = useState<string | null>(null);

  const topicsWithSubTopics = useMemo(() => {
    return topics.map((topic) => ({
      ...topic,
      subTopics: subTopics
        .filter((subTopic) => subTopic.topicId === topic.id)
        .sort(
          (a, b) =>
            new Date(b.lastPostAt).getTime() - new Date(a.lastPostAt).getTime()
        ),
    }));
  }, [topics, subTopics]);

  const activeSubTopics = useMemo(() => {
    const userMap = new Map(users.map((user) => [user.id, user.displayName]));

    return [...subTopics]
      .sort(
        (a, b) =>
          new Date(b.lastPostAt).getTime() - new Date(a.lastPostAt).getTime()
      )
      .slice(0, 3)
      .map((subTopic) => ({
        ...subTopic,
        authorName: userMap.get(subTopic.authorUserId) ?? "Unknown User",
      }));
  }, [subTopics, users]);

  const handleToggle = (topicId: string) => {
    setOpenTopicId((current) => (current === topicId ? null : topicId));
  };

  const handleOpenThread = (subTopicId: string) => {
    navigate(`/thread/${subTopicId}`);
  };

  const handleCreateTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = await createTopic({
      title: topicTitle,
      description: topicDescription,
    });

    if (!result.ok) {
      setTopicFeedback(result.error ?? "Unable to create main topic.");
      return;
    }

    setTopicTitle("");
    setTopicDescription("");
    setTopicFeedback("Main topic created successfully.");
  };

  const handleCreateSubTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parentTopicId = selectedTopicId || topics[0]?.id;

    if (!parentTopicId) {
      setSubTopicFeedback("Please create a main topic first.");
      return;
    }

    const result = await createSubTopic({
      topicId: parentTopicId,
      title: subTopicTitle,
      description: subTopicDescription,
    });

    if (!result.ok) {
      setSubTopicFeedback(result.error ?? "Unable to create sub-topic.");
      return;
    }

    setSelectedTopicId(parentTopicId);
    setSubTopicTitle("");
    setSubTopicDescription("");
    setSubTopicFeedback("Sub-topic created successfully.");
    setOpenTopicId(parentTopicId);
  };

  const isAdmin = currentUser.role === "Admin";

  if (!isAuthReady) {
    return <HomeSkeleton />;
  }

  return (
    <div className="space-y-6">
      <section className="forum-card-accent p-5">
        <h2 className="text-brand-accent text-base font-semibold">Active Topics</h2>
        <ul className="mt-3 space-y-2">
          {activeSubTopics.map((subTopic) => (
            <li key={subTopic.id}>
              <button
                type="button"
                onClick={() => handleOpenThread(subTopic.id)}
                className="forum-pill-accent w-full rounded-lg px-3 py-2 text-left transition hover:border-cyan-200 hover:bg-cyan-50/80"
              >
                <p className="text-ui-strong text-sm font-semibold">{subTopic.title}</p>
                <p className="text-ui-muted text-xs">
                  {subTopic.authorName} • Last activity{" "}
                  {new Date(subTopic.lastPostAt).toLocaleDateString("en-US")}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-brand-primary text-lg font-semibold">Main Topics</h2>
      </section>

      <div className="space-y-4">
        {topicsWithSubTopics.map((topic) => (
          <TopicAccordion
            key={topic.id}
            topic={topic}
            users={users}
            isOpen={openTopicId === topic.id}
            onToggle={handleToggle}
            onOpenThread={handleOpenThread}
          />
        ))}
      </div>

      <section className="space-y-3 pt-2">
        <h2 className="text-brand-primary text-lg font-semibold">Create Content</h2>

        <article className="forum-card-primary overflow-hidden">
          <button
            type="button"
            onClick={() =>
              setOpenCreatePanel((current) => (current === "main" ? null : "main"))
            }
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <h3 className="text-brand-primary text-sm font-semibold">
                Create Main Topic
              </h3>
              <p className="text-ui-muted mt-0.5 text-xs">
                Admin only main-topic creation.
              </p>
            </div>
            <span className="text-ui-muted text-xs font-semibold">
              {openCreatePanel === "main" ? "Close" : "Open"}
            </span>
          </button>

          {openCreatePanel === "main" ? (
            <div className="border-brand-primary bg-brand-primary-soft border-t px-4 py-4">
              {isAdmin ? (
                <form className="space-y-2" onSubmit={handleCreateTopic}>
                  <input
                    value={topicTitle}
                    onChange={(event) => setTopicTitle(event.target.value)}
                    placeholder="Topic title"
                    className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                  <textarea
                    value={topicDescription}
                    onChange={(event) => setTopicDescription(event.target.value)}
                    placeholder="Topic description"
                    className="bg-surface-card text-ui-strong min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="bg-brand-primary-solid rounded-md px-3 py-2 text-xs font-semibold text-white"
                  >
                    Create Topic
                  </button>
                </form>
              ) : (
                <p className="text-brand-accent-strong text-xs font-semibold">
                  You are currently a Member. Switch to an Admin user in header.
                </p>
              )}

              {topicFeedback ? (
                <p className="text-ui-muted mt-2 text-xs">{topicFeedback}</p>
              ) : null}
            </div>
          ) : null}
        </article>

        <article className="forum-card-accent overflow-hidden">
          <button
            type="button"
            onClick={() =>
              setOpenCreatePanel((current) => (current === "sub" ? null : "sub"))
            }
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <h3 className="text-brand-accent text-sm font-semibold">
                Create Sub-Topic
              </h3>
              <p className="text-ui-muted mt-0.5 text-xs">
                Members can post inside existing main topics.
              </p>
            </div>
            <span className="text-ui-muted text-xs font-semibold">
              {openCreatePanel === "sub" ? "Close" : "Open"}
            </span>
          </button>

          {openCreatePanel === "sub" ? (
            <div className="border-brand-accent bg-brand-accent-soft border-t px-4 py-4">
              <form className="space-y-2" onSubmit={handleCreateSubTopic}>
                <select
                  value={selectedTopicId}
                  onChange={(event) => setSelectedTopicId(event.target.value)}
                  className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select main topic</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.title}
                    </option>
                  ))}
                </select>
                <input
                  value={subTopicTitle}
                  onChange={(event) => setSubTopicTitle(event.target.value)}
                  placeholder="Sub-topic title"
                  className="bg-surface-card text-ui-strong w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <textarea
                  value={subTopicDescription}
                  onChange={(event) => setSubTopicDescription(event.target.value)}
                  placeholder="Sub-topic description"
                  className="bg-surface-card text-ui-strong min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="bg-brand-primary-solid rounded-md px-3 py-2 text-xs font-semibold text-white"
                >
                  Create Sub-Topic
                </button>
              </form>

              {subTopicFeedback ? (
                <p className="text-ui-muted mt-2 text-xs">{subTopicFeedback}</p>
              ) : null}
            </div>
          ) : null}
        </article>
      </section>
    </div>
  );
};

export default Home;
