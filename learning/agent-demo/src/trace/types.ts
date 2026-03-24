import type { ToolCall } from "../agent/state"
import type { ToolRes } from "../tool/types"
import type { MemItem } from "../memory/types"
import type { LlmOut } from "../agent/state"

export type TraceEvt =
  | { type: "turn_start"; ts: number; session: string; text: string }
  | { type: "retrieve"; ts: number; query: string; hits: number }
  | { type: "llm_request"; ts: number; tools: number; msg: number }
  | { type: "llm_response"; ts: number; out: LlmOut }
  | { type: "tool_call"; ts: number; call: ToolCall }
  | { type: "tool_result"; ts: number; id: string; res: ToolRes }
  | { type: "memory_write"; ts: number; item: MemItem }
  | { type: "turn_end"; ts: number; text: string }

