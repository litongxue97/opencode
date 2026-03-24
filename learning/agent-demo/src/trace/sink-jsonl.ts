import path from "node:path"
import { text } from "../util/json"

export function mkSink(dir: string, id: string) {
  const file = path.join(dir, `${id}.jsonl`)
  return {
    file,
    async write(v: unknown) {
      await Bun.write(file, `${text(v)}\n`, { createPath: true, append: true })
    },
  }
}

