import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, runTransaction } from "firebase/firestore";
import { auth, db, DOMAIN_SUFFIX } from "../firebase";

interface AuthScreenProps {
  onSuccess: (nickname: string) => void;
}

function describeAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  const message = (err as { message?: string })?.message;

  if (message === "NICKNAME_TAKEN") {
    return "Этот никнейм уже занят. Придумай другой!";
  }
  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Неверный никнейм или пароль";
    case "auth/email-already-in-use":
      return "Этот никнейм уже занят. Придумай другой!";
    case "auth/weak-password":
      return "Слишком простой пароль. Используй минимум 6 символов";
    case "auth/network-request-failed":
      return "Нет соединения с сетью. Проверь интернет и попробуй снова";
    case "auth/too-many-requests":
      return "Слишком много попыток. Подожди немного и попробуй снова";
    case "permission-denied":
    case "firestore/permission-denied":
      return "Доступ запрещён правилами базы данных. Попробуй позже";
    default:
      console.error("Ошибка авторизации:", err);
      return "Не удалось выполнить вход. Попробуй ещё раз";
  }
}

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [rawNickname, setRawNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const cleanNickname = rawNickname
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (cleanNickname.length < 3) {
      setError(
        "Никнейм должен содержать минимум 3 символа (латиница, цифры, _)",
      );
      return;
    }
    if (password.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }

    setIsLoading(true);
    const fakeEmail = `${cleanNickname}${DOMAIN_SUFFIX}`;

    try {
      if (isRegister) {
        const cred = await createUserWithEmailAndPassword(
          auth,
          fakeEmail,
          password,
        );
        try {
          await updateProfile(cred.user, { displayName: cleanNickname });
          await runTransaction(db, async (tx) => {
            const usernameRef = doc(db, "usernames", cleanNickname);
            if ((await tx.get(usernameRef)).exists()) {
              throw new Error("NICKNAME_TAKEN");
            }
            tx.set(usernameRef, { uid: cred.user.uid });
            tx.set(doc(db, "users", cred.user.uid), {
              nickname: cleanNickname,
              createdAt: Date.now(),
            });
          });
        } catch (profileErr) {
          await cred.user.delete().catch(() => {});
          throw profileErr;
        }

        onSuccess(cleanNickname);
      } else {
        const cred = await signInWithEmailAndPassword(
          auth,
          fakeEmail,
          password,
        );
        onSuccess(cred.user.displayName || cleanNickname);
      }
    } catch (err: unknown) {
      setError(describeAuthError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pt-app pt-auth-screen">
      <div className="pt-card pt-auth-card">
        <div className="pt-auth-icon">💩</div>
        <h2 className="pt-auth-title">
          {isRegister ? "Создать аккаунт" : "С возвращением"}
        </h2>
        <p className="pt-auth-subtitle">
          {isRegister
            ? `Твой никнейм будет использоваться как @${cleanNickname || "nickname"}`
            : "Войди, чтобы синхронизировать данные"}
        </p>

        {error && <div className="pt-auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="pt-auth-form">
          <label className="pt-auth-label">
            Никнейм
            <input
              type="text"
              className="pt-input pt-auth-input-nick"
              placeholder="alex_2026"
              value={rawNickname}
              onChange={(e) => setRawNickname(e.target.value)}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
            {rawNickname.trim() !== "" &&
              cleanNickname !== rawNickname.trim().toLowerCase() && (
                <small className="pt-auth-hint">
                  Допустимы только латиница, цифры и _. Будет использовано: @
                  {cleanNickname || "…"}
                </small>
              )}
          </label>

          <label className="pt-auth-label">
            Пароль
            <div className="pt-password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                className="pt-input"
                placeholder="Пароль"
                name="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="pt-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPassword ? "👁️" : "🙈"}
              </button>
            </div>
          </label>

          <button
            type="submit"
            className="pt-btn pt-btn--primary pt-btn--action"
            disabled={isLoading}
          >
            {isLoading
              ? "Загрузка..."
              : isRegister
                ? "Зарегистрироваться"
                : "Войти"}
          </button>
        </form>

        <div className="pt-auth-switch-wrapper">
          <button
            type="button"
            className="pt-auth-switch"
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
          >
            {isRegister
              ? "Уже есть аккаунт? Войти"
              : "Нет аккаунта? Зарегистрироваться"}
          </button>
        </div>
      </div>
    </div>
  );
}
