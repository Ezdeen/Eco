# ESG Solar Platform — دليل النشر للإنتاج

## المتطلبات

- **Bun** >= 1.3 (إلزامي للإنتاج)
- **PostgreSQL** >= 14
- **Node.js** >= 20 (للتوافق مع Next.js 16)

---

## 1. إعداد قاعدة البيانات (PostgreSQL)

```bash
# إنشاء قاعدة البيانات
psql -U postgres -c "CREATE DATABASE esg_solar;"

# تحديث prisma/schema.prisma:
# غيّر provider من "sqlite" إلى "postgresql"
```

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

## 2. إعداد متغيرات البيئة

```bash
cp .env.example .env
```

عدّل `.env` بالقيم الإنتاجية:

```env
DATABASE_URL=postgresql://user:password@host:5432/esg_solar?schema=public
JWT_SECRET=$(openssl rand -base64 32)
NODE_ENV=production
HEDERA_NETWORK=testnet  # أو mainnet
HEDERA_OPERATOR_ID=0.0.xxxx
HEDERA_OPERATOR_KEY=302e020100300506032b657004220420xxxx
HEDERA_TOPIC_ID=0.0.xxxx
```

### ⚠️ تحذيرات إلزامية:
- `JWT_SECRET` **مطلوب** — المشروع سيفشل بدونها في الإنتاج
- `HEDERA_NETWORK=simulation` **ممنوع** في الإنتاج
- يجب ضبط `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, `HEDERA_TOPIC_ID` عند استخدام testnet/mainnet

---

## 3. مسار النشر الكامل

```bash
# 1. تثبيت الاعتماديات
bun install

# 2. توليد Prisma Client
bun run db:generate

# 3. تنفيذ migrations
bun run db:migrate:deploy

# 4. فحص lint
bun run lint

# 5. فحص TypeScript
bun run typecheck

# 6. بناء المشروع
bun run build

# 7. تشغيل smoke test
bun run smoke-test

# 8. تشغيل الخادم الإنتاجي
bun run start
```

### أمر مختصر للنشر الكامل:
```bash
bun run deploy
```

---

## 4. التحقق بعد النشر

```bash
# فحص صحة الخادم
curl https://your-domain.com/api

# فحص المصادقة (يجب فشل بدون cookie)
curl https://your-domain.com/api/dashboard
#Expected: {"error":"غير مصرح - يلزم تسجيل الدخول"}

# تسجيل الدخول
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@bfec.sa","password":"Admin@123456"}'
```

---

## 5. Seed للتطوير فقط

```bash
# تطوير فقط - لا تعمل في الإنتاج
bun run seed:dev
```

---

## 6. إعدادات Cookie

| البيئة | secure | sameSite |
|---|---|---|
| development | false | lax |
| production | true | strict |

---

## 7. حالة Hedera

| الوضع | الوصف | مسموح في الإنتاج |
|---|---|---|
| simulation | محاكاة بدون شبكة حقيقية | ❌ ممنوع |
| testnet | شبكة اختبار Hedera | ✅ مسموح |
| mainnet | شبكة الإنتاج Hedera | ✅ مسموح |

---

## 8. أوامر مفيدة

```bash
# إعادة تعيين قاعدة البيانات (تطوير فقط)
bun run db:reset

# إنشاء migration جديد
bun run db:migrate --name add_new_table

# فحص TypeScript فقط
bun run typecheck

# فحص lint فقط
bun run lint
```
