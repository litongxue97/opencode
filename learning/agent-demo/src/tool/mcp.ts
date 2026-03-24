import type { Cfg } from "../config"
import { mkMcp } from "../mcp/client"
import { text } from "../util/json"
import type { ToolDef, ToolRes } from "./types"

type Item = { def: ToolDef; run: (input: unknown) => Promise<ToolRes> }

export type McpHub = {
  list(cfg: Cfg): Promise<Item[]>
  close(): Promise<void>
}

function parse(name: string) {
  const xs = name.split(".")
  if (xs.length < 3) return
  if (xs[0] !== "mcp") return
  return { srv: xs[1], tool: xs.slice(2).join(".") }
}

function content(v: unknown) {
  if (!v) return ""
  if (typeof v === "string") return v
  if (Array.isArray(v)) return v.map((x) => content(x)).filter(Boolean).join("\n")
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    if (typeof o.text === "string") return o.text
    if (typeof o.content === "string") return o.content
    return text(v)
  }
  return String(v)
}

export function mkMcpHub(cfg: Cfg): McpHub {
  const cs = new Map(
    cfg.mcp.servers.map((s) => [s.name, mkMcp(s.cmd, s.args, s.env)] as const),
  )

  return {
    async list(cfg) {
      const xs = await Promise.all(
        [...cs.entries()].map(async ([name, c]) => ({ name, tools: await c.list(cfg) })),
      )

      return xs.flatMap((x) =>
        x.tools.map((t) => ({
          def: {
            name: `mcp.${x.name}.${t.name}`,
            description: t.description || "",
            schema: t.inputSchema || { type: "object", properties: {}, additionalProperties: true },
            safety: "read_only",
            kind: "mcp",
          } satisfies ToolDef,
          async run(input) {
            const p = parse(`mcp.${x.name}.${t.name}`)
            if (!p) return { ok: false, content: "bad mcp tool name", error: { code: "bad_name", message: "bad name" } }
            const res = await cs.get(p.srv)?.call(p.tool, input, cfg)
            return { ok: true, content: content(res?.content), data: res }
          },
        })),
      )
    },
    async close() {
      await Promise.all([...cs.values()].map((c) => c.close()))
    },
  }
}

