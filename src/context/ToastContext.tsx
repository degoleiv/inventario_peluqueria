import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ToastTone = "success" | "error" | "warning" | "info";

export type ToastAction = {
  label: string;
  onAction: () => void;
};

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  durationMs: number;
};

export type ToastOptions = {
  action?: ToastAction;
  durationMs?: number;
};

const ToastContext = createContext<{
  push: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
} | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastTone = "info", options?: ToastOptions) => {
    const id = nextId++;
    const durationMs =
      options?.durationMs ?? (options?.action ? 8800 : 4200);
    setItems((prev) => [...prev, { id, message, tone, action: options?.action, durationMs }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role="status">
            <span className="toast-msg">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action?.onAction();
                  setItems((prev) => prev.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (
  message: string,
  tone?: ToastTone,
  options?: ToastOptions
) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast dentro de ToastProvider");
  return useCallback(
    (message: string, tone: ToastTone = "info", options?: ToastOptions) => {
      ctx.push(message, tone, options);
    },
    [ctx]
  );
}
