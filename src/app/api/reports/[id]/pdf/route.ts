import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { requirePermission } from '@/lib/authorization'
import { generateReportData, fmtReportDate, fmtReportDateTime } from '@/lib/report-data'

interface Params {
  params: Promise<{ id: string }>
}

// generateReportData lives in @/lib/report-data — shared with the download route so both
// always compute the exact same figures (dates, KPI catalog, attestations) from the same logic.

function generateHTMLReport(data: any, reportName: string): string {
  const fmt = (n: number) => n?.toLocaleString('en-US', { maximumFractionDigits: 2 }) || '0'
  const fmtDate = fmtReportDate

  const maxEnergy = Math.max(...data.dailyData.map((d: any) => d.energy), 1)
  const chartWidth = 580
  const chartHeight = 180
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
  * { box-sizing: border-box; }
  body { font-family: 'Tajawal', 'Cairo', 'Noto Sans Arabic', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 20px; }
  .header { background: linear-gradient(135deg, #16a34a, #0891b2); color: white; padding: 25px; border-radius: 12px; margin-bottom: 25px; }
  .header h1 { margin: 0; font-size: 22px; }
  .header .subtitle { font-size: 13px; opacity: 0.9; margin-top: 5px; }
  .section { margin-bottom: 22px; page-break-inside: avoid; }
  .section h2 { color: #16a34a; border-bottom: 2px solid #16a34a; padding-bottom: 6px; font-size: 17px; margin: 0 0 12px 0; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 12px 0; }
  .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; text-align: center; }
  .kpi-card .label { font-size: 10px; color: #64748b; margin-bottom: 3px; }
  .kpi-card .value { font-size: 20px; font-weight: 700; color: #16a34a; }
  .kpi-card .unit { font-size: 10px; color: #64748b; }
  .kpi-card.warn .value { color: #d97706; }
  .kpi-card.danger .value { color: #dc2626; }
  .kpi-card.info .value { color: #0891b2; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 11px; }
  th { background: #16a34a; color: white; padding: 6px; text-align: right; font-weight: 600; }
  td { padding: 6px; border-bottom: 1px solid #e2e8f0; }
  tr:nth-child(even) { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 600; }
  .badge-success { background: #dcfce7; color: #166534; }
  .badge-warn { background: #fef3c7; color: #92400e; }
  .badge-danger { background: #fee2e2; color: #991b1b; }
  .info-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #e2e8f0; font-size: 12px; }
  .info-row .label { color: #64748b; }
  .info-row .value { font-weight: 600; }
  .chart-container { background: #f8fafc; border-radius: 8px; padding: 12px; margin: 12px 0; text-align: center; }
  .footer { margin-top: 25px; padding-top: 12px; border-top: 2px solid #16a34a; font-size: 10px; color: #64748b; text-align: center; }
  .quality-bar { display: flex; height: 22px; border-radius: 11px; overflow: hidden; margin: 8px 0; }
  .quality-bar div { display: flex; align-items: center; justify-content: center; color: white; font-size: 9px; font-weight: 600; }
  .two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
  .page-break { page-break-before: always; }
  .note-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 12px; font-size: 10.5px; color: #14532d; margin: 10px 0; line-height: 1.6; }
  .warn-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 12px; font-size: 10.5px; color: #78350f; margin: 10px 0; line-height: 1.6; }
  .tag { display: inline-block; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; border-radius: 6px; padding: 2px 7px; font-size: 9.5px; margin: 2px 3px 2px 0; }
  .compare-grid { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; margin: 10px 0; }
  .compare-card { background: #f8fafc; border-radius: 8px; padding: 12px; text-align: center; }
  .compare-card.before { border: 1px dashed #94a3b8; }
  .compare-card.after { border: 1px solid #16a34a; }
  .compare-arrow { font-size: 22px; color: #16a34a; text-align: center; }
  .mono { font-family: 'Courier New', monospace; font-size: 9px; }
  .cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin-top: 10px; font-size: 11px; }
  .cover-meta .info-row { border-bottom: 1px dotted rgba(255,255,255,0.35); }
  .cover-meta .info-row .label, .cover-meta .info-row .value { color: white; }
  .classification { display: inline-block; background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; padding: 3px 10px; font-size: 10px; margin-top: 8px; }
</style>
</head>
<body>
  <div class="header">
    <h1>تقرير الأداء البيئي الشامل - ${data.project.nameAr || data.project.name}</h1>
    <div class="subtitle">
      ${data.project.code} • ${data.project.city || ''} • الفترة: ${fmtDate(data.report.periodStart)} إلى ${fmtDate(data.report.periodEnd)}
    </div>
    <div class="cover-meta">
      <div class="info-row"><span class="label">الجهة المُصدِرة</span><span class="value">${data.organization?.nameAr || data.organization?.name || '—'}${data.organization?.code ? ' (' + data.organization.code + ')' : ''}</span></div>
      <div class="info-row"><span class="label">رقم التقرير</span><span class="value mono">${data.report.id}</span></div>
      <div class="info-row"><span class="label">تاريخ الإصدار</span><span class="value">${fmtReportDateTime(new Date())}</span></div>
      <div class="info-row"><span class="label">الإصدار</span><span class="value">v${data.report.version || 1}</span></div>
    </div>
    <div class="classification">إعداد لغرض: طلب تمويل/قرض أخضر ومرجع لبناء تقرير ESG • معدّ وفق منهجية dMRV قابلة للتدقيق</div>
  </div>

  <div class="section">
    <h2>الملخص التنفيذي</h2>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">إجمالي الطاقة</div><div class="value">${fmt(data.summary.totalEnergy)}</div><div class="unit">kWh</div></div>
      <div class="kpi-card info"><div class="label">الكربون المتجنب</div><div class="value">${fmt(data.summary.totalCo2AvoidedTons)}</div><div class="unit">طن CO₂e</div></div>
      <div class="kpi-card"><div class="label">الوفر المالي</div><div class="value">${fmt(data.summary.totalSavings)}</div><div class="unit">${data.project.currency}</div></div>
      <div class="kpi-card"><div class="label">Performance Ratio</div><div class="value">${data.summary.performanceRatio}</div><div class="unit">%</div></div>
    </div>
    <p style="font-size:10.5px;color:#475569;margin-top:10px;line-height:1.7;">
      يوثّق هذا التقرير أداء المشروع البيئي للفترة المذكورة أعلاه وفق منهجية القياس والتحقق والإبلاغ (dMRV) المعتمدة في المنصة،
      استنادًا إلى قراءات ميدانية موثّقة رقميًا (Hash + شبكة Hedera). يشمل التقرير أيضًا ملحقًا تفصيليًا للبيانات ومنهجية
      احتسابها (القسم الأخير) لضمان أعلى درجات الشفافية والحوكمة، ولتمكين استخدامه كمرجع من قِبل البنوك والجهات المموّلة
      لأغراض التمويل الأخضر، أو كأساس لإعداد تقرير ESG مستقل للمنشأة.
    </p>
  </div>

  <div class="section">
    <h2>نطاق التقرير وحدوده (Scope &amp; Boundaries)</h2>
    <div class="two-cols">
      <div>
        <div class="info-row"><span class="label">الحد التنظيمي</span><span class="value">مشروع واحد (${data.project.code}) ضمن منشأة/منظمة واحدة</span></div>
        <div class="info-row"><span class="label">الحد الزمني</span><span class="value">${fmtDate(data.report.periodStart)} — ${fmtDate(data.report.periodEnd)} (${data.dailyData.length} يوم بيانات)</span></div>
        <div class="info-row"><span class="label">نوع المشروع</span><span class="value">${data.project.projectType === 'afforestation' ? 'تشجير/استعادة بيئية' : data.project.projectType === 'smart_irrigation' ? 'ري ذكي واستدامة مياه' : 'طاقة شمسية (' + (data.project.projectType || 'grid_tied') + ')'}</span></div>
        <div class="info-row"><span class="label">نطاق الانبعاثات (GHG Scope)</span><span class="value">Scope 2 — location-based (استبدال طاقة الشبكة/الضخ التقليدي)</span></div>
      </div>
      <div>
        <div class="info-row"><span class="label">منهجية الاحتساب المعتمدة</span><span class="value">${data.project.methodology || 'ghg_protocol_scope2'}</span></div>
        <div class="info-row"><span class="label">حالة المشروع</span><span class="value">${data.project.status || '—'}</span></div>
        <div class="info-row"><span class="label">ما لا يشمله التقرير</span><span class="value">انبعاثات Scope 1/3 خارج حدود المشروع، ودورة حياة تصنيع المعدات (Embodied Carbon)</span></div>
        <div class="info-row"><span class="label">لغة ومرجعية التاريخ</span><span class="value">تواريخ ميلادية (Gregorian) بصيغة DD/MM/YYYY</span></div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>الحسابات البيئية الشاملة (Environmental KPI Catalog)</h2>
    <p style="font-size:10px;color:#64748b;margin:0 0 10px;">نفس فئات ومنهجية قسم "الحسابات" في المنصة، محسوبة لهذا المشروع وهذه الفترة تحديدًا.</p>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">الطاقة المُصدَّرة</div><div class="value" style="font-size:16px;">${fmt(data.kpiCatalog.energy.energyExported)}</div><div class="unit">kWh</div></div>
      <div class="kpi-card"><div class="label">الاستهلاك الذاتي</div><div class="value" style="font-size:16px;">${fmt(data.kpiCatalog.energy.selfConsumption)}</div><div class="unit">kWh</div></div>
      <div class="kpi-card info"><div class="label">كثافة الكربون</div><div class="value" style="font-size:16px;">${data.kpiCatalog.carbon.carbonIntensity.toFixed(3)}</div><div class="unit">kgCO₂e/kWh</div></div>
      <div class="kpi-card"><div class="label">مياه موفّرة</div><div class="value" style="font-size:16px;">${fmt(data.kpiCatalog.water.waterSaved)}</div><div class="unit">لتر</div></div>
      ${data.kpiCatalog.afforestation.treesPlanted > 0 ? `
      <div class="kpi-card"><div class="label">أشجار مزروعة</div><div class="value" style="font-size:16px;">${fmt(data.kpiCatalog.afforestation.treesPlanted)}</div><div class="unit">شجرة</div></div>
      <div class="kpi-card"><div class="label">مساحة مُستعادة</div><div class="value" style="font-size:16px;">${data.kpiCatalog.biodiversity.restoredArea.toFixed(2)}</div><div class="unit">هكتار</div></div>
      ` : ''}
      <div class="kpi-card"><div class="label">استثمار أخضر</div><div class="value" style="font-size:16px;">${fmt(data.kpiCatalog.economy.greenInvestment)}</div><div class="unit">${data.kpiCatalog.economy.currency}</div></div>
      <div class="kpi-card"><div class="label">تكلفة لكل طن CO₂e</div><div class="value" style="font-size:16px;">${data.kpiCatalog.economy.costPerTCo2e !== null ? fmt(data.kpiCatalog.economy.costPerTCo2e) : '—'}</div><div class="unit">${data.kpiCatalog.economy.currency}/tCO₂e</div></div>
      <div class="kpi-card"><div class="label">اكتمال البيانات</div><div class="value" style="font-size:16px;">${data.kpiCatalog.dataQuality.completeness.toFixed(1)}</div><div class="unit">%</div></div>
      <div class="kpi-card"><div class="label">بيانات موثقة على Hedera</div><div class="value" style="font-size:16px;">${data.kpiCatalog.attestation.verifiedDataPercent.toFixed(1)}</div><div class="unit">%</div></div>
    </div>
  </div>

  <div class="section">
    <h2>اتجاه الإنتاج اليومي</h2>
    <div class="chart-container">
      <svg width="${chartWidth}" height="${chartHeight}" viewBox="0 0 ${chartWidth} ${chartHeight}">${bars}</svg>
    </div>
  </div>

  <div class="section">
    <h2>جودة البيانات</h2>
    <div class="quality-bar">
      <div style="background: #16a34a; width: ${validPct}%;">${validPct.toFixed(1)}% صحيحة</div>
      <div style="background: #d97706; width: ${suspectPct}%;">${suspectPct.toFixed(1)}% مشبوهة</div>
      <div style="background: #dc2626; width: ${rejectedPct}%;">${rejectedPct.toFixed(1)}% مرفوضة</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">إجمالي القراءات</div><div class="value">${fmt(data.summary.totalReadings)}</div></div>
      <div class="kpi-card"><div class="label">صحيحة</div><div class="value">${fmt(data.summary.validReadings)}</div></div>
      <div class="kpi-card warn"><div class="label">مشبوهة</div><div class="value">${fmt(data.summary.suspectReadings)}</div></div>
      <div class="kpi-card danger"><div class="label">مرفوضة</div><div class="value">${fmt(data.summary.rejectedReadings)}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>الأثر البيئي المكافئ</h2>
    <div class="two-cols">
      <div>
        <div class="info-row"><span class="label">أشجار مكافئة</span><span class="value">${fmt(data.summary.treeEquivalent)} شجرة/سنة</span></div>
        <div class="info-row"><span class="label">كم سيارة متجنّب</span><span class="value">${fmt(data.summary.carKmAvoided)} km</span></div>
        <div class="info-row"><span class="label">استهلاك ذاتي</span><span class="value">${fmt(data.summary.selfConsumed)} kWh</span></div>
        <div class="info-row"><span class="label">طاقة مُصدَّرة</span><span class="value">${fmt(data.summary.exported)} kWh</span></div>
      </div>
      <div>
        <div class="info-row"><span class="label">Specific Yield</span><span class="value">${fmt(data.summary.specificYield)} kWh/kWp</span></div>
        <div class="info-row"><span class="label">القدرة المنصوبة</span><span class="value">${fmt(data.summary.capacityKwp)} kWp</span></div>
        <div class="info-row"><span class="label">معامل الانبعاث</span><span class="value">${data.summary.emissionFactor} kgCO₂e/kWh</span></div>
        <div class="info-row"><span class="label">عدد الأيام</span><span class="value">${data.dailyData.length} يوم</span></div>
      </div>
    </div>
  </div>

  ${data.baselineComparisons && data.baselineComparisons.length > 0 ? `
  <div class="section">
    <h2>مقارنة ما قبل وما بعد اعتماد الحل الأخضر (Baseline: Before vs. After)</h2>
    <p style="font-size:10px;color:#64748b;margin:0 0 10px;">
      خط الأساس (Before) مُشتق من بيانات تاريخية فعلية للمنشأة (فواتير كهرباء/مياه أو ساعات تشغيل مضخة) قبل التحول الأخضر،
      مُسقَطًا على طول فترة هذا التقرير لإتاحة مقارنة عادلة بنفس عدد الأيام. هذه المقارنة هي الدليل الكمّي على "الإضافية"
      (Additionality) المطلوب عادة من جهات التمويل الأخضر.
    </p>
    ${data.baselineComparisons.map((b: any) => `
      <h3 style="font-size:12.5px;color:#0f172a;margin:14px 0 6px;">${b.categoryLabelAr}</h3>
      <div class="compare-grid">
        <div class="compare-card before">
          <div class="label" style="font-size:10px;color:#64748b;">قبل (خط الأساس)</div>
          <div class="value" style="font-size:19px;font-weight:700;color:#64748b;">${fmt(b.baselineCo2eTonsProRated)}</div>
          <div class="unit" style="font-size:10px;color:#64748b;">طن CO₂e لنفس فترة التقرير</div>
        </div>
        <div class="compare-arrow">→</div>
        <div class="compare-card after">
          <div class="label" style="font-size:10px;color:#64748b;">بعد (الفترة الحالية)</div>
          <div class="value" style="font-size:19px;font-weight:700;color:#16a34a;">${fmt(b.afterCo2eTons)}</div>
          <div class="unit" style="font-size:10px;color:#64748b;">طن CO₂e فعلي مقاس</div>
        </div>
      </div>
      <div class="info-row"><span class="label">صافي خفض الانبعاثات لهذه الفترة</span><span class="value" style="color:#16a34a;">${fmt(b.reductionTons)} طن CO₂e${b.reductionPct !== null ? ` (−${b.reductionPct}%)` : ''}</span></div>
      <div class="info-row"><span class="label">فترة خط الأساس التاريخية المرجعية</span><span class="value">${b.baselinePeriodMonths} شهرًا</span></div>
      <div class="info-row"><span class="label">معامل الانبعاث المستخدم لخط الأساس</span><span class="value">${b.emissionFactorValue ?? '—'} kgCO₂e/kWh (${b.emissionFactorSource || '—'}, ${b.emissionFactorVersion || '—'})</span></div>
      ${b.standardsApplied && b.standardsApplied.length > 0 ? `<div style="margin:6px 0;">${b.standardsApplied.map((s: string) => `<span class="tag">${s}</span>`).join('')}</div>` : ''}
      ${b.dmrvLinkageNotes ? `<p style="font-size:9.5px;color:#64748b;margin:4px 0 0;line-height:1.6;">${b.dmrvLinkageNotes}</p>` : ''}
    `).join('')}
  </div>
  ` : `
  <div class="section">
    <h2>مقارنة ما قبل وما بعد اعتماد الحل الأخضر (Baseline: Before vs. After)</h2>
    <div class="warn-box">لم يُسجَّل خط أساس (Before-State) مؤكَّد لهذا المشروع بعد. تسجيل خط الأساس (عبر فواتير الكهرباء/المياه التاريخية) يقوّي هذا التقرير كدليل على "الإضافية" عند تقديمه لجهة تمويل، ويُنصح به قبل الاستخدام النهائي كمرجع لقرض أخضر.</div>
  </div>
  `}

  <div class="section">
    <h2>معلومات المشروع</h2>
    <div class="two-cols">
      <div>
        <div class="info-row"><span class="label">اسم المشروع</span><span class="value">${data.project.nameAr || data.project.name}</span></div>
        <div class="info-row"><span class="label">الرمز</span><span class="value">${data.project.code}</span></div>
        <div class="info-row"><span class="label">الموقع</span><span class="value">${data.project.city || '—'}, ${data.project.country || '—'}</span></div>
        <div class="info-row"><span class="label">القدرة</span><span class="value">${fmt(data.project.capacityKwp)} kWp</span></div>
        <div class="info-row"><span class="label">تاريخ التشغيل</span><span class="value">${data.project.commissionedAt ? fmtDate(data.project.commissionedAt) : '—'}</span></div>
      </div>
      <div>
        <div class="info-row"><span class="label">نوع الإنفرتر</span><span class="value">${data.project.inverterType || '—'}</span></div>
        <div class="info-row"><span class="label">سيريال الإنفرتر</span><span class="value">${data.project.inverterSerial || '—'}</span></div>
        <div class="info-row"><span class="label">العملة</span><span class="value">${data.project.currency}</span></div>
        <div class="info-row"><span class="label">تعرفة البيع</span><span class="value">${data.project.tariffRetail || '—'} ${data.project.currency}/kWh</span></div>
        <div class="info-row"><span class="label">تعرفة Feed-in</span><span class="value">${data.project.tariffFeedIn || '—'} ${data.project.currency}/kWh</span></div>
      </div>
    </div>
  </div>

  ${data.project.sponsorName ? `
  <div class="section">
    <h2>المراقب / الممول</h2>
    <div class="info-row"><span class="label">اسم الممول</span><span class="value">${data.project.sponsorName}</span></div>
    <div class="info-row"><span class="label">رقم الاتصال</span><span class="value">${data.project.sponsorPhone || '—'}</span></div>
  </div>
  ` : ''}

  <div class="section">
    <h2>مصادر البيانات وسلسلة التتبع (Data Provenance &amp; Traceability)</h2>
    <div class="info-row"><span class="label">جهاز القياس الرئيسي</span><span class="value">${data.dataProvenance.primaryMeter.label}${data.dataProvenance.primaryMeter.serial ? ' — سيريال: ' + data.dataProvenance.primaryMeter.serial : ''}${data.dataProvenance.primaryMeter.type ? ' (' + data.dataProvenance.primaryMeter.type + ')' : ''}</span></div>
    ${data.dataProvenance.devices && data.dataProvenance.devices.length > 0 ? `
    <table>
      <thead><tr><th>الجهاز</th><th>الشركة المصنّعة/الموديل</th><th>السيريال</th><th>البروتوكول</th><th>الحالة</th></tr></thead>
      <tbody>
        ${data.dataProvenance.devices.map((d: any) => `<tr>
          <td>${d.name}</td>
          <td>${[d.manufacturer, d.model].filter(Boolean).join(' / ') || '—'}</td>
          <td class="mono">${d.serialNumber}</td>
          <td>${d.protocol}</td>
          <td><span class="badge ${d.status === 'connected' ? 'badge-success' : d.status === 'offline' ? 'badge-danger' : 'badge-warn'}">${d.status}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
    ` : ''}
    <p style="font-size:10px;color:#64748b;margin:6px 0 4px;"><b>مسار تدفق البيانات:</b> ${data.dataProvenance.ingestionPath}</p>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="label">إجمالي القراءات المستلمة</div><div class="value" style="font-size:16px;">${fmt(data.dataProvenance.totalReadings)}</div></div>
      <div class="kpi-card info"><div class="label">قراءات موثّقة على Hedera</div><div class="value" style="font-size:16px;">${fmt(data.dataProvenance.readingsWithHederaTx)}</div></div>
      <div class="kpi-card"><div class="label">تطابق Hash (سليمة)</div><div class="value" style="font-size:16px;">${fmt(data.dataProvenance.readingsHashMatched)}</div></div>
      <div class="kpi-card ${data.dataProvenance.readingsHashMismatched > 0 ? 'danger' : ''}"><div class="label">تعارض Hash (بحاجة مراجعة)</div><div class="value" style="font-size:16px;">${fmt(data.dataProvenance.readingsHashMismatched)}</div></div>
    </div>
    ${data.dataProvenance.hederaTopicId ? `<div class="info-row"><span class="label">Hedera Topic ID الخاص بالمشروع</span><span class="value mono">${data.dataProvenance.hederaTopicId}</span></div>` : ''}
    <p style="font-size:9.5px;color:#64748b;margin-top:4px;line-height:1.6;">
      لكل قراءة يُحسِب النظام "canonicalPayloadHash" محليًا ويقارنه فوريًا بالـ Hash المُرسَل من نظام الاستقبال (n8n)؛ فقط
      القراءات ذات حالة جودة "مُصادَق عليها/مُعتمَدة/مُصحَّحة" (validated/approved/corrected) تدخل في الحسابات أعلاه — راجع قسم
      "جودة البيانات" وملحق "سجل القراءات التفصيلي" أدناه.
    </p>
  </div>

  ${data.fundingAttribution && data.fundingAttribution.length > 0 ? `
  <div class="section">
    <h2>نصيب الجهات الممولة من الأثر (PCAF Attribution)</h2>
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
      النصيب المُسنَد لكل ممول مُشتق من إجمالي أثر المشروع أعلاه بحسب نسبة مساهمة كل جهة (Attribution Factor = Outstanding Amount / Total Project Value)، وفق منهجية PCAF لتمويل المشاريع. لا يُستبدل رقم المشروع الكلي بهذه الأنصبة في أي مكان من هذا التقرير.
    </p>
  </div>
  ` : ''}

  ${data.attestations.length > 0 ? `
  <div class="section">
    <h2>التوثيقات على Hedera</h2>
    <p style="font-size:10px;color:#64748b;margin:0 0 10px;">شبكة Hedera: <b>${data.hederaNetwork}</b> — كل دفعة تمثّل تجزئة (hash) غير قابلة للتعديل لبيانات هذه الفترة، مسجّلة على سلسلة الكتل.</p>
    <table>
      <thead><tr><th>الحالة</th><th>الأهلية</th><th>عدد العناصر</th><th>Transaction ID</th><th>التحقق</th></tr></thead>
      <tbody>
        ${data.attestations.map((a: any) => `<tr>
          <td><span class="badge ${a.status === 'confirmed' ? 'badge-success' : a.status === 'failed' || a.status === 'mismatch' ? 'badge-danger' : 'badge-warn'}">${a.status}</span></td>
          <td>${a.eligibilityStatus ? `<span class="badge ${a.eligibilityStatus === 'eligible' ? 'badge-success' : a.eligibilityStatus === 'ineligible' ? 'badge-danger' : 'badge-warn'}">${a.eligibilityStatus}</span>` : '—'}</td>
          <td>${a.itemCount}</td>
          <td style="font-family: monospace; font-size: 9px;">${a.hederaTransactionId || '—'}</td>
          <td>${a.explorerUrl ? `<a href="${a.explorerUrl}" style="color:#0891b2;">HashScan ↗</a>` : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="two-cols" style="margin-top:10px;">
      ${data.attestations.filter((a: any) => a.qrCodeDataUrl).map((a: any) => `
        <div style="text-align:center; padding:8px; background:#f8fafc; border-radius:8px;">
          <img src="${a.qrCodeDataUrl}" width="100" height="100" alt="QR للتحقق" />
          <p style="font-size:9px;color:#64748b;margin:4px 0 0;">امسح للتحقق المباشر على HashScan</p>
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  ${data.suspectReasons.length > 0 ? `
  <div class="section">
    <h2>القراءات المشبوهة (آخر 10)</h2>
    <table>
      <thead><tr><th>وقت القياس</th><th>القيمة</th><th>سبب الاشتباه</th></tr></thead>
      <tbody>
        ${data.suspectReasons.map((s: any) => `<tr><td>${fmtDate(s.measuredAt)}</td><td>${fmt(s.value)} kWh</td><td>${s.reason || '—'}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="section page-break">
    <h2>الحوكمة والتوافق مع أطر ESG والتمويل الأخضر</h2>
    <p style="font-size:10px;color:#64748b;margin:0 0 10px;">
      يربط الجدول التالي كل قسم من أقسام هذا التقرير بالمعيار/الإطار الدولي الذي يستند إليه منهجيًا، لتسهيل استخدام
      التقرير كوثيقة داعمة لطلب تمويل أخضر، أو كمدخل مباشر لبناء تقرير ESG مستقل للمنشأة.
    </p>
    <table>
      <thead><tr><th>قسم التقرير</th><th>المعايير والأطر ذات الصلة</th></tr></thead>
      <tbody>
        ${data.standardsMatrix.map((s: any) => `<tr>
          <td style="font-weight:600;">${s.section}</td>
          <td>${s.frameworks.map((f: string) => `<span class="tag">${f}</span>`).join('')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>ملحق أ: منهجية الاحتساب والصيغ المستخدمة</h2>
    <table>
      <thead><tr><th>المؤشر</th><th>الصيغة</th></tr></thead>
      <tbody>
        <tr><td>الكربون المتجنب (CO₂e)</td><td class="mono">Σ (قراءة الطاقة المُعتمَدة × معامل انبعاث الشبكة الساري وقت القراءة)</td></tr>
        <tr><td>كثافة الكربون</td><td class="mono">إجمالي CO₂e المتجنب ÷ إجمالي الطاقة المُولَّدة</td></tr>
        <tr><td>Specific Yield</td><td class="mono">إجمالي الطاقة المُولَّدة ÷ القدرة المنصوبة (kWp)</td></tr>
        <tr><td>Performance Ratio</td><td class="mono">Specific Yield ÷ (عدد الأيام × 5.5 ساعة ذروة شمسية مرجعية)</td></tr>
        <tr><td>الوفر المالي</td><td class="mono">(الطاقة المُستهلَكة ذاتيًا × تعرفة البيع) + (الطاقة المُصدَّرة × تعرفة Feed-in)</td></tr>
        <tr><td>نصيب الممول (PCAF)</td><td class="mono">Attribution Factor = مبلغ التمويل ÷ القيمة الإجمالية للمشروع؛ النصيب = Factor × إجمالي أثر المشروع</td></tr>
        <tr><td>أشجار/سيارات مكافئة</td><td class="mono">إجمالي CO₂e المتجنب ÷ عامل تحويل مرجعي (كغم CO₂/شجرة/سنة أو كغم CO₂/كم)</td></tr>
        ${data.kpiCatalog.afforestation.treesPlanted > 0 ? `<tr><td>الكربون المُحتجَز (تشجير)</td><td class="mono">عدد الأشجار الحية × معامل احتجاز الكربون للنوع × عمر الشجرة بالسنوات</td></tr>` : ''}
        ${data.kpiCatalog.irrigation && data.kpiCatalog.irrigation.waterUsedM3 > 0 ? `<tr><td>توفير المياه (ري ذكي)</td><td class="mono">(استهلاك خط الأساس التقديري − الاستهلاك الفعلي المقاس) ÷ استهلاك خط الأساس × 100%</td></tr>` : `<tr><td>مياه موفّرة (طاقة شمسية)</td><td class="mono">تقدير مرجعي = إجمالي الطاقة المُولَّدة × 1.5 لتر/kWh (مقارنة بمحطات توليد حرارية تقليدية)</td></tr>`}
        <tr><td>خط الأساس - الطاقة (Before)</td><td class="mono">kWh المُستهلَك = إجمالي الفاتورة التاريخية ÷ تعرفة الكهرباء؛ tCO₂e = kWh × معامل الانبعاث ÷ 1000</td></tr>
        <tr><td>خط الأساس - المياه (Before)</td><td class="mono">حجم المياه = الفاتورة ÷ تعرفة اللتر (أو من قدرة/ساعات تشغيل المضخة)؛ الكربون المتضمَّن = طاقة الضخ × معامل الانبعاث ÷ 1000</td></tr>
      </tbody>
    </table>
    <p style="font-size:9.5px;color:#64748b;margin-top:6px;">جميع الصيغ أعلاه مطابقة لمنهجية القسم المقابل في لوحة "الحسابات" بالمنصة (نفس كود الاحتساب، مصدر بيانات واحد لا يتغير بين الشاشات والتقارير).</p>
  </div>

  <div class="section">
    <h2>ملحق ب: عوامل الانبعاث والتحويل المستخدمة في هذه الفترة</h2>
    <table>
      <thead><tr><th>القيمة (kgCO₂e/kWh)</th><th>المصدر</th><th>الإصدار</th><th>من قاعدة بيانات مُعتمَدة؟</th></tr></thead>
      <tbody>
        ${data.summary.emissionFactorsUsed.map((ef: any) => `<tr>
          <td style="font-weight:700;">${ef.factor}</td>
          <td>${ef.source}</td>
          <td>${ef.version}</td>
          <td>${ef.fromDb ? '<span class="badge badge-success">نعم</span>' : '<span class="badge badge-warn">قيمة احتياطية افتراضية</span>'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>ملحق ج: سجل القراءات التفصيلي (للتدقيق)</h2>
    <p style="font-size:10px;color:#64748b;margin:0 0 10px;">
      عيّنة من سجل القراءات الخام لهذه الفترة (حتى ${data.readingsLog.length} قراءة معروضة هنا للاختصار)${data.readingsLogTruncated ? '، من إجمالي ' + fmt(data.summary.totalReadings) + ' قراءة. السجل الكامل متاح عبر تصدير CSV/JSON من داخل المنصة لأي مراجع أو مدقق خارجي.' : '.'}
    </p>
    <table>
      <thead><tr><th>وقت القياس</th><th>القيمة</th><th>النوع</th><th>حالة الجودة</th><th>تطابق Hash</th><th>Hedera Tx</th></tr></thead>
      <tbody>
        ${data.readingsLog.map((r: any) => `<tr>
          <td>${fmtReportDateTime(r.measuredAt)}</td>
          <td>${fmt(r.value)} ${r.unit}</td>
          <td>${r.metricType}</td>
          <td><span class="badge ${['validated', 'approved', 'corrected'].includes(r.qualityStatus) ? 'badge-success' : r.qualityStatus === 'suspect' ? 'badge-warn' : r.qualityStatus === 'rejected' ? 'badge-danger' : 'badge-warn'}">${r.qualityStatus}</span></td>
          <td>${r.hashMatchStatus === 'match' ? '<span class="badge badge-success">match</span>' : r.hashMatchStatus === 'mismatch' ? '<span class="badge badge-danger">mismatch</span>' : '—'}</td>
          <td class="mono" style="font-size:8px;">${r.hederaTransactionId ? r.hederaTransactionId.slice(0, 18) + '…' : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>بيان التوكيد والقيود (Assurance Statement &amp; Limitations)</h2>
    <div class="note-box">
      <b>مستوى التوكيد:</b> بيانات هذا التقرير مبنية على قراءات ميدانية موثّقة رقميًا (Hash) ومُثبَّتة على سجل لامركزي
      غير قابل للتعديل (شبكة Hedera)، بنسبة اكتمال بيانات ${data.kpiCatalog.dataQuality.completeness.toFixed(1)}% ونسبة
      بيانات موثّقة على السلسلة ${data.kpiCatalog.attestation.verifiedDataPercent.toFixed(1)}% لهذه الفترة. هذا يوفّر توكيدًا
      قريبًا من مبادئ ISAE 3410 الخاصة بتأكيدات غازات الاحتباس الحراري، دون أن يشكّل توكيدًا رسميًا من طرف ثالث مستقل
      (third-party assurance) ما لم يُذكر خلاف ذلك صراحةً.
    </div>
    <div class="warn-box">
      <b>قيود يجب مراعاتها:</b>
      القيم المُشار إليها في هذا التقرير بأنها "تقديرية" (مثل: توفير المياه لمشاريع الطاقة الشمسية غير المُزوَّدة بعداد مياه ذكي)
      مبنية على معاملات تحويل مرجعية قياسية وليست قياسًا مباشرًا. حدود التقرير تقتصر على Scope 2 لموقع المشروع، ولا تشمل
      انبعاثات دورة التصنيع للمعدات (Embodied Carbon) أو سلسلة الإمداد. القراءات المصنّفة "مشبوهة" أو "مرفوضة" (راجع قسم
      جودة البيانات) استُبعدت بالكامل من كل الحسابات أعلاه ولم تُدرَج في أي مجموع.
    </div>
  </div>

  <div class="section">
    <h2>قاموس المصطلحات</h2>
    <table>
      <thead><tr><th>المصطلح</th><th>التعريف</th></tr></thead>
      <tbody>
        <tr><td>dMRV</td><td>القياس والتحقق والإبلاغ الرقمي (Digital Measurement, Reporting & Verification)</td></tr>
        <tr><td>Scope 2</td><td>الانبعاثات غير المباشرة الناتجة عن استهلاك الطاقة المُشتراة من الشبكة، وفق GHG Protocol</td></tr>
        <tr><td>PCAF</td><td>Partnership for Carbon Accounting Financials — منهجية موحدة لإسناد الأثر الكربوني للجهات المموِّلة</td></tr>
        <tr><td>Attribution Factor</td><td>نسبة إسناد أثر المشروع لجهة تمويل معيّنة بحسب حصتها من إجمالي قيمة المشروع</td></tr>
        <tr><td>Additionality</td><td>الأثر الإضافي الذي لم يكن ليحدث لولا اعتماد الحل الأخضر — يُقاس بمقارنة "قبل/بعد"</td></tr>
        <tr><td>Attestation Batch</td><td>دفعة بيانات مُجمَّعة ومُجزَّأة (hash) ومُثبَّتة على شبكة Hedera كسجل غير قابل للتعديل</td></tr>
        <tr><td>hashMatchStatus</td><td>نتيجة مطابقة تجزئة (hash) البيانات المُعاد احتسابها داخل المنصة مع التجزئة المُرسَلة وقت الاستقبال</td></tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    <p>© 2026 Eco Ledger • منصة dMRV للمنشآت الصغيرة والمتوسطة</p>
    <p>تقرير مُولّد آليًا في ${fmtReportDateTime(new Date())} • GHG Protocol Scope 2 • Methodology v1.2</p>
    <p>معامل الانبعاث المُستخدم لهذه الفترة: ${data.summary.emissionFactor} kgCO₂e/kWh (بحسب دولة المشروع وتاريخ كل قراءة)</p>
    <p style="margin-top:4px;">هذا التقرير مُعدّ آليًا من بيانات موثّقة رقميًا، ويُنصح بمراجعته من جهة تدقيق مستقلة قبل اعتماده رسميًا في ملفات تمويل أو إفصاح ESG خارجي.</p>
  </div>
</body>
</html>`
}

export async function GET(request: NextRequest, { params }: Params) {
  let htmlPath: string | null = null
  let pdfPath: string | null = null

  try {
    const { id } = await params
    // Authorization: require report:download permission
    const auth = await requirePermission('report:download')
    if (!auth.authorized) return auth.response

    const data = await generateReportData(id)
    if (!data) {
      return NextResponse.json({ error: 'التقرير غير موجود' }, { status: 404 })
    }

    const reportName = `${data.project.code}-report-${data.report.periodStart.toISOString().slice(0, 10)}`

    console.info('Generate PDF:', { reportId: data.report.id, project: data.project.code, readings: data.dailyData.length })

    // If no readings, return friendly HTML explaining empty data
    if (!data.dailyData || data.dailyData.length === 0 || (data.summary && data.summary.totalReadings === 0)) {
      const msgHtml = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${reportName}</title></head><body><div style="font-family:Arial,Helvetica,sans-serif;padding:30px;text-align:center;"><h2>لا توجد بيانات للتقرير في الفترة المحددة</h2><p>لا توجد قراءات للطاقة ضمن الفترة ${fmtReportDate(data.report.periodStart)} إلى ${fmtReportDate(data.report.periodEnd)}.</p></div></body></html>`
      return new NextResponse(msgHtml, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${reportName}.html"`,
        },
      })
    }

    const html = generateHTMLReport(data, reportName)

    console.info('Generate PDF:', { reportId: data.report.id, project: data.project.code, readings: data.dailyData.length })

    // Save HTML to temp file
    const tmpDir = path.join(process.cwd(), 'tmp', 'report-pdfs')
    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true })
    }
    htmlPath = path.join(tmpDir, `${reportName}-${Date.now()}.html`)
    pdfPath = htmlPath.replace('.html', '.pdf')
    await writeFile(htmlPath, html, 'utf-8')

    // Use project-local script path so it works on developers' machines
    const scriptPath = path.join(process.cwd(), 'scripts', 'html-to-pdf.js')

    if (!existsSync(scriptPath)) {
      console.error('PDF script not found at:', scriptPath)
      // Fallback: return HTML
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="${reportName}.html"`,
        },
      })
    }

    // Run Playwright conversion with timeout
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(() => {
        try {
          proc.kill('SIGKILL')
        } catch (e) {}
        reject(new Error('PDF generation timeout after 30 seconds'))
      }, 30000)

      // PLAYWRIGHT_BROWSERS_PATH=0 يجبر Playwright على البحث عن المتصفح داخل
      // node_modules/playwright-core بدل المسار الافتراضي (~/.cache/ms-playwright)
      // الذي لا ينتقل مع .next/standalone على Render — انظر نفس الشرح المفصّل في
      // src/app/api/portfolio-reports/[id]/pdf/route.ts
      const proc = spawn('node', [scriptPath, htmlPath!, pdfPath!], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: '0',
        },
      })

      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      proc.on('close', async (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          console.error('Playwright exit code:', code, 'stderr:', stderr)
          reject(new Error(`Playwright failed (exit ${code}): ${stderr || stdout}`))
          return
        }
        try {
          const pdf = await readFile(pdfPath!)
          resolve(pdf)
        } catch (e: any) {
          console.error('Failed to read PDF file:', e.message)
          reject(new Error(`Failed to read generated PDF: ${e.message}`))
        }
      })
      proc.on('error', (err) => {
        clearTimeout(timeout)
        console.error('Process spawn error:', err)
        reject(err)
      })
    })

    // Cleanup temp files
    await unlink(htmlPath).catch(() => {})
    await unlink(pdfPath).catch(() => {})

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${reportName}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: any) {
    console.error('PDF generation error:', error.message || error)
    // Cleanup on error
    if (htmlPath) await unlink(htmlPath).catch(() => {})
    if (pdfPath) await unlink(pdfPath).catch(() => {})

    return NextResponse.json(
      {
        error: 'فشل توليد ملف PDF',
        details: error.message || String(error),
      },
      { status: 500 },
    )
  }
}
