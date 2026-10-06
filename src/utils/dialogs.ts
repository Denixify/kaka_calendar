export type ToastKind = "info" | "success" | "error";

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export interface ConfirmRequest {
  id: number;
  message: string;
  resolve: (ok: boolean) => void;
}

type Listener = () => void;

let toasts: ToastItem[] = [];
let confirms: ConfirmRequest[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l());

export function subscribeDialogs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getToasts = () => toasts;
export const getConfirms = () => confirms;

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function notify(message: string, kind: ToastKind = "info") {
  const id = nextId++;
  toasts = [...toasts, { id, message, kind }];
  emit();
  setTimeout(() => dismissToast(id), 4500);
}

export function askConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const id = nextId++;
    confirms = [
      ...confirms,
      {
        id,
        message,
        resolve: (ok) => {
          confirms = confirms.filter((c) => c.id !== id);
          emit();
          resolve(ok);
        },
      },
    ];
    emit();
  });
}
