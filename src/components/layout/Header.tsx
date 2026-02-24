import { useForumData } from "../../hooks/useForumData";

type ThemeMode = "light-cyan" | "soft-cyan";

type HeaderProps = {
  themeMode: ThemeMode;
  onToggleTheme: () => void;
};

const SunIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={[
      "h-4 w-4 transition",
      active ? "text-brand-accent-strong" : "text-ui-muted",
    ].join(" ")}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" />
  </svg>
);

const MoonIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={[
      "h-4 w-4 transition",
      active ? "text-brand-primary-strong" : "text-ui-muted",
    ].join(" ")}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20.5 14.8A8.5 8.5 0 1 1 9.2 3.5a7 7 0 1 0 11.3 11.3Z" />
  </svg>
);

const Header = ({ themeMode, onToggleTheme }: HeaderProps) => {
  const {
    users,
    currentUser,
    setCurrentUser,
    canSwitchUser,
    authMode,
    isAuthenticated,
    isAuthReady,
    authenticate,
  } = useForumData();

  return (
    <header className="bg-forum-header border-brand-primary sticky top-0 z-20 border-b backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <h1 className="text-xl tracking-tight">
          <span className="text-brand-primary font-bold">Qortal</span>{" "}
          <span className="text-ui-strong font-semibold">Discussion</span>{" "}
          <span className="text-brand-accent font-bold">Boards</span>
        </h1>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={
              themeMode === "light-cyan"
                ? "Switch to Soft Cyan theme"
                : "Switch to Light Cyan theme"
            }
            title={
              themeMode === "light-cyan"
                ? "Switch to Soft Cyan"
                : "Switch to Light Cyan"
            }
            className="forum-pill-primary flex items-center gap-2 rounded-md px-3 py-2"
          >
            <SunIcon active={themeMode === "light-cyan"} />
            <MoonIcon active={themeMode === "soft-cyan"} />
          </button>

          <div className="forum-card border-brand-primary flex items-center gap-3 px-3 py-2">
            <div
              className={`${currentUser.avatarColor} h-8 w-8 rounded-full ring-2 ring-cyan-100`}
              aria-hidden="true"
            />
            <div className="leading-tight">
              <p className="text-ui-strong text-sm font-semibold">
                {currentUser.displayName}
              </p>
              <p className="text-ui-muted text-xs">{currentUser.role}</p>
            </div>
            <select
              value={currentUser.id}
              onChange={(event) => setCurrentUser(event.target.value)}
              className="bg-surface-card text-ui-strong rounded-md border border-slate-200 px-2 py-1 text-xs"
              aria-label="Current user"
              disabled={!canSwitchUser}
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName} ({user.role})
                </option>
              ))}
            </select>
          </div>
          {authMode === "qortal" && !isAuthenticated ? (
            <button
              type="button"
              onClick={() => {
                void authenticate();
              }}
              className="rounded-md bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600"
            >
              Authenticate
            </button>
          ) : null}
          <div className="text-ui-muted text-[10px] leading-tight">
            <p>{isAuthReady ? "Auth Ready" : "Auth Loading..."}</p>
            <p>
              {authMode === "qortal"
                ? isAuthenticated
                  ? "Qortal Connected"
                  : "Qortal Not Authenticated"
                : "Qortal"}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
