import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "qapp-core";

import { getAccountNames } from "../../../services/qortal/walletService";
import { forumQdnService } from "../../../services/qdn/forumQdnService";
import { isQortalRequestAvailable } from "../../../services/qortal/qortalClient";
import type { Post, SubTopic, Topic, User } from "../../../types";

type ForumAuthMode = "qortal";

const GUEST_USER: User = {
  id: "qortal-guest",
  username: "qortal-guest",
  displayName: "Guest",
  role: "Member",
  avatarColor: "bg-slate-400",
  joinedAt: new Date(0).toISOString(),
};

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

export const useForumDataQuery = () => {
  const auth = useAuth();
  const [users, setUsers] = useState<User[]>([GUEST_USER]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [subTopics, setSubTopics] = useState<SubTopic[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>(GUEST_USER.id);
  const [availableAuthNames, setAvailableAuthNames] = useState<string[]>([]);
  const [activeAuthName, setActiveAuthName] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const loadedIdentityRef = useRef<string | null>(null);
  const authAttemptInFlightRef = useRef(false);
  const lastAuthAttemptAtRef = useRef(0);
  const authMode: ForumAuthMode = "qortal";

  const currentUser = useMemo(() => {
    return users.find((user) => user.id === currentUserId) ?? users[0];
  }, [currentUserId, users]);

  useEffect(() => {
    let active = true;

    const syncAccountNames = async () => {
      const address = auth.address?.trim();
      const primary = auth.primaryName?.trim();
      const authName = auth.name?.trim();
      const known = [primary, authName].filter(
        (value): value is string => Boolean(value)
      );

      if (!address) {
        if (!active) {
          return;
        }
        setAvailableAuthNames(known);
        setActiveAuthName((current) => current ?? known[0] ?? null);
        return;
      }

      try {
        const resolved = await getAccountNames(address);
        if (!active) {
          return;
        }

        const merged = Array.from(new Set([...known, ...resolved])).filter(Boolean);
        setAvailableAuthNames(merged);
        setActiveAuthName((current) => {
          if (current && merged.includes(current)) {
            return current;
          }

          if (primary && merged.includes(primary)) {
            return primary;
          }

          if (authName && merged.includes(authName)) {
            return authName;
          }

          return merged[0] ?? null;
        });
      } catch {
        if (!active) {
          return;
        }

        setAvailableAuthNames(known);
        setActiveAuthName((current) => current ?? known[0] ?? null);
      }
    };

    void syncAccountNames();

    return () => {
      active = false;
    };
  }, [auth.address, auth.name, auth.primaryName]);

  useEffect(() => {
    let active = true;
    const isQortal = isQortalRequestAvailable();

    if (!isQortal) {
      loadedIdentityRef.current = null;
      setUsers([GUEST_USER]);
      setTopics([]);
      setSubTopics([]);
      setPosts([]);
      setCurrentUserId(GUEST_USER.id);
      setAvailableAuthNames([]);
      setActiveAuthName(null);
      setIsAuthReady(true);
      return () => {
        active = false;
      };
    }

    const identity =
      activeAuthName?.trim() ||
      auth.primaryName?.trim() ||
      auth.name?.trim() ||
      auth.address?.trim() ||
      "";

    if (auth.isLoadingUser) {
      setIsAuthReady(false);
      return () => {
        active = false;
      };
    }

    if (!identity) {
      setUsers([GUEST_USER]);
      setTopics([]);
      setSubTopics([]);
      setPosts([]);
      setCurrentUserId(GUEST_USER.id);

      const now = Date.now();
      const canRetry =
        !authAttemptInFlightRef.current &&
        now - lastAuthAttemptAtRef.current >= 5000;

      if (canRetry) {
        authAttemptInFlightRef.current = true;
        lastAuthAttemptAtRef.current = now;
        setIsAuthReady(false);
        void auth
          .authenticateUser()
          .catch(() => undefined)
          .finally(() => {
            authAttemptInFlightRef.current = false;
          });
      } else {
        setIsAuthReady(true);
      }

      loadedIdentityRef.current = null;
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

        const remoteData = await forumQdnService.loadForumStructure();

        if (!active) {
          return;
        }

        const mergedUsers = mergeUsersFromForumData(
          [qortalUser],
          remoteData.topics,
          remoteData.subTopics,
          []
        );

        setUsers(mergedUsers);
        setTopics(remoteData.topics);
        setSubTopics(remoteData.subTopics);
        setPosts([]);
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
  }, [
    activeAuthName,
    auth.address,
    auth.authenticateUser,
    auth.isLoadingUser,
    auth.name,
    auth.primaryName,
  ]);

  const authenticate = useCallback(async () => {
    await auth.authenticateUser();
  }, [auth.authenticateUser]);

  const isAuthenticated = authMode === "qortal" && currentUser.id !== GUEST_USER.id;

  return {
    users,
    setUsers,
    topics,
    setTopics,
    subTopics,
    setSubTopics,
    posts,
    setPosts,
    currentUser,
    isAuthReady,
    authMode,
    isAuthenticated,
    authenticate,
    availableAuthNames,
    activeAuthName,
    setActiveAuthName,
  };
};
