import type { ToolCall } from "../agent/state"
import type { Cfg } from "../config"
import { run as exec } from "./runner"
import type { ToolDef, ToolRes } from "./types"
import type { Local } from "./local"

type Item = { def: ToolDef; run: (input: unknown) => Promise<ToolRes> }

export type Tools = {
  list(cfg: Cfg): Promise<ToolDef[]>
  run(call: ToolCall, cfg: Cfg): Promise<ToolRes>
}

export function mkTools(loc: Local[], mcp: { list(cfg: Cfg): Promise<Item[]> }): Tools {
  const map = new Map<string, Item>()
  for (const t of loc) map.set(t.def.name, t)

  let ts = 0

  async function load(cfg: Cfg) {
    if (Date.now() - ts < 2_000) return
    for (const [k, v] of map.entries()) if (v.def.kind === "mcp") map.delete(k)
    const xs = await mcp.list(cfg)
    for (const x of xs) map.set(x.def.name, x)
    ts = Date.now()
  }

  return {
    async list(cfg) {
      await load(cfg)
      return [...map.values()].map((x) => x.def)
    },
    async run(call, cfg) {
      await load(cfg)
      const x = map.get(call.name)
      if (!x) return { ok: false, content: `unknown tool: ${call.name}`, error: { code: "no_tool", message: call.name } }
      return await exec(call, x.def, x.run, cfg)
    },
  }
}
