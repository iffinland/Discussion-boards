export interface User {
  id: string;
  username: string;
  displayName: string;
  role: "Admin" | "Member";
  avatarColor: string;
  joinedAt: string;
}

export interface Topic {
  id: string;
  title: string;
  description: string;
  createdByUserId: string;
  createdAt: string;
}

export interface SubTopic {
  id: string;
  topicId: string;
  title: string;
  description: string;
  authorUserId: string;
  createdAt: string;
  lastPostAt: string;
}

export interface Post {
  id: string;
  subTopicId: string;
  authorUserId: string;
  content: string;
  createdAt: string;
  likes: number;
}
