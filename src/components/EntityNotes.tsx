import { useMemo, useState } from "react";

export type EntityNote = {
  id: string;
  content: string;
  author: string;
  created_at: string;
  updated_at: string;
};

type SerializedNotesV1 = {
  kind: "entity_notes_v1";
  notes: EntityNote[];
};

type Props = {
  title?: string;
  notes: EntityNote[];
  onChange: (notes: EntityNote[]) => void;
  currentAuthor: string;
  emptyLabel?: string;
};

function makeId() {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function parseEntityNotes(raw: string | null | undefined): {
  notes: EntityNote[];
  legacyText: string;
} {
  if (!raw || !raw.trim()) return { notes: [], legacyText: "" };
  try {
    const parsed = JSON.parse(raw) as Partial<SerializedNotesV1>;
    if (parsed?.kind === "entity_notes_v1" && Array.isArray(parsed.notes)) {
      const safe = parsed.notes
        .filter((n) => n && typeof n.content === "string")
        .map((n) => ({
          id: typeof n.id === "string" && n.id ? n.id : makeId(),
          content: n.content.trim(),
          author: typeof n.author === "string" && n.author ? n.author : "Usuario",
          created_at:
            typeof n.created_at === "string" && n.created_at ? n.created_at : new Date().toISOString(),
          updated_at:
            typeof n.updated_at === "string" && n.updated_at ? n.updated_at : new Date().toISOString(),
        }))
        .filter((n) => n.content.length > 0);
      return { notes: safe, legacyText: "" };
    }
  } catch {
    /* legacy plain text */
  }
  return { notes: [], legacyText: raw.trim() };
}

export function serializeEntityNotes(notes: EntityNote[]): string | null {
  const clean = notes
    .map((n) => ({ ...n, content: n.content.trim() }))
    .filter((n) => n.content.length > 0);
  if (!clean.length) return null;
  const payload: SerializedNotesV1 = { kind: "entity_notes_v1", notes: clean };
  return JSON.stringify(payload);
}

export function EntityNotes({
  title = "Notas",
  notes,
  onChange,
  currentAuthor,
  emptyLabel = "No hay notas todavía.",
}: Props) {
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const sorted = useMemo(
    () =>
      [...notes].sort((a, b) => {
        if (a.created_at === b.created_at) return a.id.localeCompare(b.id);
        return a.created_at.localeCompare(b.created_at);
      }),
    [notes]
  );

  function addNote() {
    const content = newText.trim();
    if (!content) return;
    const now = new Date().toISOString();
    onChange([
      ...notes,
      {
        id: makeId(),
        content,
        author: currentAuthor || "Usuario",
        created_at: now,
        updated_at: now,
      },
    ]);
    setNewText("");
  }

  function beginEdit(note: EntityNote) {
    setEditingId(note.id);
    setEditText(note.content);
  }

  function saveEdit(note: EntityNote) {
    const content = editText.trim();
    if (!content) return;
    const now = new Date().toISOString();
    onChange(
      notes.map((n) =>
        n.id === note.id
          ? {
              ...n,
              content,
              updated_at: now,
            }
          : n
      )
    );
    setEditingId(null);
    setEditText("");
  }

  function removeNote(id: string) {
    onChange(notes.filter((n) => n.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditText("");
    }
  }

  return (
    <div className="card inner-line" style={{ margin: 0 }}>
      <h4 className="card-title" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
        {title}
      </h4>

      <label className="field">
        <span>Nueva nota</span>
        <textarea
          rows={3}
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Escribí una observación..."
        />
      </label>
      <div className="actions" style={{ justifyContent: "flex-end", marginTop: "-0.2rem" }}>
        <button type="button" className="btn primary small" onClick={addNote}>
          Agregar nota
        </button>
      </div>

      <div style={{ display: "grid", gap: "0.6rem", marginTop: "0.75rem" }}>
        {sorted.length === 0 ? <p className="muted small">{emptyLabel}</p> : null}
        {sorted.map((n) => (
          <article key={n.id} className="card inner-line" style={{ margin: 0 }}>
            <p className="muted small" style={{ marginBottom: "0.4rem" }}>
              {n.author} · {fmt(n.created_at)}
              {n.updated_at !== n.created_at ? ` · editada ${fmt(n.updated_at)}` : ""}
            </p>
            {editingId === n.id ? (
              <>
                <textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} />
                <div className="actions" style={{ justifyContent: "flex-end", marginTop: "0.5rem" }}>
                  <button type="button" className="btn ghost small" onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                  <button type="button" className="btn primary small" onClick={() => saveEdit(n)}>
                    Guardar
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ whiteSpace: "pre-wrap" }}>{n.content}</p>
                <div className="actions" style={{ justifyContent: "flex-end", marginTop: "0.5rem" }}>
                  <button type="button" className="btn ghost small" onClick={() => beginEdit(n)}>
                    Editar
                  </button>
                  <button type="button" className="btn ghost small danger-ghost" onClick={() => removeNote(n.id)}>
                    Eliminar
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

