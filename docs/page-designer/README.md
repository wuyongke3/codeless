# 页面设计器文档入口与交付规则

> **文档版本：** v1.1.6-beta.1
> **最后更新：** 2026-08-24
> **状态：** active
> **适用项目：** Codeless（Electron 42 + Vue 3 + TypeScript + Vite + SQLite）

本文件是页面设计器相关文档的入口；实施进度以 [`WORK_STATUS.md`](./WORK_STATUS.md) 为唯一事实来源。

## 1. 文档地图

| 文档 | 用途 |
|---|---|
| [`COMPETITIVE_RESEARCH.md`](./COMPETITIVE_RESEARCH.md) | Pixso/Figma 官方资料、能力对比和工作流分析 |
| [`CURRENT_STATE_GAP_ANALYSIS.md`](./CURRENT_STATE_GAP_ANALYSIS.md) | 2026-08-22 历史代码审计快照、原始差距与风险；不作为当前完成状态依据 |
| [`ITERATION_PLAN.md`](./ITERATION_PLAN.md) | 工作包、依赖、交付物和验收标准 |
| [`WORK_STATUS.md`](./WORK_STATUS.md) | 中央状态表；`finished` 必须附实施细节和验证结果 |
| [`../COMPARATIVE_ANALYSIS_PIXSO_FIGMA.md`](../COMPARATIVE_ANALYSIS_PIXSO_FIGMA.md) | 历史综合架构与产品分析 |

## 2. 不可变产品约束

| 约束 | 执行规则 |
|---|---|
| Electron 桌面架构 | 保持主进程、渲染进程、preload、UtilityProcess/Worker 的边界；不改为云端 Web 应用。 |
| 完全本地优先 | 项目、页面、数据库、快照、评论、插件和导出文件默认保存在本机；断网时核心编辑、运行、保存、恢复和导出仍可用。 |
| 核心能力永久免费 | 不引入订阅、席位限制、导出次数限制、付费插件门槛或隐藏遥测。 |
| 数据主权 | 不默认上传设计文件、日志、字体、图片、评论或 AI 输入；局域网会话必须显式开启、临时且可审计。 |
| 开放兼容 | 优先使用 `codeless-design` 等开放格式和官方插件桥接；不逆向 Figma/Pixso 私有文件格式。 |
| 可运行原型 | 页面设计必须闭环支持 SQLite 数据绑定、运行时预览、Inspect/codegen 和审阅交付。 |

## 3. 并行规则

- 无共享文件写入冲突、无未决接口依赖的工作包可以并行。
- 涉及同一数据协议、文件格式或选择模型的工作，必须先完成并确认接口契约，再并行实现。
- 每个工作包由明确 owner 负责，并将实施细节、变更文件和验证结果写入 `WORK_STATUS.md`。

## 4. 状态定义

中央状态字段只使用以下英文值：

| 状态 | 含义 |
|---|---|
| `planned` | 已排期但尚未开始 |
| `in_progress` | 已开始，有明确 owner 和当前输出 |
| `blocked` | 存在已记录且尚未解决的阻塞 |
| `finished` | 已完成，并具备实施细节、变更文件、验证结果和已知限制 |

## 5. `finished` 完成定义

只有同时满足以下条件，才允许将工作项标记为 `finished`：

1. 目标和范围已实现，未将未完成子项伪装成完成。
2. 已记录实际实施细节和变更文件。
3. 已记录可复现的验证命令、通过数量或明确结果。
4. 已记录已知限制、降级路径和后续风险。
5. `WORK_STATUS.md` 的状态表和详情区均已更新。
6. 若影响公共协议、文件格式或快捷键，已补充迁移与兼容说明。

## 6. 最短更新流程

```text
planned
  -> 认领 owner，写入 scope
  -> in_progress
  -> 实现 + 文档 + 测试
  -> 执行 typecheck/build/e2e/diff check
  -> 测试后清理临时文件、中间产物和生成内容
  -> 写入 implementation details + verification results
  -> finished
```

测试环境必须在每次测试阶段结束后完成 teardown/cleanup，不保留临时测试产物。工作项不得只在聊天中宣布完成。

## 6.1 Current pre-release usability and desktop-shell integration (2026-08-24)

The current code baseline includes the following integration and defect-hardening changes; they are not additional roadmap packages: system-level `AppTopbar` rendering was removed from the Home and Workspace shells while the design-local `BuilderHeader` remains; Electron default menu chrome is replaced by a custom `AppWindowTitlebar` with drag handling and minimize/maximize-or-restore/close controls; responsive density tokens and layout rules were added so typography and structural controls scale with the viewport; page creation creates and activates an independent blank layout; page name, canvas dimensions, editor-only X/Y position, background, and route properties update the active page; Space + primary-pointer drag over a widget reserves the gesture for canvas panning; and the autosave queue coalesces edits without dropping the newest immutable snapshot.

The implementation and documentation describe a pre-release demonstrable core workflow, **not** a claim of complete Figma/Pixso parity or a packaging/release artifact. The 2026-08-24 verification run passed typecheck, build, Electron IPC/titlebar behavior, responsive-viewport regressions, page-designer fixtures/benchmarks, cleanup checks, and diff checks.
## 7. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.1.6-beta.1 | 2026-08-24 | Completed `PD-COL-01` local review delivery (auditable local snapshots/comments, anchors, bounded screenshots, Diff filters, activity history, and offline JSON review-package import/export). Documentation is also synchronized with the current integration baseline: custom Electron titlebar/window controls, removal of default application chrome, responsive density/layout rules, and the previously implemented Header/page/autosave/panning remediation are recorded as non-roadmap integration work. Counts remain 25 finished / 13 planned / 0 in_progress / 0 blocked, and P0 `PD-COL-04` remains the next global work package. The current round's verification commands passed; see `WORK_STATUS.md` for the command-level record. |
| v1.1.5 | 2026-08-23 | Completed PD-CMP-01: project-local master components/instances, override/conflict preservation, publishing, refresh/reset/detach, and explicit legacy-variants migration. Builder Inspector, context menu, and canvas status are wired; the component fixture and 20 existing Electron E2E cases passed. |
| v1.1.4 | 2026-08-23 | 完成 PD-CAN-02：Builder 接入 8px 网格、6px 智能吸附、拖拽参考线、多选对齐/等间距和 Alt 绕过吸附；正式 20 项 Electron E2E、guides fixture、静态门禁、历史回归和性能 benchmark 全部通过。 |
| v1.1.3 | 2026-08-23 | 完成 PD-CAN-01 viewport 接入：Builder 支持统一缩放、Fit Page/Selection、Space/中键平移，并新增 viewport 集成回归；后续网格、参考线和智能吸附继续按计划推进。 |
| v1.1.2 | 2026-08-23 | 移除已失效的历史 tracker 链接，并明确清理脚本会移除空的 `.tmp` 父目录；继续保持文档只包含必要规则。 |
| v1.1.1 | 2026-08-23 | 补充 `PD-QA-01` 性能基准与自动清理门禁入口；继续保持文档只包含必要规则，不记录固定工作日或开发周期。 |
