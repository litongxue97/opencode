type BunIO = {
  getReader(): ReadableStreamDefaultReader<Uint8Array>
  getWriter(): WritableStreamDefaultWriter<Uint8Array>
}

declare const Bun: {
  argv: string[]
  env: Record<string, string | undefined>
  stdout: unknown
  stdin: { stream(): ReadableStream<Uint8Array> }
  write(dst: unknown, data: string, opts?: { append?: boolean; createPath?: boolean }): Promise<number>
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>
  spawn(opts: {
    cmd: string[]
    env?: Record<string, string | undefined>
    stdin?: "pipe"
    stdout?: "pipe"
    stderr?: "pipe"
  }): { stdin: BunIO; stdout: ReadableStream<Uint8Array>; kill(): void }
}

interface ImportMeta {
  main?: boolean
}

