#!/usr/bin/env node
// يولّد تعريفات مؤشرات الأداء (KPI) من سياسات Guardian نفسها بدل كتابتها يدويًا في الواجهة.
//
//   node scripts/guardian-kpis.mjs sync  [--guardian <path>]   يكتب src/lib/methodologies/guardian-kpis.json
//   node scripts/guardian-kpis.mjs check [--guardian <path>]   يفشل (exit 1) إذا تغيّر تعريف مؤشر في Guardian
//
// لكل سياسة مُتتبَّعة نقرأ مخططات المخرجات (Emission Reductions، Net GHG removals ...) ونستخرج
// اسم الحقل ووصفه ووحدته كما كتبها واضعو السياسة. كتالوج المنصة يربط هذه التعريفات بقيمها المحسوبة
// (src/lib/kpi-catalog) فتظهر في الواجهة بمصدرها الحقيقي، ويكشف `check` أي انحراف عند تحديث Guardian.

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CDM, GUARDIAN_URL, ROOT, gitHead, listZipEntries, resolveGuardianDir } from './lib/guardian.mjs'

const OUT_PATH = join(ROOT, 'src/lib/methodologies/guardian-kpis.json')
const GITHUB_BLOB = 'https://github.com/hashgraph/guardian/blob'

// formulaId ← ملف السياسة ← المخططات والحقول التي تمثّل "مخرجات" قابلة للعرض كمؤشرات.
const TRACKED = [
  {
    formulaId: 'cdm_ams_id',
    path: `${CDM}/CDM AMS-I.D/AMS-I.D.policy`,
    outputs: [
      { schema: 'Emission Reductions', fields: ['H114', 'H115', 'H116', 'H117'] },
      { schema: 'Baseline Emissions', fields: ['H36', 'H37'] },
    ],
  },
  {
    formulaId: 'cdm_ar_acm0003',
    path: `${CDM}/CDM AR-ACM0003/CDM AR-ACM0003.policy`,
    outputs: [
      { schema: 'Net anthropogenic GHG removals by sinks', fields: ['field0'] },
      { schema: 'Baseline Scenario Net GHG Removals', fields: ['field0'] },
      { schema: 'Project Scenario Net GHG Removals', fields: ['field0', 'field1'] },
    ],
  },
  {
    // غير مطبّقة في حسابات المنصة بعد؛ تُعرض تعريفاتها للمشاريع الهجينة/المعزولة كمؤشرات "غير مفعّلة".
    formulaId: 'cdm_ams_if',
    path: `${CDM}/CDM AMS-I.F/CDM AMS-I.F Policy.policy`,
    outputs: [{ schema: 'Monitoring Report', fields: ['field15', 'field16', 'field17', 'field18'] }],
  },
]

const sha256 = (v) => createHash('sha256').update(v).digest('hex')

/** يفصل الوحدة عن الوصف: "... (t CO2)" أو "...; t CO2-e". */
export function splitDescription(description) {
  const text = String(description ?? '').replace(/\s+/g, ' ').trim()
  let m = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/)
  if (m && m[2].trim()) return { label: m[1].trim(), unit: m[2].trim() }
  m = text.match(/^(.*);\s*([^;]+)$/)
  if (m) return { label: m[1].trim().replace(/,$/, ''), unit: m[2].trim() }
  return { label: text, unit: null }
}

function inspect(guardianDir, item) {
  const file = join(guardianDir, item.path)
  if (!existsSync(file)) throw new Error(`missing in Guardian checkout: ${item.path}`)
  const raw = readFileSync(file)
  const entries = listZipEntries(raw)
  const policy = JSON.parse(entries.find((e) => e.name === 'policy.json').read().toString('utf8'))

  const schemas = new Map()
  for (const e of entries) {
    if (!e.name.startsWith('schemas/') || !e.name.endsWith('.json')) continue
    const s = JSON.parse(e.read().toString('utf8'))
    const doc = typeof s.document === 'string' ? JSON.parse(s.document) : s.document
    if (s.name && doc?.properties) schemas.set(s.name, doc.properties)
  }

  const outputs = []
  for (const { schema, fields } of item.outputs) {
    const props = schemas.get(schema)
    if (!props) throw new Error(`${item.formulaId}: schema "${schema}" not found in Guardian policy`)
    for (const field of fields) {
      const prop = props[field]
      if (!prop?.description) throw new Error(`${item.formulaId}: field ${schema}.${field} missing or has no description`)
      outputs.push({ schema, field, description: String(prop.description).replace(/\s+/g, ' ').trim(), ...splitDescription(prop.description) })
    }
  }
  return {
    formulaId: item.formulaId,
    policyName: policy.name ?? null,
    policyUuid: policy.uuid ?? null,
    sourcePath: item.path,
    outputs,
    // بصمة التعريفات فقط (لا تتأثر بإعادة تغليف ZIP)
    definitionsSha256: sha256(JSON.stringify(outputs)),
  }
}

const [cmd = 'check', ...rest] = process.argv.slice(2)
const dir = resolveGuardianDir(rest)
const current = TRACKED.map((t) => inspect(dir, t))

if (cmd === 'sync') {
  const commit = gitHead(dir)
  const doc = {
    guardianRepo: GUARDIAN_URL,
    guardianCommit: commit,
    syncedAt: new Date().toISOString(),
    sourceUrlBase: commit ? `${GITHUB_BLOB}/${commit}` : null,
    policies: Object.fromEntries(current.map((c) => [c.formulaId, c])),
  }
  writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2) + '\n')
  console.log(`✓ wrote ${OUT_PATH}`)
  for (const c of current) console.log(`  ${c.formulaId.padEnd(16)} ${String(c.outputs.length).padStart(2)} KPI  ${c.policyName ?? ''}`)
} else if (cmd === 'check') {
  if (!existsSync(OUT_PATH)) { console.error('guardian-kpis.json not found — run `sync` first'); process.exit(2) }
  const recorded = JSON.parse(readFileSync(OUT_PATH, 'utf8'))
  let drift = 0
  for (const c of current) {
    const r = recorded.policies?.[c.formulaId]
    if (!r) { console.error(`✗ ${c.formulaId}: not recorded`); drift++; continue }
    if (r.definitionsSha256 !== c.definitionsSha256) {
      console.error(`✗ ${c.formulaId}: Guardian KPI definitions CHANGED — راجع ربط المؤشرات في src/lib/kpi-catalog ثم شغّل sync`)
      drift++
    } else console.log(`✓ ${c.formulaId}: KPI definitions in sync`)
  }
  process.exit(drift ? 1 : 0)
} else {
  console.error('usage: guardian-kpis.mjs <sync|check> [--guardian <path>]'); process.exit(2)
}
