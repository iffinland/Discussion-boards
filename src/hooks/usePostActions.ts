import { useCallback, useEffect, useState } from "react";

import type { Post } from "../types";

type UsePostActionsParams = {
  initialPosts: Post[];
  currentUserId: string;
};

export const usePostActions = ({
  initialPosts,
  currentUserId,
}: UsePostActionsParams) => {
  const [threadPosts, setThreadPosts] = useState<Post[]>(initialPosts);
  const [tipsByPostId, setTipsByPostId] = useState<Record<string, number>>({});

  useEffect(() => {
    setThreadPosts(initialPosts);
    setTipsByPostId({});
  }, [initialPosts]);

  const addPost = useCallback((post: Post) => {
    setThreadPosts((current) => [...current, post]);
  }, []);

  const likePost = useCallback((postId: string) => {
    setThreadPosts((current) =>
      current.map((post) =>
        post.id === postId ? { ...post, likes: post.likes + 1 } : post
      )
    );
  }, []);

  const sendTip = useCallback((postId: string) => {
    setTipsByPostId((current) => ({
      ...current,
      [postId]: (current[postId] ?? 0) + 1,
    }));
  }, []);

  const editPost = useCallback((postId: string, nextContent: string) => {
    setThreadPosts((current) =>
      current.map((post) =>
        post.id === postId ? { ...post, content: nextContent } : post
      )
    );
  }, []);

  const deletePost = useCallback((postId: string) => {
    setThreadPosts((current) =>
      current.filter(
        (post) => !(post.id === postId && post.authorUserId === currentUserId)
      )
    );
  }, [currentUserId]);

  const isOwner = useCallback(
    (post: Post) => post.authorUserId === currentUserId,
    [currentUserId]
  );

  const getTipCount = useCallback(
    (postId: string) => tipsByPostId[postId] ?? 0,
    [tipsByPostId]
  );

  return {
    threadPosts,
    addPost,
    likePost,
    sendTip,
    editPost,
    deletePost,
    isOwner,
    getTipCount,
  };
};
