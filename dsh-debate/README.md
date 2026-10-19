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

## 开发

```sh
node --check index.js
node --test test/
```

## 状态

- [x] 插件骨架
- [ ] 裁定契约与校验
- [ ] 辩论引擎
- [ ] 工具与命令
- [ ] 报告与索引
- [ ] 实时面板
