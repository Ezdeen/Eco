import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyApiKey, hasScope } from '@/lib/api-key'

// GET /api/hedera/project-topic?serialNumber=INV-001
// n8n calls this once per inverter (and can cache the result) to learn which Hedera
// topicId to submit Hash_08 to. If the project has no topicId yet, one is created
// automatically on Hedera and persisted — so n8n never has to manage topic creation itself.
export async function GET(request: NextRequest) {
  try {
    const apiKeyCtx = await verifyApiKey(request)
    if (!apiKeyCtx) {
      return NextResponse.json({ error: 'مفتاح API غير صالح أو مفقود' }, { status: 401 })
    }
    if (!hasScope(apiKeyCtx, 'ingestion:write')) {
      return NextResponse.json({ error: 'مفتاح API لا يملك صلاحية الاستيعاب' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const serialNumber = searchParams.get('serialNumber')
    if (!serialNumber) {
      return NextResponse.json({ error: 'serialNumber مطلوب' }, { status: 400 })
    }

    // Resolve project either via a registered Device, or via Project.inverterSerial directly
    let project = await db.project.findFirst({
      where: { inverterSerial: serialNumber },
      select: { id: true, organizationId: true, hederaTopicId: true },
    })

    if (!project) {
      const device = await db.device.findUnique({
        where: { serialNumber },
        select: { projectId: true },
      })
      if (device) {
        project = await db.project.findUnique({
          where: { id: device.projectId },
          select: { id: true, organizationId: true, hederaTopicId: true },
        })
      }
    }

    if (!project) {
      return NextResponse.json(
        { error: `لا يوجد مشروع مرتبط بالرقم التسلسلي: ${serialNumber}` },
        { status: 404 },
      )
    }
    if (project.organizationId !== apiKeyCtx.organizationId) {
      return NextResponse.json({ error: 'هذا الجهاز لا ينتمي لمؤسستك' }, { status: 403 })
    }

    if (project.hederaTopicId) {
      return NextResponse.json({ projectId: project.id, topicId: project.hederaTopicId })
    }

    // No topic yet — create one now via the platform's Hedera credentials, then persist it.
    // This is the ONE case where the platform (not n8n) touches Hedera: topic creation is an
    // administrative action, not a data-attestation action, so it doesn't weaken the trust model.
    const { createProjectTopic } = await import('@/lib/hedera')
    const topicId = await createProjectTopic(project.id)

    if (!topicId) {
      return NextResponse.json(
        { error: 'تعذّر إنشاء Topic جديد على شبكة Hedera. تحقق من إعدادات التكامل.' },
        { status: 500 },
      )
    }

    return NextResponse.json({ projectId: project.id, topicId })
  } catch (error) {
    console.error('Project-topic lookup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
