import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireAuth, requirePermission } from '@/lib/authorization'
import { FORMULAS } from '@/lib/methodologies'
import { ensureDefaultMethodology, publishMethodologyVersion } from '@/lib/methodologies/resolve'
import provenance from '@/lib/methodologies/guardian-provenance.json'

// GET /api/methodologies — المنهجيات المسجّلة، نسخها، ومرجع Guardian لكل منها (قراءة لأي مستخدم مسجّل).
export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.authorized) return auth.response

    for (const id of Object.keys(FORMULAS)) await ensureDefaultMethodology(id)

    const methodologies = await db.methodology.findMany({
      where: { formulaId: { not: null } },
      include: { versions: { orderBy: { version: 'desc' } } },
      orderBy: { code: 'asc' },
    })

    return NextResponse.json({
      methodologies: methodologies.map((m) => ({
        code: m.code,
        name: m.name,
        nameAr: m.nameAr,
        formula: m.formulaId ? FORMULAS[m.formulaId] ?? null : null,
        versions: m.versions.map((v) => ({
          version: v.version,
          status: v.status,
          validFrom: v.validFrom,
          validTo: v.validTo,
          contentHash: v.contentHash,
          parameters: JSON.parse(v.parameters),
          guardianSourcePath: v.guardianSourcePath,
          guardianSourceHash: v.guardianSourceHash,
          guardianCommit: v.guardianCommit,
          changeNote: v.changeNote,
        })),
      })),
      guardianProvenance: { repo: provenance.guardianRepo, commit: provenance.guardianCommit, syncedAt: provenance.syncedAt },
    })
  } catch (error) {
    console.error('Methodologies GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const publishSchema = z.object({
  code: z.string().min(1),
  changeNote: z.string().min(3),
  parameterChanges: z.record(z.string(), z.union([z.number().finite(), z.string(), z.boolean()])).optional(),
})

// POST /api/methodologies — نشر نسخة جديدة (تعديل معاملات/افتراضات). لا يُعدَّل أي صف قديم؛
// العمليات التي حُسبت بالنسخة السابقة تُوسَم stale في التقارير حتى تُعاد.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission('methodology:manage')
    if (!auth.authorized) return auth.response

    // جدول المنهجيات مشترك بين كل المؤسسات (مثل reference-data)؛ تعديله يغيّر حسابات الجميع.
    // هذا جدول مشترك بين المؤسسات؛ تعطيل النشر افتراضيًا يمنع أي مدير مؤسسة من تغيير حسابات الجميع.
    const allowList = (process.env.METHODOLOGY_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    if (allowList.length === 0) {
      return NextResponse.json({ error: 'نشر المنهجيات معطّل حتى ضبط METHODOLOGY_ADMIN_EMAILS' }, { status: 503 })
    }
    if (!allowList.includes(auth.user.email.toLowerCase())) {
      return NextResponse.json({ error: 'نشر نسخ المنهجيات مقصور على مشرفي المنصة' }, { status: 403 })
    }

    const parsed = publishSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'بيانات غير صالحة', details: parsed.error.flatten() }, { status: 400 })
    }
    const { code, changeNote, parameterChanges } = parsed.data
    const formula = FORMULAS[code]
    if (!formula) return NextResponse.json({ error: `منهجية غير معروفة: ${code}` }, { status: 404 })

    for (const [key, value] of Object.entries(parameterChanges ?? {})) {
      const defaultValue = formula.defaultParameters[key]
      if (defaultValue === undefined || typeof value !== typeof defaultValue) {
        return NextResponse.json({ error: `معامل غير معروف أو نوعه غير صالح: ${key}` }, { status: 400 })
      }
      if (typeof value === 'number') {
        if (key === 'carbonFraction' && !(value > 0 && value < 1)) {
          return NextResponse.json({ error: 'carbonFraction يجب أن يكون بين 0 و1' }, { status: 400 })
        }
        if ((key === 'deadWoodFraction' || key === 'litterFraction') && !(value >= 0 && value <= 1)) {
          return NextResponse.json({ error: `${key} يجب أن يكون بين 0 و1` }, { status: 400 })
        }
        if (key === 'meterToNetFactor' && !(value > 0 && value <= 1)) {
          return NextResponse.json({ error: 'meterToNetFactor يجب أن يكون أكبر من 0 وحتى 1' }, { status: 400 })
        }
        if ((key === 'projectEmissions' || key === 'leakage') && value < 0) {
          return NextResponse.json({ error: `${key} يجب ألا يكون سالبًا` }, { status: 400 })
        }
      } else if (key === 'plantClass' && value !== 'wind_solar' && value !== 'other') {
        return NextResponse.json({ error: 'plantClass غير صالح' }, { status: 400 })
      }
    }

    const before = await db.methodologyVersion.count({ where: { methodology: { code } } })
    const resolved = await publishMethodologyVersion({ code, changeNote, parameterChanges, createdBy: auth.user.userId })
    const created = (await db.methodologyVersion.count({ where: { methodology: { code } } })) > before

    return NextResponse.json({
      success: true,
      created,
      version: resolved.versionNumber,
      contentHash: resolved.contentHash,
      note: created
        ? 'أُنشئت نسخة جديدة. عمليات الحساب السابقة ستظهر "بحاجة لإعادة التشغيل" في التقارير.'
        : 'لا تغيير فعلي في المعاملات؛ لم تُنشأ نسخة جديدة.',
    })
  } catch (error) {
    console.error('Methodologies POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
