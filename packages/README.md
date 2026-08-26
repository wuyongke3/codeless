# Codeless Git 子模块

| 子模块 | pnpm 包名 | 职责 | 依赖方向 |
| --- | --- | --- | --- |
| `packages/codeless-utils` | `@codeless/utils` | 公用函数工具与 Vue hooks | 不依赖业务页面 |
| `packages/codeless-ui` | `@codeless/ui` | 设计令牌、全局/结构样式及静态资源 | 不依赖组件实现 |
| `packages/codeless-components` | `@codeless/components` | 自研基础交互组件 | 仅依赖 `@codeless/utils` 与 Vue peer dependency |

这三个目录均为独立的 Git 子模块，同时被根项目的 pnpm workspace（`pnpm-workspace.yaml`）纳入依赖解析。

## 克隆与初始化

```bash
git clone --recurse-submodules <codeless-repository-url>
# 已克隆仓库时：
git submodule update --init --recursive
pnpm install --frozen-lockfile
```

修改某个包时，请先进入对应子模块提交并推送；随后在根仓库提交更新后的子模块提交引用。
