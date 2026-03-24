import type { ToolDef, ToolRes } from "./types"
import type { Skill } from "../skill/types"

export type Local = { def: ToolDef; run: (input: unknown) => Promise<ToolRes> }

export function locals(xs: Skill[]): Local[] {
  return xs.map((s) => ({
    def: {
      name: s.name,
      description: s.description,
      schema: s.schema,
      safety: s.safety,
      kind: "local",
    } satisfies ToolDef,
    run: s.run,
  }))
}
