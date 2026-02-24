import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "qapp-core";

import {
  MOCK_POSTS,
  MOCK_SUBTOPICS,
  MOCK_TOPICS,
  MOCK_USERS,
} from "../data/mockData";
import { forumQdnService } from "../services/qdn/forumQdnService";
import { isQortalRequestAvailable } from "../services/qortal/qortalClient";
import type { Post, SubTopic, Topic, User } from "../types";

type CreateResult = {
  ok: boolean;
  error?: string;
};

type ForumAuthMode = "qortal" | "mock";

type ForumContextValue = {
  users: User[];
  currentUser: User;
  topics: Topic[];
  subTopics: SubTopic[];
  posts: Post[];
  authMode: ForumAuthMode;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  canSwitchUser: boolean;
  authenticate: () => Promise<void>;
  setCurrentUser: (userId: string) => void;
  createTopic: (input: {
    title: string;
    description: string;
  }) => Promise<CreateResult>;
  createSubTopic: (input: {
    topicId: string;
    title: string;
    description: string;
  }) => Promise<CreateResult>;
  createPost: (input: { subTopicId: string; content: string }) => Promise<CreateResult>;
  updatePost: (input: {
    postId: string;
    content: string;
  }) => Promise<CreateResult>;
  deletePost: (postId: string) => Promise<CreateResult>;
  likePost: (postId: string) => void;
};

const ForumContext = createContext<ForumContextValue | null>(null);
let hasTriggeredAutoAuthThisSession = false;

const GUEST_USER: User = {
  id: "qortal-guest",
  username: "qortal-guest",
  displayName: "Not Authenticated",
  role: "Member",
  avatarColor: "bg-slate-400",
  joinedAt: new Date(0).toISOString(),
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 40);

const buildId = (prefix: string, value: string) =>
  `${prefix}-${slugify(value) || "item"}-${Date.now()}`;

const getDefaultUserId = (users: User[]) =>
  users.find((user) => user.role === "Member")?.id ?? users[0]?.id ?? "";

const resolveRoleForName = (name?: string): User["role"] => {
  const rawAdmins = import.meta.env.VITE_FORUM_ADMIN_NAMES ?? "";
  const adminNames = rawAdmins
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (!name) {
    return "Member";
  }

  return adminNames.includes(name.toLowerCase()) ? "Admin" : "Member";
};

const mergeUsersFromForumData = (
  baseUsers: User[],
  topics: Topic[],
  subTopics: SubTopic[],
  posts: Post[]
) => {
  const nextUsers = [...baseUsers];
  const seen = new Set(nextUsers.map((user) => user.id));

  const authorIds = new Set<string>();
  topics.forEach((topic) => authorIds.add(topic.createdByUserId));
  subTopics.forEach((subTopic) => authorIds.add(subTopic.authorUserId));
  posts.forEach((post) => authorIds.add(post.authorUserId));

  authorIds.forEach((id) => {
    if (!id || seen.has(id)) {
      return;
    }

    nextUsers.push({
      id,
      username: id,
      displayName: id,
      role: resolveRoleForName(id),
      avatarColor: "bg-cyan-500",
      joinedAt: new Date().toISOString(),
    });
    seen.add(id);
  });

  return nextUsers;
};

export const ForumProvider = ({ children }: { children: ReactNode }) => {
  const auth = useAuth();
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [topics, setTopics] = useState<Topic[]>(MOCK_TOPICS);
  const [subTopics, setSubTopics] = useState<SubTopic[]>(MOCK_SUBTOPICS);
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);

  const [currentUserId, setCurrentUserId] = useState<string>(
    getDefaultUserId(MOCK_USERS)
  );
  const [authMode, setAuthMode] = useState<ForumAuthMode>("mock");
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const loadedIdentityRef = useRef<string | null>(null);

  const currentUser = useMemo(() => {
    return users.find((user) => user.id === currentUserId) ?? users[0];
  }, [currentUserId, users]);

  useEffect(() => {
    let active = true;
    const isQortal = isQortalRequestAvailable();

    if (!isQortal) {
      hasTriggeredAutoAuthThisSession = false;
      loadedIdentityRef.current = null;
      setAuthMode("mock");
      setUsers(MOCK_USERS);
      setTopics(MOCK_TOPICS);
      setSubTopics(MOCK_SUBTOPICS);
      setPosts(MOCK_POSTS);
      setCurrentUserId(getDefaultUserId(MOCK_USERS));
      setIsAuthReady(true);
      return () => {
        active = false;
      };
    }

    setAuthMode("qortal");
    const identity =
      auth.primaryName?.trim() || auth.name?.trim() || auth.address?.trim() || "";

    if (auth.isLoadingUser) {
      setIsAuthReady(false);
      return () => {
        active = false;
      };
    }

    if (!identity) {
      if (!hasTriggeredAutoAuthThisSession) {
        hasTriggeredAutoAuthThisSession = true;
        setUsers([GUEST_USER]);
        setTopics([]);
        setSubTopics([]);
        setPosts([]);
        setCurrentUserId(GUEST_USER.id);
        setIsAuthReady(false);
        void auth.authenticateUser().catch(() => undefined);
        return () => {
          active = false;
        };
      }

      loadedIdentityRef.current = null;
      setUsers([GUEST_USER]);
      setTopics([]);
      setSubTopics([]);
      setPosts([]);
      setCurrentUserId(GUEST_USER.id);
      setIsAuthReady(true);
      return () => {
        active = false;
      };
    }

    if (loadedIdentityRef.current === identity) {
      setIsAuthReady(true);
      return () => {
        active = false;
      };
    }

    const bootstrapQdnData = async () => {
      try {
        setIsAuthReady(false);

        const qortalUser: User = {
          id: identity,
          username: identity,
          displayName: identity,
          role: resolveRoleForName(identity),
          avatarColor: "bg-cyan-600",
          joinedAt: new Date().toISOString(),
        };

        const remoteData = await forumQdnService.loadForumData();

        if (!active) {
          return;
        }

        const mergedUsers = mergeUsersFromForumData(
          [qortalUser],
          remoteData.topics,
          remoteData.subTopics,
          remoteData.posts
        );

        setUsers(mergedUsers);
        setTopics(remoteData.topics);
        setSubTopics(remoteData.subTopics);
        setPosts(remoteData.posts);
        setCurrentUserId(qortalUser.id);
        loadedIdentityRef.current = identity;
      } catch {
        if (!active) {
          return;
        }

        setUsers([GUEST_USER]);
        setTopics([]);
        setSubTopics([]);
        setPosts([]);
        setCurrentUserId(GUEST_USER.id);
        loadedIdentityRef.current = null;
      } finally {
        if (active) {
          setIsAuthReady(true);
        }
      }
    };

    void bootstrapQdnData();

    return () => {
      active = false;
    };
  }, [auth.address, auth.isLoadingUser, auth.name, auth.primaryName]);

  const authenticate = useCallback(async () => {
    await auth.authenticateUser();
  }, [auth.authenticateUser]);

  const isAuthenticated =
    authMode === "qortal" ? currentUser.id !== GUEST_USER.id : true;

  const setCurrentUser = useCallback(
    (userId: string) => {
      if (authMode === "qortal") {
        return;
      }

      if (users.some((user) => user.id === userId)) {
        setCurrentUserId(userId);
      }
    },
    [authMode, users]
  );

  const createTopic = useCallback(
    async (input: { title: string; description: string }): Promise<CreateResult> => {
      const title = input.title.trim();
      const description = input.description.trim();

      if (!title || !description) {
        return { ok: false, error: "Title and description are required." };
      }

      if (authMode === "qortal" && !isAuthenticated) {
        return { ok: false, error: "Authenticate with Qortal first." };
      }

      if (currentUser.role !== "Admin") {
        return { ok: false, error: "Only admins can create main topics." };
      }

      const duplicate = topics.some(
        (topic) => topic.title.toLowerCase() === title.toLowerCase()
      );
      if (duplicate) {
        return { ok: false, error: "A topic with this title already exists." };
      }

      const createdAt = new Date().toISOString();
      const newTopic: Topic = {
        id: buildId("topic", title),
        title,
        description,
        createdByUserId: currentUser.id,
        createdAt,
      };

      try {
        await forumQdnService.publishTopic(newTopic, currentUser.username);
        setTopics((current) => [newTopic, ...current]);
        setUsers((current) => mergeUsersFromForumData(current, [newTopic], [], []));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to publish topic.",
        };
      }
    },
    [authMode, currentUser.id, currentUser.role, currentUser.username, isAuthenticated, topics]
  );

  const createSubTopic = useCallback(
    async (input: {
      topicId: string;
      title: string;
      description: string;
    }): Promise<CreateResult> => {
      const title = input.title.trim();
      const description = input.description.trim();

      if (!title || !description) {
        return { ok: false, error: "Title and description are required." };
      }

      if (authMode === "qortal" && !isAuthenticated) {
        return { ok: false, error: "Authenticate with Qortal first." };
      }

      if (!topics.some((topic) => topic.id === input.topicId)) {
        return { ok: false, error: "Main topic not found." };
      }

      const duplicate = subTopics.some(
        (subTopic) =>
          subTopic.topicId === input.topicId &&
          subTopic.title.toLowerCase() === title.toLowerCase()
      );
      if (duplicate) {
        return {
          ok: false,
          error: "This sub-topic title already exists under selected main topic.",
        };
      }

      const createdAt = new Date().toISOString();
      const newSubTopic: SubTopic = {
        id: buildId("subtopic", title),
        topicId: input.topicId,
        title,
        description,
        authorUserId: currentUser.id,
        createdAt,
        lastPostAt: createdAt,
      };

      try {
        await forumQdnService.publishSubTopic(newSubTopic, currentUser.username);
        setSubTopics((current) => [newSubTopic, ...current]);
        setUsers((current) => mergeUsersFromForumData(current, [], [newSubTopic], []));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to publish sub-topic.",
        };
      }
    },
    [authMode, currentUser.id, currentUser.username, isAuthenticated, topics, subTopics]
  );

  const createPost = useCallback(
    async (input: { subTopicId: string; content: string }): Promise<CreateResult> => {
      const content = input.content.trim();

      if (!content) {
        return { ok: false, error: "Post content is required." };
      }

      if (authMode === "qortal" && !isAuthenticated) {
        return { ok: false, error: "Authenticate with Qortal first." };
      }

      if (!subTopics.some((subTopic) => subTopic.id === input.subTopicId)) {
        return { ok: false, error: "Sub-topic not found." };
      }

      const createdAt = new Date().toISOString();
      const newPost: Post = {
        id: buildId("post", `${currentUser.username}-${createdAt}`),
        subTopicId: input.subTopicId,
        authorUserId: currentUser.id,
        content,
        createdAt,
        likes: 0,
      };

      try {
        await forumQdnService.publishPost(newPost, currentUser.username);
        setPosts((current) => [...current, newPost]);
        setSubTopics((current) =>
          current.map((subTopic) =>
            subTopic.id === input.subTopicId
              ? { ...subTopic, lastPostAt: createdAt }
              : subTopic
          )
        );
        setUsers((current) => mergeUsersFromForumData(current, [], [], [newPost]));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to publish post.",
        };
      }
    },
    [authMode, currentUser.id, currentUser.username, isAuthenticated, subTopics]
  );

  const updatePost = useCallback(
    async (input: { postId: string; content: string }): Promise<CreateResult> => {
      const content = input.content.trim();
      if (!content) {
        return { ok: false, error: "Post content is required." };
      }

      if (authMode === "qortal" && !isAuthenticated) {
        return { ok: false, error: "Authenticate with Qortal first." };
      }

      const target = posts.find((post) => post.id === input.postId);
      if (!target) {
        return { ok: false, error: "Post not found." };
      }

      if (target.authorUserId !== currentUser.id) {
        return { ok: false, error: "Only owner can edit this post." };
      }

      const updatedPost: Post = { ...target, content };

      try {
        await forumQdnService.publishPost(updatedPost, currentUser.username);
        setPosts((current) =>
          current.map((post) => (post.id === input.postId ? updatedPost : post))
        );
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update post.",
        };
      }
    },
    [authMode, currentUser.id, currentUser.username, isAuthenticated, posts]
  );

  const deletePost = useCallback(
    async (postId: string): Promise<CreateResult> => {
      const target = posts.find((post) => post.id === postId);
      if (!target) {
        return { ok: false, error: "Post not found." };
      }

      if (authMode === "qortal" && !isAuthenticated) {
        return { ok: false, error: "Authenticate with Qortal first." };
      }

      if (target.authorUserId !== currentUser.id) {
        return { ok: false, error: "Only owner can delete this post." };
      }

      try {
        await forumQdnService.deletePost(target, currentUser.username);
        setPosts((current) => current.filter((post) => post.id !== postId));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to delete post.",
        };
      }
    },
    [authMode, currentUser.id, currentUser.username, isAuthenticated, posts]
  );

  const likePost = useCallback(
    (postId: string) => {
      if (authMode === "qortal" && !isAuthenticated) {
        return;
      }

      setPosts((current) => {
        const next = current.map((post) =>
          post.id === postId ? { ...post, likes: post.likes + 1 } : post
        );

        const target = next.find((post) => post.id === postId);
        if (target) {
          void forumQdnService.publishPost(target, currentUser.username);
        }

        return next;
      });
    },
    [authMode, currentUser.username, isAuthenticated]
  );

  const value = useMemo<ForumContextValue>(
    () => ({
      users,
      currentUser,
      topics,
      subTopics,
      posts,
      authMode,
      isAuthenticated,
      isAuthReady,
      authenticate,
      canSwitchUser: authMode !== "qortal",
      setCurrentUser,
      createTopic,
      createSubTopic,
      createPost,
      updatePost,
      deletePost,
      likePost,
    }),
    [
      users,
      currentUser,
      topics,
      subTopics,
      posts,
      authMode,
      isAuthenticated,
      isAuthReady,
      authenticate,
      setCurrentUser,
      createTopic,
      createSubTopic,
      createPost,
      updatePost,
      deletePost,
      likePost,
    ]
  );

  return <ForumContext.Provider value={value}>{children}</ForumContext.Provider>;
};

export const useForumContext = () => {
  const context = useContext(ForumContext);

  if (!context) {
    throw new Error("useForumContext must be used within ForumProvider");
  }

  return context;
};
