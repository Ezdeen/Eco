import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/authorization'

// GET /api/integrations — Safe status of all integrations (no secrets exposed)
export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth.authorized) return auth.response

    // === Hedera ===
    const hederaNetwork = process.env.HEDERA_NETWORK || 'simulation'
    const hederaOperatorId = process.env.HEDERA_OPERATOR_ID || ''
    const hederaOperatorKey = process.env.HEDERA_OPERATOR_KEY || ''
    const hederaTopicId = process.env.HEDERA_TOPIC_ID || ''

    const isSimulation = hederaNetwork === 'simulation'
    const isConfigured = !!(hederaOperatorId && hederaOperatorKey && hederaTopicId)
    const hederaMode = isSimulation ? 'simulation' : (isConfigured ? 'live' : 'needs_setup')

    // Fetch latest attestation from DB
    const lastAttestation = await db.attestationBatch.findFirst({
      where: { status: { in: ['confirmed', 'submitted'] } },
      orderBy: { createdAt: 'desc' },
      select: {
        hederaTransactionId: true,
        consensusTimestamp: true,
        status: true,
        confirmedAt: true,
        itemCount: true,
      },
    })

    const attestationCount = await db.attestationBatch.count({
      where: { status: { in: ['confirmed', 'submitted'] } },
    })

    // Mask operator ID (show last 4 chars only)
    const maskedOperatorId = hederaOperatorId
      ? `****${hederaOperatorId.slice(-4)}`
      : null

    const hedera = {
      status: hederaMode === 'live' ? 'connected' : hederaMode === 'simulation' ? 'simulation' : 'needs_setup',
      network: hederaNetwork,
      mode: hederaMode,
      isProductionEvidence: hederaMode === 'live',
      topicId: hederaTopicId || null,
      maskedOperatorId,
      operatorKeyConfigured: !!hederaOperatorKey,
      lastTransactionId: lastAttestation?.hederaTransactionId || null,
      lastConsensusTimestamp: lastAttestation?.consensusTimestamp || null,
      lastConfirmedAt: lastAttestation?.confirmedAt?.toISOString() || null,
      totalAttestations: attestationCount,
      warning: isSimulation
        ? 'هذا الوضع محاكاة (simulation) وليس دليلاً إنتاجيًا. اضبط HEDERA_NETWORK=testnet أو mainnet للتوثيق الفعلي.'
        : null,
    }

    // === Open-Meteo (Weather) ===
    const weatherSource = await db.weatherSource.findFirst({
      where: { name: 'Open-Meteo' },
      select: { name: true, apiUrl: true, isActive: true, lastSyncAt: true },
    })

    const weatherObsCount = await db.weatherObservation.count()

    const openMeteo = {
      status: 'available',
      name: 'Open-Meteo',
      description: 'يستخدم لجلب بيانات الطقس والإشعاع الشمسي وحساب الأداء المتوقع (Expected Yield) و Performance Ratio',
      apiUrl: weatherSource?.apiUrl || 'https://api.open-meteo.com/v1/forecast',
      isActive: weatherSource?.isActive ?? true,
      lastSyncAt: weatherSource?.lastSyncAt?.toISOString() || null,
      totalObservations: weatherObsCount,
      requiresApiKey: false,
    }

    // === Reports ===
    const publishedReports = await db.report.count({ where: { status: 'published' } })
    const approvedReports = await db.report.count({ where: { status: 'approved' } })
    const draftReports = await db.report.count({ where: { status: 'draft' } })
    const lastReport = await db.report.findFirst({
      where: { status: { in: ['published', 'approved'] } },
      orderBy: { createdAt: 'desc' },
      select: { title: true, status: true, createdAt: true },
    })

    const reports = {
      status: 'active',
      formats: ['PDF', 'CSV', 'HTML'],
      pdfEnabled: true,
      csvEnabled: true,
      htmlEnabled: true,
      publishedCount: publishedReports,
      approvedCount: approvedReports,
      draftCount: draftReports,
      lastReportTitle: lastReport?.title || null,
      lastReportStatus: lastReport?.status || null,
      lastReportDate: lastReport?.createdAt?.toISOString() || null,
      description: 'تصدير الأثر البيئي والمالي والأداء بصيغ متعددة مع رسوم بيانية',
    }

    // === Devices / IoT ===
    const totalDevices = await db.device.count()
    const connectedDevices = await db.device.count({ where: { status: 'connected' } })
    const registeredDevices = await db.device.count({ where: { status: 'registered' } })
    const offlineDevices = await db.device.count({ where: { status: { in: ['offline', 'disabled'] } } })

    const protocols = await db.device.findMany({
      select: { protocol: true },
      distinct: ['protocol'],
    })

    const devices = {
      status: totalDevices > 0 ? 'active' : 'needs_setup',
      totalDevices,
      connectedDevices,
      registeredDevices,
      offlineDevices,
      supportedProtocols: protocols.map((p) => p.protocol).filter(Boolean),
      description: 'ربط الإنفرترات والعدادات وبوابات IoT عبر بروتوكولات متعددة',
    }

    // === Notifications ===
    const notifications = {
      status: 'internal',
      channels: {
        inApp: { enabled: true, label: 'داخل التطبيق' },
        email: { enabled: false, label: 'البريد الإلكتروني' },
        sms: { enabled: false, label: 'SMS' },
        whatsapp: { enabled: false, label: 'WhatsApp' },
      },
      description: 'الإشعارات الداخلية مفعّلة. البريد و SMS و WhatsApp مستقبلية.',
    }

    // === Payments & Subscriptions ===
    const payments = {
      status: 'not_enabled',
      stripeEnabled: false,
      checkoutEnabled: false,
      description: 'مطلوب لتحويل المنصة إلى SaaS تجاري. يحتاج تكامل Stripe أو بوابة دفع.',
    }

    // === Summary KPIs ===
    const allIntegrations = [hedera, openMeteo, reports, devices, notifications, payments]
    const summary = {
      total: allIntegrations.length,
      connected: allIntegrations.filter((i) => i.status === 'connected' || i.status === 'active' || i.status === 'available').length,
      needsSetup: allIntegrations.filter((i) => i.status === 'needs_setup').length,
      notEnabled: allIntegrations.filter((i) => i.status === 'not_enabled' || i.status === 'internal').length,
      simulation: allIntegrations.filter((i) => i.status === 'simulation').length,
    }

    return NextResponse.json({
      hedera,
      openMeteo,
      reports,
      devices,
      notifications,
      payments,
      summary,
    })
  } catch (error) {
    console.error('Integrations API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
