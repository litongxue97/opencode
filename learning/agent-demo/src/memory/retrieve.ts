import type { Database } from "bun:sqlite"
import type { MemItem } from "./types"

function tags(v: unknown) {
  if (typeof v !== "string") return []
  try {
    const xs = JSON.parse(v) as unknown
    if (!Array.isArray(xs)) return []
    return xs.filter((x) => typeof x === "string")
  } catch {
    return []
  }
}

export function retrieve(db: Database, session: string, q: string, k: number): MemItem[] {
  const rows = db
    .query(
      `SELECT m.id, m.session_id, m.type, m.text, m.tags, m.created_at
       FROM memory_fts f
       JOIN memory m ON m.rowid = f.rowid
       WHERE memory_fts MATCH ? AND (m.session_id IS NULL OR m.session_id = ?)
       ORDER BY bm25(memory_fts)
       LIMIT ?`,
    )
    .all(q, session, k) as Record<string, unknown>[]

  return rows
    .map((r) => {
      if (typeof r.id !== "string") return
      if (typeof r.type !== "string") return
      if (typeof r.text !== "string") return
      if (typeof r.created_at !== "number") return
      return {
        id: r.id,
        session_id: typeof r.session_id === "string" ? r.session_id : null,
        type: r.type as MemItem["type"],
        text: r.text,
        tags: tags(r.tags),
        created_at: r.created_at,
      } satisfies MemItem
    })
    .filter((x): x is MemItem => !!x)
    .filter((x) => x.text.trim().length > 0)
}

