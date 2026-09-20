interface BottomNavBarProps {
  activeTab: "home" | "friends" | "profile";
  onChangeTab: (tab: "home" | "friends" | "profile") => void;
  hasUnreadFriends?: boolean;
}

export function BottomNavBar({
  activeTab,
  onChangeTab,
  hasUnreadFriends = false,
}: BottomNavBarProps) {
  return (
    <nav className="pt-nav-capsule-wrapper">
      <div className="pt-nav-capsule">
        <button
          className={`pt-nav-tab ${activeTab === "home" ? "active" : ""}`}
          onClick={() => onChangeTab("home")}
        >
          <span className="pt-nav-icon">📅</span>
          <span className="pt-nav-label">Дневник</span>
        </button>

        <button
          className={`pt-nav-tab ${activeTab === "friends" ? "active" : ""}`}
          onClick={() => onChangeTab("friends")}
        >
          <span className="pt-nav-icon pt-nav-icon--relative">
            💬
            {hasUnreadFriends && <span className="pt-badge-dot" />}
          </span>
          <span className="pt-nav-label">Друзья</span>
        </button>

        <button
          className={`pt-nav-tab ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => onChangeTab("profile")}
        >
          <span className="pt-nav-icon">👤</span>
          <span className="pt-nav-label">Профиль</span>
        </button>
      </div>
    </nav>
  );
}
