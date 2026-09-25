// يُنفَّذ تلقائيًا بواسطة npm/bun/yarn عند كل `install` (عبر hook "postinstall" في
// package.json) — بصرف النظر عمّا هو مكتوب في حقل "Build Command" على لوحة تحكم
// منصة الاستضافة (Render، إلخ). هذا الضمان ضروري لأن الاعتماد فقط على تسلسل داخل
// سكريبت "build" افترض خطأً أن Render يستدعي "npm run build" أو "bun run build"
// حرفيًا، بينما تُظهر رسالة الخطأ الفعلية في الإنتاج
// ("Executable doesn't exist at /opt/render/.cache/ms-playwright/...") أن
// PLAYWRIGHT_BROWSERS_PATH=0 لم يُطبَّق إطلاقًا — أي أن ذلك الافتراض كان خاطئًا.
//
// PLAYWRIGHT_BROWSERS_PATH=0 يجبر Playwright على تثبيت المتصفح داخل
// node_modules/playwright-core/.local-browsers بدل المسار الافتراضي خارج
// node_modules (~/.cache/ms-playwright على Linux) — وهذا ضروري لأن
// next.config.ts → outputFileTracingIncludes ينسخ node_modules/playwright-core/**
// فقط إلى .next/standalone، ولا يعرف عن أي مسار cache خارجي.

import { execSync } from 'node:child_process'

const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '0' }

try {
  console.log('[postinstall] Installing Playwright Chromium into node_modules/playwright-core ...')
  execSync('npx playwright install chromium', { stdio: 'inherit', env })
  console.log('[postinstall] Playwright Chromium installed successfully.')
} catch (error) {
  // لا نُفشل التثبيت بالكامل (exit non-zero) بسبب فشل هذه الخطوة وحدها — منصات
  // استضافة بعضها تمنع تحميل ملفات ثنائية كبيرة أو تحتاج صلاحيات إضافية
  // (--with-deps) غير متاحة في بيئة postinstall. تصدير PDF سيفشل حينها برسالة
  // واضحة وقت الاستخدام الفعلي بدل إفشال كل عملية النشر بصمت غامض هنا.
  console.error('[postinstall] Playwright Chromium install failed — PDF export will not work until this is resolved:')
  console.error(error?.message || error)
}
