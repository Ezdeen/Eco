// Seed script - populates the database with realistic solar energy ESG data
import { db } from '../src/lib/db'
import bcrypt from 'bcryptjs'

async function main() {
  console.log('🌱 Seeding database...')

  // Hash default passwords
  const adminPassword = await bcrypt.hash('Admin@123456', 12)
  const esgPassword = await bcrypt.hash('ESG@123456', 12)
  const viewerPassword = await bcrypt.hash('Viewer@123456', 12)
  const operatorPassword = await bcrypt.hash('Operator@123456', 12)
  const projectManagerPassword = await bcrypt.hash('Project@123456', 12)

  // ============== Organization ==============
  const org = await db.organization.create({
    data: {
      name: 'BrightFuture Energy Co.',
      nameAr: 'شركة مستقبل مشرق للطاقة',
      code: 'BFEC',
      country: 'SA',
      currency: 'SAR',
      timezone: 'Asia/Riyadh',
      language: 'ar',
    },
  })

  // ============== Users ==============
  const admin = await db.user.create({
    data: {
      email: 'admin@bfec.sa',
      name: 'Ahmed Al-Rashid',
      nameAr: 'أحمد الراشد',
      passwordHash: adminPassword,
      role: 'org_admin',
      preferredLang: 'ar',
      preferredTz: 'Asia/Riyadh',
    },
  })

  const esgManager = await db.user.create({
    data: {
      email: 'esg@bfec.sa',
      name: 'Fatima Al-Zahra',
      nameAr: 'فاطمة الزهراء',
      passwordHash: esgPassword,
      role: 'esg_manager',
      preferredLang: 'ar',
      preferredTz: 'Asia/Riyadh',
    },
  })

  const operator = await db.user.create({
    data: {
      email: 'operator@bfec.sa',
      name: 'Khalid Al-Otaibi',
      nameAr: 'خالد العتيبي',
      passwordHash: operatorPassword,
      role: 'operator',
      preferredLang: 'ar',
      preferredTz: 'Asia/Riyadh',
    },
  })

  const viewer = await db.user.create({
    data: {
      email: 'viewer@bfec.sa',
      name: 'Sara Al-Qahtani',
      nameAr: 'سارة القحطاني',
      passwordHash: viewerPassword,
      role: 'viewer',
      preferredLang: 'ar',
      preferredTz: 'Asia/Riyadh',
    },
  })

  const projectManager = await db.user.create({
    data: {
      email: 'project@bfec.sa',
      name: 'Abdullah Al-Harbi',
      nameAr: 'عبدالله الحربي',
      passwordHash: projectManagerPassword,
      role: 'project_manager',
      preferredLang: 'ar',
      preferredTz: 'Asia/Riyadh',
    },
  })

  await db.userMembership.createMany({
    data: [
      { userId: admin.id, organizationId: org.id, role: 'org_admin', status: 'active' },
      { userId: esgManager.id, organizationId: org.id, role: 'esg_manager', status: 'active' },
      { userId: operator.id, organizationId: org.id, role: 'operator', status: 'active' },
      { userId: viewer.id, organizationId: org.id, role: 'viewer', status: 'active' },
      { userId: projectManager.id, organizationId: org.id, role: 'project_manager', status: 'active' },
    ],
  })

  // ============== Projects ==============
  const projects = [
    {
      name: 'Riyadh Solar Park Phase 1',
      nameAr: 'مجمعة الرياض الشمسية - المرحلة 1',
      code: 'RYD-P1',
      status: 'active',
      projectType: 'grid_tied',
      country: 'Saudi Arabia',
      city: 'Riyadh',
      latitude: 24.7136,
      longitude: 46.6753,
      capacityKwp: 5000,
      tariffRetail: 0.18,
      tariffFeedIn: 0.10,
      sponsorName: 'البنك الأهلي السعودي',
      sponsorPhone: '+966 11 555 1234',
      inverterSerial: 'SN-RYD-P1-001',
      inverterType: 'central',
    },
    {
      name: 'Jeddah Rooftop Initiative',
      nameAr: 'مبادرة جدة للأسطح',
      code: 'JED-RT',
      status: 'active',
      projectType: 'grid_tied',
      country: 'Saudi Arabia',
      city: 'Jeddah',
      latitude: 21.4858,
      longitude: 39.1925,
      capacityKwp: 1200,
      tariffRetail: 0.20,
      tariffFeedIn: 0.12,
      sponsorName: 'بنك الرياض للاستثمار',
      sponsorPhone: '+966 12 666 7890',
      inverterSerial: 'SN-JED-RT-001',
      inverterType: 'string',
    },
    {
      name: 'Dammam Industrial Solar',
      nameAr: 'سولار الدمام الصناعي',
      code: 'DMM-IND',
      status: 'active',
      projectType: 'hybrid',
      country: 'Saudi Arabia',
      city: 'Dammam',
      latitude: 26.4207,
      longitude: 50.0888,
      capacityKwp: 8500,
      tariffRetail: 0.15,
      tariffFeedIn: 0.08,
      sponsorName: 'صندوق التنمية الصناعية السعودي',
      sponsorPhone: '+966 13 777 4567',
      inverterSerial: 'SN-DMM-IND-001',
      inverterType: 'central',
    },
    {
      name: 'Mecca Solar Farm',
      nameAr: 'مزرعة مكة الشمسية',
      code: 'Makkah-SF',
      status: 'under_review',
      projectType: 'off_grid',
      country: 'Saudi Arabia',
      city: 'Mecca',
      latitude: 21.3891,
      longitude: 39.8579,
      capacityKwp: 3200,
      tariffRetail: 0.17,
      tariffFeedIn: 0.11,
      sponsorName: 'بنك البلاد',
      sponsorPhone: '+966 12 888 9999',
      inverterSerial: 'SN-Makkah-SF-001',
      inverterType: 'string',
    },
    {
      name: 'Medina Hospital Solar',
      nameAr: 'سولار مستشفى المدينة',
      code: 'MED-HOS',
      status: 'draft',
      projectType: 'grid_tied',
      country: 'Saudi Arabia',
      city: 'Medina',
      latitude: 24.5247,
      longitude: 39.5692,
      capacityKwp: 800,
      tariffRetail: 0.22,
      tariffFeedIn: 0.13,
      sponsorName: '',
      sponsorPhone: '',
      inverterSerial: 'SN-MED-HOS-001',
      inverterType: 'micro',
    },
    {
      name: 'Riyadh Afforestation Project',
      nameAr: 'مشروع تشجير الرياض',
      code: 'RYD-TREE',
      status: 'active',
      projectType: 'afforestation',
      country: 'Saudi Arabia',
      city: 'Riyadh',
      latitude: 24.7136,
      longitude: 46.6753,
      currency: 'SAR',
      sponsorName: 'وزارة البيئة',
      sponsorPhone: '+966 11 200 0000',
      treeSpecies: 'السدر (Ziziphus spina-christi)',
      treeCount: 5000,
      plantedAreaM2: 250000,
      plantingDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      survivalRateTarget: 0.85,
      iotSensorType: 'soil_moisture',
      iotSensorModel: 'Decagon EC-5',
      iotSensorSerial: 'SN-IOT-RYD-TREE-001',
      iotGatewayId: 'GW-RYD-001',
      iotProtocol: 'lora',
      iotDataFrequency: 'daily',
    },
  ]

  const projectRecords = []
  for (const p of projects) {
    const project = await db.project.create({
      data: {
        ...p,
        organizationId: org.id,
        commissionedAt: p.status === 'active' ? new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) : null,
      },
    })
    projectRecords.push(project)

    const site = await db.site.create({
      data: {
        projectId: project.id,
        name: `${p.name} - Main Site`,
        nameAr: `${p.nameAr} - الموقع الرئيسي`,
        country: p.country,
        city: p.city,
        latitude: p.latitude,
        longitude: p.longitude,
      },
    })

    const asset = await db.asset.create({
      data: {
        projectId: project.id,
        siteId: site.id,
        name: `${p.code} Array A`,
        assetType: 'solar_array',
        status: 'active',
      },
    })

    await db.solarAssetProfile.create({
      data: {
        assetId: asset.id,
        capacityKwp: p.capacityKwp || 1000,
        panelAreaM2: (p.capacityKwp || 1000) * 5,
        tiltDegrees: 25,
        azimuthDegrees: 180,
        technology: 'mono_si',
        moduleEfficiency: 0.21,
        systemLosses: 0.14,
        inverterEfficiency: 0.97,
      },
    })

    await db.device.create({
      data: {
        projectId: project.id,
        siteId: site.id,
        assetId: asset.id,
        name: `${p.code}-INV-001`,
        manufacturer: 'Huawei',
        model: 'SUN2000-100KTL',
        serialNumber: `SN-${p.code}-001`,
        protocol: 'http_api',
        status: p.status === 'active' ? 'connected' : 'registered',
        lastSeenAt: p.status === 'active' ? new Date() : null,
        firmwareVersion: 'V3.2.1',
      },
    })

    // Generate readings only for active projects
    if (p.status === 'active') {
      const device = await db.device.findFirst({ where: { projectId: project.id } })
      if (!device) continue
      const deviceId = device.id
      const assetId = asset.id
      const siteId = site.id

      const now = new Date()
      const days = 30
      let cumulativeEnergy = 0

      for (let day = days - 1; day >= 0; day--) {
        for (let hour = 5; hour <= 19; hour++) {
          const measuredAt = new Date(now.getTime() - day * 24 * 60 * 60 * 1000)
          measuredAt.setHours(hour, 0, 0, 0)

          const hourOfDay = hour + 0.5
          const daylight = Math.max(0, Math.sin(((hourOfDay - 5) / 14) * Math.PI))
          const capacityKw = p.capacityKwp || 1000
          const weatherFactor = 0.7 + Math.random() * 0.4
          const energyKwh = capacityKw * daylight * weatherFactor

          if (energyKwh > 0.1) {
            cumulativeEnergy += energyKwh
            const isSuspect = Math.random() > 0.95
            const isRejected = !isSuspect && Math.random() > 0.985
            const qualityStatus = isRejected ? 'rejected' : isSuspect ? 'suspect' : 'validated'
            const validationStatus = isRejected ? 'invalid' : isSuspect ? 'invalid' : 'valid'

            // Generate suspect reason for non-validated readings
            let suspectReason: string | null = null
            let suspectRuleCode: string | null = null
            let suspectSeverity: string | null = null
            let suspectDetails: string | null = null

            if (isSuspect) {
              const reasons = [
                { code: 'OUT_OF_RANGE', reason: 'القيمة تتجاوز النطاق المتوقع للقدرة المنصوبة', severity: 'high', detail: `القيمة ${Math.round(energyKwh * 100) / 100} kWh تتجاوز الحد الأقصى النظري ${Math.round(capacityKw * 1.1 * 100) / 100} kWh` },
                { code: 'SPIKE_DETECTED', reason: 'قفزة مفاجئة في الإنتاج مقارنة بالفترة السابقة', severity: 'medium', detail: `زيادة بنسبة ${Math.floor(Math.random() * 50 + 30)}% عن المتوسط المتوقع` },
                { code: 'NIGHTTIME_READING', reason: 'قراءة في ساعة غير نهارية (إشعاع شمسي صفر)', severity: 'critical', detail: `القراءة في الساعة ${hour}:00 خارج نطاق الإنتاج الشمسي` },
                { code: 'CUMULATIVE_DROP', reason: 'انخفاض القيمة التراكمية عن القراءة السابقة', severity: 'high', detail: `احتمال إعادة ضبط العداد أو خطأ في القراءة` },
              ]
              const selected = reasons[Math.floor(Math.random() * reasons.length)]
              suspectReason = selected.reason
              suspectRuleCode = selected.code
              suspectSeverity = selected.severity
              suspectDetails = JSON.stringify({ expected: selected.detail, factor: weatherFactor })
            }

            if (isRejected) {
              const reasons = [
                { code: 'DUPLICATE_READING', reason: 'قراءة مكررة لنفس الفترة الزمنية', severity: 'high', detail: 'تطابق كامل في القيمة والطابع الزمني' },
                { code: 'DEVICE_OFFLINE', reason: 'الجهاز غير متصل وقت القراءة', severity: 'critical', detail: 'آخر اتصال قبل القراءة بـ 6 ساعات' },
                { code: 'NEGATIVE_VALUE', reason: 'قيمة سالبة غير منطقية للإنتاج', severity: 'critical', detail: `القيمة سالبة وهذا غير ممكن لمقياس energy_export_kwh` },
              ]
              const selected = reasons[Math.floor(Math.random() * reasons.length)]
              suspectReason = selected.reason
              suspectRuleCode = selected.code
              suspectSeverity = selected.severity
              suspectDetails = JSON.stringify({ expected: selected.detail })
            }

            await db.energyReading.create({
              data: {
                projectId: project.id,
                siteId,
                assetId,
                deviceId,
                metricType: 'energy_export_kwh',
                measuredAt,
                intervalStart: measuredAt,
                intervalEnd: new Date(measuredAt.getTime() + 60 * 60 * 1000),
                value: Math.round(energyKwh * 100) / 100,
                unit: 'kWh',
                cumulativeValue: Math.round(cumulativeEnergy * 100) / 100,
                qualityStatus,
                validationStatus,
                canonicalPayloadHash: `0x${Math.random().toString(16).slice(2, 18).padEnd(16, '0')}`,
                suspectReason,
                suspectRuleCode,
                suspectSeverity,
                suspectDetails,
              },
            })
          }
        }
      }
    }
  }

  // ============== Impact Account ==============
  const impactAccount = await db.impactAccount.create({
    data: {
      organizationId: org.id,
      name: 'Carbon Avoided - 2026',
      accountType: 'carbon_avoided',
      balance: 1250000,
      unit: 'kgCO2e',
    },
  })

  for (const project of projectRecords.slice(0, 3)) {
    await db.impactUnit.create({
      data: {
        projectId: project.id,
        accountId: impactAccount.id,
        amount: 400000 + Math.random() * 100000,
        unit: 'kgCO2e',
        status: 'verified',
        periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        methodologyVersion: 'ghg_protocol_scope2_v1.2',
      },
    })
  }

  // ============== Attestations ==============
  for (const project of projectRecords.slice(0, 3)) {
    await db.attestationBatch.create({
      data: {
        projectId: project.id,
        batchHash: `0x${Math.random().toString(16).slice(2, 66).padEnd(64, '0')}`,
        merkleRoot: `0x${Math.random().toString(16).slice(2, 66).padEnd(64, '0')}`,
        status: 'confirmed',
        hederaTransactionId: `0.0.${Math.floor(Math.random() * 1000000)}-${Math.floor(Math.random() * 1000000000)}-${Math.floor(Math.random() * 100000)}`,
        consensusTimestamp: `${Math.floor(Date.now() / 1000 - 86400)}.123456789`,
        payloadSummary: JSON.stringify({ readings: 720, period: '30 days' }),
        itemCount: 720,
        submittedAt: new Date(Date.now() - 86400 * 1000),
        confirmedAt: new Date(Date.now() - 86300 * 1000),
      },
    })
  }

  // ============== Reports ==============
  for (const project of projectRecords.slice(0, 3)) {
    await db.report.create({
      data: {
        projectId: project.id,
        title: `تقرير الأداء الشهري - ${project.nameAr}`,
        reportType: 'comprehensive',
        status: 'published',
        periodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        periodEnd: new Date(),
        summary: 'تقرير شامل لفترة 30 يومًا يتضمن الإنتاج والكربون المتجنب والوفر المالي ومؤشرات الأداء.',
        version: 1,
      },
    })
  }

  // ============== Cases ==============
  const cases = [
    {
      projectId: projectRecords[0].id,
      title: 'انقطاع بيانات من الإنفرتر INV-001',
      caseType: 'device_offline',
      priority: 'high',
      status: 'open',
      description: 'انقطاع في البيانات من الإنفرتر لمدة 3 ساعات صباح اليوم',
    },
    {
      projectId: projectRecords[1].id,
      title: 'قراءات شاذة في فترة الذروة',
      caseType: 'anomaly',
      priority: 'medium',
      status: 'in_progress',
      description: 'قيم إنتاج أعلى من المتوقع بنسبة 35% في فترة الظهيرة',
    },
    {
      projectId: projectRecords[2].id,
      title: 'فجوة بيانات لمدة 6 ساعات',
      caseType: 'data_gap',
      priority: 'medium',
      status: 'resolved',
      description: 'فجوة بيانات من 02:00 إلى 08:00 صباحًا، تمت معالجتها عبر backfill',
    },
  ]

  for (const c of cases) {
    await db.case.create({
      data: {
        ...c,
        slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    })
  }

  // ============== Notifications ==============
  const notifications = [
    {
      userId: admin.id,
      title: 'تم تأكيد التوثيق على Hedera',
      body: 'تم تأكيد توثيق 720 قراءة للمشروع RYD-P1 على شبكة Hedera',
      category: 'attestation',
      severity: 'success',
    },
    {
      userId: admin.id,
      projectId: projectRecords[0].id,
      title: 'تنبيه: جهاز غير متصل',
      body: 'الإنفرتر RYD-P1-INV-001 غير متصل منذ 3 ساعات',
      category: 'alert',
      severity: 'error',
    },
    {
      userId: esgManager.id,
      title: 'قراءة شاذة مكتشفة',
      body: 'تم رصد قراءة شاذة في مشروع JED-RT، بانتظار المراجعة البشرية',
      category: 'alert',
      severity: 'warning',
    },
    {
      userId: esgManager.id,
      title: 'تم اعتماد تقرير الأداء',
      body: 'تم اعتماد تقرير الأداء الشهري لـ DMM-IND ونشره',
      category: 'report',
      severity: 'success',
    },
    {
      userId: admin.id,
      title: 'مصالحة ناجحة',
      body: 'اكتملت مصالحة دفعة التوثيق بنجاح، 100% من العناصر متطابقة',
      category: 'attestation',
      severity: 'info',
    },
  ]

  for (const n of notifications) {
    await db.notification.create({ data: n })
  }

  // ============== Audit Events ==============
  await db.auditEvent.createMany({
    data: [
      {
        organizationId: org.id,
        userId: admin.id,
        actor: admin.email,
        action: 'project.create',
        resource: 'project',
        resourceId: projectRecords[0].id,
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
        correlationId: 'corr-001',
        metadata: JSON.stringify({ code: 'RYD-P1' }),
      },
      {
        organizationId: org.id,
        userId: esgManager.id,
        actor: esgManager.email,
        action: 'report.approve',
        resource: 'report',
        resourceId: 'report-001',
        ipAddress: '10.0.0.2',
        userAgent: 'Mozilla/5.0',
        correlationId: 'corr-002',
      },
      {
        organizationId: org.id,
        userId: admin.id,
        actor: admin.email,
        action: 'attestation.submit',
        resource: 'attestation_batch',
        resourceId: 'batch-001',
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
        correlationId: 'corr-003',
      },
    ],
  })

  console.log('✅ Database seeded successfully!')
  console.log(`   Organization: ${org.nameAr}`)
  console.log(`   Users: 5 (with hashed passwords)`)
  console.log(`   Projects: ${projectRecords.length}`)
  console.log(`   Impact Account Balance: 1,250,000 kgCO2e`)
  console.log('\n📋 Login Credentials:')
  console.log('   ────────────────────────────────────────')
  console.log('   Admin:           admin@bfec.sa / Admin@123456')
  console.log('   ESG Manager:     esg@bfec.sa / ESG@123456')
  console.log('   Project Manager: project@bfec.sa / Project@123456')
  console.log('   Operator:        operator@bfec.sa / Operator@123456')
  console.log('   Viewer:          viewer@bfec.sa / Viewer@123456')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
