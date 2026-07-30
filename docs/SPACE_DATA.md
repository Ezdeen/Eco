# البيانات الفضائية (Space Data)

## نظرة عامة
قسم جديد يجلب بيانات استشعار عن بعد (satellite / earth observation) لكل مشروع في المنصة
اعتمادًا على إحداثياته (`latitude`, `longitude`)، من 3 مصادر مفتوحة المصدر:

| المصدر | يوفّر | مفتاح مطلوب | البروتوكول الفعلي |
|---|---|---|---|
| **NASA POWER** | الإشعاع الشمسي التاريخي (GHI)، درجة حرارة الهواء، سرعة الرياح، الرطوبة، الهطول | لا | REST API مجاني ومباشر بالكامل |
| **Google Earth Engine** | NDVI/EVI (Sentinel-2, MODIS, Landsat)، حرارة سطح الأرض (MODIS LST)، NO2 (Sentinel-5P) | نعم (Service Account JSON) | Earth Engine REST API + OAuth2 JWT Bearer |
| **CAMS (Copernicus Atmosphere)** | الإشعاع الشمسي الفعلي GHI/DNI/DIF ونسبة الغبار AOD | نعم (حساب ADS مجاني) | CAMS Radiation Service (WPS REST) |

## قرار معماري مهم: لا توجد بيئة Python في هذا المشروع
مشروعك الحالي بالكامل Next.js/TypeScript. المكتبتان المذكورتان أصلاً (`earthengine-api`
و`ecmwf-api-client`) هما مكتبتا Python، لكنهما فعليًا **أغلفة رفيعة (wrappers)** فوق REST
APIs حقيقية. لذلك تم تطبيق نفس البروتوكولات مباشرة بـ TypeScript بدون أي خدمة Python
منفصلة، لأن هذا يحافظ على:
- **الحوكمة والشفافية**: كل منطق الجلب داخل نفس الكود المصدري القابل للتدقيق، بدل قفزة إلى
  خدمة خارجية "صندوق أسود".
- **البساطة التشغيلية**: لا حاجة لنشر/صيانة حاوية Python إضافية أو إدارة اتصال بينها وبين
  Next.js.

التطبيق العملي:
- **NASA POWER**: `GET https://power.larc.nasa.gov/api/temporal/daily/point` — JSON مباشر.
- **Google Earth Engine**: توليع JWT بخوارزمية RS256 من Service Account، استبداله بـ
  access_token عبر `oauth2.googleapis.com/token` (تطبيق مباشر لـ RFC 7523)، ثم استدعاء
  `earthengine.googleapis.com/v1/projects/{project}/value:compute`.
- **CAMS**: استدعاء `api.soda-pro.com/service/wps` (خدمة CAMS Radiation المرتبطة بـ ADS)
  بمصادقة Basic Auth (username + ADS API key).

## البنية (الملفات الجديدة)
```
prisma/schema.prisma                                → SpaceDataSource, SpaceDataObservation, SpaceDataSyncRun
src/lib/space-data/nasa-power.ts                     → موصل NASA POWER
src/lib/space-data/google-earth-engine.ts            → موصل GEE (JWT + REST)
src/lib/space-data/cams.ts                           → موصل CAMS
src/lib/space-data/sync.ts                           → المنسّق الرئيسي (يُشغَّل لكل مشروع × مصدر)
src/app/api/space-data/route.ts                      → GET: جلب/فلترة/فرز القراءات
src/app/api/space-data/sync/route.ts                 → GET/POST: تشغيل دورة سحب (Cron أو يدوي)
src/components/sections/space-data-section.tsx       → واجهة القسم (جدول + فلاتر)
src/components/platform/sidebar.tsx (تعديل)          → عنصر تنقل "البيانات الفضائية"
src/app/page.tsx (تعديل)                              → تسجيل القسم الجديد
src/components/sections/integrations-section.tsx (تعديل)      → بطاقة حالة في التكاملات
src/components/sections/integration-config-section.tsx (تعديل) → قوالب إدخال المفاتيح
src/app/api/integrations/route.ts (تعديل)             → بيانات حالة الاتصال لكل مصدر
src/app/api/integration-config/[id]/test/route.ts (تعديل) → اختبار اتصال حي لكل مصدر
vercel.json                                           → 3 جداول Cron يومية
.env.example                                          → متغيرات البيئة الجديدة موثّقة
```

## نموذج البيانات (Prisma)
- **`SpaceDataSource`**: سجل واحد لكل مصدر (nasa_power / gee / cams)، يحفظ آخر حالة مزامنة.
- **`SpaceDataObservation`**: كل رصدة (قراءة) — مرتبطة بمشروع، بمصدر، وبنوع Dataset
  (Sentinel-2, Sentinel-5P, Landsat-8/9, MODIS, NASA-POWER, CAMS). تخزّن الحقول الموحّدة
  (GHI/DNI/DIF/AOD, حرارة/رياح/رطوبة, NDVI/EVI/LST/NO2) بغض النظر عن مصدرها الأصلي،
  بالإضافة إلى `rawPayload` (JSON خام) للتدقيق الكامل والشفافية.
  قيد فريد `(projectId, sourceKey, dataset, observedAt)` يمنع تكرار نفس الرصدة عند
  إعادة تشغيل المزامنة.
- **`SpaceDataSyncRun`**: سجل تدقيق لكل تشغيل يومي (نجاح/فشل جزئي/فشل كامل)، لدعم الحوكمة.

هذا كله يُخزَّن في **نفس قاعدة بيانات Supabase Postgres** التي يستخدمها المشروع حاليًا
(`DATABASE_URL`) عبر Prisma — لم يُنشأ أي اتصال Supabase منفصل، لأن `DATABASE_URL` الحالي
في `.env` يشير أصلاً إلى Supabase.

## الجدولة اليومية (3 مرات)
`vercel.json` يعرّف 3 Cron Jobs (Vercel يشغّلها بتوقيت UTC، مع تحويل من توقيت الرياض UTC+3):

| التوقيت المطلوب (الرياض) | UTC | Cron expression |
|---|---|---|
| 10:55 | 07:55 | `55 7 * * *` |
| 15:55 | 12:55 | `55 12 * * *` |
| 17:50 | 14:50 | `50 14 * * *` |

> **ملاحظة**: Cron Jobs على خطة Vercel المجانية (Hobby) تعمل **مرة واحدة يوميًا فقط**.
> لتفعيل 3 جداول منفصلة فعليًا يلزم خطة Pro أو استخدام مُجدوِل خارجي (مثل
> cron-job.org أو GitHub Actions scheduled workflow) يستدعي:
> `GET https://<your-domain>/api/space-data/sync?run=morning`
> مع رأس `Authorization: Bearer <CRON_SECRET>`.

## الأمان
- استدعاء `/api/space-data/sync` يتطلب إما:
  - رأس `Authorization: Bearer <CRON_SECRET>` (يضبطه Vercel تلقائيًا، أو مُجدوِلك الخارجي)، أو
  - جلسة مستخدم بصلاحية `settings:manage` (للتشغيل اليدوي من الواجهة).
- مفاتيح GEE (Service Account JSON كاملاً) وCAMS (API key) تُشفَّر بـ AES-256-GCM عبر
  `src/lib/crypto.ts` (نفس آلية تشفير مفتاح Hedera الخاص)، ولا تُعاد أبدًا في أي استجابة API.

## خطوات التفعيل بعد الدمج
```bash
# 1) تثبيت الحزم (لا حزم جديدة مطلوبة — كل الموصلات مبنية بـ fetch/crypto الأصليين في Node)
npm install

# 2) تحديث قاعدة البيانات (يُنشئ الجداول الجديدة في Supabase)
npx prisma generate
npx prisma migrate dev --name add_space_data

# 3) في بيئة الإنتاج (Vercel) بدل migrate dev:
npx prisma migrate deploy

# 4) أضف CRON_SECRET إلى متغيرات بيئة Vercel (Settings → Environment Variables)
```
ثم من واجهة المنصة → **التكاملات** → **إدارة الإعدادات**:
- **NASA POWER**: فعّله فقط (لا يحتاج مفتاح).
- **Google Earth Engine**: أنشئ Service Account من Google Cloud Console بصلاحية
  Earth Engine، فعّل Earth Engine API على المشروع، الصق **محتوى ملف JSON كاملاً** كـ secret.
- **CAMS**: سجّل حسابًا مجانيًا في https://ads.atmosphere.copernicus.eu، أدخل البريد
  الإلكتروني المسجَّل وAPI key.

اضغط "اختبار الاتصال" على كل بطاقة للتحقق قبل انتظار أول تشغيل مجدول، أو اضغط
"سحب البيانات الآن" من قسم "البيانات الفضائية" نفسه لتشغيل يدوي فوري.

## التوسعة المستقبلية (حوكمة وشفافية الكربون)
البنية مصمَّمة لدعم إضافة مصادر مفتوحة أخرى بسهولة (كل مصدر = ملف موصل جديد في
`src/lib/space-data/` + تسجيل في `sync.ts`)، مثل:
- **Sentinel-5P CO/CH4/O3** (إضافة أعمدة غازات دفيئة إضافية لدعم منهجيات شهادات الكربون).
- **ESA WorldCover / Global Forest Watch** (تغيّر الغطاء الأرضي — مهم لمشاريع التشجير ولمنع
  الادعاءات الكاذبة "double counting" في اعتمادات الكربون).
- **Copernicus Land Monitoring Service** (مؤشرات صحة الغابات طويلة المدى).
