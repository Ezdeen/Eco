import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowLeft,
  ChartNoAxesCombined,
  Leaf,
  Sparkles,
  Sun,
} from 'lucide-react'
import { SolarCalculatorWidget } from '@/components/public/solar-calculator-widget'

export const metadata: Metadata = {
  title: 'حاسبة القرض الأخضر الشمسي | Eco Ledger',
  description:
    'احسب توفيرك الشهري، فترة الاسترداد، والأثر البيئي لتحويل استهلاكك للطاقة الشمسية عبر قرض أخضر — واحصل على تقرير PDF جاهز لعرضه على البنك.',
}

export default function SolarCalculatorPage() {
  return (
    <main
      dir="rtl"
      className="relative isolate min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 sm:py-10"
    >
      {/* طبقات زخرفية فقط، لا تعترض النقر أو قارئ الشاشة */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-50/90 via-background to-background dark:from-emerald-950/30" />

<div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-200/35 blur-3xl dark:bg-emerald-800/15" />

<div className="absolute -left-32 top-64 h-80 w-80 rounded-full bg-amber-100/50 blur-3xl dark:bg-amber-900/10" />

<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
      </div>

<div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-emerald-900/10 pb-5 dark:border-emerald-100/10">
          <Link
            href="/"
            aria-label="Eco Ledger — الصفحة الرئيسية"
            className="group inline-flex items-center gap-2.5 rounded-xl outline-none motion-safe:transition-colors hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-4 focus-visible:ring-offset-background dark:hover:text-emerald-300"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-200/70 bg-white/80 text-emerald-700 shadow-sm motion-safe:transition-colors group-hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300 dark:group-hover:bg-emerald-900/60">
              <Leaf aria-hidden="true" className="h-5 w-5" />
            </span>

<span dir="ltr" className="text-sm font-bold tracking-tight">
              Eco Ledger
            </span>
          </Link>

<Link
            href="/"
            className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-emerald-200/80 bg-white/80 px-4 py-2 text-xs font-semibold text-emerald-800 shadow-sm outline-none motion-safe:transition-[background-color,border-color,box-shadow] hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-5 sm:text-sm dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:border-emerald-600 dark:hover:bg-emerald-900/50"
          >
            تسجيل الدخول إلى المنصة
            <ArrowLeft
              aria-hidden="true"
              className="h-4 w-4 shrink-0 motion-safe:transition-transform motion-safe:group-hover:-translate-x-1"
            />
          </Link>
        </header>

<section
          aria-labelledby="calculator-title"
          className="px-1 pb-8 pt-10 text-center sm:pb-10 sm:pt-14"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-4 py-2 text-xs font-medium text-emerald-800 shadow-sm dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-200">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            خطوة أذكى نحو طاقة أنظف
          </div>

<div
            aria-hidden="true"
            className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl border border-white/80 bg-gradient-to-br from-emerald-500 to-teal-700 text-white shadow-lg shadow-emerald-700/20 dark:border-emerald-400/20"
          >
            <Sun className="h-8 w-8" strokeWidth={1.5} />
            <span className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full border-4 border-background bg-amber-100 text-amber-800 dark:bg-amber-200">
              <Leaf className="h-3 w-3" />
            </span>
          </div>

<h1
            id="calculator-title"
            className="text-3xl font-extrabold leading-snug tracking-tight sm:text-4xl sm:leading-snug"
          >
            حاسبة القرض
            <span className="mt-1 block text-emerald-700 dark:text-emerald-400">
              الأخضر الشمسي
            </span>
          </h1>

<p className="mx-auto mt-5 max-w-xl text-sm leading-8 text-muted-foreground sm:text-base sm:leading-8">
            اعرف خلال أقل من دقيقة كم يمكنك أن توفّر شهريًا بتحويل منزلك
            أو منشأتك للطاقة الشمسية عبر تمويل أخضر، وكم من انبعاثات
            الكربون يمكنك تجنبها.
          </p>

<ul className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            {[
              { label: 'التوفير الشهري', icon: ChartNoAxesCombined },
              { label: 'فترة الاسترداد', icon: Sun },
              { label: 'الأثر البيئي', icon: Leaf },
            ].map(({ label, icon: Icon }) => (
              <li
                key={label}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-2 text-xs font-medium text-muted-foreground sm:px-4"
              >
                <Icon
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                />
                {label}
              </li>
            ))}
          </ul>
        </section>

{/* الحاسبة كما هي، دون تعديل وظائفها أو حقولها */}
        <section
          aria-label="حاسبة التمويل الشمسي"
          className="relative rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-white/90 via-white/60 to-emerald-50/60 p-2 shadow-xl shadow-emerald-950/5 sm:p-3 dark:border-emerald-800/50 dark:from-emerald-950/30 dark:via-background dark:to-background dark:shadow-black/20"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent"
          />

<SolarCalculatorWidget />
        </section>

<footer className="pb-3 pt-8 text-center">
          <p className="inline-flex items-center justify-center gap-2 text-xs leading-6 text-muted-foreground">
            <Leaf
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            خيارات أوضح اليوم، وأثر أكثر استدامة غدًا.
          </p>
        </footer>
      </div>
    </main>
  )
}
