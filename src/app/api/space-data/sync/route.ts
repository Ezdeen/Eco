import { NextRequest, NextResponse } from 'next/server'
import { runSpaceDataSync, FetchRun } from '@/lib/space-data/sync'
import { requirePermission } from '@/lib/authorization'
import crypto from 'crypto'

// /api/space-data/sync — يشغّل دورة سحب كاملة للبيانات الفضائية لجميع المشاريع.
//
// يمكن استدعاؤه بطريقتين:
// 1) GET من Vercel Cron (راجع vercel.json) — Vercel يضبط تلقائيًا
//    Authorization: Bearer $CRON_SECRET إذا عُرِّف متغيّر البيئة CRON_SECRET.
//    الأوقات المُجدولة (UTC): 07:55 و12:55 و14:50 ≈ 10:55/15:55/17:50 بتوقيت الرياض (UTC+3).
// 2) POST يدويًا من قسم "البيانات الفضائية" بواسطة مستخدم مخوّل (صلاحية settings:manage).

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

async function handleSync(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization') || ''
  // CRON_SECRET: الاسم القياسي الذي يستخدمه Vercel Cron تلقائيًا.
  // SPACE_DATA_CRON_SECRET: بديل صريح عند استخدام مُجدوِل خارجي غير Vercel.
  const cronSecret = process.env.CRON_SECRET || process.env.SPACE_DATA_CRON_SECRET
  const isCronCall = !!cronSecret && !!authHeader && timingSafeEqualStr(authHeader, `Bearer ${cronSecret}`)

  let triggeredBy = 'cron'

  if (!isCronCall) {
    // ليس استدعاء cron موقّعًا بشكل صحيح ⇒ يلزم أن يكون مستخدمًا مخوّلاً (تشغيل يدوي من الواجهة)
    const auth = await requirePermission('settings:manage')
    if (!auth.authorized) return auth.response
    triggeredBy = auth.user.email
  }

  const { searchParams } = new URL(request.url)
  const body = request.method === 'POST' ? await request.json().catch(() => ({} as any)) : {}
  const runLabel: FetchRun =
    (searchParams.get('run') as FetchRun) || (body?.runLabel as FetchRun) || 'manual'

  const summary = await runSpaceDataSync(runLabel, triggeredBy)

  return NextResponse.json({
    success: true,
    summary: {
      runId: summary.runId,
      runLabel: summary.runLabel,
      projectsTotal: summary.projectsTotal,
      projectsOk: summary.projectsOk,
      projectsFailed: summary.projectsFailed,
      observationsCreated: summary.observationsCreated,
      errorsCount: summary.errors.length,
      errors: summary.errors.slice(0, 20), // تفصيل أول 20 خطأ فقط في الاستجابة المباشرة
      comparisonRun: summary.comparisonRun, // نتيجة تشغيل مقارنة الأرض-الفضاء التلقائية بعد هذه المزامنة
      comparisonError: summary.comparisonError,
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    return await handleSync(request)
  } catch (error: any) {
    console.error('Space data sync error (GET):', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'حدث خطأ أثناء مزامنة البيانات الفضائية' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handleSync(request)
  } catch (error: any) {
    console.error('Space data sync error (POST):', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'حدث خطأ أثناء مزامنة البيانات الفضائية' },
      { status: 500 },
    )
  }
}
