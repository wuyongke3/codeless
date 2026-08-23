import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '1.1.0'
const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIRECTORY, '..')
const REPOSITORY_ROOT_REAL = fs.realpathSync.native(REPOSITORY_ROOT)
const DIRECTORY_TARGETS = ['.test-artifacts', path.join('.tmp', 'page-designer')]
const EMPTY_PARENT_DIRECTORIES = ['.tmp']
const EXACT_LOG_NAMES = new Set(['dev-test.log'])
const ELECTRON_SMOKE_LOG_PATTERN = /^electron-smoke.*\.log$/

function isWithinRoot(candidatePath, rootPath) {
  const relativePath = path.relative(rootPath, candidatePath)

  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  )
}

function existingPathOrAncestor(targetPath) {
  let currentPath = targetPath

  while (true) {
    try {
      fs.lstatSync(currentPath)
      return currentPath
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error
      }

      const parentPath = path.dirname(currentPath)
      if (parentPath === currentPath) {
        return currentPath
      }
      currentPath = parentPath
    }
  }
}

function assertTargetWithinRepository(targetPath) {
  const absoluteTargetPath = path.resolve(targetPath)

  if (!isWithinRoot(absoluteTargetPath, REPOSITORY_ROOT)) {
    throw new Error(`Refusing to access path outside repository root: ${absoluteTargetPath}`)
  }

  const existingPath = existingPathOrAncestor(absoluteTargetPath)
  const existingRealPath = fs.realpathSync.native(existingPath)

  if (!isWithinRoot(existingRealPath, REPOSITORY_ROOT_REAL)) {
    throw new Error(`Refusing to access symlinked path outside repository root: ${absoluteTargetPath}`)
  }

  if (absoluteTargetPath === REPOSITORY_ROOT) {
    throw new Error(`Refusing to operate on repository root: ${absoluteTargetPath}`)
  }
}

function lstatIfExists(targetPath) {
  try {
    return fs.lstatSync(targetPath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

function displayPath(targetPath) {
  return path.relative(REPOSITORY_ROOT, targetPath) || '.'
}

function collectTargets() {
  const targets = []

  for (const relativePath of DIRECTORY_TARGETS) {
    const targetPath = path.resolve(REPOSITORY_ROOT, relativePath)
    assertTargetWithinRepository(targetPath)

    const stats = lstatIfExists(targetPath)
    if (stats?.isDirectory() || stats?.isSymbolicLink()) {
      targets.push({ kind: 'directory', path: targetPath })
    }
  }

  for (const entry of fs.readdirSync(REPOSITORY_ROOT, { withFileTypes: true })) {
    const isNamedLog = EXACT_LOG_NAMES.has(entry.name)
    const isElectronSmokeLog = ELECTRON_SMOKE_LOG_PATTERN.test(entry.name)

    if ((!isNamedLog && !isElectronSmokeLog) || !entry.isFile()) {
      continue
    }

    const targetPath = path.join(REPOSITORY_ROOT, entry.name)
    assertTargetWithinRepository(targetPath)
    targets.push({ kind: 'file', path: targetPath })
  }

  return targets
}

function isEmptyAfterCleanup(targetPath, targets) {
  const stats = lstatIfExists(targetPath)
  if (!stats?.isDirectory()) {
    return false
  }

  return fs.readdirSync(targetPath, { withFileTypes: true }).every((entry) => {
    const entryPath = path.join(targetPath, entry.name)
    return targets.some((target) => target.path === entryPath)
  })
}

function collectEmptyParentTargets(targets) {
  const emptyParents = []

  for (const relativePath of EMPTY_PARENT_DIRECTORIES) {
    const targetPath = path.resolve(REPOSITORY_ROOT, relativePath)
    assertTargetWithinRepository(targetPath)

    if (isEmptyAfterCleanup(targetPath, targets)) {
      emptyParents.push({ kind: 'directory', path: targetPath })
    }
  }

  return emptyParents
}

function removeTarget(target) {
  const stats = lstatIfExists(target.path)
  if (!stats) {
    return false
  }

  assertTargetWithinRepository(target.path)

  if (target.kind === 'directory') {
    if (!stats.isDirectory() && !stats.isSymbolicLink()) {
      return false
    }
    fs.rmSync(target.path, { force: true, recursive: stats.isDirectory() })
    return true
  }

  if (!stats.isFile()) {
    return false
  }
  fs.rmSync(target.path, { force: true })
  return true
}

function printUsage() {
  console.log(`Usage: node scripts/clean-test-artifacts.mjs [--check]\n\n  --check  Report matching artifacts without deleting them.`)
}

function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help')) {
    printUsage()
    return
  }

  const unknownArgs = args.filter((argument) => argument !== '--check')
  if (unknownArgs.length > 0) {
    console.error(`Unknown argument: ${unknownArgs[0]}`)
    printUsage()
    process.exitCode = 2
    return
  }

  const checkOnly = args.includes('--check')
  const targets = collectTargets()
  const emptyParentTargets = collectEmptyParentTargets(targets)
  const allTargets = [...targets, ...emptyParentTargets]
  const mode = checkOnly ? 'check' : 'delete'

  console.log(`[clean-test-artifacts v${VERSION}] mode=${mode}`)
  console.log(`[clean-test-artifacts] repository=${REPOSITORY_ROOT}`)

  if (allTargets.length === 0) {
    console.log('[clean-test-artifacts] no matching test artifacts found')
    return
  }

  if (checkOnly) {
    for (const target of allTargets) {
      console.log(`[check] would remove ${displayPath(target.path)}`)
    }
    console.log(`[clean-test-artifacts] ${allTargets.length} artifact(s) would be removed`)
    return
  }

  let removedCount = 0
  for (const target of allTargets) {
    if (removeTarget(target)) {
      removedCount += 1
      console.log(`[removed] ${displayPath(target.path)}`)
    }
  }
  console.log(`[clean-test-artifacts] removed ${removedCount} artifact(s)`)
}

try {
  main()
} catch (error) {
  console.error(`[clean-test-artifacts] failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
