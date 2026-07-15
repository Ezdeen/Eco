'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Sun, Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck, Leaf, Zap, User, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

interface LoginSectionProps {
  onLoginSuccess: (user: any) => void
}

const DEMO_ACCOUNTS = [
  { email: 'admin@bfec.sa', password: 'Admin@123456', role: 'مدير المؤسسة', icon: '👨‍💼', color: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' },
  { email: 'esg@bfec.sa', password: 'ESG@123456', role: 'مدير ESG', icon: '🌿', color: 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300' },
  { email: 'operator@bfec.sa', password: 'Operator@123456', role: 'مشغّل', icon: '⚙️', color: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' },
  { email: 'viewer@bfec.sa', password: 'Viewer@123456', role: 'مشاهد', icon: '👁️', color: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' },
]

export function LoginSection({ onLoginSuccess }: LoginSectionProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [registerName, setRegisterName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور')
      return
    }

    setLoading(true)

    try {
      if (mode === 'login') {
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
      } else {
        if (!registerName) {
          setError('يرجى إدخال الاسم')
          return
        }
        if (password.length < 8) {
          setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
          return
        }

        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name: registerName }),
        })
        const data = await res.json()

        if (!res.ok) {
          setError(data.error || 'فشل إنشاء الحساب')
          return
        }

        toast.success(`تم إنشاء الحساب بنجاح! أهلاً ${data.user.name}`)
        onLoginSuccess(data.user)
      }
    } catch (err) {
      setError('حدث خطأ في الاتصال')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (account: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(account.email)
    setPassword(account.password)
    setError('')
    setMode('login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 via-background to-teal-50 dark:from-emerald-950/20 dark:via-background dark:to-teal-950/20">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-emerald-200/20 dark:bg-emerald-900/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-teal-200/20 dark:bg-teal-900/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-emerald-100/10 dark:bg-emerald-950/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-5xl grid lg:grid-cols-2 gap-6 items-center">
        {/* Left: Branding */}
        <div className="hidden lg:flex flex-col gap-6 p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
              <Sun className="h-7 w-7" />
            </div>
            <div>
              <h1 className="font-cairo text-2xl font-bold">منصة ESG الشمسية</h1>
              <p className="text-sm text-muted-foreground">BrightFuture Energy Platform</p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="font-cairo text-3xl font-bold leading-tight">
              قِس أثر مشاريعك الشمسية
              <br />
              <span className="text-emerald-600">بشفافية وموثوقية</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              منصة SaaS متعددة المؤسسات لقياس الأثر البيئي والاستدامة، بدعم توثيق Hedera وحسابات الكربون المتجنب وفق GHG Protocol.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-card border shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900 text-emerald-600 mb-2">
                <Zap className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold">طاقة موثّقة</p>
              <p className="text-xs text-muted-foreground">قراءات في الوقت الفعلي</p>
            </div>
            <div className="p-4 rounded-xl bg-card border shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-900 text-teal-600 mb-2">
                <Leaf className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold">كربون متجنب</p>
              <p className="text-xs text-muted-foreground">وفق GHG Protocol</p>
            </div>
            <div className="p-4 rounded-xl bg-card border shadow-sm">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-600 mb-2">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold">توثيق Hedera</p>
              <p className="text-xs text-muted-foreground">سجل غير قابل للتعديل</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4 border-t">
            <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-950/30">
              <ShieldCheck className="h-3 w-3 ml-1" />
              JWT + HTTP-only
            </Badge>
            <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/30">
              <Lock className="h-3 w-3 ml-1" />
              bcryptjs
            </Badge>
            <Badge variant="outline" className="bg-amber-50 dark:bg-amber-950/30">
              <ShieldCheck className="h-3 w-3 ml-1" />
              RBAC + ABAC
            </Badge>
          </div>
        </div>

        {/* Right: Form */}
        <Card className="w-full shadow-xl border-border/60 backdrop-blur">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg">
                <Sun className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">منصة ESG الشمسية</CardTitle>
                <CardDescription className="text-xs">BrightFuture Energy</CardDescription>
              </div>
            </div>

            <div className="hidden lg:block">
              <CardTitle className="text-2xl font-cairo">
                {mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
              </CardTitle>
              <CardDescription className="mt-1">
                {mode === 'login'
                  ? 'سجّل دخولك للوصول إلى لوحة القيادة'
                  : 'أنشئ حسابًا للانضمام إلى المنصة'}
              </CardDescription>
            </div>

            <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
              <button
                type="button"
                onClick={() => { setMode('login'); setError('') }}
                className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${
                  mode === 'login' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                دخول
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError('') }}
                className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${
                  mode === 'register' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                حساب جديد
              </button>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-xs font-medium">الاسم الكامل</Label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="أحمد محمد"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      className="pr-9"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium">البريد الإلكتروني</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@bfec.sa"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pr-9"
                    required
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium">كلمة المرور</Label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      className="text-xs text-emerald-600 hover:underline"
                      onClick={() => toast.info('تواصل مع مدير النظام لإعادة تعيين كلمة المرور')}
                    >
                      نسيت كلمة المرور؟
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={mode === 'register' ? '8 أحرف على الأقل' : '••••••••'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-9 pl-9"
                    required
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 text-red-700 dark:text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    {mode === 'login' ? 'جاري تسجيل الدخول...' : 'جاري إنشاء الحساب...'}
                  </>
                ) : (
                  <>{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب'}</>
                )}
              </Button>
            </form>

            {mode === 'login' && (
              <>
                <div className="relative my-4">
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
                      className="flex items-center gap-2 p-2.5 rounded-lg border bg-card hover:bg-muted/40 transition-all text-right group"
                    >
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${acc.color}`}>
                        {acc.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{acc.role}</p>
                        <p className="text-[10px] text-muted-foreground truncate" dir="ltr">{acc.email}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <p className="text-[10px] text-muted-foreground text-center mt-3">
                  اضغط على حساب لتعبئة البيانات تلقائيًا
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-muted-foreground">
        © 2026 BrightFuture Energy Co. • منصة ESG للطاقة الشمسية
      </div>
    </div>
  )
}
