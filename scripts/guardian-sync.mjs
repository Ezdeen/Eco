#!/usr/bin/env node
// مزامنة/فحص انحراف المنهجيات عن Guardian (hashgraph/guardian → Methodology Library).
//
//   node scripts/guardian-sync.mjs sync  [--guardian <path>]   يسجّل بصمات المصدر في guardian-provenance.json
//   node scripts/guardian-sync.mjs check [--guardian <path>]   يفشل (exit 1) إذا تغيّرت صيغة في Guardian
//
// إن لم يُمرَّر --guardian ولا GUARDIAN_REPO_PATH يُنسَخ المستودع (shallow) إلى .guardian-cache/.
// بلا اعتماديات خارجية: قارئ ZIP صغير مبني على zlib (ملفات .policy و .tool هي ZIP).

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROVENANCE_PATH = join(ROOT, 'src/lib/methodologies/guardian-provenance.json')
const GUARDIAN_URL = 'https://github.com/hashgraph/guardian.git'
const CDM = 'Methodology Library/Clean Development Mechanism (CDM)'

// مفتاح الصيغة في المنصة ← ملف Guardian ← اسم الملف الداخلي (policy.json أو tool.json)
const TRACKED = [
  { formulaId: 'cdm_ams_id', path: `${CDM}/CDM AMS-I.D/AMS-I.D.policy`, inner: 'policy.json' },
  { formulaId: 'cdm_ar_acm0003', path: `${CDM}/CDM AR-ACM0003/CDM AR-ACM0003.policy`, inner: 'policy.json' },
  { formulaId: 'cdm_tool_07', path: `${CDM}/Tools/Tool 07/Tool 07.tool`, inner: 'tool.json' },
]

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

// ---- قارئ ZIP (stored / deflate) ----
function readZipEntry(buf, wanted) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('not a zip file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
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
    if (name !== wanted) continue
    const lhName = buf.readUInt16LE(localOff + 26)
    const lhExtra = buf.readUInt16LE(localOff + 28)
    const data = buf.subarray(localOff + 30 + lhName + lhExtra, localOff + 30 + lhName + lhExtra + compSize)
    if (method === 0) return data
    if (method === 8) return inflateRawSync(data)
    throw new Error(`unsupported zip method ${method}`)
  }
  throw new Error(`entry ${wanted} not found in archive`)
}

function customLogicExpressions(config) {
  const out = []
  const walk = (b) => {
    if (!b || typeof b !== 'object') return
    if (b.blockType === 'customLogicBlock' && typeof b.expression === 'string') out.push({ tag: b.tag ?? '', expression: b.expression })
    for (const c of b.children ?? []) walk(c)
  }
  walk(config)
  return out.sort((a, b) => a.tag.localeCompare(b.tag))
}

function inspect(guardianDir, item) {
  const file = join(guardianDir, item.path)
  if (!existsSync(file)) throw new Error(`missing in Guardian checkout: ${item.path}`)
  const raw = readFileSync(file)
  const doc = JSON.parse(readZipEntry(raw, item.inner).toString('utf8'))
  const blocks = customLogicExpressions(doc.config)
  return {
    formulaId: item.formulaId,
    sourcePath: item.path,
    guardianName: doc.name ?? null,
    guardianVersion: doc.version ?? doc.codeVersion ?? null,
    guardianUuid: doc.uuid ?? null,
    // البصمة الدلالية: نص منطق الحساب فقط (لا تتأثر بإعادة تغليف ZIP أو تغيّر الواجهة)
    calcExpressionSha256: sha256(JSON.stringify(blocks)),
    calcBlockTags: blocks.map((b) => b.tag),
    fileSha256: sha256(raw),
  }
}

function resolveGuardianDir(argv) {
  const i = argv.indexOf('--guardian')
  const given = i >= 0 ? argv[i + 1] : process.env.GUARDIAN_REPO_PATH
  if (given) return resolve(given)
  const cache = join(ROOT, '.guardian-cache')
  if (!existsSync(cache)) execFileSync('git', ['clone', '--depth', '1', GUARDIAN_URL, cache], { stdio: 'inherit' })
  return cache
}

function gitHead(dir) {
  try { return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return null }
}

const [cmd = 'check', ...rest] = process.argv.slice(2)
const dir = resolveGuardianDir(rest)
const current = TRACKED.map((t) => inspect(dir, t))

if (cmd === 'sync') {
  const doc = { guardianRepo: GUARDIAN_URL, guardianCommit: gitHead(dir), syncedAt: new Date().toISOString(), items: current }
  writeFileSync(PROVENANCE_PATH, JSON.stringify(doc, null, 2) + '\n')
  console.log(`✓ wrote ${PROVENANCE_PATH}`)
  for (const c of current) console.log(`  ${c.formulaId.padEnd(16)} ${c.calcExpressionSha256.slice(0, 12)}  ${c.guardianName ?? ''}`)
} else if (cmd === 'check') {
  if (!existsSync(PROVENANCE_PATH)) { console.error('guardian-provenance.json not found — run `sync` first'); process.exit(2) }
  const recorded = JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'))
  let drift = 0
  for (const c of current) {
    const r = recorded.items.find((x) => x.formulaId === c.formulaId)
    if (!r) { console.error(`✗ ${c.formulaId}: not recorded`); drift++; continue }
    if (r.calcExpressionSha256 !== c.calcExpressionSha256) {
      console.error(`✗ ${c.formulaId}: Guardian calculation logic CHANGED (${r.calcExpressionSha256.slice(0, 12)} → ${c.calcExpressionSha256.slice(0, 12)}) — راجع الصيغة في src/lib/methodologies ثم ارفع REVISION وأعد sync`)
      drift++
    } else console.log(`✓ ${c.formulaId}: in sync`)
  }
  process.exit(drift ? 1 : 0)
} else {
  console.error('usage: guardian-sync.mjs <sync|check> [--guardian <path>]'); process.exit(2)
}
