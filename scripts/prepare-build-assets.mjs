import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const png2icons = require('png2icons')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'public')
const buildDir = path.join(root, 'build')

const sourcePng = path.join(publicDir, 'logo.png')
const targetPng = path.join(buildDir, 'icon.png')
const iconsDir = path.join(buildDir, 'icons')
const linuxPng = path.join(iconsDir, '1024x1024.png')
const macIcns = path.join(iconsDir, 'icon.icns')
const winIco = path.join(iconsDir, 'icon.ico')

function copyIfChanged(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true })

  const next = fs.readFileSync(source)
  const current = fs.existsSync(target) ? fs.readFileSync(target) : null

  if (!current || !current.equals(next)) {
    fs.writeFileSync(target, next)
  }
}

export function prepareBuildAssets() {
  if (!fs.existsSync(sourcePng)) {
    throw new Error('Missing app icon. Add public/logo.png before running the build command.')
  }

  copyIfChanged(sourcePng, targetPng)
  generatePlatformIcons()
  console.log(`[build] generated app icons from ${path.relative(root, sourcePng)} to ${path.relative(root, iconsDir)}`)
}

function generatePlatformIcons() {
  resetIconsDir()

  const input = fs.readFileSync(targetPng)
  const icns = png2icons.createICNS(input, png2icons.BICUBIC2, 0)
  const ico = png2icons.createICO(input, png2icons.BICUBIC2, 0, false, true)

  if (!icns || !ico) {
    throw new Error('Failed to generate platform icons from public/logo.png.')
  }

  fs.writeFileSync(macIcns, icns)
  fs.writeFileSync(winIco, ico)
  copyIfChanged(targetPng, linuxPng)
}

function resetIconsDir() {
  const resolved = path.resolve(iconsDir)
  const allowed = `${path.resolve(buildDir)}${path.sep}`

  if (!resolved.startsWith(allowed)) {
    throw new Error(`Refusing to reset icons outside build directory: ${resolved}`)
  }

  fs.rmSync(resolved, { recursive: true, force: true })
  fs.mkdirSync(resolved, { recursive: true })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareBuildAssets()
}
