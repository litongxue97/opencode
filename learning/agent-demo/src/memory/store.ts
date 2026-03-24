import { Database } from "bun:sqlite"
import type { Msg } from "../agent/state"
import type { Cfg } from "../config"
import type { ToolDef } from "../tool/types"
import { id, now } from "../util/time"
import { build } from "../agent/prompt"
import { sql } from "./schema"
import type { MemItem } from "./types"
import { retrieve as find } from "./retrieve"

function json(v: unknown) {
  try {
    return JSON.stringify(v)
  } catch {
    return "[]"
  }
}

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

function msgs(db: Database, session: string, limit: number) {
  const rows = db
    .query(
      `SELECT role, content, name, tool_call_id
       FROM messages
       WHERE session_id=?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(session, limit) as Record<string, unknown>[]

  return rows
    .map((r) => {
      if (typeof r.role !== "string") return
      if (typeof r.content !== "string") return
      return {
        role: r.role as Msg["role"],
        content: r.content,
        name: typeof r.name === "string" ? r.name : undefined,
        tool_call_id: typeof r.tool_call_id === "string" ? r.tool_call_id : undefined,
      } satisfies Msg
    })
    .filter((x): x is Msg => !!x)
    .reverse()
}

function summary(db: Database, session: string) {
  const row = db.query(`SELECT summary FROM sessions WHERE id=?`).get(session) as
    | { summary?: unknown }
    | undefined
  return typeof row?.summary === "string" ? row.summary : ""
}

function set(db: Database, session: string, v: string) {
  const ts = now()
  db.run(
    `INSERT INTO sessions(id, created_at, updated_at, summary)
     VALUES(?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, summary=excluded.summary`,
    [session, ts, ts, v],
  )
}

function touch(db: Database, session: string) {
  const ts = now()
  db.run(
    `INSERT INTO sessions(id, created_at, updated_at, summary)
     VALUES(?, ?, ?, '')
     ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`,
    [session, ts, ts],
  )
}

function summarize(xs: Msg[]) {
  const keep = xs.filter((m) => m.role === "user" || m.role === "assistant").slice(-12)
  return keep
    .map((m) => {
      const p = m.role === "user" ? "用户" : "助手"
      const s = m.content.replace(/\s+/g, " ").trim()
      return `- ${p}：${s.length > 160 ? `${s.slice(0, 160)}…` : s}`
    })
    .join("\n")
}

export type Mem = {
  db: Database
  appendMsg(session: string, msg: Msg): Promise<void>
  listMsg(session: string, limit: number): Promise<Msg[]>
  write(item: MemItem): Promise<void>
  listMem(session: string, limit: number): Promise<MemItem[]>
  retrieve(session: string, q: string, k: number): Promise<MemItem[]>
  getSummary(session: string): Promise<string>
  setSummary(session: string, v: string): Promise<void>
  buildContext(session: string, hits: MemItem[], cfg: Cfg, tools: ToolDef[]): Promise<Msg[]>
  maybeSummarize(session: string, cfg: Cfg): Promise<void>
  close(): void
}

export function mkMem(cfg: Cfg): Mem {
  const db = new Database(cfg.db.path)
  db.run(sql)

  return {
    db,
    async appendMsg(session, msg) {
      touch(db, session)
      db.run(
        `INSERT INTO messages(id, session_id, role, content, name, tool_call_id, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
        [id(), session, msg.role, msg.content, msg.name ?? null, msg.tool_call_id ?? null, now()],
      )
    },
    async listMsg(session, limit) {
      return msgs(db, session, limit)
    },
    async write(item) {
      touch(db, item.session_id || "global")
      db.run(
        `INSERT INTO memory(id, session_id, type, text, tags, created_at)
         VALUES(?, ?, ?, ?, ?, ?)`,
        [item.id, item.session_id ?? null, item.type, item.text, json(item.tags), item.created_at],
      )
    },
    async listMem(session, limit) {
      const rows = db
        .query(
          `SELECT id, session_id, type, text, tags, created_at
           FROM memory
           WHERE session_id IS NULL OR session_id=?
           ORDER BY created_at DESC
           LIMIT ?`,
        )
        .all(session, limit) as Record<string, unknown>[]

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
    },
    async retrieve(session, q, k) {
      return find(db, session, q, k)
    },
    async getSummary(session) {
      return summary(db, session)
    },
    async setSummary(session, v) {
      set(db, session, v)
    },
    async buildContext(session, hits, cfg, tools) {
      const recent = msgs(db, session, cfg.mem.maxMsgs)
      return build(cfg, recent, hits, tools, await this.getSummary(session))
    },
    async maybeSummarize(session, cfg) {
      const c = (db.query(`SELECT COUNT(*) as n FROM messages WHERE session_id=?`).get(session) as
        | { n?: unknown }
        | undefined)?.n
      if (typeof c !== "number") return
      if (c < cfg.mem.summarizeAt) return
      if (c % cfg.mem.summarizeAt !== 0) return
      set(db, session, summarize(msgs(db, session, cfg.mem.maxMsgs)))
    },
    close() {
      db.close()
    },
  }
}
