// منسّق سحب البيانات الفضائية (Space Data Sync Orchestrator)
// يُستدعى بواسطة /api/space-data/sync (المُجدوَل عبر Vercel Cron 3 مرات يوميًا)
// أو يدويًا من واجهة المستخدم. يمرّ على كل مشروع لديه إحداثيات (lat/lon)، ولكل
// مصدر بيانات مفعّل، ويخزّن النتائج بشكل موحّد في SpaceDataObservation.

import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'
import { fetchNasaPowerLatest } from './nasa-power'
import { fetchGeeObservations, GeeServiceAccount } from './google-earth-engine'
import { fetchCamsLatest, CamsCredentials } from './cams'
import { fetchCdseObservations, CdseCredentials } from './cdse'

export type FetchRun = 'morning' | 'afternoon' | 'evening' | 'manual'

export interface SyncSummary {
  runId: string
  runLabel: FetchRun
  projectsTotal: number
  projectsOk: number
  projectsFailed: number
  observationsCreated: number
  errors: Array<{ projectId: string; projectName: string; source: string; error: string }>
}

// أسماء مصادر البيانات المدعومة، متوافقة مع أسماء IntegrationConfig.name
const SOURCE_KEYS = {
  NASA_POWER: 'space_nasa_power',
  GEE: 'space_gee',
  CAMS: 'space_cams',
  CDSE: 'space_cdse',
} as const

async function ensureSpaceDataSource(key: string, name: string, provider: string, description: string, requiresApiKey: boolean) {
  return db.spaceDataSource.upsert({
    where: { key },
    update: {},
    create: { key, name, provider, description, requiresApiKey, apiUrl: null },
  })
}

async function getIntegrationConfig(name: string) {
  return db.integrationConfig.findUnique({ where: { name } })
}

/**
 * يشغّل دورة سحب كاملة لكل المشاريع النشطة التي تحتوي إحداثيات صالحة.
 * كل (مشروع × مصدر) مستقل تمامًا: فشل مصدر واحد لمشروع واحد لا يوقف البقية،
 * ويُسجَّل الخطأ بوضوح في errorSummary لضمان الشفافية الكاملة لعملية الجمع.
 */
export async function runSpaceDataSync(runLabel: FetchRun, triggeredBy?: string): Promise<SyncSummary> {
  const syncRun = await db.spaceDataSyncRun.create({
    data: { runLabel, status: 'running', triggeredBy: triggeredBy || 'cron' },
  })

  const errors: SyncSummary['errors'] = []
  let observationsCreated = 0
  let projectsOk = 0
  let projectsFailed = 0

  // نضمن وجود سجلات SpaceDataSource أساسية دائمًا (حتى لو التكامل غير مُفعّل بعد)
  const nasaSource = await ensureSpaceDataSource(
    SOURCE_KEYS.NASA_POWER, 'NASA POWER', 'NASA',
    'الإشعاع الشمسي التاريخي، درجة حرارة الهواء، سرعة الرياح، ومؤشرات الجو — REST API مجاني بالكامل',
    false,
  )
  const geeSource = await ensureSpaceDataSource(
    SOURCE_KEYS.GEE, 'Google Earth Engine', 'Google',
    'بيانات Sentinel-2/5P وLandsat وMODIS — مؤشرات نباتية (NDVI/EVI) وحرارة سطح الأرض وNO2',
    true,
  )
  const camsSource = await ensureSpaceDataSource(
    SOURCE_KEYS.CAMS, 'CAMS (Copernicus Atmosphere)', 'ECMWF/Copernicus (soda-pro.com)',
    'الإشعاع الشمسي الفعلي المباشر والمشتت (GHI, DNI, DIF) — يتطلب بريدًا إلكترونيًا مسجَّلاً فقط',
    false,
  )
  const cdseSource = await ensureSpaceDataSource(
    SOURCE_KEYS.CDSE, 'Copernicus Data Space Ecosystem', 'ESA/Copernicus (dataspace.copernicus.eu)',
    'بيانات Sentinel-2/5P (NDVI, EVI, NO2) — بديل GEE بمصادقة OAuth2 أبسط (Client ID/Secret)',
    true,
  )

  const nasaConfig = await getIntegrationConfig('space_nasa_power')
  const geeConfig = await getIntegrationConfig('space_gee')
  const camsConfig = await getIntegrationConfig('space_cams')
  const cdseConfig = await getIntegrationConfig('space_cdse')

  // NASA POWER لا يحتاج مفتاحًا — نعتبره مفعّلاً افتراضيًا ما لم يُعطَّل صراحة
  const nasaEnabled = nasaConfig ? nasaConfig.isActive : true

  const geeEnabled = !!(geeConfig?.isActive && geeConfig?.encryptedSecret)
  let geeServiceAccount: GeeServiceAccount | null = null
  if (geeEnabled) {
    try {
      const decrypted = decryptSecret(geeConfig!.encryptedSecret!)
      geeServiceAccount = JSON.parse(decrypted)
    } catch {
      errors.push({ projectId: '-', projectName: '-', source: 'GEE', error: 'تعذّر قراءة مفتاح Service Account المخزّن (JSON غير صالح)' })
    }
  }

  // CAMS: المصادقة الوحيدة هي البريد الإلكتروني المسجَّل على soda-pro.com (لا "سر" مشفَّر
  // فعليًا)، لذا نعتبره مفعّلاً إن كان isActive=true وبريد صالح مخزَّن في config (وليس secret).
  const camsEnabled = !!(camsConfig?.isActive && camsConfig?.config)
  let camsCredentials: CamsCredentials | null = null
  if (camsEnabled) {
    try {
      const cfg = camsConfig!.config ? JSON.parse(camsConfig!.config) : {}
      if (cfg.username) {
        camsCredentials = { username: cfg.username }
      } else {
        errors.push({ projectId: '-', projectName: '-', source: 'CAMS', error: 'البريد الإلكتروني المسجَّل في soda-pro.com غير مُدخَل' })
      }
    } catch {
      errors.push({ projectId: '-', projectName: '-', source: 'CAMS', error: 'تعذّر قراءة إعدادات CAMS المخزّنة' })
    }
  }

  // CDSE: مصادقة OAuth2 قياسية — Client ID في config العادي، Client Secret مشفَّر
  const cdseEnabled = !!(cdseConfig?.isActive && cdseConfig?.config && cdseConfig?.encryptedSecret)
  // تسجيل تشخيصي صريح: يطبع حالة كل شرط فرعي بغض النظر عن النتيجة النهائية، لتفادي
  // فشل صامت بلا أي أثر في السجلات إن كان cdseEnabled=false لسبب غير متوقع.
  console.log('[space-data-sync] CDSE config check:', {
    found: !!cdseConfig,
    isActive: cdseConfig?.isActive,
    hasConfig: !!cdseConfig?.config,
    hasEncryptedSecret: !!cdseConfig?.encryptedSecret,
    cdseEnabled,
  })
  let cdseCredentials: CdseCredentials | null = null
  if (cdseEnabled) {
    try {
      const cfg = cdseConfig!.config ? JSON.parse(cdseConfig!.config) : {}
      if (cfg.clientId) {
        cdseCredentials = { clientId: cfg.clientId, clientSecret: decryptSecret(cdseConfig!.encryptedSecret!) }
      } else {
        errors.push({ projectId: '-', projectName: '-', source: 'CDSE', error: 'Client ID غير مُدخَل' })
      }
    } catch {
      errors.push({ projectId: '-', projectName: '-', source: 'CDSE', error: 'تعذّر قراءة إعدادات CDSE المخزّنة' })
    }
  }

  // المشاريع المؤهلة: لديها إحداثيات صالحة (طول/عرض) فقط
  const projects = await db.project.findMany({
    where: {
      latitude: { not: null },
      longitude: { not: null },
      status: { in: ['approved', 'active'] },
    },
    select: { id: true, name: true, nameAr: true, latitude: true, longitude: true },
  })

  for (const project of projects) {
    const lat = project.latitude!
    const lon = project.longitude!
    let anySuccessForProject = false

    // --- NASA POWER ---
    if (nasaEnabled) {
      try {
        const result = await fetchNasaPowerLatest(lat, lon)
        if (result) {
          await db.spaceDataObservation.upsert({
            where: {
              projectId_sourceKey_dataset_observedAt: {
                projectId: project.id,
                sourceKey: SOURCE_KEYS.NASA_POWER,
                dataset: 'NASA-POWER',
                observedAt: new Date(result.observedAt),
              },
            },
            update: {
              fetchedAt: new Date(), fetchRun: runLabel,
              ghiWm2: result.ghiWm2, temperatureC: result.temperatureC,
              windSpeedMs: result.windSpeedMs, humidityPct: result.humidityPct,
              precipitationMm: result.precipitationMm, rawPayload: JSON.stringify(result.raw),
            },
            create: {
              projectId: project.id, sourceId: nasaSource.id, sourceKey: SOURCE_KEYS.NASA_POWER,
              dataset: 'NASA-POWER', observedAt: new Date(result.observedAt), fetchRun: runLabel,
              latitude: lat, longitude: lon,
              ghiWm2: result.ghiWm2, temperatureC: result.temperatureC,
              windSpeedMs: result.windSpeedMs, humidityPct: result.humidityPct,
              precipitationMm: result.precipitationMm, qualityFlag: 'good',
              rawPayload: JSON.stringify(result.raw),
            },
          })
          observationsCreated++
          anySuccessForProject = true
        } else {
          errors.push({ projectId: project.id, projectName: project.nameAr || project.name, source: 'NASA POWER', error: 'لم يتم إرجاع بيانات صالحة' })
        }
      } catch (e: any) {
        errors.push({ projectId: project.id, projectName: project.nameAr || project.name, source: 'NASA POWER', error: e?.message || 'خطأ غير معروف' })
      }
    }

    // --- Google Earth Engine ---
    if (geeEnabled && geeServiceAccount) {
      try {
        const observations = await fetchGeeObservations(geeServiceAccount, lat, lon)
        for (const obs of observations) {
          await db.spaceDataObservation.upsert({
            where: {
              projectId_sourceKey_dataset_observedAt: {
                projectId: project.id,
                sourceKey: SOURCE_KEYS.GEE,
                dataset: obs.dataset,
                observedAt: new Date(obs.observedAt),
              },
            },
            update: {
              fetchedAt: new Date(), fetchRun: runLabel,
              ndvi: obs.ndvi, evi: obs.evi, lstC: obs.lstC,
              no2ColumnMolM2: obs.no2ColumnMolM2, aerosolIndex: obs.aerosolIndex,
              rawPayload: JSON.stringify(obs.raw),
            },
            create: {
              projectId: project.id, sourceId: geeSource.id, sourceKey: SOURCE_KEYS.GEE,
              dataset: obs.dataset, observedAt: new Date(obs.observedAt), fetchRun: runLabel,
              latitude: lat, longitude: lon,
              ndvi: obs.ndvi, evi: obs.evi, lstC: obs.lstC,
              no2ColumnMolM2: obs.no2ColumnMolM2, aerosolIndex: obs.aerosolIndex,
              qualityFlag: 'good', rawPayload: JSON.stringify(obs.raw),
            },
          })
          observationsCreated++
          anySuccessForProject = true
        }
        if (observations.length === 0) {
          errors.push({ projectId: project.id, projectName: project.nameAr || project.name, source: 'GEE', error: 'لم يتم إرجاع أي مؤشرات (قد تكون كل المجموعات بلا تغطية سحابية صافية ضمن النافذة الزمنية)' })
        }
      } catch (e: any) {
        errors.push({ projectId: project.id, projectName: project.nameAr || project.name, source: 'GEE', error: e?.message || 'خطأ غير معروف' })
      }
    }

    // --- CAMS ---
    if (camsEnabled && camsCredentials) {
      try {
        const result = await fetchCamsLatest(camsCredentials, lat, lon)
        if (result) {
          await db.spaceDataObservation.upsert({
            where: {
              projectId_sourceKey_dataset_observedAt: {
                projectId: project.id,
                sourceKey: SOURCE_KEYS.CAMS,
                dataset: 'CAMS',
                observedAt: new Date(result.observedAt),
              },
            },
            update: {
              fetchedAt: new Date(), fetchRun: runLabel,
              ghiWm2: result.ghiWm2, dniWm2: result.dniWm2, difWm2: result.difWm2, aod: result.aod,
              rawPayload: JSON.stringify(result.raw),
            },
            create: {
              projectId: project.id, sourceId: camsSource.id, sourceKey: SOURCE_KEYS.CAMS,
              dataset: 'CAMS', observedAt: new Date(result.observedAt), fetchRun: runLabel,
              latitude: lat, longitude: lon,
              ghiWm2: result.ghiWm2, dniWm2: result.dniWm2, difWm2: result.difWm2, aod: result.aod,
              qualityFlag: 'good', rawPayload: JSON.stringify(result.raw),
            },
          })
          observationsCreated++
          anySuccessForProject = true
        } else {
          errors.push({ projectId: project.id, projectName: project.nameAr || project.name, source: 'CAMS', error: 'لم يتم إرجاع بيانات صالحة' })
        }
      } catch (e: any) {
        errors.push({ projectId: project.id, projectName: project.nameAr || project.name, source: 'CAMS', error: e?.message || 'خطأ غير معروف' })
      }
    }

    // --- Copernicus Data Space Ecosystem (CDSE) ---
    if (cdseEnabled && cdseCredentials) {
      console.log(`[space-data-sync] CDSE: calling fetchCdseObservations for project ${project.id} (${project.nameAr || project.name}) at ${lat},${lon}`)
      try {
        const observations = await fetchCdseObservations(cdseCredentials, lat, lon)
        console.log(`[space-data-sync] CDSE: returned ${observations.length} observation(s) for project ${project.id}`, JSON.stringify(observations))
        for (const obs of observations) {
          await db.spaceDataObservation.upsert({
            where: {
              projectId_sourceKey_dataset_observedAt: {
                projectId: project.id,
                sourceKey: SOURCE_KEYS.CDSE,
                dataset: obs.dataset,
                observedAt: new Date(obs.observedAt),
              },
            },
            update: {
              fetchedAt: new Date(), fetchRun: runLabel,
              ndvi: obs.ndvi, evi: obs.evi, lstC: obs.lstC,
              no2ColumnMolM2: obs.no2ColumnMolM2, aerosolIndex: obs.aerosolIndex,
              rawPayload: JSON.stringify(obs.raw),
            },
            create: {
              projectId: project.id, sourceId: cdseSource.id, sourceKey: SOURCE_KEYS.CDSE,
              dataset: obs.dataset, observedAt: new Date(obs.observedAt), fetchRun: runLabel,
              latitude: lat, longitude: lon,
              ndvi: obs.ndvi, evi: obs.evi, lstC: obs.lstC,
              no2ColumnMolM2: obs.no2ColumnMolM2, aerosolIndex: obs.aerosolIndex,
              qualityFlag: 'good', rawPayload: JSON.stringify(obs.raw),
            },
          })
          observationsCreated++
          anySuccessForProject = true
        }
        if (observations.length === 0) {
          errors.push({ projectId: project.id, projectName: project.nameAr || project.name, source: 'CDSE', error: 'لم يتم إرجاع أي مؤشرات (قد تكون كل المشاهد ضمن النافذة الزمنية مغطاة بالسحاب بالكامل)' })
        }
      } catch (e: any) {
        errors.push({ projectId: project.id, projectName: project.nameAr || project.name, source: 'CDSE', error: e?.message || 'خطأ غير معروف' })
      }
    }

    if (anySuccessForProject || (!nasaEnabled && !geeEnabled && !camsEnabled && !cdseEnabled)) {
      projectsOk++
    } else {
      projectsFailed++
    }
  }

  const finalStatus = errors.length === 0 ? 'success' : (projectsOk > 0 ? 'partial' : 'failed')

  await db.spaceDataSyncRun.update({
    where: { id: syncRun.id },
    data: {
      finishedAt: new Date(),
      status: finalStatus,
      projectsTotal: projects.length,
      projectsOk,
      projectsFailed,
      observationsCreated,
      errorSummary: errors.length > 0 ? JSON.stringify(errors) : null,
    },
  })

  // تحديث حالة آخر مزامنة لكل مصدر (لعرضها في قسم التكاملات) — فقط للمصادر المفعّلة فعليًا
  const now = new Date()
  await db.spaceDataSource.update({
    where: { id: nasaSource.id },
    data: nasaEnabled
      ? { lastSyncAt: now, lastSyncStatus: errors.some((e) => e.source === 'NASA POWER') ? 'partial' : 'success' }
      : {},
  })
  if (geeEnabled) {
    await db.spaceDataSource.update({
      where: { id: geeSource.id },
      data: { lastSyncAt: now, lastSyncStatus: errors.some((e) => e.source === 'GEE') ? 'partial' : 'success' },
    })
  }
  if (camsEnabled) {
    await db.spaceDataSource.update({
      where: { id: camsSource.id },
      data: { lastSyncAt: now, lastSyncStatus: errors.some((e) => e.source === 'CAMS') ? 'partial' : 'success' },
    })
  }
  if (cdseEnabled) {
    await db.spaceDataSource.update({
      where: { id: cdseSource.id },
      data: { lastSyncAt: now, lastSyncStatus: errors.some((e) => e.source === 'CDSE') ? 'partial' : 'success' },
    })
  }

  return {
    runId: syncRun.id,
    runLabel,
    projectsTotal: projects.length,
    projectsOk,
    projectsFailed,
    observationsCreated,
    errors,
  }
}
