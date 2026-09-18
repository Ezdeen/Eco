'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Globe, Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck, Leaf, Zap, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { appCopy, loginCopy, type Locale } from '@/lib/i18n'

interface LoginSectionProps {
  onLoginSuccess: (user: any) => void
  locale: Locale
  onLocaleChange: (next: Locale) => void
}

const DEMO_ACCOUNTS = [
  {
    email: 'admin@bfec.sa',
    password: 'Admin@123456',
    role: 'organizationAdmin',
    icon: '👨‍💼',
    ring: 'focus-visible:ring-emerald-500',
    chip: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  },
  {
    email: 'project@bfec.sa',
    password: 'Project@123456',
    role: 'projectManager',
    icon: '📋',
    ring: 'focus-visible:ring-teal-500',
    chip: 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200',
  },
] as const

export function LoginSection({ onLoginSuccess, locale, onLocaleChange }: LoginSectionProps) {
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
      setError(loginCopy[locale].enterCredentials)
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
        setError(data.error || loginCopy[locale].loginFailed)
        return
      }

      toast.success(loginCopy[locale].loginSuccess.replace('{name}', data.user.name))
      onLoginSuccess(data.user)
    } catch {
      setError(loginCopy[locale].connectionError)
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setEmail(account.email)
    setPassword(account.password)
    setError('')
    setTouched({})
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f7f1] px-4 py-10 text-foreground dark:bg-[#0b1510] sm:px-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(30,73,49,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(30,73,49,0.055)_1px,transparent_1px)] [background-size:34px_34px] dark:opacity-20" />
        <div className="absolute -top-44 end-[-7rem] h-[28rem] w-[28rem] rounded-full bg-emerald-200/45 blur-3xl dark:bg-emerald-800/20" />
        <div className="absolute -bottom-52 start-[-8rem] h-[32rem] w-[32rem] rounded-full bg-lime-100/70 blur-3xl dark:bg-teal-900/20" />
        <div className="absolute top-[22%] start-[38%] h-48 w-48 rounded-full border border-emerald-800/10 dark:border-emerald-100/10" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute top-5 end-5 z-20 h-9 rounded-full border-emerald-950/10 bg-background/80 px-4 text-foreground shadow-sm transition-colors hover:bg-emerald-50 hover:text-emerald-900 dark:border-emerald-100/15 dark:hover:bg-emerald-950"
        onClick={() => onLocaleChange(locale === 'ar' ? 'en' : 'ar')}
        title={appCopy[locale].language}
      >
        <Globe className="me-2 h-4 w-4" />
        {locale === 'ar' ? 'English' : 'العربية'}
      </Button>

      <div className="relative z-10 grid w-full max-w-6xl items-stretch overflow-hidden rounded-[2rem] border border-emerald-950/10 bg-background/85 shadow-[0_28px_70px_-32px_rgba(19,58,39,0.42)] backdrop-blur-sm dark:border-emerald-100/10 lg:grid-cols-[1.14fr_0.86fr]">
        <section className="relative hidden min-h-[650px] overflow-hidden bg-[#183f2c] p-10 text-emerald-50 lg:flex lg:flex-col" aria-label="Eco Ledger">
          <div aria-hidden="true" className="absolute inset-0">
            <div className="absolute -top-16 -end-20 h-72 w-72 rounded-full border-[22px] border-emerald-200/10" />
            <div className="absolute bottom-12 -start-20 h-80 w-80 rounded-full bg-[#245d40] opacity-70" />
            <div className="absolute bottom-24 start-20 h-32 w-32 rounded-full border border-emerald-200/20" />
          </div>

          <div className="relative flex items-center gap-3">
            <img src="/logo.svg" alt={loginCopy[locale].logoAlt} className="h-12 w-12 rounded-2xl bg-white/90 p-1.5 object-contain shadow-sm" />
            <div>
              <p className="text-xl font-bold tracking-tight">Eco Ledger</p>
              <p className="mt-0.5 text-xs text-emerald-100/70">{loginCopy[locale].platformDescription}</p>
            </div>
          </div>

          <div className="relative my-auto max-w-md pt-16">
            <Badge className="mb-5 rounded-full border border-emerald-100/20 bg-emerald-100/10 px-3 py-1 text-emerald-50 hover:bg-emerald-100/10">
              <CheckCircle2 className="me-1.5 h-3.5 w-3.5" />
              {loginCopy[locale].verifiedData}
            </Badge>
            <h1 className="font-cairo text-4xl font-bold leading-[1.25] tracking-tight text-white">
              {loginCopy[locale].headline}
              <span className="block text-emerald-200">{loginCopy[locale].headlineHighlight}</span>
            </h1>
            <p className="mt-5 max-w-prose text-base leading-7 text-emerald-50/75">
              {loginCopy[locale].description}
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-emerald-100/15 bg-white/[0.07] p-4">
              <Zap className="mb-5 h-5 w-5 text-lime-200" />
              <p className="text-sm font-semibold text-white">{loginCopy[locale].verifiedData}</p>
              <p className="mt-1 text-xs leading-5 text-emerald-50/60">{loginCopy[locale].realTimeMeasurement}</p>
            </div>
            <div className="rounded-2xl border border-emerald-100/15 bg-white/[0.07] p-4">
              <Leaf className="mb-5 h-5 w-5 text-lime-200" />
              <p className="text-sm font-semibold text-white">{loginCopy[locale].avoidedCarbon}</p>
              <p className="mt-1 text-xs leading-5 text-emerald-50/60">{loginCopy[locale].ghgProtocol}</p>
            </div>
            <div className="rounded-2xl border border-emerald-100/15 bg-white/[0.07] p-4">
              <ShieldCheck className="mb-5 h-5 w-5 text-lime-200" />
              <p className="text-sm font-semibold text-white">{loginCopy[locale].hederaAttestation}</p>
              <p className="mt-1 text-xs leading-5 text-emerald-50/60">{loginCopy[locale].immutableRecord}</p>
            </div>
          </div>
        </section>

        <section className="flex min-h-[650px] flex-col justify-center bg-card px-5 py-10 sm:px-10 lg:px-12">
          <div className="mx-auto w-full max-w-md animate-in fade-in slide-in-from-bottom-3 duration-500">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <img src="/logo.svg" alt={loginCopy[locale].logoAlt} className="h-12 w-12 rounded-2xl border border-emerald-950/10 bg-emerald-50 p-1.5 object-contain" />
              <div>
                <p className="text-xl font-bold tracking-tight">Eco Ledger</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{loginCopy[locale].platformDescription}</p>
              </div>
            </div>

            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="space-y-2 p-0">
                <Badge variant="outline" className="w-fit rounded-full border-emerald-900/15 bg-emerald-50 px-3 py-1 text-emerald-900 dark:border-emerald-300/20 dark:bg-emerald-950/40 dark:text-emerald-200">
                  <ShieldCheck className="me-1.5 h-3.5 w-3.5" />
                  Eco Ledger Secure Access
                </Badge>
                <CardTitle className="font-cairo text-3xl font-bold tracking-tight">{loginCopy[locale].login}</CardTitle>
                <CardDescription className="max-w-sm text-sm leading-6">{loginCopy[locale].loginDescription}</CardDescription>
              </CardHeader>

              <CardContent className="p-0 pt-7">
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold">{loginCopy[locale].email}</Label>
                    <div className="relative">
                      <Mail className={`absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${emailInvalid ? 'text-destructive' : 'text-emerald-800/55 dark:text-emerald-200/60'}`} />
                      <Input
                        id="email"
                        type="email"
                        placeholder="admin@bfec.sa"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value)
                          if (error) setError('')
                        }}
                        onBlur={() => setTouched((current) => ({ ...current, email: true }))}
                        className="h-12 rounded-xl border-emerald-950/15 bg-[#f8faf6] pe-10 shadow-none transition-[border-color,box-shadow] focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 dark:bg-emerald-950/10"
                        aria-invalid={!!emailInvalid}
                        autoComplete="email"
                        autoFocus
                        required
                        dir="ltr"
                      />
                    </div>
                    {emailInvalid && <p className="text-xs text-destructive">{loginCopy[locale].required}</p>}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="password" className="text-sm font-semibold">{loginCopy[locale].password}</Label>
                      <button
                        type="button"
                        className="text-xs font-medium text-emerald-800 underline-offset-4 transition-colors hover:text-emerald-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 dark:text-emerald-300 dark:hover:text-emerald-100"
                        onClick={() => toast.info(loginCopy[locale].forgotPasswordMessage)}
                      >
                        {loginCopy[locale].forgotPassword}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className={`absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${passwordInvalid ? 'text-destructive' : 'text-emerald-800/55 dark:text-emerald-200/60'}`} />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          if (error) setError('')
                        }}
                        onBlur={() => setTouched((current) => ({ ...current, password: true }))}
                        className="h-12 rounded-xl border-emerald-950/15 bg-[#f8faf6] pe-10 ps-10 shadow-none transition-[border-color,box-shadow] focus-visible:border-emerald-700 focus-visible:ring-emerald-700/20 dark:bg-emerald-950/10"
                        aria-invalid={!!passwordInvalid}
                        autoComplete="current-password"
                        required
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute start-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40"
                        aria-label={showPassword ? loginCopy[locale].hidePassword : loginCopy[locale].showPassword}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordInvalid && <p className="text-xs text-destructive">{loginCopy[locale].required}</p>}
                  </div>

                  {error && (
                    <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={loading}
                    className="h-12 w-full rounded-xl bg-[#1b5a3a] text-white shadow-sm transition-[background-color,transform,box-shadow] duration-200 hover:bg-[#12442c] hover:shadow-md active:scale-[0.99] disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  >
                    {loading ? (
                      <><Loader2 className="me-2 h-4 w-4 animate-spin" />{loginCopy[locale].loggingIn}</>
                    ) : loginCopy[locale].login}
                  </Button>
                </form>

                <div className="relative my-7">
                  <Separator />
                  <span className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
                    {loginCopy[locale].demoAccounts}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemo(account)}
                      className={`group flex items-center gap-3 rounded-xl border border-emerald-950/10 bg-[#f8faf6] p-3 text-start transition-[background-color,border-color,box-shadow,transform] duration-200 hover:border-emerald-700/30 hover:bg-emerald-50 hover:shadow-sm active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${account.ring} dark:bg-emerald-950/10 dark:hover:bg-emerald-950/30`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${account.chip}`}>{account.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-foreground">{loginCopy[locale][account.role]}</span>
                        <span className="mt-1 block truncate text-[11px] text-muted-foreground" dir="ltr">{account.email}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">{loginCopy[locale].demoHint}</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>

      <p className="absolute bottom-4 z-10 text-center text-xs text-emerald-950/55 dark:text-emerald-100/50">© 2026 Eco Ledger • {loginCopy[locale].platformDescription}</p>
    </main>
  )
}
