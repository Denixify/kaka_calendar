import "./DialogHost.scss";
import { useSyncExternalStore } from "react";
import {
  dismissToast,
  getConfirms,
  getToasts,
  subscribeDialogs,
} from "../utils/dialogs";

export function DialogHost() {
  const toasts = useSyncExternalStore(subscribeDialogs, getToasts);
  const confirms = useSyncExternalStore(subscribeDialogs, getConfirms);
  const current = confirms[0];

  return (
    <>
      <div className="pt-dialog-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pt-dialog-toast pt-dialog-toast--${t.kind}`}
            onClick={() => dismissToast(t.id)}
          >
            {t.message}
          </div>
        ))}
      </div>

      {current && (
        <div className="pt-overlay pt-dialog-overlay">
          <div className="pt-modal" role="alertdialog" aria-modal="true">
            <p className="pt-dialog-message">{current.message}</p>
            <div className="pt-modal__actions-row">
              <button
                className="pt-btn pt-btn--secondary"
                onClick={() => current.resolve(false)}
              >
                Отмена
              </button>
              <button
                className="pt-btn pt-btn--primary"
                onClick={() => current.resolve(true)}
              >
                Да
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
