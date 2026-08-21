import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareBuildAssets } from './prepare-build-assets.mjs'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

const platformAliases = new Map([
  ['--win', 'win32'],
  ['--windows', 'win32'],
  ['-w', 'win32'],
  ['--mac', 'darwin'],
  ['--macos', 'darwin'],
  ['-m', 'darwin'],
  ['--linux', 'linux'],
  ['-l', 'linux'],
])

const currentPlatformMarkers = {
  win32: 'electron.exe',
  darwin: path.join('Electron.app', 'Contents', 'MacOS', 'Electron'),
  linux: 'electron',
}

const archAliases = new Map([
  ['--x64', 'x64'],
  ['--ia32', 'ia32'],
  ['--arm64', 'arm64'],
])

function runBin(name, binArgs) {
  const command = resolveBin(name)
  const result = spawnSync(command, binArgs, {
    cwd: root,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function resolveBin(name) {
  const binName = process.platform === 'win32' ? `${name}.cmd` : name
  const localBin = path.join(root, 'node_modules', '.bin', binName)

  return fs.existsSync(localBin) ? localBin : name
}

function requestedPlatforms(builderArgs) {
  const platforms = new Set()

  for (const arg of builderArgs) {
    const platform = platformAliases.get(arg)
    if (platform) {
      platforms.add(platform)
      continue
    }

    if (/^-[mwl]+$/.test(arg)) {
      if (arg.includes('m')) platforms.add('darwin')
      if (arg.includes('w')) platforms.add('win32')
      if (arg.includes('l')) platforms.add('linux')
    }
  }

  if (platforms.size === 0) {
    platforms.add(process.platform)
  }

  return platforms
}

function localElectronDist() {
  const dist = path.join(root, 'node_modules', 'electron', 'dist')
  const marker = currentPlatformMarkers[process.platform]

  if (!marker) {
    return null
  }

  const markerPath = path.join(dist, marker)
  return fs.existsSync(markerPath) ? dist : null
}

function builderArgsWithLocalElectron(builderArgs) {
  const targets = requestedPlatforms(builderArgs)
  const archs = requestedArchs(builderArgs)
  const dist = ensureLocalElectronDist(targets, archs)

  if (!dist || targets.size !== 1 || !targets.has(process.platform) || archs.size !== 1 || !archs.has(process.arch)) {
    return builderArgs
  }

  console.log(`[build] using local Electron distribution: ${dist}`)
  return [...builderArgs, `--config.electronDist=${dist}`]
}

function requestedArchs(builderArgs) {
  const archs = new Set()

  for (const arg of builderArgs) {
    const arch = archAliases.get(arg)
    if (arch) {
      archs.add(arch)
    }
  }

  if (archs.size === 0) {
    archs.add(process.arch)
  }

  return archs
}

function ensureLocalElectronDist(targets, archs) {
  if (targets.size !== 1 || !targets.has(process.platform) || archs.size !== 1 || !archs.has(process.arch)) {
    return null
  }

  const current = localElectronDist()
  if (current) {
    return current
  }

  try {
    console.log('[build] local Electron distribution not found; preparing node_modules/electron/dist')
    require('electron')
  } catch (error) {
    console.warn(`[build] unable to prepare local Electron distribution: ${error.message}`)
  }

  return localElectronDist()
}

function setupSigningEnv() {
  const envPairs = [
    ['CODELESS_WIN_CSC_LINK', 'WIN_CSC_LINK'],
    ['CODELESS_WIN_CSC_KEY_PASSWORD', 'WIN_CSC_KEY_PASSWORD'],
    ['CODELESS_CSC_LINK', 'CSC_LINK'],
    ['CODELESS_CSC_KEY_PASSWORD', 'CSC_KEY_PASSWORD'],
    ['CODELESS_APPLE_ID', 'APPLE_ID'],
    ['CODELESS_APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_APP_SPECIFIC_PASSWORD'],
    ['CODELESS_APPLE_TEAM_ID', 'APPLE_TEAM_ID'],
  ]

  for (const [source, target] of envPairs) {
    if (process.env[source] && !process.env[target]) {
      process.env[target] = process.env[source]
    }
  }

  if (!process.env.CSC_IDENTITY_AUTO_DISCOVERY && !process.env.CSC_LINK && !process.env.WIN_CSC_LINK) {
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  }
}

setupSigningEnv()
prepareBuildAssets()
runBin('vue-tsc', ['--noEmit'])
runBin('vite', ['build'])
runBin('electron-builder', builderArgsWithLocalElectron(args))
