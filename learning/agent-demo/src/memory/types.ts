export type MemType = "fact" | "preference" | "summary" | "artifact" | "decision"

export type MemItem = {
  id: string
  session_id?: string | null
  type: MemType
  text: string
  tags: string[]
  created_at: number
}

