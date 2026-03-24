import type { Cfg } from "../../config"
import { text } from "../../util/json"

export type Transport = {
  req(method: string, params: unknown, cfg: Cfg): Promise<unknown>
  close(): Promise<void>
}

export function mkStdio(cmd: string, args: string[], env: Record<string, string> | undefined): Transport {
  const child = Bun.spawn({
    cmd: [cmd, ...args],
    env: { ...Bun.env, ...(env || {}) },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })

  let id = 0
  const wait = new Map<number, { ok: (v: unknown) => void; err: (e: unknown) => void }>()
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  let buf = ""

  void (async () => {
    const r = child.stdout.getReader()
    while (true) {
      const res = await r.read()
      if (res.done) break
      buf += dec.decode(res.value)
      while (true) {
        const i = buf.indexOf("\n")
        if (i < 0) break
        const line = buf.slice(0, i).trim()
        buf = buf.slice(i + 1)
        if (!line) continue
        let msg: unknown
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }
        if (!msg || typeof msg !== "object") continue
        const m = msg as Record<string, unknown>
        if (typeof m.id !== "number") continue
        const w = wait.get(m.id)
        if (!w) continue
        wait.delete(m.id)
        if ("error" in m) w.err(m.error)
        else w.ok(m.result)
      }
    }
    for (const w of wait.values()) w.err(new Error("mcp closed"))
    wait.clear()
  })()

  async function send(v: unknown) {
    const w = child.stdin.getWriter()
    await w.write(enc.encode(`${text(v)}\n`))
    w.releaseLock()
  }

  return {
    async req(method, params, cfg) {
      id++
      const cur = id
      const p = new Promise<unknown>((ok, err) => {
        wait.set(cur, { ok, err })
      })
      await send({ jsonrpc: "2.0", id: cur, method, params })
      return await Promise.race([
        p,
        new Promise<unknown>((_, rej) => setTimeout(() => rej(new Error("timeout")), cfg.tool.timeoutMs)),
      ])
    },
    async close() {
      child.kill()
    },
  }
}
