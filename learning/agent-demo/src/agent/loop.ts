import type { Cfg } from "../config"
import type { Mem } from "../memory/store"
import { afterTool } from "../memory/policy"
import type { Tools } from "../tool/registry"
import type { Llm } from "../llm"
import type { Trace } from "../trace/bus"
import { guard } from "./limits"

export async function runTurn(
  cfg: Cfg,
  deps: { llm: Llm; mem: Mem; tools: Tools; trace: Trace },
  session: string,
  text: string,
) {
  deps.trace.emit({ type: "turn_start", session, text, ts: Date.now() })

  await deps.mem.appendMsg(session, { role: "user", content: text })

  const start = Date.now()
  let steps = 0
  let calls = 0
  const seen = guard()

  while (true) {
    steps++
    if (steps > cfg.limits.maxSteps) return end("max_steps")
    if (Date.now() - start > cfg.limits.timeoutMs) return end("timeout")

    const hits = await deps.mem.retrieve(session, text, cfg.mem.topK)
    deps.trace.emit({ type: "retrieve", query: text, hits: hits.length, ts: Date.now() })

    const defs = await deps.tools.list(cfg)
    const msgs = await deps.mem.buildContext(session, hits, cfg, defs)

    deps.trace.emit({ type: "llm_request", ts: Date.now(), tools: defs.length, msg: msgs.length })
    const out = await deps.llm.complete(msgs, defs, cfg)
    deps.trace.emit({ type: "llm_response", ts: Date.now(), out })

    if (out.type === "final") {
      await deps.mem.appendMsg(session, { role: "assistant", content: out.text })
      await deps.mem.maybeSummarize(session, cfg)
      deps.trace.emit({ type: "turn_end", ts: Date.now(), text: out.text })
      return { text: out.text, trace: deps.trace.id }
    }

    for (const call of out.calls) {
      calls++
      if (calls > cfg.limits.maxCalls) return end("max_calls")
      if (seen(call)) return end("repeat_tool_call")

      deps.trace.emit({ type: "tool_call", ts: Date.now(), call })
      const res = await deps.tools.run(call, cfg)
      deps.trace.emit({ type: "tool_result", ts: Date.now(), id: call.id, res })

      await deps.mem.appendMsg(session, {
        role: "tool",
        content: res.content,
        name: call.name,
        tool_call_id: call.id,
      })

      for (const item of afterTool(session, call, res, cfg)) {
        await deps.mem.write(item)
        deps.trace.emit({ type: "memory_write", ts: Date.now(), item })
      }
    }
  }

  async function end(reason: string) {
    const text = `终止：${reason}`
    await deps.mem.appendMsg(session, { role: "assistant", content: text })
    deps.trace.emit({ type: "turn_end", ts: Date.now(), text })
    return { text, trace: deps.trace.id }
  }
}

