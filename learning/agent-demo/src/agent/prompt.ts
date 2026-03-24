import type { Msg } from "./state"
import type { Cfg } from "../config"
import type { MemItem } from "../memory/types"
import type { ToolDef } from "../tool/types"

function rank(t: MemItem["type"]) {
  if (t === "preference") return 0
  if (t === "fact") return 1
  if (t === "decision") return 2
  if (t === "artifact") return 3
  return 4
}

function mem(hits: MemItem[]) {
  const xs = hits
    .slice()
    .sort((a, b) => rank(a.type) - rank(b.type))
    .slice(0, 12)
    .map((x) => {
      const t = x.tags.length ? ` (${x.tags.join(",")})` : ""
      return `- [${x.type}] ${x.text}${t}`
    })
    .join("\n")

  if (!xs) return ""
  return `长期记忆：\n${xs}`
}

function sys(tools: ToolDef[]) {
  const names = tools.map((t) => t.name).slice(0, 80)
  return [
    "你是一个 CLI agent。优先使用工具获取事实，不要编造工具结果。",
    "需要工具时，选择合适的 tool 调用并给出正确的 input。",
    "工具失败时说明原因，并决定重试/换工具/降级回答。",
    names.length ? `可用工具：${names.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

export function build(cfg: Cfg, recent: Msg[], hits: MemItem[], tools: ToolDef[], sum: string): Msg[] {
  const xs: Msg[] = [{ role: "system", content: sys(tools) }]

  const m = mem(hits)
  if (m) xs.push({ role: "system", content: m })

  if (sum.trim()) xs.push({ role: "system", content: `会话摘要：\n${sum.trim()}` })

  xs.push(...recent.slice(-cfg.mem.maxMsgs))
  return xs
}

