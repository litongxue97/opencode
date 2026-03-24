import type { ToolCall } from "../agent/state"
import type { Cfg } from "../config"
import { text } from "../util/json"
import { now } from "../util/time"
import { allow } from "./policy"
import type { ToolDef, ToolRes } from "./types"

function cut(s: string, max: number) {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…(truncated)`
}

function timeout<T>(p: Promise<T>, ms: number) {
  if (ms <= 0) return p
  return Promise.race<T>([
    p,
    new Promise<T>((_, rej) => {
      setTimeout(() => rej(new Error("timeout")), ms)
    }),
  ])
}

export async function run(call: ToolCall, def: ToolDef, fn: (input: unknown) => Promise<ToolRes>, cfg: Cfg) {
  const block = allow(def, cfg)
  if (block) return block

  const start = now()
  const res = await timeout(
    Promise.resolve()
      .then(() => fn(call.input))
      .catch((err) => ({
        ok: false,
        content: `tool error: ${String(err)}`,
        error: { code: "tool_error", message: String(err) },
      })),
    cfg.tool.timeoutMs,
  ).catch((err) => ({
    ok: false,
    content: `tool timeout: ${cfg.tool.timeoutMs}ms`,
    error: { code: "timeout", message: String(err) },
  }))

  const out: ToolRes = {
    ok: !!res.ok,
    content: cut(typeof res.content === "string" ? res.content : text(res.content), cfg.tool.maxOut),
    data: res.data,
    error: res.error,
  }

  const ms = now() - start
  if (!out.data || typeof out.data !== "object" || Array.isArray(out.data)) return { ...out, data: { ms, data: out.data } }
  return { ...out, data: { ...(out.data as Record<string, unknown>), ms } }
}
