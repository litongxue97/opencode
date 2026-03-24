export type Safety = "read_only" | "write" | "external_network"

export type ToolDef = {
  name: string
  description: string
  schema: unknown
  safety: Safety
  kind: "local" | "mcp"
}

export type ToolRes = {
  ok: boolean
  content: string
  data?: unknown
  error?: { code: string; message: string }
}

