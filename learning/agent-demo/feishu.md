# 简易 Agent CLI（learning/agent-demo）设计与测试说明

本文用于在飞书中同步：该简易 Agent CLI 的代码设计、模块划分、以及可复现的测试实践（包含验收点与记录模板）。

代码入口：运行 [simple-agent.ts](file:///Users/bytedance/Desktop/opencode/learning/simple-agent.ts)，实际 CLI 在 [cli.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/cli.ts)。

## 1. 背景与目标

目标是对齐 [agent-cli-blueprint.md](file:///Users/bytedance/Desktop/opencode/learning/spec/agent-cli-blueprint.md) 的最小“可开工”实现：

- 单进程 CLI：`run`（单轮）与 `chat`（多轮）
- Agent loop：LLM 决策 → 工具调用（多次）→ 观察结果 → 继续/结束
- 记忆：SQLite 持久化 + FTS5 检索（RAG-lite）+ 会话摘要（规则摘要）
- 技能：本地 skills（TypeScript 函数），作为本地 tools 的来源
- MCP：stdio transport 的最小 JSON-RPC（`tools/list` / `tools/call`）
- 可观测：每 turn 输出 trace（JSONL）
- 安全门控：write/network tools 需要显式允许

## 2. 目录与模块总览

- CLI
  - [cli.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/cli.ts)：命令路由、组装依赖、run/chat/mem/msg
  - [simple-agent.ts](file:///Users/bytedance/Desktop/opencode/learning/simple-agent.ts)：顶层入口
- Agent
  - [state.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/agent/state.ts)：Msg/ToolCall/LlmOut
  - [loop.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/agent/loop.ts)：核心 runTurn
  - [prompt.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/agent/prompt.ts)：system/memory/summary/recent 的 prompt 组织
  - [limits.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/agent/limits.ts)：重复 tool+input 保护
- LLM
  - [llm/index.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/llm/index.ts)：mkLlm（mock/openai）
  - [llm/mock.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/llm/mock.ts)：用于本地闭环验证的 mock
  - [llm/openai.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/llm/openai.ts)：OpenAI ChatCompletions + tools
- Memory（SQLite+FTS）
  - [memory/schema.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/memory/schema.ts)：sessions/messages/memory + FTS5 + triggers
  - [memory/store.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/memory/store.ts)：append/list/retrieve/summary/buildContext/maybeSummarize
  - [memory/retrieve.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/memory/retrieve.ts)：FTS 查询封装
  - [memory/policy.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/memory/policy.ts)：afterTool（remember → MemItem）
  - [memory/types.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/memory/types.ts)
- Skill（本地技能）
  - [skill/types.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/skill/types.ts)：Skill 结构
  - [skill/index.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/skill/index.ts)：skills() 内置 echo/time/remember
- Tool（registry/policy/runner + MCP 映射）
  - [tool/types.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/tool/types.ts)：ToolDef/ToolRes/Safety
  - [tool/local.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/tool/local.ts)：locals(skills) → local tools
  - [tool/policy.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/tool/policy.ts)：allowWrite/allowNet 门控
  - [tool/runner.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/tool/runner.ts)：timeout/maxOut/错误规范化
  - [tool/registry.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/tool/registry.ts)：聚合 local+mcp（定期 refresh）
  - [tool/mcp.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/tool/mcp.ts)：`mcp.${server}.${tool}` 命名
- MCP（stdio + JSON-RPC）
  - [mcp/transport/stdio.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/mcp/transport/stdio.ts)：spawn + 按行解析 JSON
  - [mcp/client.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/mcp/client.ts)：`tools/list` / `tools/call`
  - [mcp/types.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/mcp/types.ts)
- Trace（JSONL）
  - [trace/bus.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/trace/bus.ts)：mkTrace + emit
  - [trace/sink-jsonl.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/trace/sink-jsonl.ts)：落盘
  - [trace/types.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/trace/types.ts)
- Config
  - [config.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/config.ts)：cfg() 读取 env 形成 Cfg

## 3. 核心设计：一次 turn 的数据流

实现位置：[runTurn](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/agent/loop.ts)。

1) 写入用户消息到 messages（SQLite）
2) 从 memory_fts 检索 topK 命中（长期记忆 hits）
3) 拉取工具列表（local skills + mcp tools），构建 prompt：
   - system（规则 + 工具）
   - memory block（hits 压缩成 bullet）
   - session summary（规则摘要）
   - recent messages（最后 N 条 user/assistant/tool）
4) 调用 LLM 得到：
   - final：写入 assistant 消息，maybeSummarize，turn_end
   - tool：逐个执行 tool call
5) 执行 tool call：
   - tool policy 门控（read_only 默认允许；write/network 需 env 允许）
   - runner 超时（默认 15s）、输出截断（默认 32KB）、错误规范化为 ToolRes
   - tool res 写回 messages（role=tool）
   - memory policy：remember 成功时写入 memory（SQLite + 自动同步到 FTS）
6) 触发 trace JSONL：记录 turn_start/retrieve/llm_request/llm_response/tool_call/tool_result/memory_write/turn_end

## 4. 安全与资源限制

- write tools：需要 `ALLOW_WRITE_TOOLS=true`
- network tools：需要 `ALLOW_NETWORK_TOOLS=true`
- tool timeout：`AGENT_TOOL_TIMEOUT`（默认 15000ms）
- tool output max：`AGENT_TOOL_MAXOUT`（默认 32768 字符）

对应实现：[tool/policy.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/tool/policy.ts) 与 [tool/runner.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/tool/runner.ts)。

## 5. 配置说明（环境变量）

cfg() 默认会把数据落到 `~/.opencode-learning` 下（可覆盖）：

- DB
  - `AGENT_DB`：SQLite 文件路径（默认 `~/.opencode-learning/agent.db`）
- Trace
  - `AGENT_TRACE`：是否开启（默认 true）
  - `AGENT_TRACE_DIR`：trace 目录（默认 `~/.opencode-learning/trace`）
- Memory
  - `AGENT_MEM_TOPK`：检索条数（默认 6）
  - `AGENT_MEM_MAXMSGS`：prompt recent 消息数量（默认 24）
  - `AGENT_MEM_SUMMARY_AT`：每累计多少 messages 刷新一次 summary（默认 40）
- Limits
  - `AGENT_MAX_STEPS`（默认 12）
  - `AGENT_MAX_CALLS`（默认 8）
  - `AGENT_TIMEOUT`（默认 60000ms）
- MCP
  - `MCP_SERVERS`：JSON 数组，形如：
    - `[{"name":"my","cmd":"node","args":["/abs/path/to/server.js"]}]`
- LLM
  - `LLM_PROVIDER=mock|openai`（默认 mock）
  - `LLM_MODEL`（默认 gpt-4.1-mini）
  - `OPENAI_API_KEY`
  - `OPENAI_BASE_URL`（默认 https://api.openai.com/v1）

对应实现：[config.ts](file:///Users/bytedance/Desktop/opencode/learning/agent-demo/src/config.ts)。

## 6. 测试实践（可复现）

### 6.0 先决条件

- 安装 Bun（本仓库的 packageManager 为 bun）
- 确认 `bun` 在 PATH 中可用：`bun -v`

### 6.1 冒烟测试：run（mock LLM）

1) 查询时间（会触发 time tool）

```bash
bun run learning/simple-agent.ts run "帮我查询一下当前时间" --session demo
```

验收点：
- 输出包含“工具结果”或时间戳
- messages 表新增 user/tool/assistant
- trace 目录新增一个 `*.jsonl`，包含 turn_start/llm_request/tool_call/tool_result/turn_end

2) 记忆写入（remember 是 write tool，默认会被拦截）

```bash
bun run learning/simple-agent.ts run "帮我记住 我喜欢把变量命名短一点" --session demo
```

验收点：
- 输出提示 blocked: write（因为未打开写权限）

打开写权限后再测：

```bash
ALLOW_WRITE_TOOLS=true bun run learning/simple-agent.ts run "帮我记住 我喜欢把变量命名短一点" --session demo
```

验收点：
- 输出包含“已记录：...”
- `mem ls` 能看到一条 fact/preference（默认 fact）

```bash
bun run learning/simple-agent.ts mem ls --session demo --limit 20
```

3) 检索验证：用相近 query 应命中记忆（RAG-lite）

```bash
bun run learning/simple-agent.ts run "我之前对变量命名有什么偏好？" --session demo
```

验收点：
- trace JSONL 中 retrieve.hits > 0
- 模型回答能提到已写入的记忆（mock LLM 逻辑较简单，更建议用 openai 进行此项验证）

### 6.2 冒烟测试：chat（多轮）

```bash
bun run learning/simple-agent.ts chat --session demo
```

输入两轮，例如：
- `帮我查询一下当前时间`
- `exit`

验收点：
- 每一轮各生成一次 turn trace（同一个 trace id 会持续追加）
- `msg ls` 能看到多轮消息

### 6.3 Trace 检查

默认目录：`~/.opencode-learning/trace/`

trace 文件为 JSONL，每行一个事件，关键字段：
- `turn_start`: session/text
- `llm_request`: tools 数量、msg 数量
- `tool_call` / `tool_result`
- `memory_write`
- `turn_end`

### 6.4 MCP（可选）

设置 MCP_SERVERS，示例（你需要替换 cmd/args 为你自己的 MCP server）：

```bash
export MCP_SERVERS='[{"name":"my","cmd":"node","args":["/abs/mcp-server.js"]}]'
bun run learning/simple-agent.ts run "用 mcp 做点什么" --session demo
```

验收点：
- `tools.list` 能看到 `mcp.my.*` 工具名
- trace 能看到 mcp tool 的 tool_call/tool_result

### 6.5 OpenAI（可选）

```bash
export LLM_PROVIDER=openai
export OPENAI_API_KEY=***
bun run learning/simple-agent.ts run "根据我的长期记忆，总结我的偏好" --session demo
```

验收点：
- 能根据 memory block 给出更合理的总结（比 mock 更接近真实使用）

## 7. 测试结果记录模板（建议复制到飞书）

- 运行环境：
  - OS：
  - bun 版本：
  - `AGENT_DB`：
  - `AGENT_TRACE_DIR`：
- 用例 1：run 时间查询
  - 命令：
  - 输出（粘贴）：
  - trace 文件名：
  - 结论：通过/失败（原因）
- 用例 2：remember 门控（未开写）
  - 命令：
  - 输出：
  - 结论：
- 用例 3：remember 写入（开启写）
  - 命令：
  - `mem ls` 输出：
  - 结论：
- 用例 4：chat 多轮
  - 命令：
  - `msg ls` 输出：
  - 结论：
- 用例 5（可选）：MCP
  - MCP_SERVERS：
  - 命令/输出：
  - 结论：
- 用例 6（可选）：OpenAI
  - 命令/输出：
  - 结论：
