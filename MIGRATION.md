# دليل ترحيل قاعدة البيانات من SQLite إلى PostgreSQL

## نظرة عامة

هذا الدليل يوضح كيفية ترحيل قاعدة البيانات من SQLite إلى PostgreSQL بدون فقدان أي بيانات، مع الحفاظ على جميع IDs والعلاقات.

---

## 1. المتطلبات

- PostgreSQL >= 14 مثبت ومشغّل
- `better-sqlite3` مثبت (لقراءة SQLite)
- نسخة احتياطية من `db/custom.db`

---

## 2. خطوات ما قبل الترحيل

### 2.1 نسخة احتياطية من SQLite
```bash
cp db/custom.db db/custom.db.backup-$(date +%Y%m%d)
```

### 2.2 إنشاء قاعدة بيانات PostgreSQL
```bash
psql -U postgres -c "CREATE DATABASE esg_solar;"
```

### 2.3 تحديث `.env`
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/esg_solar?schema=public
```

### 2.4 تحديث `prisma/schema.prisma`
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

## 3. تنفيذ الترحيل

### 3.1 توليد Prisma Client
```bash
bun run db:generate
```

### 3.2 إنشاء المخطط في PostgreSQL
```bash
bun run db:push
```

### 3.3 Dry Run (اختبار بدون كتابة)
```bash
DRY_RUN=true bun scripts/migrate-to-postgres.ts
```

### 3.4 الترحيل الفعلي
```bash
bun scripts/migrate-to-postgres.ts
```

---

## 4. التحقق بعد الترحيل

```bash
bun scripts/verify-migration.ts
```

الناتج المتوقع:
```
✅ Row counts match: YES
✅ Sample IDs match: YES
✅ Admin user exists
✅ Organization exists
✅ Projects exist: 7
✅ Energy readings exist: 1680
✅ Reports exist: 3
✅ Audit events exist: 35
✅ No orphan memberships
✅ No orphan attestations
```

---

## 5. خطة التراجع (Rollback Plan)

إذا فشل الترحيل:

1. **استعادة SQLite:**
```bash
cp db/custom.db.backup-YYYYMMDD db/custom.db
```

2. **إعادة `.env`:**
```env
DATABASE_URL=file:/home/z/my-project/db/custom.db
```

3. **إعادة `schema.prisma`:**
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

4. **إعادة توليد:**
```bash
bun run db:push
```

5. **إعادة تشغيل الخادم:**
```bash
bun run dev
```

---

## 6. ترتيب جداول الترحيل (يحترم Foreign Keys)

1. Organization
2. User
3. UserMembership
4. Project
5. Site
6. Asset
7. SolarAssetProfile
8. Device
9. EnergyReading
10. CalculationRun
11. AttestationBatch
12. ImpactAccount
13. ImpactUnit
14. Report
15. Case
16. Notification
17. AuditEvent
18. GridEmissionFactor
19. Tariff
20. ConversionFactor
21. Methodology
22. IngestionBatch
23. RawPayload
24. ReadingAdjustment
25. ValidationRule
26. ValidationResult
27. WeatherSource
28. WeatherObservation
29. ExpectedYieldModel
30. OutboxEvent
31. ReconciliationRun

---

## 7. التحضير لـ SaaS

بعد الترحيل الناجح:

- ✅ العزل حسب `organizationId` موجود في كل APIs
- ✅ `requireAuth()` و `requirePermission()` على كل المسارات
- ✅ نموذج `IntegrationConfig` لإدارة الأسرار مشفرة
- ✅ نموذج `WebhookEvent` لاستقبال بيانات n8n
- ✅ نماذج `Plan` و `Subscription` جاهزة للـ billing
- 🔲 تحويل التسجيل إلى invite-only
- 🔲 إضافة Stripe للدفع
- 🔲 إضافة rate limiting بـ Redis

---

## 8. n8n Webhook Setup

### إعداد HMAC:
```env
N8N_WEBHOOK_SECRET=your-secure-secret-here
```

### Headers المطلوبة من n8n:
```
x-n8n-signature: <HMAC-SHA256 of payload>
x-n8n-timestamp: <Unix ms timestamp>
x-n8n-event-id: <unique event ID>
x-source-id: <device or project identifier>
```

### Payload format:
```json
{
  "projectId": "cmr...",
  "eventType": "reading_ingest",
  "readings": [
    {
      "deviceId": "cmr...",
      "metricType": "energy_export_kwh",
      "measuredAt": "2026-07-17T10:00:00Z",
      "value": 125.5,
      "unit": "kWh"
    }
  ]
}
```
