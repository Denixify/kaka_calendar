import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, DOMAIN_SUFFIX } from "../firebase";

interface AuthScreenProps {
  onSuccess: (nickname: string) => void;
}

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [rawNickname, setRawNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
        const usernameRef = doc(db, "usernames", cleanNickname);
        const usernameSnap = await getDoc(usernameRef);

        if (usernameSnap.exists()) {
          setError("Этот никнейм уже занят. Придумай другой!");
          setIsLoading(false);
          return;
        }

        const cred = await createUserWithEmailAndPassword(
          auth,
          fakeEmail,
          password,
        );
        await updateProfile(cred.user, { displayName: cleanNickname });

        await setDoc(doc(db, "usernames", cleanNickname), {
          uid: cred.user.uid,
        });
        await setDoc(doc(db, "users", cred.user.uid), {
          nickname: cleanNickname,
          createdAt: Date.now(),
        });

        onSuccess(cleanNickname);
      } else {
        const cred = await signInWithEmailAndPassword(
          auth,
          fakeEmail,
          password,
        );
        onSuccess(cred.user.displayName || cleanNickname);
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password"
      ) {
        setError("Неверный никнейм или пароль");
      } else if (err.code === "auth/email-already-in-use") {
        setError("Пользователь с таким никнеймом уже зарегистрирован");
      } else if (err.code === "permission-denied") {
        setError("Доступ запрещен базой данных. Проверьте правила Firestore.");
      } else {
        setError(err.message || "Ошибка авторизации");
      }
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
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
          </label>

          <label className="pt-auth-label">
            Пароль
            <input
              type="password"
              className="pt-input pt-auth-input-pass"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
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
