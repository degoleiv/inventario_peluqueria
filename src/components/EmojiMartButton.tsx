import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import data from "@emoji-mart/data";

const EmojiPicker = lazy(() => import("@emoji-mart/react"));

type EmojiSelectPayload = { native: string };

function readDataTheme(): "light" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function subscribeDataTheme(onStoreChange: () => void) {
  const mo = new MutationObserver(onStoreChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

type Props = {
  onPick: (emojiNative: string) => void;
  /** `auto` sigue `data-theme` del documento */
  theme?: "light" | "dark" | "auto";
  ariaLabel?: string;
};

export function EmojiMartButton({
  onPick,
  theme = "auto",
  ariaLabel = "Insertar emoji",
}: Props) {
  const appTheme = useSyncExternalStore(subscribeDataTheme, readDataTheme, () => "light");
  const pickerTheme = theme === "auto" ? appTheme : theme;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(ev: MouseEvent) {
      if (wrapRef.current?.contains(ev.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  return (
    <div className="emoji-mart-anchor" ref={wrapRef}>
      <button
        type="button"
        className="btn ghost small emoji-mart-toggle"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>😀</span>
      </button>
      {open ? (
        <div className="emoji-mart-popover" role="dialog" aria-label="Selector de emojis">
          <Suspense fallback={<div className="emoji-mart-fallback muted">Cargando emojis…</div>}>
            <EmojiPicker
              data={data}
              theme={pickerTheme}
              onEmojiSelect={(emoji: EmojiSelectPayload) => {
                onPick(emoji.native);
                setOpen(false);
              }}
              previewPosition="none"
              skinTonePosition="search"
              maxFrequentRows={2}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
