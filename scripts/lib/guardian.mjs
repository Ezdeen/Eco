// أدوات مشتركة للتعامل مع مستودع Guardian (hashgraph/guardian → Methodology Library).
// تُستخدم من guardian-sync.mjs (بصمات الصيغ) ومن guardian-kpis.mjs (تعريفات المؤشرات).
// بلا اعتماديات خارجية: قارئ ZIP صغير مبني على zlib (ملفات .policy و .tool هي ZIP).

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const GUARDIAN_URL = 'https://github.com/hashgraph/guardian.git'
export const CDM = 'Methodology Library/Clean Development Mechanism (CDM)'

/** يفتح مدخلات ZIP (stored / deflate) ويعيدها كقائمة {name, read()}. */
export function listZipEntries(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('not a zip file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const entries = []
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory')
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    entries.push({
      name,
      read() {
        const lhName = buf.readUInt16LE(localOff + 26)
        const lhExtra = buf.readUInt16LE(localOff + 28)
        const data = buf.subarray(localOff + 30 + lhName + lhExtra, localOff + 30 + lhName + lhExtra + compSize)
        if (method === 0) return data
        if (method === 8) return inflateRawSync(data)
        throw new Error(`unsupported zip method ${method}`)
      },
    })
  }
  return entries
}

export function readZipEntry(buf, wanted) {
  const hit = listZipEntries(buf).find((e) => e.name === wanted)
  if (!hit) throw new Error(`entry ${wanted} not found in archive`)
  return hit.read()
}

export function resolveGuardianDir(argv) {
  const i = argv.indexOf('--guardian')
  const given = i >= 0 ? argv[i + 1] : process.env.GUARDIAN_REPO_PATH
  if (given) return resolve(given)
  const cache = join(ROOT, '.guardian-cache')
  if (!existsSync(cache)) execFileSync('git', ['clone', '--depth', '1', GUARDIAN_URL, cache], { stdio: 'inherit' })
  return cache
}

export function gitHead(dir) {
  try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return null }
}
