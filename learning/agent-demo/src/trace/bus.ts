import type { Cfg } from "../config"
import type { TraceEvt } from "./types"
import { mkSink } from "./sink-jsonl"

export type Trace = {
  id: string
  emit(e: TraceEvt): void
  close(): Promise<void>
}

export function mkTrace(cfg: Cfg): Trace {
  const id = crypto.randomUUID()
  if (!cfg.trace.on) return { id, emit() {}, async close() {} }

  const sink = mkSink(cfg.trace.dir, id)
  return {
    id,
    emit(e) {
      void sink.write(e)
    },
    async close() {},
  }
}

