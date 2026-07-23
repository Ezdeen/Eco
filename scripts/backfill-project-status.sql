-- =====================================================================
-- Backfill script — تحديث المشاريع الموجودة (draft → active)
-- =====================================================================
-- استراتيجية التشغيل:
--   1. اعرض المشاريع المرشحة (DRY RUN).
--   2. فعّل المشروع إلى status='active' إذا تحققت كل الشروط:
--        - لديه موقع (sites.count > 0)
--        - لديه أصل (assets.count > 0)
--        - status الحالي ليس 'decommissioned' أو 'suspended'
--      ويُضبط commissionedAt إلى تاريخ أول قراءة (أو now()).
--   3. COMMIT يدويًا — اقرأ المخرجات قبل التأكيد.
-- =====================================================================

\echo '═══════════════════════════════════════════════════════════════'
\echo '  DRY RUN — المشاريع المرشحة للتفعيل'
\echo '═══════════════════════════════════════════════════════════════'

SELECT
  p.id, p.code, p.name, p."nameAr",
  p.status           AS current_status,
  p."commissionedAt" AS current_commissioned_at,
  (SELECT COUNT(*) FROM "Site"          s WHERE s."projectId" = p.id) AS sites_count,
  (SELECT COUNT(*) FROM "Asset"         a WHERE a."projectId" = p.id) AS assets_count,
  (SELECT COUNT(*) FROM "Device"        d WHERE d."projectId" = p.id) AS devices_count,
  (SELECT COUNT(*) FROM "EnergyReading" r WHERE r."projectId" = p.id) AS readings_count,
  (SELECT MIN(r."measuredAt") FROM "EnergyReading" r WHERE r."projectId" = p.id) AS first_reading_at
FROM "Project" p
WHERE p.status IN ('draft', 'under_review', 'approved')
  AND p.status <> 'decommissioned'
  AND EXISTS (SELECT 1 FROM "Site" s WHERE s."projectId" = p.id)
  AND EXISTS (SELECT 1 FROM "Asset" a WHERE a."projectId" = p.id)
ORDER BY p."createdAt" ASC;

BEGIN;

UPDATE "Project" p
SET
  status = 'active',
  "commissionedAt" = COALESCE(
    p."commissionedAt",
    (SELECT MIN(r."measuredAt") FROM "EnergyReading" r WHERE r."projectId" = p.id),
    NOW()
  ),
  "updatedAt" = NOW()
WHERE p.status IN ('draft', 'under_review', 'approved')
  AND p.status <> 'decommissioned'
  AND EXISTS (SELECT 1 FROM "Site"  s WHERE s."projectId" = p.id)
  AND EXISTS (SELECT 1 FROM "Asset" a WHERE a."projectId" = p.id);

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '  الإحصائيات بعد التحديث (قبل COMMIT)'
\echo '═══════════════════════════════════════════════════════════════'

SELECT
  status,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE "commissionedAt" IS NOT NULL) AS with_commissioned_at
FROM "Project"
GROUP BY status
ORDER BY status;

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '  للتراجع:  ROLLBACK;'
\echo '  للتأكيد:  COMMIT;'
\echo '═══════════════════════════════════════════════════════════════'
