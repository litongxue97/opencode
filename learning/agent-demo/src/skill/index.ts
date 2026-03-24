import type { Skill } from "./types"
import { now } from "../util/time"

function obj(v: unknown) {
  return !!v && typeof v === "object" ? (v as Record<string, unknown>) : undefined
}

export function skills(): Skill[] {
  return [
    {
      name: "echo",
      description: "回显输入",
      schema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
      safety: "read_only",
      async run(input) {
        const o = obj(input)
        if (!o || typeof o.text !== "string") {
          return { ok: false, content: "invalid input", error: { code: "bad_input", message: "text required" } }
        }
        return { ok: true, content: o.text }
      },
    },
    {
      name: "time",
      description: "输出当前时间（毫秒时间戳）",
      schema: { type: "object", properties: {}, additionalProperties: false },
      safety: "read_only",
      async run() {
        return { ok: true, content: String(now()), data: { ms: now() } }
      },
    },
    {
      name: "remember",
      description: "写入一条记忆（仅本地 DB）",
      schema: {
        type: "object",
        properties: {
          text: { type: "string" },
          type: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["text"],
        additionalProperties: false,
      },
      safety: "write",
      async run(input) {
        const o = obj(input)
        if (!o || typeof o.text !== "string") {
          return { ok: false, content: "invalid input", error: { code: "bad_input", message: "text required" } }
        }
        const tags = Array.isArray(o.tags) ? o.tags.filter((t) => typeof t === "string") : []
        const type = typeof o.type === "string" ? o.type : "fact"
        return { ok: true, content: `已记录：${o.text}`, data: { text: o.text, type, tags } }
      },
    },
  ]
}

