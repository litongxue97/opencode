import path from "node:path"

export type Cfg = {
  llm: {
    provider: "mock" | "openai"
    model: string
    key?: string
    baseUrl: string
  }
  db: { path: string }
  trace: { dir: string; on: boolean }
  mem: { topK: number; maxMsgs: number; summarizeAt: number }
  tool: { allowWrite: boolean; allowNet: boolean; timeoutMs: number; maxOut: number }
  mcp: { servers: { name: string; cmd: string; args: string[]; env?: Record<string, string> }[] }
  limits: { maxSteps: number; maxCalls: number; timeoutMs: number }
}

function num(v: string | undefined, d: number) {
  if (!v) return d
  const n = Number(v)
  if (!Number.isFinite(n)) return d
  return n
}

function bool(v: string | undefined, d: boolean) {
  if (!v) return d
  if (v === "1") return true
  if (v === "0") return false
  return v.toLowerCase() === "true"
}

function home() {
  return Bun.env.HOME || process.cwd()
}

function dir(v: string | undefined, d: string) {
  if (!v) return d
  if (path.isAbsolute(v)) return v
  return path.join(process.cwd(), v)
}

function servers(v: string | undefined) {
  if (!v) return []
  try {
    const xs = JSON.parse(v) as unknown
    if (!Array.isArray(xs)) return []
    return xs
      .map((x) => {
        if (!x || typeof x !== "object") return
        const o = x as Record<string, unknown>
        if (typeof o.name !== "string") return
        if (typeof o.cmd !== "string") return
        const args = Array.isArray(o.args) ? o.args.filter((a) => typeof a === "string") : []
        const env = o.env && typeof o.env === "object" ? (o.env as Record<string, unknown>) : undefined
        return {
          name: o.name,
          cmd: o.cmd,
          args,
          env: env
            ? Object.fromEntries(
                Object.entries(env).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
              )
            : undefined,
        }
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
  } catch {
    return []
  }
}

export function cfg(): Cfg {
  const root = path.join(home(), ".opencode-learning")
  const db = dir(Bun.env.AGENT_DB, path.join(root, "agent.db"))
  const tdir = dir(Bun.env.AGENT_TRACE_DIR, path.join(root, "trace"))

  const provider = Bun.env.LLM_PROVIDER === "openai" ? "openai" : "mock"
  const model = Bun.env.LLM_MODEL || "gpt-4.1-mini"
  const baseUrl = Bun.env.OPENAI_BASE_URL || "https://api.openai.com/v1"

  return {
    llm: { provider, model, key: Bun.env.OPENAI_API_KEY, baseUrl },
    db: { path: db },
    trace: { dir: tdir, on: bool(Bun.env.AGENT_TRACE, true) },
    mem: {
      topK: num(Bun.env.AGENT_MEM_TOPK, 6),
      maxMsgs: num(Bun.env.AGENT_MEM_MAXMSGS, 24),
      summarizeAt: num(Bun.env.AGENT_MEM_SUMMARY_AT, 40),
    },
    tool: {
      allowWrite: bool(Bun.env.ALLOW_WRITE_TOOLS, false),
      allowNet: bool(Bun.env.ALLOW_NETWORK_TOOLS, false),
      timeoutMs: num(Bun.env.AGENT_TOOL_TIMEOUT, 15_000),
      maxOut: num(Bun.env.AGENT_TOOL_MAXOUT, 32 * 1024),
    },
    mcp: { servers: servers(Bun.env.MCP_SERVERS) },
    limits: {
      maxSteps: num(Bun.env.AGENT_MAX_STEPS, 12),
      maxCalls: num(Bun.env.AGENT_MAX_CALLS, 8),
      timeoutMs: num(Bun.env.AGENT_TIMEOUT, 60_000),
    },
  }
}

