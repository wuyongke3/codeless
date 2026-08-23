#!/usr/bin/env node

/**
 * PD-QA-01 v1.0.0
 * 纯 Node 页面设计器性能基准：验证当前 LowCodeProject/PageLayout 数据模型
 * 在 250/500/1000 节点规模下的序列化、解析、结构校验和布局历史 patch 成本。
 *
 * 运行约束：仅使用 Node.js 内置模块，不启动 Vite、Electron 或浏览器。
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { applyLayoutPatch, createLayoutPatch } from '../../src/composables/layoutHistory.ts'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const BENCHMARK_VERSION = 'PD-QA-01 v1.0.0'
const NODE_COUNTS = [250, 500, 1000]
const DEFAULT_WARMUPS = 2
const DEFAULT_ITERATIONS = 7
const WIDGET_TYPES = ['heading', 'text', 'button', 'input', 'card', 'stack', 'grid', 'image', 'table', 'badge']
const MUTATION_RATIO = 0.05

/**
 * 预算按节点规模逐级放宽，门禁只使用纯 Node 可稳定测量的 CPU/数据路径。
 * 浏览器 FPS、DOM、GPU/WebGL 不属于本基准的可测范围。
 */
const PERFORMANCE_BUDGETS = {
  250: { serializeP95Ms: 50, parseP95Ms: 50, validateP95Ms: 25, createPatchP95Ms: 100, applyPatchP95Ms: 50, payloadKB: 2048 },
  500: { serializeP95Ms: 100, parseP95Ms: 100, validateP95Ms: 50, createPatchP95Ms: 200, applyPatchP95Ms: 100, payloadKB: 4096 },
  1000: { serializeP95Ms: 200, parseP95Ms: 200, validateP95Ms: 100, createPatchP95Ms: 400, applyPatchP95Ms: 200, payloadKB: 8192 },
}

let sink = 0

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function nowIso() {
  return new Date().toISOString()
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} 必须是大于等于 0 的整数，实际为 ${value}`)
  }
  return parsed
}

function parseArguments(argv) {
  const options = {
    warmups: DEFAULT_WARMUPS,
    iterations: DEFAULT_ITERATIONS,
  }

  for (const argument of argv) {
    const [key, rawValue] = argument.split('=', 2)
    if (key === '--warmups' && rawValue !== undefined) {
      options.warmups = parsePositiveInteger(rawValue, '--warmups')
      continue
    }
    if (key === '--iterations' && rawValue !== undefined) {
      options.iterations = parsePositiveInteger(rawValue, '--iterations')
      continue
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    throw new Error(`不支持的参数：${argument}。可用参数：--warmups=N --iterations=N`)
  }

  if (options.iterations === 0) {
    throw new Error('--iterations 必须大于 0')
  }
  return options
}

function createWidget(index, total) {
  const type = WIDGET_TYPES[index % WIDGET_TYPES.length]
  const parentIndex = index > 0 && index % 11 === 0 ? index - 1 : undefined
  const x = (index % 20) * 24
  const y = Math.floor(index / 20) * 72
  const width = type === 'heading' ? 280 : 160 + (index % 4) * 16
  const height = type === 'heading' ? 48 : 40 + (index % 3) * 8
  const timestamp = '2026-08-23T00:00:00.000Z'

  return {
    id: `widget-${index}`,
    type,
    ...(parentIndex === undefined ? {} : { parentId: `widget-${parentIndex}` }),
    name: `${type}-${index}`,
    // 兼容当前 LowCodeWidget 的 legacy 投影字段。
    x,
    y,
    w: width,
    h: height,
    props: {
      text: `${type} content ${index}`,
      placeholder: type === 'input' ? `输入第 ${index} 项` : undefined,
      accent: index % 2 === 0 ? '#6d5dfc' : '#14b8a6',
      variant: type === 'button' ? 'primary' : undefined,
    },
    config: {
      version: 1,
      layout: {
        x,
        y,
        width,
        height,
        rotation: 0,
        zIndex: index + 1,
        locked: false,
        hidden: false,
      },
      content: {
        text: `${type} content ${index}`,
        label: type === 'button' ? `操作 ${index}` : undefined,
        placeholder: type === 'input' ? `输入第 ${index} 项` : undefined,
        variant: type === 'button' ? 'primary' : undefined,
        options: type === 'select' ? [{ label: '选项 A', value: 'a' }, { label: '选项 B', value: 'b' }] : undefined,
      },
      style: {
        color: '#1f2937',
        background: index % 3 === 0 ? '#ffffff' : '#f8fafc',
        accent: index % 2 === 0 ? '#6d5dfc' : '#14b8a6',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        borderRadius: 8,
        fontSize: type === 'heading' ? 28 : 14,
        fontWeight: type === 'heading' ? 700 : 400,
        textAlign: 'left',
        opacity: 1,
        padding: 12,
        gap: 8,
      },
      data: {
        source: index % 5 === 0 ? 'table' : 'static',
        ...(index % 5 === 0 ? { table: 'demo_items', mode: 'list', limit: 50 } : {}),
      },
      validation: {
        ...(type === 'input' ? { required: index % 2 === 0, maxLength: 120 } : {}),
      },
      interaction: {
        events: type === 'button'
          ? [{ id: `event-${index}`, event: 'click', actions: [{ id: `action-${index}`, type: 'showToast', value: `已操作 ${index}` }] }]
          : [],
      },
      meta: {
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    },
  }
}

function createProject(nodeCount) {
  const widgets = Array.from({ length: nodeCount }, (_, index) => createWidget(index, nodeCount))
  return {
    id: `benchmark-project-${nodeCount}`,
    name: `PD-QA-01 ${nodeCount} nodes`,
    description: 'Synthetic project matching the current LowCodeProject/PageLayout shape.',
    status: 'draft',
    category: 'benchmark',
    layout: {
      version: 1,
      pageName: 'Benchmark Page',
      canvas: {
        width: 1440,
        height: Math.max(900, Math.ceil(nodeCount / 20) * 96),
        background: '#f8fafc',
      },
      widgets,
    },
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  }
}

function createChangedProject(project) {
  const changed = clone(project)
  const mutationCount = Math.max(1, Math.floor(changed.layout.widgets.length * MUTATION_RATIO))
  for (let index = 0; index < mutationCount; index += 1) {
    const widget = changed.layout.widgets[index * 2]
    widget.config.layout.x += 12
    widget.config.layout.y += 8
    widget.x = widget.config.layout.x
    widget.y = widget.config.layout.y
    widget.config.meta.updatedAt = '2026-08-23T00:00:01.000Z'
  }

  // 触发当前 layoutHistory 的 orderBefore/orderAfter 分支。
  const last = changed.layout.widgets.length - 1
  const previous = changed.layout.widgets[last - 1]
  changed.layout.widgets[last - 1] = changed.layout.widgets[last]
  changed.layout.widgets[last] = previous
  changed.layout.version += 1
  changed.updatedAt = '2026-08-23T00:00:01.000Z'
  return changed
}


/** 与 scripts/validate-page-designer.mjs 的核心 project shape 检查保持一致。 */
function serialize(value) {
  return JSON.stringify(value)
}

function validateProjectShape(project) {
  assert(isRecord(project), 'project 必须是对象')
  assert(typeof project.id === 'string' && project.id.trim(), 'project.id 必须是非空字符串')
  assert(typeof project.name === 'string' && project.name.trim(), 'project.name 必须是非空字符串')
  assert(isRecord(project.layout), 'project.layout 必须是对象')
  assert(isRecord(project.layout.canvas) && Array.isArray(project.layout.widgets), 'project.layout 必须包含 canvas 和 widgets')

  const widgetIds = new Set()
  for (const [index, widget] of project.layout.widgets.entries()) {
    assert(isRecord(widget), `layout.widgets[${index}] 必须是对象`)
    assert(typeof widget.id === 'string' && widget.id.trim(), `layout.widgets[${index}] 缺少 id`)
    assert(typeof widget.type === 'string' && widget.type.trim(), `layout.widgets[${index}] 缺少 type`)
    assert(!widgetIds.has(widget.id), `layout.widgets[${index}] id 重复：${widget.id}`)
    widgetIds.add(widget.id)
  }
  return widgetIds.size
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  return sorted[Math.max(0, index)]
}

function round(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function formatMs(value) {
  return `${round(value, 2).toFixed(2)} ms`
}

function formatBytes(value) {
  return `${round(value / 1024, 1).toFixed(1)} KB`
}

function formatMb(value) {
  return `${round(value / (1024 * 1024), 2).toFixed(2)} MB`
}

async function measure(operation, fn, warmups, iterations) {
  for (let index = 0; index < warmups; index += 1) {
    sink ^= Number(fn()) || 0
  }

  const samples = []
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now()
    const result = fn()
    const elapsed = performance.now() - startedAt
    sink ^= Number(result) || 0
    samples.push(elapsed)
  }

  assert(samples.length > 0, `${operation} 没有有效样本`)
  return {
    operation,
    minMs: Math.min(...samples),
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    maxMs: Math.max(...samples),
  }
}

function createOperationFunctions(project, changedProject, serializedProject) {
  const baselineLayout = project.layout
  const changedLayout = changedProject.layout
  const patch = createLayoutPatch(baselineLayout, changedLayout)
  assert(patch && patch.widgetChanges.length > 0, 'benchmark patch ???????')

  return {
    serializeP95Ms: () => JSON.stringify(project).length,
    parseP95Ms: () => {
      const parsed = JSON.parse(serializedProject)
      return parsed.layout.widgets.length
    },
    validateP95Ms: () => validateProjectShape(project),
    createPatchP95Ms: () => {
      const patch = createLayoutPatch(baselineLayout, changedLayout)
      assert(patch && patch.widgetChanges.length > 0, 'createLayoutPatch 未生成有效 patch')
      return patch.widgetChanges.length
    },
    applyPatchP95Ms: () => {
      const applied = applyLayoutPatch(baselineLayout, patch, 'redo')
      assert(applied.widgets.length === changedLayout.widgets.length, 'applyLayoutPatch 节点数不一致')
      assert(applied.version === changedLayout.version, 'applyLayoutPatch version 不一致')
      return applied.widgets.length
    },
  }
}

function checkBudget(nodeCount, metric, value, budget, failures) {
  if (value > budget) {
    failures.push(`${nodeCount} 节点 ${metric}=${formatMs(value)} 超过预算 ${formatMs(budget)}`)
    return 'FAIL'
  }
  return 'PASS'
}

function printHeader(options) {
  console.log(`${BENCHMARK_VERSION} | 纯 Node | Node ${process.version}`)
  console.log(`仓库：${REPO_ROOT}`)
  console.log(`规模：${NODE_COUNTS.join(' / ')} 节点 | warmup=${options.warmups} | iterations=${options.iterations}`)
  console.log('预算：p95 CPU 指标 + 序列化 payload 大小；浏览器 FPS/DOM/WebGL 不在本基准范围内。')
  console.log('')
}

function printResultTable(results) {
  const headers = ['节点', 'payload', 'serialize p95', 'parse p95', 'validate p95', 'patch build p95', 'patch apply p95', 'heap delta', '结果']
  const rows = results.map(result => [
    String(result.nodeCount),
    formatBytes(result.payloadBytes),
    formatMs(result.metrics.serialize.p95Ms),
    formatMs(result.metrics.parse.p95Ms),
    formatMs(result.metrics.validate.p95Ms),
    formatMs(result.metrics.createPatch.p95Ms),
    formatMs(result.metrics.applyPatch.p95Ms),
    formatMb(result.heapDeltaBytes),
    result.status,
  ])
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map(row => row[index].length)))
  const line = cells => `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(' | ')} |`
  const separator = `|-${widths.map(width => '-'.repeat(width)).join('-|-')}-|`

  console.log(line(headers))
  console.log(separator)
  rows.forEach(row => console.log(line(row)))
}

async function runBenchmark(options) {
  const results = []
  const failures = []

  for (const nodeCount of NODE_COUNTS) {
    const memoryBefore = process.memoryUsage().heapUsed
    const project = createProject(nodeCount)
    const changedProject = createChangedProject(project)
    const serializedProject = serialize(project)
    const memoryAfter = process.memoryUsage().heapUsed
    const payloadBytes = Buffer.byteLength(serializedProject, 'utf8')
    const budgets = PERFORMANCE_BUDGETS[nodeCount]

    assert(validateProjectShape(project) === nodeCount, `${nodeCount} 节点 fixture 校验数量不一致`)
    assert(payloadBytes <= budgets.payloadKB * 1024, `${nodeCount} 节点 payload 超出硬上限`)

    const operations = createOperationFunctions(project, changedProject, serializedProject)
    const metrics = {}
    const metricNames = [
      ['serialize', 'serializeP95Ms'],
      ['parse', 'parseP95Ms'],
      ['validate', 'validateP95Ms'],
      ['createPatch', 'createPatchP95Ms'],
      ['applyPatch', 'applyPatchP95Ms'],
    ]

    for (const [metricName, operationName] of metricNames) {
      metrics[metricName] = await measure(operationName, operations[operationName], options.warmups, options.iterations)
    }

    const budgetStatuses = [
      checkBudget(nodeCount, 'serialize p95', metrics.serialize.p95Ms, budgets.serializeP95Ms, failures),
      checkBudget(nodeCount, 'parse p95', metrics.parse.p95Ms, budgets.parseP95Ms, failures),
      checkBudget(nodeCount, 'validate p95', metrics.validate.p95Ms, budgets.validateP95Ms, failures),
      checkBudget(nodeCount, 'create patch p95', metrics.createPatch.p95Ms, budgets.createPatchP95Ms, failures),
      checkBudget(nodeCount, 'apply patch p95', metrics.applyPatch.p95Ms, budgets.applyPatchP95Ms, failures),
    ]
    if (payloadBytes > budgets.payloadKB * 1024) {
      failures.push(`${nodeCount} 节点 payload=${formatBytes(payloadBytes)} 超过预算 ${budgets.payloadKB} KB`)
    }

    results.push({
      nodeCount,
      payloadBytes,
      heapDeltaBytes: Math.max(0, memoryAfter - memoryBefore),
      metrics,
      status: budgetStatuses.every(status => status === 'PASS') && payloadBytes <= budgets.payloadKB * 1024 ? 'PASS' : 'FAIL',
    })
  }

  return { results, failures, sink }
}

function help() {
  console.log(`${BENCHMARK_VERSION}\n`)
  console.log('???node --experimental-strip-types scripts/benchmarks/page-designer-performance.mjs [--warmups=N] [--iterations=N]')
  console.log('默认覆盖 250、500、1000 节点；所有报告只写入系统临时目录并在 finally 中删除。')
}

async function main() {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error(`参数错误：${error instanceof Error ? error.message : String(error)}`)
    return 2
  }

  if (options.help) {
    help()
    return 0
  }

  let tempDir
  let reportPath
  let exitCode = 0
  let report

  try {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'codeless-pd-qa-01-'))
    reportPath = path.join(tempDir, 'performance-report.json')
    printHeader(options)

    const benchmark = await runBenchmark(options)
    report = {
      benchmark: BENCHMARK_VERSION,
      generatedAt: nowIso(),
      node: process.version,
      options,
      nodeCounts: NODE_COUNTS,
      results: benchmark.results,
      failures: benchmark.failures,
    }
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')

    printResultTable(benchmark.results)
    console.log('')
    console.log(`报告已生成至临时目录：${reportPath}`)
    console.log(`报告字节数：${(await readFile(reportPath)).byteLength}`)

    if (benchmark.failures.length > 0) {
      exitCode = 1
      console.error('')
      console.error('失败项：')
      benchmark.failures.forEach(failure => console.error(`- ${failure}`))
    } else {
      console.log('')
      console.log('结论：PD-QA-01 性能预算全部通过。')
    }
  } catch (error) {
    exitCode = 1
    console.error(`基准执行失败：${error instanceof Error ? error.stack || error.message : String(error)}`)
  } finally {
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true })
        if (existsSync(tempDir)) {
          exitCode = 1
          console.error(`清理失败：临时目录仍然存在：${tempDir}`)
        } else {
          console.log('临时报告与测试文件已在 finally 中清理。')
        }
      } catch (error) {
        exitCode = 1
        console.error(`清理临时目录失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  return exitCode
}

process.exitCode = await main()
