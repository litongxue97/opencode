export function now() {
  return Date.now()
}

let n = 0
export function id() {
  n++
  return `${Date.now()}-${n}`
}

