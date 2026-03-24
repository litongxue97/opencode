import type { ToolCall } from "../agent/state"
import type { Cfg } from "../config"
import type { ToolRes } from "../tool/types"
import { id, now } from "../util/time"
import type { MemItem, MemType } from "./types"

function item(session: string, input: unknown): MemItem | undefined {
  if (!input || typeof input !== "object") return
  const o = input as Record<string, unknown>
  if (typeof o.text !== "string") return
  const tags = Array.isArray(o.tags) ? o.tags.filter((t) => typeof t === "string") : []
  const type: MemType =
    o.type === "preference" || o.type === "decision" || o.type === "artifact" || o.type === "summary"
      ? o.type
      : "fact"

  return {
    id: id(),
    session_id: session,
    type,
    text: o.text,
    tags,
    created_at: now(),
  }
}

export function afterTool(session: string, call: ToolCall, res: ToolRes, _cfg: Cfg) {
  if (!res.ok) return []
  if (call.name !== "remember") return []
  const v = item(session, call.input)
  if (!v) return []
  return [v]
}

