import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildGuardianKpiCatalog } from './build.ts'
import type { GuardianKpiFile } from './types.ts'

const file = JSON.parse(readFileSync(new URL('../methodologies/guardian-kpis.json', import.meta.url), 'utf8')) as GuardianKpiFile

const kpis = {
  energy: { energyGenerated: 12000 },
  carbon: { co2Avoided: 5400, carbonIntensity: 0.45, co2Sequestered: 2500, claimGrades: { co2Avoided: 'indicative', co2Sequestered: 'indicative' } },
  afforestation: { treesPlanted: 100, survivalRate: 0.85, carbonSequestration: 2100 },
  biodiversity: { restoredArea: 2 },
  irrigation: { waterUsedM3: 50, waterSavedM3: 10, waterSavedPct: 16.6, avgSoilMoisturePct: 31 },
}
const build = (projectType: string, k: unknown = kpis) => buildGuardianKpiCatalog({ projectType, kpiCatalog: k, guardianKpis: file })

test('solar: يربط الإنتاج والكربون بمخرجات AMS-I.D ويحوّل الكغ إلى طن', () => {
  const c = build('grid_tied')
  const co2 = c.groups.flatMap((g) => g.items).find((i) => i.key === 'co2Avoided')!
  assert.equal(co2.value, 5.4)
  assert.equal(co2.guardian?.field, 'H114')
  assert.equal(co2.claimGrade, 'indicative')
  assert.equal(c.methodology.formulaId, 'cdm_ams_id')
  assert.deepEqual(c.headline.map((i) => i.key), ['energyGenerated', 'co2Avoided'])
  // مخرجات AMS-I.D غير المربوطة (خط الأساس/المشروع/التسرّب) تُكشف كفجوة تغطية
  assert.deepEqual(c.coverage.unbound.map((u) => u.field).sort(), ['H115', 'H116', 'H117'])
  assert.equal(c.coverage.guardianBound, 3)
})

test('solar و grid_tied يعطيان الكتالوج نفسه', () => {
  assert.deepEqual({ ...build('solar'), projectType: '' }, { ...build('grid_tied'), projectType: '' })
})

test('hybrid/off_grid: الكربون غير مطبّق ويُولَّد من تعريفات AMS-I.F', () => {
  const c = build('off_grid')
  const carbon = c.groups.find((g) => g.key === 'carbon')!
  assert.equal(carbon.items.length, 4)
  assert.ok(carbon.items.every((i) => i.status === 'not_implemented' && i.value === null && i.guardian?.formulaId === 'cdm_ams_if'))
  assert.equal(carbon.items[0].labelAr, 'الانبعاثات المخفَّضة')
  assert.equal(c.methodology.implemented, false)
})

test('afforestation: الإزالة تقديرية ومربوطة بـ AR-ACM0003 والنسبة تتحول إلى %', () => {
  const c = build('afforestation')
  const items = c.groups.flatMap((g) => g.items)
  const rem = items.find((i) => i.key === 'co2Sequestered')!
  assert.equal(rem.value, 2.5)
  assert.equal(rem.basis, 'estimate')
  assert.equal(rem.guardian?.formulaId, 'cdm_ar_acm0003')
  assert.equal(items.find((i) => i.key === 'survivalRate')!.value, 85)
  assert.equal(items.find((i) => i.key === 'survivalRate')!.source, 'platform')
})

test('irrigation: لا منهجية في Guardian والمؤشرات كلها platform', () => {
  const c = build('smart_irrigation')
  assert.equal(c.methodology.formulaId, null)
  assert.ok(c.methodology.unmatchedReason)
  assert.ok(c.groups.flatMap((g) => g.items).every((i) => i.source === 'platform'))
  assert.equal(c.coverage.guardianTotal, 0)
})

test('الصفر لمؤشر zeroIsMissing يصبح no_data وليس 0', () => {
  const c = build('grid_tied', { energy: { energyGenerated: 0 }, carbon: { co2Avoided: 0, carbonIntensity: 0 } })
  assert.ok(c.groups.flatMap((g) => g.items).every((i) => i.status === 'no_data' && i.value === null))
})

test('نوع غير معروف يعيد كتالوجًا فارغًا بدل أن يفشل', () => {
  const c = build('wind')
  assert.equal(c.groups.length, 0)
  assert.match(c.summary, /لا يوجد ملف مؤشرات/)
})
