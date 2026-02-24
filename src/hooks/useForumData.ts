import { useForumContext } from "../context/ForumContext";

export const useForumData = () => {
  return useForumContext();
};
