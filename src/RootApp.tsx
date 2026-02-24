import App from "./App";
import { AppWrapper } from "./AppWrapper";
import { ForumProvider } from "./context/ForumContext";

const RootApp = () => {
  return (
    <AppWrapper>
      <ForumProvider>
        <App />
      </ForumProvider>
    </AppWrapper>
  );
};

export default RootApp;
