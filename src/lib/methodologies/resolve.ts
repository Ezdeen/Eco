// ============== ربط المنهجيات بقاعدة البيانات (نسخ ثابتة + بصمات Guardian) ==============
//
// المبدأ: لا تُحسب أي عملية كربون بمعاملات مُدمجة في الكود. تُحلّ "نسخة المنهجية السارية"
// من جدول MethodologyVersion، ويُخزَّن معرّفها وبصمتها (contentHash) في CalculationRun.
// تعديل أي معامل = publishMethodologyVersion() ⇒ صف جديد ⇒ بصمة جديدة ⇒ تُوسَم العمليات
// القديمة "stale" في التقارير وتُعاد من خلال /api/calculations عند الطلب.

import { createHash } from 'crypto'
import { db } from '@/lib/db'
import provenance from './guardian-provenance.json'
import { computeCombinedMargin, type CmPlantClass } from './tool07'
import { FORMULAS, computeMethodologyContentHash } from './registry'

export interface ResolvedMethodology {
  methodologyId: string
  code: string
  name: string
  versionId: string
  versionNumber: number
  formulaId: string
  formulaRevision: number
  parameters: Record<string, number | string | boolean>
  contentHash: string
  guardian: {
    policy: string
    sourcePath: string
    tools: string[]
    sourceHash: string | null
    commit: string | null
    policyUuid: string | null
  }
  /** نص قصير يُخزَّن في CalculationRun.methodologyVersion */
  label: string
}

type ProvItem = { formulaId: string; sourcePath: string; guardianUuid: string | null; calcExpressionSha256: string }

function guardianSourceFor(formulaId: string): { hash: string | null; uuid: string | null; commit: string | null } {
  const meta = FORMULAS[formulaId]
  if (!meta) return { hash: null, uuid: null, commit: null }
  const items = (provenance.items as ProvItem[]).filter((i) => meta.provenanceKeys.includes(i.formulaId))
  if (items.length !== meta.provenanceKeys.length) return { hash: null, uuid: null, commit: provenance.guardianCommit ?? null }
  const combined = createHash('sha256')
    .update(items.map((i) => i.calcExpressionSha256).sort().join('|'))
    .digest('hex')
  return { hash: combined, uuid: items[0]?.guardianUuid ?? null, commit: provenance.guardianCommit ?? null }
}

function parseParams(json: string): Record<string, number | string | boolean> {
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

/** ينشئ المنهجية والنسخة 1 من السجل إن لم تكونا موجودتين (آمن للاستدعاء المتكرر). */
export async function ensureDefaultMethodology(formulaId: string): Promise<void> {
  const meta = FORMULAS[formulaId]
  if (!meta) throw new Error(`Unknown methodology formula: ${formulaId}`)

  const methodology = await db.methodology.upsert({
    where: { code: formulaId },
    update: {},
    create: {
      code: formulaId,
      name: meta.title,
      nameAr: meta.titleAr,
      version: '1',
      frameworkRef: `CDM / Guardian: ${meta.guardian.policy}`,
      formulaId,
      validFrom: new Date('2024-01-01'),
    },
  })

  const existing = await db.methodologyVersion.count({ where: { methodologyId: methodology.id } })
  if (existing > 0) return

  const g = guardianSourceFor(formulaId)
  const parameters = { ...meta.defaultParameters }
  await db.methodologyVersion.create({
    data: {
      methodologyId: methodology.id,
      version: 1,
      formulaId,
      formulaRevision: meta.revision,
      parameters: JSON.stringify(parameters),
      guardianSourcePath: meta.guardian.sourcePath,
      guardianPolicyUuid: g.uuid,
      guardianSourceHash: g.hash,
      guardianCommit: g.commit,
      contentHash: computeMethodologyContentHash({
        formulaId,
        formulaRevision: meta.revision,
        parameters,
        guardianSourceHash: g.hash,
      }),
      changeNote: 'Initial version (defaults from methodology registry)',
      validFrom: new Date('2024-01-01'),
    },
  })
}

/** النسخة المعتمدة السارية في تاريخ معيّن. */
export async function resolveMethodologyVersion(code: string, date: Date = new Date()): Promise<ResolvedMethodology> {
  await ensureDefaultMethodology(code)
  const methodology = await db.methodology.findUniqueOrThrow({ where: { code } })

  const v = await db.methodologyVersion.findFirst({
    where: {
      methodologyId: methodology.id,
      status: 'approved',
      validFrom: { lte: date },
      OR: [{ validTo: null }, { validTo: { gte: date } }],
    },
    orderBy: { version: 'desc' },
  })
  if (!v) throw new Error(`No approved version of methodology ${code} valid on ${date.toISOString()}`)

  const meta = FORMULAS[v.formulaId]
  return {
    methodologyId: methodology.id,
    code,
    name: methodology.name,
    versionId: v.id,
    versionNumber: v.version,
    formulaId: v.formulaId,
    formulaRevision: v.formulaRevision,
    parameters: { ...(meta?.defaultParameters ?? {}), ...parseParams(v.parameters) },
    contentHash: v.contentHash,
    guardian: {
      policy: meta?.guardian.policy ?? v.formulaId,
      sourcePath: v.guardianSourcePath ?? meta?.guardian.sourcePath ?? '',
      tools: meta?.guardian.tools ?? [],
      sourceHash: v.guardianSourceHash,
      commit: v.guardianCommit,
      policyUuid: v.guardianPolicyUuid,
    },
    label: `${code}@v${v.version}`,
  }
}

/**
 * أي تعديل على منهجية (معاملات، افتراضات، أو إعادة مزامنة مع Guardian) يمرّ من هنا:
 * ينشئ نسخة جديدة، ويُغلق صلاحية السابقة، ولا يعدّل أي صف قديم.
 */
export async function publishMethodologyVersion(args: {
  code: string
  parameterChanges?: Record<string, number | string | boolean>
  changeNote: string
  createdBy?: string
}): Promise<ResolvedMethodology> {
  const current = await resolveMethodologyVersion(args.code)
  const meta = FORMULAS[current.formulaId]
  if (!meta) throw new Error(`Unknown methodology formula: ${current.formulaId}`)

  const parameters = { ...current.parameters, ...(args.parameterChanges ?? {}) }
  const g = guardianSourceFor(current.formulaId)
  const contentHash = computeMethodologyContentHash({
    formulaId: current.formulaId,
    formulaRevision: meta.revision,
    parameters,
    guardianSourceHash: g.hash,
  })
  if (contentHash === current.contentHash) return current // لا تغيير فعلي ⇒ لا نسخة جديدة

  const now = new Date()
  await db.$transaction([
    db.methodologyVersion.update({ where: { id: current.versionId }, data: { validTo: now } }),
    db.methodologyVersion.create({
      data: {
        methodologyId: current.methodologyId,
        version: current.versionNumber + 1,
        formulaId: current.formulaId,
        formulaRevision: meta.revision,
        parameters: JSON.stringify(parameters),
        guardianSourcePath: meta.guardian.sourcePath,
        guardianPolicyUuid: g.uuid,
        guardianSourceHash: g.hash,
        guardianCommit: g.commit,
        contentHash,
        changeNote: args.changeNote,
        validFrom: now,
        createdBy: args.createdBy,
      },
    }),
  ])
  return resolveMethodologyVersion(args.code, now)
}

/** اختيار المنهجية الكربونية لمشروع: تجاوز صريح ← حقل المشروع ← الافتراضي حسب النوع. */
export function resolveCarbonMethodologyCode(project: { projectType?: string | null; methodology?: string | null }, requested?: string | null): string {
  for (const candidate of [requested, project.methodology]) {
    if (candidate && FORMULAS[candidate]) return candidate
  }
  return project.projectType === 'afforestation' ? 'cdm_ar_acm0003' : 'cdm_ams_id'
}

// ---------- معامل الشبكة الفعّال (Tool 07) ----------

export interface EffectiveGridFactor {
  /** صافي الكهرباء = قراءة العدّاد (عند العاكس) × هذا المعامل؛ 1 = بلا خصم */
  meterToNetFactor: number
  /** tCO2/MWh ≡ kgCO2/kWh */
  factor: number
  isCombinedMargin: boolean
  basis: 'combined_margin' | 'average_grid_factor'
  omFactor: number | null
  bmFactor: number | null
  weights: { wOM: number; wBM: number } | null
}

export function effectiveGridFactor(
  ef: { factor: number; omFactor?: number | null; bmFactor?: number | null },
  parameters: Record<string, number | string | boolean>,
): EffectiveGridFactor {
  const rawNet = Number(parameters.meterToNetFactor ?? 1)
  const meterToNetFactor = rawNet > 0 && rawNet <= 1 ? rawNet : 1
  if (ef.omFactor != null && ef.bmFactor != null) {
    const cm = computeCombinedMargin({
      omFactor: ef.omFactor,
      bmFactor: ef.bmFactor,
      plantClass: (parameters.plantClass as CmPlantClass) ?? 'wind_solar',
      firstCreditingPeriod: parameters.firstCreditingPeriod !== false,
    })
    return {
      meterToNetFactor,
      factor: cm.efCm,
      isCombinedMargin: true,
      basis: 'combined_margin',
      omFactor: ef.omFactor,
      bmFactor: ef.bmFactor,
      weights: { wOM: cm.wOM, wBM: cm.wBM },
    }
  }
  return { meterToNetFactor, factor: ef.factor, isCombinedMargin: false, basis: 'average_grid_factor', omFactor: null, bmFactor: null, weights: null }
}

// ---------- كشف التقادم (Stale) ----------

export interface RunStaleness {
  runId: string
  stale: boolean
  reason: 'current' | 'methodology_updated' | 'legacy_unversioned' | 'guardian_logic_updated'
  currentVersionLabel?: string
}

export async function evaluateRunStaleness(
  runs: Array<{ id: string; periodStart: Date; methodologyHash: string | null; methodologyVersionId: string | null }>,
  code: string,
): Promise<RunStaleness[]> {
  const out: RunStaleness[] = []
  const current = await resolveMethodologyVersion(code, new Date())
  for (const r of runs) {
    if (!r.methodologyHash || !r.methodologyVersionId) {
      out.push({ runId: r.id, stale: true, reason: 'legacy_unversioned' })
      continue
    }
    if (current.contentHash === r.methodologyHash) {
      out.push({ runId: r.id, stale: false, reason: 'current', currentVersionLabel: current.label })
      continue
    }
    const used = await db.methodologyVersion.findUnique({ where: { id: r.methodologyVersionId }, select: { guardianSourceHash: true } })
    const guardianChanged = !!used && used.guardianSourceHash !== current.guardian.sourceHash
    out.push({
      runId: r.id,
      stale: true,
      reason: guardianChanged ? 'guardian_logic_updated' : 'methodology_updated',
      currentVersionLabel: current.label,
    })
  }
  return out
}
