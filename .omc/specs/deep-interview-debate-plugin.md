# 辩论台（dsh-debate）— 访谈规格

## Metadata

- 阈值 / 来源：0.20 / 默认值（无 `.omc/omc.jsonc` 覆盖）
- 最终歧义度：0.115
- 访谈轮次：8
- 组件：5 个全部确认，0 个延后
- 状态：待用户审阅（批准后才进入实现）

## Goal

**使命**：在会话里用一句话发起一场「3 辩手 + 1 裁判」的结构化辩论，两轮交叉质询后产出可校验的裁定——做 / 有条件做 / 不做——附带可追溯到人、轮次和依据的不足清单，并在 Web UI 面板实时观看、事后回看。

**评估方式**：见「验收标准」。五条必过项分别对应一个已确认的失败模式，缺一条即视为不达标。

## Users and situations

1. 方案动工前，判断一个想法值不值得做（只给想法文本）。
2. 拿一份已有方案 / PRD 做对抗式评审（给文档路径）。
3. 对当前仓库里一个待做功能做可行性判断（给代码路径，辩手现场核查）。
4. 事后回看历史辩论，确认当时的结论和依据。

## Topology

| 组件 | 范围 |
|---|---|
| 辩论入口 | 模型可调用的 `debate` 工具 + 人类可用的 `/debate` 命令 |
| 辩论引擎 | 3 辩手 + 裁判，2 轮交叉质询，120s 硬上限，结构化输出 |
| 裁定与报告 | 强校验 JSON 裁定、markdown 报告落盘、全局索引 |
| 实时面板 | `shell.overlay` 浮层 + 侧栏图标，实时观战 + 历史回看 |
| 可配置 | 角色、轮数、模型、时限、语言、上下文模式 |

延后项：无。

## Requirements (functional)

### F1 入口

- **工具 `debate`**（模型可见）
  - `idea`：string，必填，1–4000 字符，待辩论的想法。
  - `context`：string[]，可选，文件或目录路径；存在时辩手获得只读工具。
  - 返回：裁定摘要 + 报告路径 + 辩论 id + 是否 `incomplete`。
  - 工具卡展示：辩题标题、结论徽章、耗时。
- **命令 `/debate`**
  - 语法：`/debate <想法>`；`input.hint` 提示可带路径。
  - 走同一引擎，返回一段可读摘要。
- 同一 Session 同时只允许一场辩论；重复调用返回错误并带上进行中的辩论 id。

### F2 辩论引擎

**角色**（默认，可在配置中增删改）：

| id | 视角 | 默认提示要点 |
|---|---|---|
| `advocate` | 支持者 | 论证价值与成立条件，必须给出可执行的最小路径 |
| `skeptic` | 价值质疑者 | 攻击需求真实性、替代方案、用户是否真的需要 |
| `engineer` | 工程可行性 | 攻击实现成本、依赖、运维、失败模式 |
| `judge` | 裁判 | 只读全程记录，不参与辩论，给出裁定 |

**流程**：

1. **第 1 轮（并行）**：每名辩手独立陈词，互不可见。输出结构：
   `{ stance: 'support'|'oppose'|'mixed', summary, claims: [{id, text, evidence?}], concerns: [{claim, why}], confidence: 0..1 }`
   - 硬性要求：`claims` 至少 2 条；`concerns` 至少 1 条；不得只复述想法。
2. **第 2 轮（并行）**：每名辩手拿到全部第 1 轮发言，必须点名反驳。输出结构：
   `{ rebuttals: [{ targetSpeaker, targetClaimId, counter }], revisedStance, remainingConcerns, changedMind: boolean }`
   - 硬性要求：`rebuttals` 至少 1 条，`targetClaimId` 必须存在于第 1 轮。
3. **裁判**：只读想法 + 两轮记录，输出裁定（见 F3）。
4. **收敛与失败**：
   - 100s 时停止发起新的辩手轮次，用已有发言强制进入裁判阶段。
   - 120s 硬上限：中止未完成调用，报告标注 `incomplete` + 原因，不补写、不编造。
   - 单个辩手失败：其余照常进行，报告标注缺席视角；裁判需把「视角缺失」写进分歧或风险。

**结构化输出**：全部走 `outputSchema`（ObjectJsonSchema），引擎再做语义校验与一次重试。

### F3 裁定与报告

**裁定 JSON（强校验）**：

```
{
  decision: 'go' | 'conditional' | 'no-go',
  summary: string,
  conditions: string[],              // decision=conditional 时至少 1 条
  scores: { demand, feasibility, cost, risk },  // 各 1..5
  shortcomings: [{ claim, evidence, severity: 'fatal'|'major'|'minor', verify }],
  disagreements: [{ topic, positions: string[] }],
  nextStep: string,
  confidence: 0..1
}
```

**校验规则**（任一不过即重试一次，把错误原样回喂）：

- `decision` 必须是三个枚举之一；`conditional` 必须有可执行条件。
- `shortcomings` 至少 2 条；`evidence` 非空，且必须是「引用某位辩手的原话」或「指向某个文件/路径/事实」二者之一。
- `scores` 四项齐全且落在 1–5。
- 第 2 轮 `rebuttals` 至少 1 条且目标 claim 存在。
- 重试后仍不合格：标记 `incomplete`，保留裁判原文，报告写明「裁定不完整」，**不伪造结构化结果**。

**报告**：写入 `<会话 cwd>/.debate/<yyyyMMdd-HHmmss>-<slug>.md`，包含：

1. 头部元数据（id、时间、辩题、参与者与模型、耗时、是否 incomplete）
2. 结论与条件
3. 四维评分表
4. 不足清单（按严重度排序，每条带证据）
5. 未解决分歧
6. 下一步最小验证动作
7. 附录：第 1 轮陈词、第 2 轮反驳、裁判原始输出

**全局索引**：插件私有数据目录下 `debates.jsonl`，每行
`{ id, sessionId, cwd, title, decision, createdAt, reportPath, incomplete }`，供面板跨项目列历史。

### F4 实时面板

- **落点**：`shell.overlay` 渲染浮层；`sidebar.panellist` 提供「辩论台」图标用于展开/收起（两者 `replaceRisk: none`）。
- **实时**：辩论进行中每 800ms 轮询一次；结束后停止轮询。不引入 SSE/WebSocket。
- **Host 只读路由**：
  - `GET /plugins/debate/api/state?sessionId=...` → 当前会话进行中的辩论快照 + 历史列表。
  - `GET /plugins/debate/api/state?id=...` → 单场完整记录。
- **界面**：
  - 顶部：辩题、阶段（第 1 轮 / 第 2 轮 / 裁定中 / 完成）、计时、中止按钮。
  - 中部：3 张辩手卡（角色、状态、本轮输出摘要），裁判卡（结论徽章、四维评分、不足清单）。
  - 底部：历史列表，点击载入完整报告摘要。
  - 空状态：说明如何发起（`/debate 想法` 或让模型调用工具）。
- 面板只读：不提供发起、编辑、删除。

### F5 配置

```yaml
debate:
  roles: [...]        # 角色数组；默认三名辩手
  judgePrompt: ...    # 裁判提示
  rounds: 2           # 1..3
  timeLimitMs: 120000
  softStopMs: 100000
  maxDebaters: 3
  language: zh        # zh | en
  contextMode: auto   # auto | on | off
  outputDir: .debate
  panel:
    enabled: true
    autoOpen: true
```

- 每个角色支持 `provider` / `model` 覆盖（走 `AgentOptions`），缺省继承会话默认模型。
- 所有默认值即上表；配置只做覆盖，不做必要项。

### F6 安装与展示

- 一个 bundle 包 `dsh-debate`：Host 半 + Client 半 + `cordis.patch.yml` + `locale/zh.json`、`locale/en.json` + `icon.svg`。
- 标题「辩论台」，描述说明「多 agent 对抗式评审」。
- 通过 `plugin_manager install_bundle` 以工作区绝对路径安装；不手写 profile 文件。

## Constraints and non-goals

**约束**

- 辩手只读：允许 `read` / `grep` / `glob`，禁止写入、删除、执行命令。
- 单场 ≤120s、≤7 次模型调用、同时 ≤3 个辩手。
- 报告只写会话 cwd 的 `.debate/`；不得写 profile 目录或用户主目录以外的位置。
- 不新增网络依赖、不联网检索。
- 任何缺失数据必须显式标注；禁止静默补齐。
- 默认中文输出，`language: en` 时全英文。

**非目标**

- 不做辩论历史编辑 / 删除 / 分享。
- 不做多场并行、跨会话团队协作。
- 不自动执行裁定中的建议动作。
- 不做语音、图片输入。

## Acceptance criteria

| # | 标准 | 检验方式 |
|---|---|---|
| A1 | 一句话想法 → 120s 内出结论，聊天里可见摘要 | 计时跑一次完整辩论 |
| A2 | `decision` ∈ {go, conditional, no-go}；conditional 必有可执行条件 | 检查裁定 JSON 与报告 |
| A3 | ≥2 条不足，每条能追溯到「谁、第几轮、依据是什么」 | 报告不足清单与附录对照 |
| A4 | 第 2 轮至少 1 条点名反驳，`targetClaimId` 能在第 1 轮找到 | 检查第 2 轮结构化输出 |
| A5 | `.debate/` 有报告，面板能列出历史并打开回看 | 文件检查 + 面板操作 |
| A6 | 超时/失败时如实标注 `incomplete`，不产出假完整结论 | 人为压到 30s 时限跑一次 |
| A7 | 裁定校验失败重试一次；仍失败则保留原文并标注 | 注入一个不合规裁定做单测 |

## Assumptions and accepted risks

- 运行时存在可用的 in-process subagent provider；`maxDepth` 默认 1 允许直接子级，`maxActiveSubagents` 默认 8 ≥ 3。
- 会话 cwd 在 workspace-write 下可写 `.debate/`。
- 浏览器与 Host 同源，轮询路由无需额外鉴权。
- 面板 `shell.overlay` / `sidebar.panellist` 的注册参数按当前 Slot 契约可用。
- 风险：三个子 agent 并行会带来延迟波动；120s 可能不够带工具的重度核查。缓解：超时降级为部分裁定并标注，不重试。
- 风险：模型可能仍输出和稀泥；用第 2 轮点名反驳 + 裁判分歧清单双重约束。

## Open questions

1. 运行时实际 provider 名称（`ctx.subagents.list()` 选择），需在实现时确认。
2. `delivery: 'caller'` 是否会把子 agent 结果注入主会话；若会，改用不注入的方式并清理。
3. 全局索引写在 storage 服务的域内，还是 `DSH_HOME` 下的数据目录，实现时定。

## Decision log

| 轮次 | 问题 | 回答 | 对歧义度的影响 |
|---|---|---|---|
| 0 | 顶层组件 | 5 个全部保留 | 范围锁定 |
| 1 | 辩论协议 | 交叉质询：独立陈词 → 互看反驳 → 裁判终裁 | 目标 ↓ |
| 2 | 辩手能力 | 混合：按输入是否带路径切换只读工具 | 约束 ↓ |
| 3 | 面板职责 | 实时观战 + 历史回看，不做发起入口 | 目标 ↓ |
| 4 | 失败模式 | 和稀泥 / 没结论 / 套话 / 太重 / 面板装饰，全部不可接受 | 成功标准 ↓ |
| 5 | 默认规模 | 3 辩手 + 裁判，120s | 约束 ↓ |
| 6 | 裁定契约 | 强校验 JSON，失败重试一次，不编造成功 | 目标 ↓ |
| 7 | 存储位置 | 项目内正文 + 全局索引 | 约束 ↓ |
| 8 | 验收清单 | 5 条全为必过项 | 成功标准 ↓ |
| 8+ | 设计细节 | 7 条建议全部经用户确认 | 0.115 |

## 实现顺序（待批准后执行）

1. 骨架：bundle 包、manifest、locale、icon，`install_bundle` 跑通空插件。
2. Host 引擎：角色提示、`outputSchema`、两轮编排、超时与取消、JSON 校验与重试。
3. 存储：报告生成、索引写入。
4. 工具 + 命令：参数解析、会话 cwd、返回摘要。
5. Client 面板：`shell.overlay` + `sidebar.panellist`、轮询、三种状态（进行中/完成/空）。
6. 验证：按 A1–A7 逐条跑，记录证据；修缺陷。
