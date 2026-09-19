interface BottomNavBarProps {
  activeTab: "home" | "friends" | "profile";
  onChangeTab: (tab: "home" | "friends" | "profile") => void;
}

export function BottomNavBar({ activeTab, onChangeTab }: BottomNavBarProps) {
  return (
    <nav className="pt-bottom-nav">
      <button
        className={`pt-bottom-nav__item ${activeTab === "home" ? "active" : ""}`}
        onClick={() => onChangeTab("home")}
      >
        <span className="pt-bottom-nav__icon">📅</span>
        <span className="pt-bottom-nav__label">Дневник</span>
      </button>

      <button
        className={`pt-bottom-nav__item ${activeTab === "friends" ? "active" : ""}`}
        onClick={() => onChangeTab("friends")}
      >
        <span className="pt-bottom-nav__icon">👥</span>
        <span className="pt-bottom-nav__label">Друзья</span>
      </button>

      <button
        className={`pt-bottom-nav__item ${activeTab === "profile" ? "active" : ""}`}
        onClick={() => onChangeTab("profile")}
      >
        <span className="pt-bottom-nav__icon">👤</span>
        <span className="pt-bottom-nav__label">Профиль</span>
      </button>
    </nav>
  );
}
