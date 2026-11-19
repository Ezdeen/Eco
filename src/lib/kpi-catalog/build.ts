// بناء الكتالوج: نقي (بلا قاعدة بيانات ولا I/O) حتى يُختبر بسهولة ويُستخدم من الـ API.

import { PROFILES, type GroupSpec, type ItemSpec, type ProfileSpec } from './profiles.ts'
import type {
  CatalogGroup,
  CatalogItem,
  ClaimGrade,
  GuardianKpiCatalog,
  GuardianKpiFile,
  GuardianKpiOutput,
  GuardianKpiRef,
} from './types.ts'

const get = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

// عناوين عربية للمخرجات الشائعة حين تُولَّد المؤشرات تلقائيًا من Guardian؛ ما لا يطابق يبقى بعنوان Guardian الأصلي.
const AR_LABELS: Array<[RegExp, string]> = [
  [/^Emission reductions/i, 'الانبعاثات المخفَّضة'],
  [/^Baseline emissions/i, 'انبعاثات خط الأساس'],
  [/^Project emissions/i, 'انبعاثات المشروع'],
  [/^Leakage emissions/i, 'انبعاثات التسرّب'],
]
const arLabel = (label: string) => AR_LABELS.find(([re]) => re.test(label))?.[1] ?? label

function toRef(file: GuardianKpiFile, formulaId: string, o: GuardianKpiOutput): GuardianKpiRef {
  const policy = file.policies[formulaId]
  return {
    formulaId,
    policy: policy?.policyName ?? formulaId,
    schema: o.schema,
    field: o.field,
    label: o.label,
    unit: o.unit,
    description: o.description,
    sourceUrl: file.sourceUrlBase && policy ? `${file.sourceUrlBase}/${encodeURI(policy.sourcePath)}` : null,
  }
}

function buildItem(spec: ItemSpec, group: GroupSpec, profile: ProfileSpec, kpis: unknown, file: GuardianKpiFile): CatalogItem {
  const raw = get(kpis, spec.path)
  const scaled = isNum(raw) ? raw * (spec.scale ?? 1) : null
  const missing = scaled === null || (spec.zeroIsMissing === true && scaled === 0)

  let guardian: GuardianKpiRef | undefined
  let note = spec.note
  if (spec.guardian && profile.formulaId) {
    const out = file.policies[profile.formulaId]?.outputs.find((o) => o.schema === spec.guardian!.schema && o.field === spec.guardian!.field)
    if (out) guardian = toRef(file, profile.formulaId, out)
    else note = `${note ? note + ' ' : ''}(تعريف Guardian لهذا المؤشر لم يعد موجودًا؛ شغّل guardian:kpis:check)`
  }

  const grade = spec.claimGradePath ? get(kpis, spec.claimGradePath) : undefined
  const claimGrade: ClaimGrade | undefined = grade === 'methodology_compliant' || grade === 'indicative' ? grade : undefined

  return {
    key: spec.key,
    labelAr: spec.labelAr,
    label: spec.label,
    unit: spec.unit,
    value: missing ? null : scaled,
    decimals: spec.decimals ?? 2,
    status: missing ? 'no_data' : 'available',
    basis: spec.basis,
    source: guardian ? 'guardian' : 'platform',
    claimGrade,
    note,
    guardian,
  }
}

function buildGroup(group: GroupSpec, profile: ProfileSpec, kpis: unknown, file: GuardianKpiFile): CatalogGroup {
  const items = group.items.map((s) => buildItem(s, group, profile, kpis, file))
  if (group.autoFromGuardian) {
    const { formulaId, reason } = group.autoFromGuardian
    for (const o of file.policies[formulaId]?.outputs ?? []) {
      items.push({
        key: `${formulaId}.${o.schema}.${o.field}`,
        labelAr: arLabel(o.label),
        label: o.label,
        unit: o.unit ?? '',
        value: null,
        decimals: 2,
        status: 'not_implemented',
        basis: 'calculated',
        source: 'guardian',
        note: reason,
        guardian: toRef(file, formulaId, o),
      })
    }
  }
  return { key: group.key, title: group.title, titleEn: group.titleEn, icon: group.icon, color: group.color, source: group.source, note: group.note, items }
}

export function buildGuardianKpiCatalog(input: {
  projectType: string | null | undefined
  /** كائن kpiCatalog كما يعيده GET /api/calculations */
  kpiCatalog: unknown
  guardianKpis: GuardianKpiFile
}): GuardianKpiCatalog {
  const { guardianKpis: file } = input
  const projectType = input.projectType ?? ''
  const profile = PROFILES[projectType]
  const provenance = { repo: file.guardianRepo, commit: file.guardianCommit, syncedAt: file.syncedAt }

  if (!profile) {
    return {
      projectType,
      summary: 'لا يوجد ملف مؤشرات مهيأ لنوع هذا المشروع في الكتالوج حاليًا.',
      methodology: { formulaId: null, titleAr: 'غير محدد', implemented: false, sources: [] },
      headline: [],
      groups: [],
      coverage: { guardianTotal: 0, guardianBound: 0, unbound: [] },
      provenance,
    }
  }

  const groups = profile.groups.map((g) => buildGroup(g, profile, input.kpiCatalog, file))
  const allItems = groups.flatMap((g) => g.items)

  const policy = profile.formulaId ? file.policies[profile.formulaId] : undefined
  const bound = new Set(allItems.filter((i) => i.guardian && i.status !== 'not_implemented').map((i) => `${i.guardian!.schema}|${i.guardian!.field}`))
  const unbound = (policy?.outputs ?? [])
    .filter((o) => !bound.has(`${o.schema}|${o.field}`))
    // المؤشرات المولَّدة تلقائيًا (غير مطبّقة) تظهر في المجموعات، فلا تُكرَّر هنا
    .filter((o) => !allItems.some((i) => i.status === 'not_implemented' && i.guardian?.schema === o.schema && i.guardian?.field === o.field))
    .map((o) => toRef(file, profile.formulaId!, o))

  const sources: Array<{ label: string; url: string }> = []
  if (policy && file.sourceUrlBase) sources.push({ label: `Guardian ${policy.policyName ?? profile.formulaId}`, url: `${file.sourceUrlBase}/${encodeURI(policy.sourcePath)}` })
  if (file.sourceUrlBase) for (const s of profile.extraSources ?? []) sources.push({ label: s.label, url: `${file.sourceUrlBase}/${encodeURI(s.path)}` })

  return {
    projectType,
    summary: profile.summary,
    methodology: { formulaId: profile.formulaId, titleAr: profile.titleAr, implemented: profile.implemented, sources, unmatchedReason: profile.unmatchedReason },
    headline: allItems.filter((i) => profile.groups.some((g) => g.items.some((s) => s.key === i.key && s.headline))),
    groups,
    coverage: {
      guardianTotal: policy?.outputs.length ?? 0,
      guardianBound: policy ? policy.outputs.length - unbound.length - allItems.filter((i) => i.status === 'not_implemented').length : 0,
      unbound,
    },
    provenance,
  }
}
