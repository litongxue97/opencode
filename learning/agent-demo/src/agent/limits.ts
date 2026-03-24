import { text } from "../util/json"
import type { ToolCall } from "./state"

export function guard() {
  let prev = ""
  let n = 0
  return (call: ToolCall) => {
    const cur = `${call.name}:${text(call.input)}`
    if (cur === prev) n++
    else {
      prev = cur
      n = 1
    }
    return n >= 2
  }
}

