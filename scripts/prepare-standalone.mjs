import { cp, mkdir, stat } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const nextStatic = path.join(root, '.next', 'static')
const standaloneNext = path.join(root, '.next', 'standalone', '.next')
const publicDir = path.join(root, 'public')
const standalonePublic = path.join(root, '.next', 'standalone', 'public')

async function copyDirectory(source, destination) {
  try {
    await stat(source)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }

  await mkdir(path.dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true })
}

await copyDirectory(nextStatic, path.join(standaloneNext, 'static'))
await copyDirectory(publicDir, standalonePublic)
