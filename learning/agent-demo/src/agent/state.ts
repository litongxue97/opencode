export type Role = "system" | "user" | "assistant" | "tool"

export type Msg = {
  role: Role
  content: string
  name?: string
  tool_call_id?: string
}

export type ToolCall = {
  id: string
  name: string
  input: unknown
}

export type LlmOut =
  | { type: "final"; text: string }
  | { type: "tool"; calls: ToolCall[]; text?: string }

