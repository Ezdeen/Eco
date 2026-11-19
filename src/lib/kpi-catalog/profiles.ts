// ============== ملفات المؤشرات حسب نوع المشروع ==============
//
// كل نوع مشروع ← المنهجية المقابلة في Guardian ← المؤشرات المعروضة وكيف تُربط بقيم /api/calculations.
// لإضافة نوع/منهجية جديدة: أضفها هنا (وإلى TRACKED في scripts/guardian-kpis.mjs) ثم شغّل `bun run guardian:kpis`.

import type { KpiBasis, KpiColor, KpiIcon, KpiSource } from './types.ts'

export interface ItemSpec {
  key: string
  labelAr: string
  label: string
  unit: string
  /** مسار القيمة داخل kpiCatalog الذي يعيده /api/calculations، مثل 'carbon.co2Avoided' */
  path: string
  /** يُضرب في القيمة قبل العرض (كغ → طن = 0.001، كسر → % = 100) */
  scale?: number
  decimals?: number
  basis: KpiBasis
  /** مخرج Guardian الذي يعرّف هذا المؤشر (المخطط + الحقل) */
  guardian?: { schema: string; field: string }
  /** مسار درجة الادعاء، مثل 'carbon.claimGrades.co2Avoided' */
  claimGradePath?: string
  /** الصفر يعني "لا بيانات" (لا قراءات بعد، أو تاريخ زراعة غير مسجّل) */
  zeroIsMissing?: boolean
  note?: string
  headline?: boolean
}

export interface GroupSpec {
  key: string
  title: string
  titleEn: string
  icon: KpiIcon
  color: KpiColor
  source: KpiSource
  note?: string
  items: ItemSpec[]
  /** يولّد مؤشرات "غير مطبّقة" تلقائيًا من كل مخرجات الصيغة في Guardian (لمنهجيات لم تُنفَّذ بعد) */
  autoFromGuardian?: { formulaId: string; reason: string }
}

export interface ProfileSpec {
  id: string
  formulaId: string | null
  titleAr: string
  implemented: boolean
  summary: string
  unmatchedReason?: string
  /** مصادر إضافية (أدوات Tool مثلًا) بمسار نسبي داخل مستودع Guardian */
  extraSources?: Array<{ label: string; path: string }>
  groups: GroupSpec[]
}

const CDM = 'Methodology Library/Clean Development Mechanism (CDM)'

const SOLAR_GRID: ProfileSpec = {
  id: 'solar_grid',
  formulaId: 'cdm_ams_id',
  titleAr: 'AMS-I.D — توليد كهرباء متجددة متصل بالشبكة',
  implemented: true,
  summary:
    'الإنتاج مقيس من العدادات، وأثره البيئي (CO₂e المتجنَّب) = الإنتاج × معامل الشبكة وفق AMS-I.D مع Tool 07 في Guardian. يُطبَّق على كامل الإنتاج لأن الجزء المُصدَّر والمستهلك ذاتيًا يستخدمان الصيغة نفسها. الرقم تقديري حتى تُضاف قيم OM/BM وتقييم الإضافية.',
  extraSources: [{ label: 'Guardian CDM Tool 07', path: `${CDM}/Tools/Tool 07/Tool 07.tool` }],
  groups: [
    {
      key: 'energy',
      title: 'الطاقة',
      titleEn: 'Energy',
      icon: 'zap',
      color: 'amber',
      source: 'guardian',
      items: [
        {
          key: 'energyGenerated',
          labelAr: 'الطاقة المُولّدة',
          label: 'Energy generated',
          unit: 'kWh',
          path: 'energy.energyGenerated',
          basis: 'measured',
          guardian: { schema: 'Baseline Emissions', field: 'H36' },
          zeroIsMissing: true,
          headline: true,
          note: 'مجموع قراءات العدّاد المعتمدة. وحدة Guardian هي MWh (القيمة ÷ 1000)، ويفترض AMS-I.D كهرباء صافية (معامل العدّاد→الصافي قابل للضبط في إعدادات المنهجية).',
        },
      ],
    },
    {
      key: 'carbon',
      title: 'الكربون',
      titleEn: 'Carbon',
      icon: 'leaf',
      color: 'emerald',
      source: 'guardian',
      items: [
        {
          key: 'co2Avoided',
          labelAr: 'CO₂e متجنَّب',
          label: 'Emission reductions',
          unit: 'tCO₂e',
          path: 'carbon.co2Avoided',
          scale: 0.001,
          basis: 'calculated',
          guardian: { schema: 'Emission Reductions', field: 'H114' },
          claimGradePath: 'carbon.claimGrades.co2Avoided',
          zeroIsMissing: true,
          headline: true,
          note: 'الطاقة × معامل الشبكة − انبعاثات المشروع − التسرّب (الأخيران صفر افتراضيًا لمشاريع PV).',
        },
        {
          key: 'carbonIntensity',
          labelAr: 'معامل الشبكة المُطبَّق',
          label: 'Grid emission factor',
          unit: 'kgCO₂/kWh',
          path: 'carbon.carbonIntensity',
          decimals: 4,
          basis: 'calculated',
          guardian: { schema: 'Baseline Emissions', field: 'H37' },
          zeroIsMissing: true,
          note: 'مكافئ عدديًا لـ t CO₂/MWh. يُوسَم تقديريًا ما لم يكن Combined Margin وفق Tool 07.',
        },
      ],
    },
  ],
}

const SOLAR_OFFGRID: ProfileSpec = {
  id: 'solar_offgrid',
  formulaId: 'cdm_ams_if',
  titleAr: 'AMS-I.F — كهرباء متجددة للمستخدم (بديل عن مولّد/شبكة مصغّرة)',
  implemented: false,
  summary:
    'الإنتاج مقيس من العدادات. الأثر الكربوني غير معروض لأن خط الأساس هنا بديل (مثل مولّد ديزل أو شبكة مصغّرة) ويتطلب AMS-I.F مع Tool 05، وهو غير مطبّق في حسابات المنصة بعد. مؤشرات Guardian المعرَّفة لهذه المنهجية معروضة أدناه كمؤشرات غير مفعّلة.',
  groups: [
    {
      key: 'energy',
      title: 'الطاقة',
      titleEn: 'Energy',
      icon: 'zap',
      color: 'amber',
      source: 'platform',
      items: [
        {
          key: 'energyGenerated',
          labelAr: 'الطاقة المُولّدة',
          label: 'Energy generated',
          unit: 'kWh',
          path: 'energy.energyGenerated',
          basis: 'measured',
          zeroIsMissing: true,
          headline: true,
          note: 'مجموع قراءات العدّاد المعتمدة.',
        },
      ],
    },
    {
      key: 'carbon',
      title: 'الكربون (غير مفعّل)',
      titleEn: 'Carbon (not implemented)',
      icon: 'leaf',
      color: 'emerald',
      source: 'guardian',
      items: [],
      autoFromGuardian: { formulaId: 'cdm_ams_if', reason: 'غير مطبّق في حسابات المنصة بعد (يتطلب AMS-I.F مع Tool 05).' },
    },
  ],
}

const AFFORESTATION: ProfileSpec = {
  id: 'afforestation',
  formulaId: 'cdm_ar_acm0003',
  titleAr: 'AR-ACM0003 — التشجير وإعادة التشجير (عدا الأراضي الرطبة)',
  implemented: false,
  summary:
    'مؤشرات الغطاء النباتي مُسجَّلة من بيانات المشروع. أما الإزالة الكربونية فتقدير بمعدل ثابت لكل شجرة ولا يطابق AR-ACM0003، الذي يتطلب قياس الكتلة الحيوية حقليًا؛ لذلك يُوسَم تقديريًا ولا يُستخدم كادعاء معتمد.',
  groups: [
    {
      key: 'removals',
      title: 'إزالة الكربون',
      titleEn: 'Carbon removals',
      icon: 'trees',
      color: 'green',
      source: 'guardian',
      note: 'تقدير تأشيري بمعدل CO₂ ثابت لكل شجرة وليس قياسًا للكتلة الحيوية.',
      items: [
        {
          key: 'co2Sequestered',
          labelAr: 'CO₂e ممتص (تراكمي)',
          label: 'Net removals by sinks',
          unit: 'tCO₂e',
          path: 'carbon.co2Sequestered',
          scale: 0.001,
          basis: 'estimate',
          guardian: { schema: 'Net anthropogenic GHG removals by sinks', field: 'field0' },
          claimGradePath: 'carbon.claimGrades.co2Sequestered',
          zeroIsMissing: true,
          headline: true,
          note: 'تقدير تراكمي منذ تاريخ الزراعة؛ يتطلب تاريخ زراعة مسجّلًا.',
        },
        {
          key: 'carbonSequestration',
          labelAr: 'معدل الامتصاص السنوي',
          label: 'Annual removal rate',
          unit: 'tCO₂e/سنة',
          path: 'afforestation.carbonSequestration',
          scale: 0.001,
          basis: 'estimate',
          zeroIsMissing: true,
          note: 'الأشجار الحيّة × معدل ثابت للنوع. لا مقابل مباشر له في مخرجات Guardian.',
        },
      ],
    },
    {
      key: 'vegetation',
      title: 'الغطاء النباتي',
      titleEn: 'Vegetation',
      icon: 'sprout',
      color: 'emerald',
      source: 'platform',
      items: [
        { key: 'treesPlanted', labelAr: 'أشجار مزروعة', label: 'Trees planted', unit: 'شجرة', path: 'afforestation.treesPlanted', decimals: 0, basis: 'recorded', zeroIsMissing: true, headline: true },
        { key: 'survivalRate', labelAr: 'نسبة البقاء المعتمدة', label: 'Survival rate', unit: '%', path: 'afforestation.survivalRate', scale: 100, decimals: 1, basis: 'recorded', zeroIsMissing: true, note: 'مستهدفة ومسجّلة (أو 85% افتراضيًا)، وليست مقيسة حقليًا.' },
        { key: 'restoredArea', labelAr: 'مساحة مزروعة', label: 'Planted area', unit: 'هكتار', path: 'biodiversity.restoredArea', basis: 'recorded', zeroIsMissing: true },
      ],
    },
  ],
}

const IRRIGATION: ProfileSpec = {
  id: 'smart_irrigation',
  formulaId: null,
  titleAr: 'لا توجد منهجية مطابقة في Guardian',
  implemented: false,
  unmatchedReason:
    'لم نعثر في Guardian على منهجية تطابق كفاءة مياه الري الذكي (منهجيات مياه الشرب الآمنة لا تنطبق على الري)، لذا القياسات أدناه تشغيلية محلية وليست مؤشرات مستمدة من Guardian.',
  summary: 'قياسات تشغيلية من عدادات المياه ومجسات الرطوبة. لا يقابلها مخرج في Guardian، فلا تُعرض كمؤشرات منهجية.',
  groups: [
    {
      key: 'water',
      title: 'مياه الري',
      titleEn: 'Irrigation water',
      icon: 'droplet',
      color: 'sky',
      source: 'platform',
      items: [
        { key: 'waterUsedM3', labelAr: 'مياه مستخدمة (فعلي)', label: 'Water used', unit: 'م³', path: 'irrigation.waterUsedM3', basis: 'measured', zeroIsMissing: true, headline: true, note: 'من عدّاد المياه الذكي.' },
        { key: 'waterSavedM3', labelAr: 'مياه موفَّرة', label: 'Water saved', unit: 'م³', path: 'irrigation.waterSavedM3', basis: 'calculated', headline: true, note: 'خط الأساس − المقيس.' },
        { key: 'waterSavedPct', labelAr: 'نسبة التوفير', label: 'Water savings', unit: '%', path: 'irrigation.waterSavedPct', decimals: 1, basis: 'calculated' },
        { key: 'avgSoilMoisturePct', labelAr: 'متوسط رطوبة التربة', label: 'Avg. soil moisture', unit: '%', path: 'irrigation.avgSoilMoisturePct', decimals: 1, basis: 'measured', zeroIsMissing: true, note: 'قراءات معتمدة فقط.' },
      ],
    },
  ],
}

/** projectType (كما يُخزَّن في Project.projectType) ← ملف المؤشرات */
export const PROFILES: Record<string, ProfileSpec> = {
  grid_tied: SOLAR_GRID,
  solar: SOLAR_GRID,
  hybrid: SOLAR_OFFGRID,
  off_grid: SOLAR_OFFGRID,
  afforestation: AFFORESTATION,
  smart_irrigation: IRRIGATION,
}
