import type { Msg, LlmOut, ToolCall } from "../agent/state"
import type { Cfg } from "../config"
import type { ToolDef } from "../tool/types"

function tools(defs: ToolDef[]) {
  return defs.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.schema },
  }))
}

function args(v: string) {
  try {
    return JSON.parse(v) as unknown
  } catch {
    return v
  }
}

export function mkOpenAI(cfg: Cfg) {
  return {
    async complete(msgs: Msg[], defs: ToolDef[]): Promise<LlmOut> {
      if (!cfg.llm.key) return { type: "final", text: "缺少 OPENAI_API_KEY" }
      const res = await fetch(`${cfg.llm.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.llm.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.llm.model,
          messages: msgs,
          tools: tools(defs),
        }),
      }).then((r) => r.json() as Promise<Record<string, unknown>>)

      const cs = (res.choices as unknown[]) || []
      const c = (cs[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined
      const text = typeof c?.content === "string" ? c.content : ""
      const calls = Array.isArray(c?.tool_calls) ? c.tool_calls : []
      if (!calls.length) return { type: "final", text: text || "（空响应）" }

      const out = calls
        .map((x) => {
          if (!x || typeof x !== "object") return
          const o = x as Record<string, unknown>
          if (typeof o.id !== "string") return
          const fn = o.function as Record<string, unknown> | undefined
          if (!fn || typeof fn.name !== "string") return
          const input = typeof fn.arguments === "string" ? args(fn.arguments) : fn.arguments
          return { id: o.id, name: fn.name, input } satisfies ToolCall
        })
        .filter((x): x is ToolCall => !!x)

      return { type: "tool", calls: out, text: text || undefined }
    },
  }
}

