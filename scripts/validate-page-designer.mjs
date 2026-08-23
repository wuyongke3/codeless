import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..')
const FIXTURE_ROOT = path.join(SCRIPT_DIR, 'page-designer-fixtures')
const STATUS_VALUES = new Set(['planned', 'in_progress', 'blocked', 'finished'])
const SUPPORTED_SCHEMA_VERSION = 1

let passed = 0
let failed = 0

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stripCode(value) {
  return String(value || '').replace(/^`|`$/g, '').trim()
}

function tableCells(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return []
  return trimmed.split('|').slice(1, -1).map(cell => cell.trim())
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function failCode(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

async function readText(relativePath) {
  return readFile(path.join(REPO_ROOT, relativePath), 'utf8')
}

async function readJson(relativePath) {
  const text = await readText(relativePath)
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (error) {
    throw new Error(`${relativePath} 不是有效 JSON：${error.message}`)
  }
}

async function runCheck(label, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  PASS ${label}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${label} — ${error instanceof Error ? error.message : String(error)}`)
  }
}

function validateProjectShape(value) {
  if (!isRecord(value)) failCode('invalid-project', 'project 必须是对象')
  if (typeof value.id !== 'string' || !value.id.trim()) failCode('invalid-project-id', 'project.id 必须是非空字符串')
  if (typeof value.name !== 'string' || !value.name.trim()) failCode('invalid-project-name', 'project.name 必须是非空字符串')
  if (!isRecord(value.layout)) failCode('invalid-layout', 'project.layout 必须是对象')
  if (!isRecord(value.layout.canvas) || !Array.isArray(value.layout.widgets)) {
    failCode('invalid-layout', 'project.layout 必须包含 canvas 对象和 widgets 数组')
  }

  const widgetIds = new Set()
  for (const [index, widget] of value.layout.widgets.entries()) {
    if (!isRecord(widget) || typeof widget.id !== 'string' || !widget.id.trim() || typeof widget.type !== 'string' || !widget.type.trim()) {
      failCode('invalid-widget', `layout.widgets[${index}] 必须包含非空 id 和 type`)
    }
    if (widgetIds.has(widget.id)) failCode('duplicate-widget-id', `layout.widgets[${index}] 的 id 重复：${widget.id}`)
    widgetIds.add(widget.id)
  }
}

function migrateStaticDocument(raw) {
  if (!isRecord(raw)) failCode('invalid-envelope', '项目文件顶层必须是对象')

  let project
  if (raw.format === 'codeless') {
    const version = raw.schemaVersion === undefined ? 0 : Number(raw.schemaVersion)
    if (!Number.isInteger(version) || version < 0) failCode('invalid-schema-version', 'schemaVersion 必须是非负整数')
    if (version > SUPPORTED_SCHEMA_VERSION) failCode('unsupported-schema-version', `schemaVersion ${version} 高于支持版本 ${SUPPORTED_SCHEMA_VERSION}`)
    project = raw.project
  } else if (raw.id !== undefined && raw.layout !== undefined) {
    project = raw
  } else if (isRecord(raw.project) && raw.layout === undefined) {
    project = raw.project
  } else {
    failCode('invalid-envelope', '文件不符合 codeless v0/v1 包装或直接项目结构')
  }

  validateProjectShape(project)
  return { format: 'codeless', schemaVersion: SUPPORTED_SCHEMA_VERSION, project }
}

function assertSafeRepoRelative(relativePath) {
  assert(typeof relativePath === 'string' && relativePath.trim(), '路径不能为空')
  assert(!path.isAbsolute(relativePath), `路径不能是绝对路径：${relativePath}`)
  const normalized = path.normalize(relativePath)
  assert(normalized !== '..' && !normalized.startsWith(`..${path.sep}`), `路径不能逃逸仓库：${relativePath}`)
}

async function validateDocumentation() {
  const requiredDocs = [
    'docs/page-designer/README.md',
    'docs/page-designer/COMPETITIVE_RESEARCH.md',
    'docs/page-designer/CURRENT_STATE_GAP_ANALYSIS.md',
    'docs/page-designer/ITERATION_PLAN.md',
    'docs/page-designer/WORK_STATUS.md',
  ]
  for (const doc of requiredDocs) {
    const text = await readText(doc)
    assert(text.trim(), `${doc} 为空`)
  }

  const readme = await readText('docs/page-designer/README.md')
  for (const link of ['COMPETITIVE_RESEARCH.md', 'CURRENT_STATE_GAP_ANALYSIS.md', 'ITERATION_PLAN.md', 'WORK_STATUS.md']) {
    assert(readme.includes(link), `README 缺少文档入口：${link}`)
  }

  const status = await readText('docs/page-designer/WORK_STATUS.md')
  assert(status.includes('implementation details'), 'WORK_STATUS 缺少完成定义中的 implementation details')
  assert(status.includes('changed files'), 'WORK_STATUS 缺少完成定义中的 changed files')
  assert(status.includes('verification commands/results'), 'WORK_STATUS 缺少完成定义中的 verification commands/results')
  assert(status.includes('known limitations'), 'WORK_STATUS 缺少完成定义中的 known limitations')

  const idRows = status
    .split(/\r?\n/)
    .map(tableCells)
    .filter(cells => cells.length >= 4 && /^`[^`]+`$/.test(cells[0]))
  assert(idRows.length > 0, 'WORK_STATUS 未找到带 ID 的状态表行')

  const ids = new Set()
  const counts = new Map()
  for (const cells of idRows) {
    const id = stripCode(cells[0])
    const state = stripCode(cells[3])
    assert(!ids.has(id), `WORK_STATUS 存在重复工作项 ID：${id}`)
    ids.add(id)
    assert(STATUS_VALUES.has(state), `${id} 使用了未知状态：${state}`)
    counts.set(state, (counts.get(state) || 0) + 1)
    if (state === 'finished') {
      assert(cells.length >= 6, `${id} 的 finished 行缺少变更范围或验证结果列`)
      assert(cells[4] && cells[4] !== '—' && cells[4] !== '-', `${id} 的 finished 行缺少 changed files/变更范围`)
      assert(cells[5] && cells[5] !== '—' && cells[5] !== '-', `${id} 的 finished 行缺少 verification results/验证结果`)
    }
  }

  const expectedSummary = [
    ['finished', /\|\s*历史实施项\s*`finished`\s*\|\s*(\d+)\s*\|/],
    ['planned', /\|\s*新规划项\s*`planned`\s*\|\s*(\d+)\s*\|/],
    ['in_progress', /\|\s*当前\s*`in_progress`\s*\|\s*(\d+)\s*\|/],
    ['blocked', /\|\s*当前\s*`blocked`\s*\|\s*(\d+)\s*\|/],
  ]
  for (const [state, pattern] of expectedSummary) {
    const match = status.match(pattern)
    assert(match, `WORK_STATUS 缺少总体统计：${state}`)
    assert(Number(match[1]) === (counts.get(state) || 0), `${state} 统计与状态表不一致：summary=${match[1]}, rows=${counts.get(state) || 0}`)
  }

  const iterationPlan = await readText('docs/page-designer/ITERATION_PLAN.md')
  for (const cells of idRows.filter(row => stripCode(row[3]) === 'planned')) {
    const id = stripCode(cells[0])
    assert(iterationPlan.includes(id), `ITERATION_PLAN is missing planned work item: ${id}`)
  }

  assert(ids.has('PD-QA-03'), 'WORK_STATUS 缺少 PD-QA-03 状态入口')
}

async function validateProtocolEntrypoints() {
  const entrypoints = [
    {
      file: 'src/types/projectFile.ts',
      patterns: [
        /CODELESS_FILE_FORMAT/,
        /CODELESS_SCHEMA_VERSION/,
        /function\s+migrateCodelessDocument/,
        /function\s+parseCodelessDocument/,
        /function\s+serializeCodelessDocument/,
        /assertProjectShape/,
      ],
    },
    {
      file: 'electron/main/index.ts',
      patterns: [/function\s+writeRecoverySnapshot/, /writeTextAtomically/, /\.codeless\.recovery/, /parseCodelessDocument/, /Failed to write local recovery snapshot/],
    },
    {
      file: 'docs/COMPONENT_DATA_PROTOCOL.md',
      patterns: [/WidgetConfig\s+v1/, /normalizeProject/, /normalizeWidget/],
    },
  ]

  for (const entry of entrypoints) {
    const text = await readText(entry.file)
    for (const pattern of entry.patterns) assert(pattern.test(text), `${entry.file} 缺少入口标记：${pattern}`)
  }
}

function parseStaticJson(text, label) {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (error) {
    failCode('invalid-json', `${label} is not valid JSON: ${error.message}`)
  }
}

async function validateFixtures() {
  const manifestRelative = 'scripts/page-designer-fixtures/manifest.json'
  const manifest = await readJson(manifestRelative)
  assert(isRecord(manifest), 'fixture manifest 顶层必须是对象')
  assert(manifest.manifestVersion === 1, `fixture manifest 版本必须为 1，实际为 ${manifest.manifestVersion}`)
  assert(isRecord(manifest.protocol), 'fixture manifest 缺少 protocol 入口')
  assert(Array.isArray(manifest.cases) && manifest.cases.length >= 6, 'fixture manifest 至少需要 6 个覆盖用例')

  for (const [name, entry] of Object.entries(manifest.protocol)) {
    assertSafeRepoRelative(entry)
    const text = await readText(entry)
    assert(text.trim(), `protocol 入口为空：${entry}`)
    assert(name && typeof name === 'string', 'protocol 入口名称无效')
  }

  const seenIds = new Set()
  const seenFiles = new Set()
  const coverage = new Set()
  for (const fixture of manifest.cases) {
    assert(isRecord(fixture), 'fixture case 必须是对象')
    assert(typeof fixture.id === 'string' && fixture.id.trim(), 'fixture case 缺少 id')
    assert(!seenIds.has(fixture.id), `fixture case id 重复：${fixture.id}`)
    seenIds.add(fixture.id)
    assert(typeof fixture.file === 'string' && fixture.file.trim(), `${fixture.id} 缺少 file`)
    assert(!seenFiles.has(fixture.file), `fixture file 重复：${fixture.file}`)
    seenFiles.add(fixture.file)
    assert(['project-file', 'migration', 'recovery'].includes(fixture.kind), `${fixture.id} kind 无效：${fixture.kind}`)
    assert(['accept', 'reject'].includes(fixture.expect), `${fixture.id} expect 无效：${fixture.expect}`)

    const fixturePath = path.resolve(FIXTURE_ROOT, fixture.file)
    assert(fixturePath === FIXTURE_ROOT || fixturePath.startsWith(`${FIXTURE_ROOT}${path.sep}`), `${fixture.id} 路径逃逸 fixture 目录`)
    const text = await readFile(fixturePath, 'utf8')
    if (fixture.kind === 'recovery') assert(fixture.file.endsWith('.codeless.recovery'), `${fixture.id} recovery fixture 必须使用 .codeless.recovery 后缀`)

    try {
      const raw = parseStaticJson(text, fixture.file)
      const normalized = migrateStaticDocument(raw)
      assert(fixture.expect === 'accept', `${fixture.id} 预期 reject，但静态迁移接受了文件`)
      if (fixture.result) {
        assert(normalized.format === fixture.result.format, `${fixture.id} 归一化 format 不一致`)
        assert(normalized.schemaVersion === fixture.result.schemaVersion, `${fixture.id} 归一化 schemaVersion 不一致`)
      }
      coverage.add(fixture.kind === 'migration' ? 'migration-accept' : `${fixture.kind}-accept`)
      console.log(`    PASS fixture ${fixture.id} (${fixture.kind}/${fixture.expect})`)
    } catch (error) {
      if (fixture.expect === 'accept') throw new Error(`${fixture.id} 预期 accept，但失败：${error instanceof Error ? error.message : String(error)}`)
      const actualCode = error?.code || 'unknown'
      assert(actualCode === fixture.errorCode, `${fixture.id} 错误码不一致：expected=${fixture.errorCode}, actual=${actualCode}`)
      coverage.add(`reject-${fixture.errorCode}`)
      console.log(`    PASS fixture ${fixture.id} rejected with ${actualCode}`)
    }
  }

  for (const required of ['project-file-accept', 'migration-accept', 'recovery-accept', 'reject-invalid-json', 'reject-invalid-project-id', 'reject-invalid-widget', 'reject-unsupported-schema-version']) {
    assert(coverage.has(required), `fixture 覆盖不足：${required}`)
  }
}

async function main() {
  console.log('PD-QA-03 page-designer 静态门禁')
  console.log(`仓库：${REPO_ROOT}`)
  console.log('')

  console.log('[1/3] 中央文档状态')
  await runCheck('中央文档存在、README 入口和 WORK_STATUS 完成定义', validateDocumentation)
  console.log('')

  console.log('[2/3] 协议/迁移/恢复入口')
  await runCheck('项目文件、WidgetConfig 和恢复快照入口存在且可定位', validateProtocolEntrypoints)
  console.log('')

  console.log('[3/3] 静态 fixture 字段校验')
  await runCheck('manifest、迁移接受/拒绝、坏文件和恢复 fixture 覆盖', validateFixtures)
  console.log('')

  console.log(`结果：${passed} 项通过，${failed} 项失败`)
  console.log(`退出码：${failed === 0 ? 0 : 1}`)
  process.exitCode = failed === 0 ? 0 : 1
}

await main()
