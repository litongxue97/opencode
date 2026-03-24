export type McpTool = {
  name: string
  description?: string
  inputSchema?: unknown
}

export type McpCallRes = {
  content?: unknown
  [k: string]: unknown
}

