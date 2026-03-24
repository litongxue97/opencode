import type { Msg, LlmOut } from "../agent/state"
import type { Cfg } from "../config"
import type { ToolDef } from "../tool/types"
import { mkMock } from "./mock"
import { mkOpenAI } from "./openai"

export type Llm = {
  complete(msgs: Msg[], tools: ToolDef[], cfg: Cfg): Promise<LlmOut>
}

export function mkLlm(cfg: Cfg): Llm {
  if (cfg.llm.provider === "openai") return mkOpenAI(cfg)
  return mkMock()
}

