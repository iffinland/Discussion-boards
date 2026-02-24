import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import { generateForumEntityId } from "../../../services/forum/forumId";
import { threadPostCache } from "../../../services/forum/threadPostCache";
import { forumQdnService } from "../../../services/qdn/forumQdnService";
import type { Post, SubTopic, Topic, User } from "../../../types";
import type { ForumMutationResult } from "../types";

type UseForumCommandsParams = {
  currentUser: User;
  isAuthenticated: boolean;
  topics: Topic[];
  subTopics: SubTopic[];
  posts: Post[];
  setUsers: Dispatch<SetStateAction<User[]>>;
  setTopics: Dispatch<SetStateAction<Topic[]>>;
  setSubTopics: Dispatch<SetStateAction<SubTopic[]>>;
  setPosts: Dispatch<SetStateAction<Post[]>>;
};

const ensureCurrentUserPresent = (users: User[], currentUser: User) => {
  return users.some((user) => user.id === currentUser.id)
    ? users
    : [currentUser, ...users];
};

export const useForumCommands = ({
  currentUser,
  isAuthenticated,
  topics,
  subTopics,
  posts,
  setUsers,
  setTopics,
  setSubTopics,
  setPosts,
}: UseForumCommandsParams) => {
  const createTopic = useCallback(
    async (input: {
      title: string;
      description: string;
    }): Promise<ForumMutationResult> => {
      const title = input.title.trim();
      const description = input.description.trim();

      if (!title || !description) {
        return { ok: false, error: "Title and description are required." };
      }

      if (!isAuthenticated) {
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
        id: generateForumEntityId("topic", currentUser.username),
        title,
        description,
        createdByUserId: currentUser.id,
        createdAt,
      };

      try {
        await forumQdnService.publishTopic(newTopic, currentUser.username);
        setTopics((current) => [newTopic, ...current]);
        setUsers((current) => ensureCurrentUserPresent(current, currentUser));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to publish topic.",
        };
      }
    },
    [
      currentUser,
      isAuthenticated,
      setTopics,
      setUsers,
      topics,
    ]
  );

  const createSubTopic = useCallback(
    async (input: {
      topicId: string;
      title: string;
      description: string;
    }): Promise<ForumMutationResult> => {
      const title = input.title.trim();
      const description = input.description.trim();

      if (!title || !description) {
        return { ok: false, error: "Title and description are required." };
      }

      if (!isAuthenticated) {
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
        id: generateForumEntityId("subtopic", currentUser.username),
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
        setUsers((current) => ensureCurrentUserPresent(current, currentUser));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to publish sub-topic.",
        };
      }
    },
    [
      currentUser,
      isAuthenticated,
      setSubTopics,
      setUsers,
      subTopics,
      topics,
    ]
  );

  const createPost = useCallback(
    async (input: {
      subTopicId: string;
      content: string;
    }): Promise<ForumMutationResult> => {
      const content = input.content.trim();

      if (!content) {
        return { ok: false, error: "Post content is required." };
      }

      if (!isAuthenticated) {
        return { ok: false, error: "Authenticate with Qortal first." };
      }

      if (!subTopics.some((subTopic) => subTopic.id === input.subTopicId)) {
        return { ok: false, error: "Sub-topic not found." };
      }

      const createdAt = new Date().toISOString();
      const newPost: Post = {
        id: generateForumEntityId("post", currentUser.username),
        subTopicId: input.subTopicId,
        authorUserId: currentUser.id,
        content,
        createdAt,
        likes: 0,
      };

      try {
        await forumQdnService.publishPost(newPost, currentUser.username);
        setPosts((current) => {
          const next = [...current, newPost];
          threadPostCache.write(
            input.subTopicId,
            next.filter((post) => post.subTopicId === input.subTopicId)
          );
          return next;
        });
        setSubTopics((current) =>
          current.map((subTopic) =>
            subTopic.id === input.subTopicId
              ? { ...subTopic, lastPostAt: createdAt }
              : subTopic
          )
        );
        setUsers((current) => ensureCurrentUserPresent(current, currentUser));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to publish post.",
        };
      }
    },
    [currentUser, isAuthenticated, setPosts, setSubTopics, setUsers, subTopics]
  );

  const updatePost = useCallback(
    async (input: {
      postId: string;
      content: string;
    }): Promise<ForumMutationResult> => {
      const content = input.content.trim();
      if (!content) {
        return { ok: false, error: "Post content is required." };
      }

      if (!isAuthenticated) {
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
        setPosts((current) => {
          const next = current.map((post) =>
            post.id === input.postId ? updatedPost : post
          );
          threadPostCache.write(
            updatedPost.subTopicId,
            next.filter((post) => post.subTopicId === updatedPost.subTopicId)
          );
          return next;
        });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update post.",
        };
      }
    },
    [currentUser, isAuthenticated, posts, setPosts]
  );

  const deletePost = useCallback(
    async (postId: string): Promise<ForumMutationResult> => {
      const target = posts.find((post) => post.id === postId);
      if (!target) {
        return { ok: false, error: "Post not found." };
      }

      if (!isAuthenticated) {
        return { ok: false, error: "Authenticate with Qortal first." };
      }

      if (target.authorUserId !== currentUser.id) {
        return { ok: false, error: "Only owner can delete this post." };
      }

      try {
        await forumQdnService.deletePost(target, currentUser.username);
        setPosts((current) => {
          const next = current.filter((post) => post.id !== postId);
          threadPostCache.write(
            target.subTopicId,
            next.filter((post) => post.subTopicId === target.subTopicId)
          );
          return next;
        });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to delete post.",
        };
      }
    },
    [currentUser, isAuthenticated, posts, setPosts]
  );

  const likePost = useCallback(
    (postId: string) => {
      if (!isAuthenticated) {
        return;
      }

      setPosts((current) => {
        const next = current.map((post) =>
          post.id === postId ? { ...post, likes: post.likes + 1 } : post
        );

        const target = next.find((post) => post.id === postId);
        if (target) {
          threadPostCache.write(
            target.subTopicId,
            next.filter((post) => post.subTopicId === target.subTopicId)
          );
          void forumQdnService.publishPost(target, currentUser.username);
        }

        return next;
      });
    },
    [currentUser.username, isAuthenticated, setPosts]
  );

  return {
    createTopic,
    createSubTopic,
    createPost,
    updatePost,
    deletePost,
    likePost,
  };
};
