import type { Safety, ToolRes } from "../tool/types"

export type Skill = {
  name: string
  description: string
  schema: unknown
  safety: Safety
  run: (input: unknown) => Promise<ToolRes>
}

