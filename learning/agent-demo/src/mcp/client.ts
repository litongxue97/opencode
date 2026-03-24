import type { Cfg } from "../config"
import type { McpCallRes, McpTool } from "./types"
import { mkStdio } from "./transport/stdio"

export type Mcp = {
  list(cfg: Cfg): Promise<McpTool[]>
  call(name: string, input: unknown, cfg: Cfg): Promise<McpCallRes>
  close(): Promise<void>
}

export function mkMcp(cmd: string, args: string[], env: Record<string, string> | undefined): Mcp {
  const tx = mkStdio(cmd, args, env)
  return {
    async list(cfg) {
      const res = await tx.req("tools/list", {}, cfg)
      if (!res || typeof res !== "object") return []
      const o = res as Record<string, unknown>
      const xs = Array.isArray(o.tools) ? o.tools : []
      return xs
        .map((x) => {
          if (!x || typeof x !== "object") return
          const t = x as Record<string, unknown>
          if (typeof t.name !== "string") return
          return {
            name: t.name,
            description: typeof t.description === "string" ? t.description : undefined,
            inputSchema: t.inputSchema,
          } satisfies McpTool
        })
        .filter((x): x is McpTool => !!x)
    },
    async call(name, input, cfg) {
      const res = await tx.req("tools/call", { name, input }, cfg)
      return (res || {}) as McpCallRes
    },
    async close() {
      await tx.close()
    },
  }
}
