'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Sun, Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck, Leaf, Zap, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface LoginSectionProps {
  onLoginSuccess: (user: any) => void
}

const DEMO_ACCOUNTS = [
  {
    email: 'admin@bfec.sa',
    password: 'Admin@123456',
    role: 'مدير المؤسسة',
    icon: '👨‍💼',
    ring: 'ring-emerald-200 dark:ring-emerald-800',
    chip: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300',
  },
  {
    email: 'project@bfec.sa',
    password: 'Project@123456',
    role: 'مدير المشروع',
    icon: '📋',
    ring: 'ring-violet-200 dark:ring-violet-800',
    chip: 'bg-violet-100 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300',
  },
]

export function LoginSection({ onLoginSuccess }: LoginSectionProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})

  const emailInvalid = touched.email && !email
  const passwordInvalid = touched.password && !password

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setTouched({ email: true, password: true })

    if (!email || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'فشل تسجيل الدخول')
        return
      }

      toast.success(`أهلاً ${data.user.name}! تم تسجيل الدخول بنجاح`)
      onLoginSuccess(data.user)
    } catch (err) {
      setError('حدث خطأ في الاتصال، يرجى المحاولة مرة أخرى')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (account: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(account.email)
    setPassword(account.password)
    setError('')
    setTouched({})
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-background to-teal-50 dark:from-emerald-950/30 dark:via-background dark:to-teal-950/20">
      {/* Ambient background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-emerald-300/25 dark:bg-emerald-900/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-teal-300/25 dark:bg-teal-900/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-emerald-100/20 dark:bg-emerald-950/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Left: Branding */}
        <div className="hidden lg:flex flex-col gap-6 p-8">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="شعار المنصة" className="h-14 w-14 rounded-2xl shrink-0 object-contain shadow-lg ring-1 ring-black/5" />
            <div>
              <h1 className="font-cairo text-2xl font-bold text-foreground">منصة ESG الشمسية</h1>
              <p className="text-sm text-muted-foreground">BrightFuture Energy Platform</p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="font-cairo text-3xl font-bold leading-tight text-foreground">
              قِس أثر مشاريعك الشمسية
              <br />
              <span className="bg-gradient-to-l from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                بشفافية وموثوقية
              </span>
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              منصة SaaS متعددة المؤسسات لقياس الأثر البيئي والاستدامة، بدعم توثيق Hedera وحسابات الكربون المتجنب وفق GHG Protocol.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-card border shadow-sm transition-shadow hover:shadow-md">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/70 text-emerald-600 dark:text-emerald-400 mb-2">
                <Zap className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-foreground">طاقة موثّقة</p>
              <p className="text-xs text-muted-foreground">قراءات في الوقت الفعلي</p>
            </div>
            <div className="p-4 rounded-xl bg-card border shadow-sm transition-shadow hover:shadow-md">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900/70 text-teal-600 dark:text-teal-400 mb-2">
                <Leaf className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-foreground">كربون متجنب</p>
              <p className="text-xs text-muted-foreground">وفق GHG Protocol</p>
            </div>
            <div className="p-4 rounded-xl bg-card border shadow-sm transition-shadow hover:shadow-md">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/70 text-blue-600 dark:text-blue-400 mb-2">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold text-foreground">توثيق Hedera</p>
              <p className="text-xs text-muted-foreground">سجل غير قابل للتعديل</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-4 border-t">
            <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900">
              <ShieldCheck className="h-3 w-3 ml-1" />
              JWT + HTTP-only
            </Badge>
            <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900">
              <Lock className="h-3 w-3 ml-1" />
              bcryptjs
            </Badge>
            <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900">
              <ShieldCheck className="h-3 w-3 ml-1" />
              RBAC + ABAC
            </Badge>
          </div>
        </div>

        {/* Right: Form */}
        <Card className="w-full shadow-2xl shadow-emerald-950/5 border-border/60 backdrop-blur">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center gap-3 lg:hidden">
              <img src="/logo.svg" alt="شعار المنصة" className="h-11 w-11 rounded-xl shrink-0 object-contain" />
              <div>
                <CardTitle className="text-lg">منصة ESG الشمسية</CardTitle>
                <CardDescription className="text-xs">BrightFuture Energy</CardDescription>
              </div>
            </div>

            <div className="hidden lg:block">
              <CardTitle className="text-2xl font-cairo">تسجيل الدخول</CardTitle>
              <CardDescription className="mt-1">
                سجّل دخولك للوصول إلى لوحة القيادة
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium">البريد الإلكتروني</Label>
                <div className="relative">
                  <Mail className={`absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${emailInvalid ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@bfec.sa"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (error) setError('')
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    className="pr-9 h-11"
                    aria-invalid={!!emailInvalid}
                    autoComplete="email"
                    autoFocus
                    required
                    dir="ltr"
                  />
                </div>
                {emailInvalid && (
                  <p className="text-xs text-destructive">هذا الحقل مطلوب</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium">كلمة المرور</Label>
                  <button
                    type="button"
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:underline underline-offset-2 transition-colors"
                    onClick={() => toast.info('تواصل مع مدير النظام لإعادة تعيين كلمة المرور')}
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
                <div className="relative">
                  <Lock className={`absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors ${passwordInvalid ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (error) setError('')
                    }}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    className="pr-9 pl-9 h-11"
                    aria-invalid={!!passwordInvalid}
                    autoComplete="current-password"
                    required
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordInvalid && (
                  <p className="text-xs text-destructive">هذا الحقل مطلوب</p>
                )}
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm animate-in fade-in slide-in-from-top-1 duration-200">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري تسجيل الدخول...
                  </>
                ) : (
                  <>تسجيل الدخول</>
                )}
              </Button>
            </form>

            <div className="relative my-5">
              <Separator />
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
                حسابات تجريبية
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => fillDemo(acc)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border bg-card hover:bg-muted/50 hover:ring-2 ${acc.ring} transition-all text-right group`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${acc.chip}`}>
                    {acc.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate text-foreground">{acc.role}</p>
                    <p className="text-[10px] text-muted-foreground truncate" dir="ltr">{acc.email}</p>
                  </div>
                </button>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground text-center mt-3">
              اضغط على حساب لتعبئة البيانات تلقائيًا
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-muted-foreground">
        © 2026 BrightFuture Energy Co. • منصة ESG للطاقة الشمسية
      </div>
    </div>
  )
}
