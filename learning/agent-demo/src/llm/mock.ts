import type { Msg, LlmOut, ToolCall } from "../agent/state"
import type { ToolDef } from "../tool/types"
import { id } from "../util/time"

function last<T>(xs: T[]) {
  return xs.length ? xs[xs.length - 1] : undefined
}

function tool(tools: ToolDef[], name: string) {
  return tools.some((t) => t.name === name)
}

export function mkMock() {
  return {
    async complete(msgs: Msg[], tools: ToolDef[]): Promise<LlmOut> {
      const m = last(msgs)
      if (!m) return { type: "final", text: "空输入" }
      if (m.role === "tool") return { type: "final", text: `工具结果：\n${m.content}` }

      const q = m.content
      if (q.includes("时间") && tool(tools, "time")) {
        const calls: ToolCall[] = [{ id: id(), name: "time", input: {} }]
        return { type: "tool", calls }
      }

      if ((q.includes("记住") || q.includes("记下")) && tool(tools, "remember")) {
        const text = q.replace(/^.*?(记住|记下)/, "").trim() || q
        const calls: ToolCall[] = [{ id: id(), name: "remember", input: { text } }]
        return { type: "tool", calls }
      }

      const mcp = tools.find((t) => t.name.startsWith("mcp."))
      if (q.includes("mcp") && mcp) {
        const calls: ToolCall[] = [{ id: id(), name: mcp.name, input: { text: q } }]
        return { type: "tool", calls }
      }

      if (tool(tools, "echo")) {
        const calls: ToolCall[] = [{ id: id(), name: "echo", input: { text: q } }]
        return { type: "tool", calls }
      }

      return { type: "final", text: q }
    },
  }
}

