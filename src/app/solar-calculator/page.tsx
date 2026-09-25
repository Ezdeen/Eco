import type { Metadata } from 'next'
import Link from 'next/link'
import { Leaf } from 'lucide-react'
import { SolarCalculatorWidget } from '@/components/public/solar-calculator-widget'

export const metadata: Metadata = {
  title: 'حاسبة القرض الأخضر الشمسي | Eco Ledger',
  description:
    'احسب توفيرك الشهري، فترة الاسترداد، والأثر البيئي لتحويل استهلاكك للطاقة الشمسية عبر قرض أخضر — واحصل على تقرير PDF جاهز لعرضه على البنك.',
}

// Public, unauthenticated route — intentionally outside the authenticated
// dashboard shell in src/app/page.tsx. Linked from the login screen as a
// lead-gen teaser (see the CTA added to src/components/auth/login-section.tsx).
export default function SolarCalculatorPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-background to-background py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <Leaf className="h-4 w-4 text-green-600" /> Eco Ledger
          </Link>
          <Link href="/" className="text-sm text-green-700 hover:underline">
            تسجيل الدخول إلى المنصة →
          </Link>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold">حاسبة القرض الأخضر الشمسي</h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
            اعرف خلال أقل من دقيقة كم يمكنك أن توفّر شهريًا بتحويل منزلك أو منشأتك للطاقة الشمسية عبر تمويل أخضر،
            وكم من انبعاثات الكربون يمكنك تجنبها.
          </p>
        </div>

        <SolarCalculatorWidget />
      </div>
    </main>
  )
}
