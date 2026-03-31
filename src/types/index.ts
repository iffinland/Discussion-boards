export type UserRole = "SuperAdmin" | "Admin" | "Moderator" | "Member";
export type TopicStatus = "open" | "locked";
export type TopicVisibility = "visible" | "hidden";
export type TopicAccess = "everyone" | "moderators" | "admins" | "custom";
export type SubTopicStatus = "open" | "locked";
export type SubTopicVisibility = "visible" | "hidden";

export interface User {
  id: string;
  username: string;
  displayName: string;
  address?: string | null;
  role: UserRole;
  avatarColor: string;
  joinedAt: string;
}

export interface Topic {
  id: string;
  title: string;
  description: string;
  createdByUserId: string;
  createdAt: string;
  status: TopicStatus;
  visibility: TopicVisibility;
  subTopicAccess: TopicAccess;
  allowedAddresses: string[];
}

export interface SubTopic {
  id: string;
  topicId: string;
  title: string;
  description: string;
  authorUserId: string;
  createdAt: string;
  lastPostAt: string;
  status: SubTopicStatus;
  visibility: SubTopicVisibility;
}

export interface Post {
  id: string;
  subTopicId: string;
  authorUserId: string;
  content: string;
  createdAt: string;
  likes: number;
}

export interface ForumRoleRegistry {
  superAdminAddress: string;
  admins: string[];
  moderators: string[];
  updatedAt: number | null;
}
