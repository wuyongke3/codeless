# 页面设计器协议契约（PD-ARC-01 最小可交付版）

> 状态：协议契约已定义，尚未接入现有业务。
> 代码入口：`src/types/designerProtocol.ts`
> 本文档只描述稳定边界，不改变现有 `useDesigner.ts`、`widgetConfig.ts`、`lowcode.ts` 或协作实现。

## 1. 目标与边界

PD-ARC-01 的目标是先建立一个**与当前业务对象解耦**的编辑协议，使后续画布、Inspector、Token、组件、持久化和协作线程可以围绕同一套数据交换语义演进。

协议 v1 覆盖以下最小能力：

- 结构化节点新增、删除、属性修改、重父级；
- 页面属性和样式/Token 属性修改；
- 不可递归的事务命令，用于一次用户操作的多个原子变化；
- 基于 `baseRevision` 的乐观并发检查；
- 可诊断的协议版本/迁移结果；
- 仅使用 JSON 可表示的数据，不携带函数、运行时对象、数据库连接或 UI 引用。

协议**不**负责：

- 定义 `LowCodeProject`、`LowCodeWidget` 或 `WidgetConfig` 的字段；
- 执行命令、生成 Undo/Redo 栈或持久化 revision；
- 决定组件的视觉样式、布局算法或协作传输方式；
- 自动把旧项目字段转换成新业务模型。

这些职责由后续工作项通过 adapter/command bus 接入；本次只交付可独立验证的类型和纯函数。

## 2. 稳定标识与版本

| 字段/常量 | v1 值 | 规则 |
|---|---|---|
| `DESIGNER_PROTOCOL_NAME` | `codeless.page-designer` | 传输和落盘边界的协议名称，不随业务模块重命名 |
| `DESIGNER_PROTOCOL_VERSION` | `1` | 整数版本；改变必填字段、命令语义或并发语义时递增 |
| `DESIGNER_REVISION_START` | `0` | 新文档尚未提交任何编辑时的 revision |
| `protocol` | 同上 | envelope 必填，接收方必须精确匹配 |
| `protocolVersion` | `1` | JSON number，不接受字符串 `"1"` |

版本号与项目文件版本、组件模型版本、设计交换格式版本相互独立。后续 `WidgetConfig` 或 `.codeless` 迁移不得复用本协议版本号。

## 3. JSON 与 ID 约束

### 3.1 JSON 值

`DesignerJsonValue` 只允许：

- `string`、`number`、`boolean`、`null`；
- JSON 数组；
- JSON 对象。

运行时守卫会拒绝 `NaN`、`Infinity`、`undefined`、函数、`Date`、`Map`、`Set`、循环引用等值。这样可以保证命令可安全序列化、记录、传输和重放。

### 3.2 ID

`DesignerId` 当前是非空字符串别名，协议不强制 UUID。生产接入时应保证：

- `documentId` 在一个可协作文档生命周期内稳定；
- `operationId` 对同一提交请求唯一，用于幂等去重；
- `commandId` 在 envelope 内唯一；事务父命令和事务子命令也不能重复；
- 节点、页面、样式 ID 由 adapter 负责在各自命名空间内稳定。

### 3.3 属性路径

`DesignerPropertyChange.path` 使用 JSON Pointer（RFC 6901）：

| 示例 | 含义 |
|---|---|
| `""` | 修改目标对象本身（仅在 adapter 明确支持时使用） |
| `"/layout/width"` | 修改 `layout.width` |
| `"/style/fill~1color"` | 属性名包含 `/` 时使用 `~1` 转义 |
| `"/content/title~0value"` | 属性名包含 `~` 时使用 `~0` 转义 |

`set` 命令必须提供 `next`；`remove` 命令不能提供 `next`。`previous` 可选，但编辑器发出的历史命令应尽量提供它，以支持可解释的 Undo、Diff 和冲突展示。

## 4. 结构化编辑命令

所有命令共享以下字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `kind` | `DesignerCommandKind` | 是 | 命令语义 discriminator |
| `commandId` | `DesignerId` | 是 | 单条命令唯一 ID |
| `actorId` | `DesignerId` | 是 | 发起编辑的窗口/用户/系统 actor |
| `issuedAt` | ISO-8601 UTC string | 是 | 命令产生时间，要求以 `Z` 结尾 |
| `origin` | `canvas \| inspector \| library \| import \| migration \| system` | 否 | 产生来源，用于历史面板和诊断 |
| `label` | string | 否 | 面向用户的简短操作名 |
| `metadata` | JSON object | 否 | 非语义扩展数据；不得用来替代正式字段 |

### 4.1 原子命令

| `kind` | 核心字段 | 语义 |
|---|---|---|
| `node.create` | `parentId`、`index`、`node` | 在父节点的指定位置插入完整节点快照 |
| `node.delete` | `nodeIds`、可选 `snapshots` | 删除一个或多个节点；需要本地 Undo 时附带逆向快照 |
| `node.update` | `nodeId`、`changes[]` | 修改节点属性，属性路径相对于节点数据 |
| `node.reparent` | `nodeId`、`fromParentId`/`fromIndex`、`toParentId`/`toIndex` | 移动节点的父级和顺序，不隐含属性修改 |
| `page.update` | `pageId`、`changes[]` | 修改页面设置，例如画布尺寸或背景 |
| `style.update` | `styleId`、`changes[]` | 修改样式/Token 对象；具体 Token schema 由 styles adapter 定义 |

`DesignerNodeSnapshot` 只固定 `id`、`type`、`parentId`、`data` 四个字段。`data` 是 adapter-owned JSON object，可承载布局、内容、数据绑定、组件实例信息等，协议不读取其中的业务字段。

### 4.2 事务命令

`transaction` 是一组非空原子命令：

```ts
{
  kind: 'transaction',
  commandId: 'cmd-tx-001',
  actorId: 'window-a',
  issuedAt: '2026-08-22T10:00:00.000Z',
  origin: 'inspector',
  label: '批量更新卡片尺寸',
  commands: [
    {
      kind: 'node.update',
      commandId: 'cmd-001',
      actorId: 'window-a',
      issuedAt: '2026-08-22T10:00:00.000Z',
      changes: [
        { operation: 'set', path: '/layout/width', previous: 240, next: 280 },
        { operation: 'set', path: '/layout/height', previous: 120, next: 144 }
      ],
      nodeId: 'node-card-1'
    }
  ]
}
```

v1 禁止事务嵌套。若一个用户动作跨越多个领域，使用一个事务包住多个原子命令；若需要更复杂的批处理，提交多个 envelope，并为它们分别分配 `operationId`。

## 5. Revision Envelope

`DesignerRevisionEnvelope` 是提交和广播编辑的统一包裹对象：

| 字段 | 类型 | 说明 |
|---|---|---|
| `protocol` | literal `codeless.page-designer` | 协议名 |
| `protocolVersion` | literal `1` | 当前协议版本 |
| `documentId` | `DesignerId` | 文档/页面设计会话 ID |
| `baseRevision` | 非负整数 | 发起方提交前观察到的文档头 revision |
| `revision` | 非负整数 | 本批次提议/提交的 revision，v1 必须为 `baseRevision + 1` |
| `operationId` | `DesignerId` | 本次提交批次 ID，重试时保持不变 |
| `actorId` | `DesignerId` | envelope 所属 actor，必须与所有命令一致 |
| `issuedAt` | ISO-8601 UTC string | envelope 产生时间 |
| `commands` | 非空 `DesignerEditCommand[]` | 按数组顺序执行的命令 |

示例：

```json
{
  "protocol": "codeless.page-designer",
  "protocolVersion": 1,
  "documentId": "page-home",
  "baseRevision": 41,
  "revision": 42,
  "operationId": "op-window-a-00042",
  "actorId": "window-a",
  "issuedAt": "2026-08-22T10:00:00.000Z",
  "commands": [
    {
      "kind": "node.update",
      "commandId": "cmd-window-a-00042",
      "actorId": "window-a",
      "issuedAt": "2026-08-22T10:00:00.000Z",
      "origin": "inspector",
      "nodeId": "button-submit",
      "changes": [
        { "operation": "set", "path": "/content/label", "previous": "保存", "next": "提交" }
      ]
    }
  ]
}
```

### 5.1 接收方的 compare-and-swap 规则

接收方维护 `headRevision`，处理 envelope 时必须按以下顺序：

1. 校验协议、版本、命令结构和 envelope 不变量；
2. 如果 `operationId` 已成功处理，返回同一处理结果，不重复执行；
3. 如果 `baseRevision !== headRevision`，拒绝提交并返回冲突，不执行任何命令；
4. 如果 `revision !== headRevision + 1`，拒绝提交，视为协议错误；
5. 在一个事务内按 `commands` 顺序应用全部命令；
6. 成功持久化后将 `headRevision` 设置为 `revision`，再广播/确认结果。

成功提交的核心伪代码：

```ts
if (seenOperationIds.has(envelope.operationId)) return previousResult
if (envelope.baseRevision !== headRevision) return conflict(headRevision)
if (envelope.revision !== headRevision + 1) return protocolError()
applyAll(envelope.commands) // 全部成功，或全部回滚
headRevision = envelope.revision
remember(envelope.operationId, headRevision)
return accepted(headRevision)
```

### 5.2 并发语义

v1 采用**乐观并发 + 显式冲突**，不引入 CRDT：

- 不同窗口编辑不同节点时，后提交者若基于旧 head，也会先收到冲突；是否自动重放由上层根据命令目标判断，协议本身不静默合并；
- 同一节点或同一路径冲突必须保留本地 envelope，展示 base/head/本地命令，交给上层选择重放、放弃或另存快照；
- 协议不使用“最后写入覆盖”作为默认策略；
- 接收方应在持久化层保证 compare-and-swap 原子性，避免两个窗口同时通过检查；
- 离线场景可以暂存 envelope，但重新连接时仍必须携带原 `baseRevision`，不能伪造为最新 revision；
- revision 是文档内单调递增整数，不要求时间戳排序。时间戳只用于审计和 UI 展示。

这套语义适合当前本地优先、同机多窗口和临时 LAN 会话；后续若引入 CRDT，应新增协议版本或明确新的并发 profile，不能改变 v1 的 `baseRevision` 含义。

## 6. 兼容与迁移策略

### 6.1 接收原则

| 情况 | v1 行为 | 原因 |
|---|---|---|
| `protocol` 与当前名称不一致 | 拒绝，诊断 `unsupported-protocol` | 防止把别的格式误当编辑协议 |
| 缺少 `protocolVersion` | 拒绝，诊断 `no-migrator`/`protocolVersion` | 不对未版本化数据做猜测性升级 |
| 版本低于 1 | 拒绝，诊断 `no-migrator` | 当前没有注册的旧版转换器 |
| 版本高于 1 | 拒绝，诊断 `unsupported-version` | 防止未知必填字段或新并发语义被误执行 |
| 版本为 1，但字段/命令非法 | 拒绝，诊断 `invalid-field`/`invalid-command` | 不允许部分应用 |
| 版本为 1，存在未知字段 | 保留并忽略 | 为非破坏性扩展留出空间；不得重定义已知字段 |
| 版本为 1，合法命令重试 | 由 `operationId` 幂等去重 | 避免网络重试重复应用 |

`migrateDesignerRevisionEnvelope(raw)` 当前是“验证 + 迁移结果形状”的纯函数：v1 没有隐式旧版迁移器，因此不会自动填充字段、删除未知字段或猜测 legacy 语义。未来加入迁移时，应遵守：

1. 明确注册 `sourceVersion -> targetVersion` 迁移器；
2. 每一个丢弃、重命名、默认填充或降级字段都产生 `DesignerMigrationDiagnostic`；
3. `ok: true` 只代表结果已经可以安全按目标版本解释；
4. 不可恢复字段必须 `ok: false`，不能只写 warning；
5. 迁移输出必须重新通过 `isDesignerRevisionEnvelope`。

### 6.2 诊断结果

`DesignerMigrationResult<T>` 是可判别联合：

- `ok: true`：包含 `value`、`sourceVersion`、`targetVersion` 和诊断列表；
- `ok: false`：不包含可执行的 `value`，包含 `sourceVersion` 和一个或多个错误诊断；
- 每条诊断包含 `severity`、`code`、JSON Pointer `path`、人类可读 `message`、源版本和目标版本。

接入 UI 时，建议把诊断分成“阻止打开”“需要人工确认”“仅提示”三类；不要只展示一个笼统的“文件损坏”。

## 7. 接入边界与后续 adapter 约定

本次模块不接入业务，后续线程应按以下边界接入：

| 接入层 | 负责内容 | 不应做的事 |
|---|---|---|
| Model adapter | `LowCodeWidget`/未来 `WidgetConfig` ↔ `DesignerNodeSnapshot` | 修改协议字段以适配单个组件实现 |
| Command bus | 校验后执行 atomic/transaction，生成 inverse 命令 | 直接覆盖整个项目快照作为普通编辑 |
| History | 用 envelope/command 记录 Undo/Redo 来源和分组 | 把自动保存单独记成用户编辑 |
| Persistence | 原子保存 head revision、operationId 去重记录和冲突快照 | 在 base revision 不匹配时静默覆盖 |
| Collaboration transport | 传递 envelope、accepted/conflict/error 结果 | 在传输层偷偷改变命令语义 |
| Import/migration adapter | 将旧格式显式转换为 v1 DTO，并输出诊断 | 把未知字段静默丢弃 |

推荐的最小接入顺序：

1. 先实现纯 `CommandBus`：只处理 `DesignerRevisionEnvelope`，暂不改变 UI；
2. 用一个 adapter 映射当前节点布局和属性；
3. 将 Inspector、Token、页面设置改成生成命令，而不是直接改对象；
4. 再把同一 envelope 接入历史、自动保存和协作；
5. 最后补充旧完整快照的安全降级和冲突恢复。

## 8. 验证方式

本模块可脱离业务独立验证：

```powershell
npx --no-install tsc --noEmit --strict --ignoreConfig --target ESNext --module ESNext --moduleResolution bundler --skipLibCheck src/types/designerProtocol.ts
```

运行时应至少覆盖：

- 合法 `node.update` envelope 可以通过 `isDesignerRevisionEnvelope`；
- `revision !== baseRevision + 1` 被拒绝；
- 事务嵌套、重复 `commandId`、actor 不一致被拒绝；
- 旧/未来/缺失版本返回结构化迁移诊断；
- JSON Pointer 的 `~0`/`~1` 转义和非法 `~` 被正确区分。

## 9. 已知限制

- v1 只定义协议和校验，不执行命令，也不持久化 revision；
- 没有实现旧版本迁移器；未版本化 envelope 必须由上层显式 adapter 处理；
- `DesignerId` 尚未品牌化或限制为 UUID；唯一性和生命周期由业务层保证；
- 冲突只定义拒绝和保留本地 envelope，不定义自动三方合并；
- `node.delete.snapshots` 只提供可选逆向数据，不规定删除子树的具体编码；
- 未知字段虽被保留/忽略，但当前纯函数不会重排或深拷贝输入；持久化层需要自行做不可变快照。
