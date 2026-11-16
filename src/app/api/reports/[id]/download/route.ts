import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authorization'
import { generateReportData, fmtReportDate, fmtReportDateTime } from '@/lib/report-data'
import { renderBankSummaryHtml } from '@/lib/report-bank-summary'
import { renderKpiCatalogHtml, kpiGroupsToCsvRows } from '@/lib/report-kpi-catalog'

interface Params {
  params: Promise<{ id: string }>
}

// generateReportData lives in @/lib/report-data — shared with the PDF route so both
// always compute the exact same figures from the exact same logic.

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    // Authorization: require report:download permission
    const auth = await requirePermission('report:download')
    if (!auth.authorized) return auth.response

    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'json' // json, csv, html

    const data = await generateReportData(id)
    if (!data) {
      return NextResponse.json({ error: 'التقرير غير موجود' }, { status: 404 })
    }

    const reportName = `${data.project.code}-report-${data.report.periodStart.toISOString().slice(0, 10)}`

    if (format === 'csv') {
      // Generate CSV
      const rows: string[] = []
      rows.push('# تقرير الأداء الشامل')
      rows.push(`# المشروع,${data.project.nameAr || data.project.name}`)
      rows.push(`# الرمز,${data.project.code}`)
      rows.push(`# الفترة,${fmtReportDate(data.report.periodStart)} إلى ${fmtReportDate(data.report.periodEnd)}`)
      rows.push('')
      rows.push('# الملخص التنفيذي')
      rows.push('المؤشر,القيمة,الوحدة')
      rows.push(`إجمالي الطاقة,${data.summary.totalEnergy},kWh`)
      rows.push(`الكربون المتجنب,${data.summary.totalCo2Avoided},kgCO2e`)
      rows.push(`الكربون المتجنب,${data.summary.totalCo2AvoidedTons},tCO2e`)
      rows.push(`الوفر المالي,${data.summary.totalSavings},${data.project.currency}`)
      rows.push(`Specific Yield,${data.summary.specificYield},kWh/kWp`)
      rows.push(`عامل السعة,${data.summary.capacityFactor},%`)
      rows.push(`مستوى الثقة بالبيانات,${data.bankSummary.confidence.level},`)
      rows.push(`تغطية أيام الفترة,${data.bankSummary.confidence.coveragePct},%`)
      rows.push(`القراءات الصحيحة,${data.summary.validReadings},قراءة`)
      rows.push(`القراءات المشبوهة,${data.summary.suspectReadings},قراءة`)
      rows.push(`القراءات المرفوضة,${data.summary.rejectedReadings},قراءة`)
      rows.push(`نسبة جودة البيانات,${data.summary.dataQualityRate.toFixed(2)},%`)
      rows.push(`أشجار مكافئة,${data.summary.treeEquivalent},شجرة`)
      rows.push(`كم سيارة متجنّب,${data.summary.carKmAvoided},km`)
      rows.push('')
      rows.push('# الحسابات البيئية الشاملة (Environmental KPI Catalog)')
      rows.push(...kpiGroupsToCsvRows(data.kpiGroups))
      rows.push('')
      rows.push('# البيانات اليومية')
      rows.push('التاريخ,الطاقة (kWh),CO2 (kg),الوفر')
      for (const d of data.dailyData) {
        rows.push(`${d.date},${d.energy},${d.co2},${d.savings}`)
      }
      rows.push('')
      rows.push('# التوثيقات على Hedera')
      rows.push('الحالة,عدد العناصر,Transaction ID,Consensus Timestamp,رابط التحقق')
      for (const a of data.attestations) {
        rows.push(`${a.status},${a.itemCount},${a.hederaTransactionId || '—'},${a.consensusTimestamp || '—'},${a.explorerUrl || '—'}`)
      }

      if (data.fundingAttribution && data.fundingAttribution.length > 0) {
        rows.push('')
        rows.push('# نصيب الجهات الممولة من الأثر (PCAF Attribution)')
        rows.push(`# إجمالي المشروع (100%),${data.summary.totalCo2AvoidedTons},tCO2e`)
        rows.push('الجهة الممولة,نسبة الإسناد (%),طريقة الاحتساب,النصيب المُسنَد (tCO2e),النصيب المُسنَد (kgCO2e)')
        for (const f of data.fundingAttribution) {
          const method = f.attributionMethod === 'capital_share' ? 'نسبة رأس المال (PCAF)' : 'إدخال يدوي'
          rows.push(`${f.funderNameAr || f.funderName},${f.attributionSharePct},${method},${f.attributableCo2AvoidedTons},${f.attributableCo2AvoidedKg}`)
        }
      }

      if (data.baselineComparisons && data.baselineComparisons.length > 0) {
        rows.push('')
        rows.push('# مقارنة ما قبل/ما بعد اعتماد الحل الأخضر (Baseline)')
        rows.push('الفئة,قبل (tCO2e مُسقَطة لنفس الفترة),بعد (tCO2e فعلي),صافي الخفض (tCO2e),نسبة الخفض (%),فترة خط الأساس (أشهر),مصدر معامل الانبعاث')
        for (const b of data.baselineComparisons) {
          rows.push(`${b.categoryLabelAr},${b.baselineCo2eTonsProRated},${b.afterCo2eTons},${b.reductionTons},${b.reductionPct ?? ''},${b.baselinePeriodMonths},${b.emissionFactorSource || ''}`)
        }
      }

      rows.push('')
      rows.push('# مصادر البيانات وسلسلة التتبع')
      rows.push(`# جهاز القياس الرئيسي,${data.dataProvenance.primaryMeter.label},${data.dataProvenance.primaryMeter.serial || '—'}`)
      rows.push(`إجمالي القراءات,${data.dataProvenance.totalReadings}`)
      rows.push(`قراءات موثّقة على Hedera,${data.dataProvenance.readingsWithHederaTx}`)
      rows.push(`تطابق Hash (سليمة),${data.dataProvenance.readingsHashMatched}`)
      rows.push(`تعارض Hash (بحاجة مراجعة),${data.dataProvenance.readingsHashMismatched}`)
      if (data.dataProvenance.devices && data.dataProvenance.devices.length > 0) {
        rows.push('')
        rows.push('# الأجهزة المسجّلة على المشروع')
        rows.push('الجهاز,الشركة المصنّعة,الموديل,السيريال,البروتوكول,الحالة')
        for (const dvc of data.dataProvenance.devices) {
          rows.push(`${dvc.name},${dvc.manufacturer || '—'},${dvc.model || '—'},${dvc.serialNumber},${dvc.protocol},${dvc.status}`)
        }
      }

      rows.push('')
      rows.push('# الحوكمة والتوافق مع أطر ESG والتمويل الأخضر')
      rows.push('قسم التقرير,المعايير والأطر ذات الصلة')
      for (const s of data.standardsMatrix) {
        rows.push(`${s.section},"${s.frameworks.join('; ')}"`)
      }

      rows.push('')
      rows.push(`# سجل القراءات الكامل (${data.readingsFull.length} قراءة — غير مُختصَر، لأغراض التدقيق الخارجي)`)
      rows.push('وقت القياس,القيمة,الوحدة,النوع,حالة الجودة,حالة التحقق,تطابق Hash,Hedera Transaction ID')
      for (const r of data.readingsFull) {
        rows.push(`${fmtReportDateTime(r.measuredAt)},${r.value},${r.unit},${r.metricType},${r.qualityStatus},${r.validationStatus},${r.hashMatchStatus || '—'},${r.hederaTransactionId || '—'}`)
      }

      const csv = '\uFEFF' + rows.join('\n') // BOM for Arabic
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${reportName}.csv"`,
        },
      })
    }

    if (format === 'html') {
      // Generate HTML report with charts (for PDF conversion)
      const html = generateHTMLReport(data, reportName)
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${reportName}.html"`,
        },
      })
    }

    // Default: JSON
    return NextResponse.json(data)
  } catch (error) {
    console.error('Report download error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function generateHTMLReport(data: any, reportName: string): string {
  const fmt = (n: number) => n?.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0'
  const fmtDate = fmtReportDate

  // Generate SVG charts (energy trend, quality pie)
  const maxEnergy = Math.max(...data.dailyData.map((d: any) => d.energy), 1)
  const chartWidth = 600
  const chartHeight = 200
  const barWidth = chartWidth / Math.max(data.dailyData.length, 1)

  const bars = data.dailyData.map((d: any, i: number) => {
    const h = (d.energy / maxEnergy) * (chartHeight - 30)
    const x = i * barWidth
    const y = chartHeight - h - 20
    return `<rect x="${x}" y="${y}" width="${barWidth - 2}" height="${h}" fill="#16a34a" rx="2"/>
            <text x="${x + barWidth/2}" y="${chartHeight - 5}" font-size="8" text-anchor="middle" fill="#666">${d.date.slice(5)}</text>`
  }).join('')

  const validPct = data.summary.dataQualityRate
  const suspectPct = data.summary.totalReadings > 0 ? (data.summary.suspectReadings / data.summary.totalReadings) * 100 : 0
  const rejectedPct = data.summary.totalReadings > 0 ? (data.summary.rejectedReadings / data.summary.totalReadings) * 100 : 0

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${reportName}</title>
<style>
  @page { size: A4; margin: 1.5cm; }
  body { font-family: 'Tajawal', 'Cairo', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 20px; }
  .header { background: linear-gradient(135deg, #16a34a, #0891b2); color: white; padding: 25px; border-radius: 12px; margin-bottom: 25px; }
  .header h1 { margin: 0; font-size: 24px; }
  .header .subtitle { font-size: 14px; opacity: 0.9; margin-top: 5px; }
  .section { margin-bottom: 25px; page-break-inside: avoid; }
  .section h2 { color: #16a34a; border-bottom: 2px solid #16a34a; padding-bottom: 8px; font-size: 18px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 15px 0; }
  .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
  .kpi-card .label { font-size: 11px; color: #64748b; margin-bottom: 4px; }
  .kpi-card .value { font-size: 22px; font-weight: 700; color: #16a34a; }
  .kpi-card .unit { font-size: 11px; color: #64748b; }
  .kpi-card.warn .value { color: #d97706; }
  .kpi-card.danger .value { color: #dc2626; }
  .kpi-card.info .value { color: #0891b2; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 12px; }
  th { background: #16a34a; color: white; padding: 8px; text-align: right; font-weight: 600; }
  td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge-success { background: #dcfce7; color: #166534; }
  .badge-warn { background: #fef3c7; color: #92400e; }
  .badge-danger { background: #fee2e2; color: #991b1b; }
  .badge-info { background: #dbeafe; color: #1e40af; }
  .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #e2e8f0; }
  .info-row .label { color: #64748b; }
  .info-row .value { font-weight: 600; }
  .chart-container { background: #f8fafc; border-radius: 8px; padding: 15px; margin: 15px 0; text-align: center; }
  .footer { margin-top: 30px; padding-top: 15px; border-top: 2px solid #16a34a; font-size: 11px; color: #64748b; text-align: center; }
  .quality-bar { display: flex; height: 24px; border-radius: 12px; overflow: hidden; margin: 10px 0; }
  .quality-bar div { display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: 600; }
  .two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    <h1>تقرير الأداء الشامل - ${data.project.nameAr || data.project.name}</h1>
    <div class="subtitle">
      ${data.project.code} • ${data.project.city || ''} • الفترة: ${fmtDate(data.report.periodStart)} إلى ${fmtDate(data.report.periodEnd)}
    </div>
  </div>

  ${renderBankSummaryHtml(data.bankSummary, fmtDate)}

  <div class="section">
    <h2>🌍 الحسابات البيئية الشاملة (Environmental KPI Catalog)</h2>
    <p style="font-size:11px;color:#64748b;margin:0 0 4px;">مؤشرات هذا المشروع وهذه الفترة فقط، حسب نوع المشروع والبيانات المتوفرة. لكل مؤشر أساسه: مقيس، أو محسوب بمنهجية، أو مُسجَّل، أو تقديري.</p>
    ${renderKpiCatalogHtml(data.kpiGroups)}
  </div>

  <div class="section">
    <h2>📈 اتجاه الإنتاج اليومي</h2>
    <div class="chart-container">
      <svg width="${chartWidth}" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}">
        ${bars}
      </svg>
    </div>
  </div>

  <div class="section">
    <h2>✅ جودة البيانات</h2>
    <div class="quality-bar">
      <div style="background: #16a34a; width: ${validPct}%;">${validPct.toFixed(1)}% صحيحة</div>
      <div style="background: #d97706; width: ${suspectPct}%;">${suspectPct.toFixed(1)}% مشبوهة</div>
      <div style="background: #dc2626; width: ${rejectedPct}%;">${rejectedPct.toFixed(1)}% مرفوضة</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="label">إجمالي القراءات</div>
        <div class="value">${fmt(data.summary.totalReadings)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">قراءات صحيحة</div>
        <div class="value">${fmt(data.summary.validReadings)}</div>
      </div>
      <div class="kpi-card warn">
        <div class="label">قراءات مشبوهة</div>
        <div class="value">${fmt(data.summary.suspectReadings)}</div>
      </div>
      <div class="kpi-card danger">
        <div class="label">قراءات مرفوضة</div>
        <div class="value">${fmt(data.summary.rejectedReadings)}</div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>📋 معلومات المشروع</h2>
    <div class="two-cols">
      <div>
        <div class="info-row"><span class="label">اسم المشروع</span><span class="value">${data.project.nameAr || data.project.name}</span></div>
        <div class="info-row"><span class="label">الرمز</span><span class="value">${data.project.code}</span></div>
        <div class="info-row"><span class="label">الموقع</span><span class="value">${data.project.city || '—'}, ${data.project.country || '—'}</span></div>
        <div class="info-row"><span class="label">القدرة</span><span class="value">${fmt(data.project.capacityKwp)} kWp</span></div>
        <div class="info-row"><span class="label">تاريخ التشغيل</span><span class="value">${data.project.commissionedAt ? fmtDate(data.project.commissionedAt) : '—'}</span></div>
      </div>
      <div>
        <div class="info-row"><span class="label">🔌 نوع الإنفرتر</span><span class="value">${data.project.inverterType || '—'}</span></div>
        <div class="info-row"><span class="label">🔢 سيريال الإنفرتر</span><span class="value" style="font-family: monospace;">${data.project.inverterSerial || '—'}</span></div>
        <div class="info-row"><span class="label">💰 العملة</span><span class="value">${data.project.currency}</span></div>
        <div class="info-row"><span class="label">⚡ تعرفة البيع</span><span class="value">${data.project.tariffRetail || '—'} ${data.project.currency}/kWh</span></div>
        <div class="info-row"><span class="label">📤 تعرفة Feed-in</span><span class="value">${data.project.tariffFeedIn || '—'} ${data.project.currency}/kWh</span></div>
      </div>
    </div>
  </div>

  ${data.project.sponsorName ? `
  <div class="section">
    <h2>🏦 المراقب / الممول</h2>
    <div class="info-row"><span class="label">اسم الممول</span><span class="value">${data.project.sponsorName}</span></div>
    <div class="info-row"><span class="label">رقم الاتصال</span><span class="value" style="font-family: monospace; direction: ltr;">${data.project.sponsorPhone || '—'}</span></div>
  </div>
  ` : ''}

  ${data.fundingAttribution && data.fundingAttribution.length > 0 ? `
  <div class="section">
    <h2>🏦 نصيب الجهات الممولة من الأثر (PCAF Attribution)</h2>
    <div class="info-row"><span class="label">إجمالي المشروع (100%)</span><span class="value">${fmt(data.summary.totalCo2AvoidedTons)} طن CO₂e</span></div>
    <table>
      <thead><tr><th>الجهة الممولة</th><th>نسبة الإسناد</th><th>طريقة الاحتساب</th><th>النصيب المُسنَد (طن CO₂e)</th></tr></thead>
      <tbody>
        ${data.fundingAttribution.map((f: any) => `<tr>
          <td>${f.funderNameAr || f.funderName}</td>
          <td>${f.attributionSharePct}%</td>
          <td>${f.attributionMethod === 'capital_share' ? 'نسبة رأس المال (PCAF)' : 'إدخال يدوي'}</td>
          <td style="font-weight:700;">${fmt(f.attributableCo2AvoidedTons)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p style="font-size:10px;color:#64748b;margin-top:6px;">
      النصيب المُسنَد لكل ممول مُشتق من إجمالي أثر المشروع أعلاه بحسب نسبة مساهمة كل جهة، وفق منهجية PCAF لتمويل المشاريع (Project Finance). رقم المشروع الكلي لا يُستبدل بهذه الأنصبة في أي مكان من هذا التقرير.
    </p>
  </div>
  ` : ''}

  ${data.attestations.length > 0 ? `
  <div class="section">
    <h2>🔗 التوثيقات على Hedera</h2>
    <p style="font-size:11px;color:#64748b;margin:0 0 10px;">شبكة Hedera: <b>${data.hederaNetwork}</b> — كل دفعة تمثّل تجزئة (hash) غير قابلة للتعديل لبيانات هذه الفترة، مسجّلة على سلسلة الكتل.</p>
    <table>
      <thead>
        <tr><th>الحالة</th><th>الأهلية</th><th>عدد العناصر</th><th>Transaction ID</th><th>التحقق</th></tr>
      </thead>
      <tbody>
        ${data.attestations.map((a: any) => `
          <tr>
            <td><span class="badge ${a.status === 'confirmed' ? 'badge-success' : a.status === 'failed' || a.status === 'mismatch' ? 'badge-danger' : 'badge-warn'}">${a.status}</span></td>
            <td>${a.eligibilityStatus ? `<span class="badge ${a.eligibilityStatus === 'eligible' ? 'badge-success' : a.eligibilityStatus === 'ineligible' ? 'badge-danger' : 'badge-warn'}">${a.eligibilityStatus}</span>` : '—'}</td>
            <td>${a.itemCount}</td>
            <td style="font-family: monospace; font-size: 10px;">${a.hederaTransactionId || '—'}</td>
            <td>${a.explorerUrl ? `<a href="${a.explorerUrl}" style="color:#0891b2;">فتح في HashScan ↗</a>` : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="two-cols" style="margin-top:12px;">
      ${data.attestations.filter((a: any) => a.qrCodeDataUrl).map((a: any) => `
        <div style="text-align:center; padding:10px; background:#f8fafc; border-radius:8px;">
          <img src="${a.qrCodeDataUrl}" width="120" height="120" alt="QR للتحقق من دفعة التوثيق" />
          <p style="font-size:10px;color:#64748b;margin:6px 0 0;">امسح للتحقق المباشر على HashScan</p>
          <p style="font-size:9px;color:#94a3b8;font-family:monospace;word-break:break-all;">Batch: ${a.batchHash?.slice(0, 24)}…</p>
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  ${data.suspectReasons.length > 0 ? `
  <div class="section">
    <h2>⚠️ القراءات المشبوهة (آخر 10)</h2>
    <table>
      <thead>
        <tr><th>وقت القياس</th><th>القيمة</th><th>سبب الاشتباه</th></tr>
      </thead>
      <tbody>
        ${data.suspectReasons.map((s: any) => `
          <tr>
            <td>${fmtDate(s.measuredAt)}</td>
            <td>${fmt(s.value)} kWh</td>
            <td>${s.reason || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    <p>© 2026 Eco Ledger • منصة dMRV للمنشآت الصغيرة والمتوسطة</p>
    <p>تقرير مُولّد آليًا في ${fmtReportDateTime(new Date())} • GHG Protocol Scope 2 • Methodology v1.2</p>
    <p>معامل الانبعاث المُستخدم لهذه الفترة: ${data.summary.emissionFactor} kgCO₂e/kWh (بحسب دولة المشروع وتاريخ كل قراءة)</p>
  </div>
</body>
</html>`
}
