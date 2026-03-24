import { cfg } from "./config"
import { runTurn } from "./agent/loop"
import { mkLlm } from "./llm"
import { mkMem } from "./memory/store"
import { locals } from "./tool/local"
import { skills } from "./skill"
import { mkMcpHub } from "./tool/mcp"
import { mkTools } from "./tool/registry"
import { mkTrace } from "./trace/bus"

function dir(p: string) {
  const i = p.lastIndexOf("/")
  if (i < 0) return "."
  if (i === 0) return "/"
  return p.slice(0, i)
}

function val(args: string[], k: string) {
  const i = args.indexOf(k)
  if (i < 0) return
  return args[i + 1]
}

function num(v: string | undefined, d: number) {
  if (!v) return d
  const n = Number(v)
  if (Number.isNaN(n)) return d
  return n
}

async function write(s: string) {
  await Bun.write(Bun.stdout, s)
}

async function* lines(rs: ReadableStream<Uint8Array>) {
  const dec = new TextDecoder()
  let buf = ""
  const r = rs.getReader()
  while (true) {
    const res = await r.read()
    if (res.done) break
    buf += dec.decode(res.value)
    while (true) {
      const i = buf.indexOf("\n")
      if (i < 0) break
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      yield line
    }
  }
  if (buf) yield buf
}

async function run(text: string, session: string) {
  const cfg0 = cfg()
  await Bun.mkdir(dir(cfg0.db.path), { recursive: true })
  await Bun.mkdir(cfg0.trace.dir, { recursive: true })
  const trace = mkTrace(cfg0)
  const mem = mkMem(cfg0)
  const mcp = mkMcpHub(cfg0)
  const tools = mkTools(locals(skills()), mcp)
  const llm = mkLlm(cfg0)

  try {
    const res = await runTurn(cfg0, { llm, mem, tools, trace }, session, text)
    return res
  } finally {
    await trace.close()
    await mcp.close()
    mem.close()
  }
}

async function chat(session: string) {
  const cfg0 = cfg()
  await Bun.mkdir(dir(cfg0.db.path), { recursive: true })
  await Bun.mkdir(cfg0.trace.dir, { recursive: true })
  const trace = mkTrace(cfg0)
  const mem = mkMem(cfg0)
  const mcp = mkMcpHub(cfg0)
  const tools = mkTools(locals(skills()), mcp)
  const llm = mkLlm(cfg0)

  try {
    await write("> ")
    for await (const line of lines(Bun.stdin.stream())) {
      const text = line.trim()
      if (!text) {
        await write("> ")
        continue
      }
      if (text === "exit" || text === "quit") break
      const res = await runTurn(cfg0, { llm, mem, tools, trace }, session, text)
      await write(`${res.text}\n> `)
    }
  } finally {
    await trace.close()
    await mcp.close()
    mem.close()
  }
}

async function memls(session: string, limit: number) {
  const cfg0 = cfg()
  await Bun.mkdir(dir(cfg0.db.path), { recursive: true })
  const mem = mkMem(cfg0)
  try {
    const xs = await mem.listMem(session, limit)
    for (const x of xs) await write(`${x.created_at} [${x.type}] ${x.text}\n`)
  } finally {
    mem.close()
  }
}

async function msgls(session: string, limit: number) {
  const cfg0 = cfg()
  await Bun.mkdir(dir(cfg0.db.path), { recursive: true })
  const mem = mkMem(cfg0)
  try {
    const xs = await mem.listMsg(session, limit)
    for (const x of xs) await write(`${x.role}${x.name ? `(${x.name})` : ""}: ${x.content}\n`)
  } finally {
    mem.close()
  }
}

export async function main(argv: string[] = Bun.argv) {
  const args = argv.slice(2)
  const cmd = args[0]

  if (cmd === "run") {
    const text = args[1] || ""
    const session = val(args, "--session") || "demo"
    const res = await run(text, session)
    await write(`${res.text}\n`)
    return
  }

  if (cmd === "chat") {
    const session = val(args, "--session") || "demo"
    await chat(session)
    return
  }

  if (cmd === "mem" && args[1] === "ls") {
    const session = val(args, "--session") || "demo"
    await memls(session, num(val(args, "--limit"), 20))
    return
  }

  if (cmd === "msg" && args[1] === "ls") {
    const session = val(args, "--session") || "demo"
    await msgls(session, num(val(args, "--limit"), 50))
    return
  }

  await write(
    [
      "usage:",
      '  agent run "<text>" --session <id?>',
      "  agent chat --session <id?>",
      "  agent mem ls --session <id?> --limit 20",
      "  agent msg ls --session <id?> --limit 50",
    ].join("\n") + "\n",
  )
}

if (import.meta.main) {
  void main()
}
