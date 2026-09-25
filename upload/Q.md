\# برومبت احترافي لتحويل المشروع إلى PostgreSQL وتجهيزه كمنصة SaaS

\## البرومبت

أريد تنفيذ ترحيل احترافي وآمن لمشروع منصة ESG للطاقة الشمسية من SQLite إلى PostgreSQL، مع الحفاظ الكامل على البيانات الحالية وهيكل العلاقات، وتجهيز المشروع للتحول إلى SaaS متعدد المؤسسات.

المشروع الحالي مبني بـ Next.js App Router وReact وPrisma، ويحتوي على:

\- مؤسسات Organizations

\- مستخدمين Users

\- عضويات UserMemberships

\- مشاريع Projects

\- مواقع Sites

\- أصول Assets

\- أجهزة Devices

\- قراءات EnergyReadings

\- تقارير Reports

\- حسابات ESG

\- سجل تدقيق AuditEvents

\- IngestionBatches وRawPayloads

\- تكامل Hedera

\- صلاحيات RBAC/ABAC

\- واجهة عربية RTL

المطلوب تنفيذ خطة تحويل شاملة وآمنة تشمل الآتي:

\---

\## 1. تحليل الوضع الحالي

\- افحص Prisma schema الحالي بالكامل.

\- افحص العلاقات بين الجداول والقيود والفهارس.

\- حدّد أي اختلافات مهمة بين SQLite وPostgreSQL.

\- حدّد الحقول التي تخزن JSON كنص، واقترح هل تبقى Text مؤقتًا أم تتحول لاحقًا إلى Json/JsonB.

\- تأكد أن IDs الحالية من نوع cuid أو string محفوظة كما هي أثناء النقل.

\---

\## 2. تجهيز PostgreSQL

\- عدّل datasource في Prisma من sqlite إلى postgresql.

\- لا تكسر أسماء الجداول أو العلاقات.

\- أنشئ DATABASE\_URL مناسبًا لـ PostgreSQL.

\- أنشئ migration نظيفًا يعكس نفس الهيكل الحالي.

\- لا تفقد أي unique constraints أو indexes أو foreign keys.

\- راجع العلاقات التي كانت SQLite تتساهل معها وقد يرفضها PostgreSQL.

\---

\## 3. ترحيل البيانات بدون فقدان

\- أنشئ سكربت ترحيل آمن يقرأ من SQLite ويكتب إلى PostgreSQL.

\- حافظ على نفس IDs الأصلية لجميع السجلات.

\- نفّذ الاستيراد بترتيب يحترم العلاقات:

1\. Organizations

2\. Users

3\. UserMemberships

4\. Projects

5\. Sites

6\. Assets

7\. SolarAssetProfiles

8\. Devices

9\. EnergyReadings

10\. CalculationRuns

11\. AttestationBatches

12\. ImpactAccounts

13\. ImpactUnits

14\. Reports

15\. Cases

16\. Notifications

17\. AuditEvents

18\. Reference data مثل GridEmissionFactor وTariff وConversionFactor وMethodology

19\. IngestionBatches

20\. RawPayloads

21\. ReadingAdjustments

22\. ValidationRules

23\. ValidationResults

24\. WeatherSources

25\. WeatherObservations

26\. ExpectedYieldModels

27\. OutboxEvents

28\. ReconciliationRuns

\- استخدم transactions قدر الإمكان.

\- أضف معالجة واضحة للأخطاء.

\- أضف dry-run mode قبل التنفيذ الفعلي.

\- أضف logs توضح عدد السجلات المنقولة لكل جدول.

\- لا تشغّل التطبيق أثناء الترحيل النهائي حتى لا تدخل بيانات جديدة في SQLite.

\---

\## 4. التحقق بعد الترحيل

\- قارِن عدد الصفوف بين SQLite وPostgreSQL لكل جدول.

\- تحقّق من سلامة foreign keys.

\- تحقّق من unique constraints.

\- تحقّق من تسجيل الدخول.

\- تحقّق من صلاحيات RBAC/ABAC.

\- تحقّق من ظهور المؤسسات والمشاريع والقراءات والتقارير.

\- تحقّق من خط الاستيعاب ingestion.

\- تحقّق من Hedera outbox/reconciliation.

\- تحقّق من تحميل التقارير وسجل التدقيق.

\- أنشئ تقرير تحقق migration verification report.

\---

\## 5. تجهيز SaaS متعدد المؤسسات

بعد نجاح التحويل إلى PostgreSQL، أضف أو حضّر البنية التالية بدون كسر النظام الحالي:

\- عزل صارم للبيانات حسب organizationId.

\- مراجعة كل API routes والتأكد من استخدام requireAuth أو requireProjectAccess حسب الحاجة.

\- منع ربط المستخدم الجديد تلقائيًا بأول مؤسسة.

\- تحويل التسجيل إلى invite-only أو onboarding آمن.

\- إضافة rate limiting لمسارات login/register/webhooks.

\- تجهيز بنية plans/subscriptions/usage limits لاحقًا.

\- تجهيز إمكانية إضافة billing لاحقًا.

\---

\## 6. إدارة أسرار التكاملات

أضف تصميمًا قابلًا للتنفيذ لإدارة تكاملات قابلة للتحرير من لوحة الإدارة، خاصة Hedera:

\- إنشاء نموذج IntegrationConfig.

\- إنشاء نموذج ApiCredential أو SecretReference.

\- تخزين الأسرار مشفرة server-side.

\- عدم عرض الأسرار بعد حفظها.

\- عرض القيم فقط بصيغة masked.

\- إضافة test connection.

\- إضافة AuditEvent عند إنشاء أو تعديل أو اختبار التكامل.

\- السماح بالتعديل فقط لأدوار platform\_admin أو org\_admin.

\- منع HEDERA\_NETWORK=simulation في الإنتاج.

\- دعم إعداد Hedera على مستوى المؤسسة أو المشروع عند الحاجة.

\---

\## 7. تكامل n8n مع حزمة بيانات مشفرة

صمّم ونفّذ endpoint آمن لاستقبال بيانات مشفرة من n8n:

\- endpoint مقترح: POST /api/webhooks/n8n

\- التحقق من headers مثل:

\- x-n8n-signature

\- x-n8n-timestamp

\- x-n8n-event-id

\- x-source-id

\- منع replay attacks عبر timestamp وeventId.

\- التحقق من HMAC signature.

\- فك تشفير payload باستخدام AES-256-GCM أو معيار JWE/JWS.

\- تحويل الحزمة بعد فك التشفير إلى صيغة ingestReadings الحالية.

\- استخدام idempotencyKey لمنع التكرار.

\- حفظ WebhookEvent وWebhookDelivery أو سجل مشابه للنجاح والفشل.

\- عدم تخزين مفاتيح n8n في الواجهة.

\- دعم rotation لمفاتيح n8n.

\---

\## 8. تحسين الأداء بعد PostgreSQL

\- أضف pagination للقراءات والتقارير والتدقيق والتنبيهات.

\- استخدم select بدل include الواسع عند الإمكان.

\- أضف فهارس إضافية للحقول كثيرة الاستخدام مثل:

\- organizationId

\- projectId

\- measuredAt

\- deviceId

\- metricType

\- status

\- createdAt

\- عطّل Prisma query logging في production.

\- اقترح lazy loading لأقسام الواجهة الكبيرة.

\- انقل توليد التقارير الثقيلة وHedera outbox إلى worker أو cron لاحقًا.

\---

\## 9. شروط القبول

يجب ألا يعتبر العمل مكتملًا إلا إذا:

\- التطبيق يعمل على PostgreSQL.

\- البيانات القديمة موجودة بالكامل.

\- العلاقات محفوظة.

\- تسجيل الدخول يعمل.

\- لوحة المشاريع والقراءات والتقارير تعمل.

\- لا توجد أخطاء foreign key.

\- لا توجد خسارة في IDs.

\- يمكن تشغيل migration verification report.

\- يوجد rollback plan واضح.

\- توجد نسخة احتياطية من SQLite قبل الترحيل.

\- تم توثيق خطوات التشغيل والترحيل.

\---

\## 10. المخرجات المطلوبة

أريد المخرجات التالية:

\- خطة تنفيذ تفصيلية قبل التعديل.

\- قائمة الملفات التي ستتغير.

\- نسخة احتياطية من قاعدة SQLite قبل أي تغيير.

\- تحديث Prisma schema.

\- سكربت migration من SQLite إلى PostgreSQL.

\- سكربت verification بعد الترحيل.

\- تقرير بالمخاطر والحلول.

\- تعليمات تشغيل محلية وproduction.

\- توصيات المرحلة التالية للتحول الكامل إلى SaaS.

نفّذ العمل بطريقة إنتاجية، آمنة، قابلة للمراجعة، ولا تستخدم حلولًا وهمية أو حذفًا للبيانات. الأولوية المطلقة هي عدم فقدان البيانات وعدم كسر العلاقات الحالية.

\---

\## نسخة مختصرة جدًا

حوّل مشروع Next.js + Prisma الحالي من SQLite إلى PostgreSQL بدون فقدان بيانات، مع الحفاظ على IDs والعلاقات، وإضافة سكربت ترحيل وتحقق، ثم جهّز البنية لإدارة تكاملات SaaS آمنة مثل Hedera وn8n encrypted webhooks مع عزل المؤسسات وإدارة أسرار مشفرة.