export type UserRole =
  | 'SysOp'
  | 'SuperAdmin'
  | 'Admin'
  | 'Moderator'
  | 'Member';
export type TopicStatus = 'open' | 'locked';
export type TopicVisibility = 'visible' | 'hidden';
export type TopicAccess = 'everyone' | 'moderators' | 'admins' | 'custom';
export type SubTopicStatus = 'open' | 'locked';
export type SubTopicVisibility = 'visible' | 'hidden';

export interface PostAttachment {
  id: string;
  service: string;
  name: string;
  identifier: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  address?: string | null;
  avatarUrl?: string | null;
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
  sortOrder: number;
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
  isPinned: boolean;
  pinnedAt: string | null;
  isSolved: boolean;
  solvedAt: string | null;
  solvedByUserId: string | null;
  access: TopicAccess;
  allowedAddresses: string[];
  status: SubTopicStatus;
  visibility: SubTopicVisibility;
}

export interface Post {
  id: string;
  subTopicId: string;
  authorUserId: string;
  parentPostId: string | null;
  content: string;
  attachments: PostAttachment[];
  createdAt: string;
  editedAt?: string | null;
  likes: number;
  tips: number;
  likedByAddresses: string[];
}

export interface ForumRoleRegistry {
  primarySysOpAddress: string;
  sysOps: string[];
  admins: string[];
  moderators: string[];
  updatedAt: number | null;
}
