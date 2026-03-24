import type { Cfg } from "../config"
import type { ToolDef, ToolRes } from "./types"

export function allow(def: ToolDef, cfg: Cfg): ToolRes | undefined {
  if (def.safety === "read_only") return
  if (def.safety === "write" && cfg.tool.allowWrite) return
  if (def.safety === "external_network" && cfg.tool.allowNet) return
  return {
    ok: false,
    content: `blocked: ${def.safety}`,
    error: { code: "blocked", message: `tool blocked: ${def.safety}` },
  }
}

