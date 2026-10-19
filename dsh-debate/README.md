# 辩论台（dsh-debate）

让多个 agent 就一个想法展开交叉质询，最后给出可校验的可行性裁定与不足清单。

## 一场辩论怎么跑

1. 三名辩手并行陈词（支持者 / 价值质疑者 / 工程可行性），互不可见。
2. 第二轮每人看到全部陈词，必须点名反驳具体论点。
3. 独立裁判只读全程记录，输出结构化裁定：做 / 有条件做 / 不做，附条件、评分、不足清单、未解决分歧与下一步。

默认 2 轮、120 秒硬上限；超时或校验失败会明确标注 `incomplete`，不会伪造完整结论。

## 入口

- 工具 `debate`：`idea` 必填，`context` 可选（文件或目录路径）。
- 命令 `/debate <想法>`。

## 配置

写在 bundle 的 `cordis.patch.yml` 里：

```yaml
- insert:
    - id: dsh-debate
      name: '@local/dsh-debate'
      config:
        rounds: 2
        timeLimitMs: 120000
        language: zh
        contextMode: auto
        outputDir: .debate
```

| 键 | 默认 | 说明 |
|---|---|---|
| `rounds` | `2` | 辩论轮数，1–3 |
| `timeLimitMs` | `120000` | 单场硬上限 |
| `softStopMs` | `100000` | 到达后不再发起新轮次，用已有发言收口 |
| `language` | `zh` | 输出语言 |
| `contextMode` | `auto` | 有路径才给辩手只读工具 |
| `outputDir` | `.debate` | 报告相对会话工作目录的位置 |

### 按角色指定模型

不写 `roles` 时用内置三名辩手。要换模型或改角色，整组覆盖：

```yaml
config:
  roles:
    - id: advocate
      label: { zh: 支持者, en: Advocate }
      brief: { zh: '把想法最有说服力的一面说清楚。', en: 'Make the strongest case.' }
      provider: deepseek-official
      model: deepseek-flash
    - id: skeptic
      label: { zh: 价值质疑者, en: Value skeptic }
      brief: { zh: '攻击需求本身。', en: 'Attack the demand.' }
  judge:
    provider: deepseek-official
    model: deepseek-flash
```

`label` / `brief` 省略时用 id 占位；`provider` / `model` 省略时继承会话默认模型。

## 边界

- 面板只读：不支持删除、编辑、导出。
- 同一会话同时只跑一场辩论。
- 辩手只读：只允许 `read` / `grep` / `glob`，写入与执行由工具守卫拒绝。
- 不联网：结论只基于想法文本、给定路径和辩手推理。

## 开发

```sh
node --check index.js
node --test
```

## 状态

- [x] 插件骨架
- [x] 裁定契约与校验
- [x] 辩论引擎
- [x] 工具与命令
- [x] 报告与索引
- [x] 实时面板

## 面板

侧栏「辩论台」图标 → 主面板：

- 进行中：每个辩手的立场、陈词摘要、第 2 轮状态，以及裁判结论。
- 历史：最近 50 场，点击后**直接渲染完整 markdown 报告**（标题、表格、列表、代码块、引用），可切到「结构化」看评分与不足卡片。
- 面板每秒轮询，只在面板打开时轮询；辩论结束后停止。

## 已验证

- 真实辩论一次：64s 完成（第 1 轮 26.3s / 第 2 轮 19.6s / 裁判 18.1s），结论「有条件做」，4 条不足均带依据，第 2 轮点名反驳。
- 超时与失败路径：不产出假结论，标记 `incomplete` 并写明原因。
- Client 激活回归测试：缺 locale 服务时降级，不抛错、不拖垮 web boot。
- 冷启动：重启应用后侧栏图标、主面板与历史列表均正常。
- 历史详情：默认渲染 markdown 报告，渲染器单测覆盖标题/表格/列表/代码块/引用。

## 已知未验证

- 辩论进行中的面板实时刷新未在真实运行中观察（历史回看已确认）。
