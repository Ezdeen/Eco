'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Globe,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Leaf,
  Zap,
  AlertCircle,
  CheckCircle2,
  Activity,
  Radio,
} from 'lucide-react'
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

const NETWORK_NODES = [
  { x: 6, y: 18, size: 4, delay: '0s', duration: '7s' },
  { x: 17, y: 35, size: 6, delay: '-2s', duration: '9s' },
  { x: 12, y: 72, size: 4, delay: '-4s', duration: '8s' },
  { x: 29, y: 14, size: 5, delay: '-1s', duration: '10s' },
  { x: 34, y: 58, size: 4, delay: '-5s', duration: '7s' },
  { x: 47, y: 26, size: 7, delay: '-3s', duration: '11s' },
  { x: 54, y: 78, size: 4, delay: '-6s', duration: '8s' },
  { x: 64, y: 43, size: 5, delay: '-2s', duration: '9s' },
  { x: 73, y: 12, size: 4, delay: '-7s', duration: '10s' },
  { x: 79, y: 67, size: 6, delay: '-4s', duration: '8s' },
  { x: 91, y: 28, size: 5, delay: '-1s', duration: '9s' },
  { x: 94, y: 82, size: 4, delay: '-5s', duration: '11s' },
] as const

const NETWORK_LINES = [
  { left: 6, top: 18, width: 20, rotate: 35 },
  { left: 17, top: 35, width: 30, rotate: -12 },
  { left: 12, top: 72, width: 24, rotate: -20 },
  { left: 29, top: 14, width: 19, rotate: 18 },
  { left: 34, top: 58, width: 22, rotate: 42 },
  { left: 47, top: 26, width: 21, rotate: 30 },
  { left: 54, top: 78, width: 27, rotate: -24 },
  { left: 64, top: 43, width: 20, rotate: 28 },
  { left: 73, top: 12, width: 20, rotate: 45 },
  { left: 79, top: 67, width: 17, rotate: 36 },
] as const

export function LoginSection({ onLoginSuccess, locale, onLocaleChange }: LoginSectionProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})
  const sceneRef = useRef<HTMLElement>(null)

  const emailInvalid = touched.email && !email
  const passwordInvalid = touched.password && !password

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    const handlePointerMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const x = event.clientX / window.innerWidth - 0.5
        const y = event.clientY / window.innerHeight - 0.5
        scene.style.setProperty('--pointer-x', `${x * 18}px`)
        scene.style.setProperty('--pointer-y', `${y * 18}px`)
      })
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', handlePointerMove)
    }
  }, [])

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
    <main
      ref={sceneRef}
      className="eco-login-scene relative flex min-h-screen items-center justify-center overflow-hidden bg-[#071713] px-4 py-16 text-[#10241d] sm:px-6 lg:py-10"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <style>{`
        .eco-login-scene {
          --pointer-x: 0px;
          --pointer-y: 0px;
          isolation: isolate;
          background:
            radial-gradient(circle at 78% 18%, rgba(30, 155, 128, 0.14), transparent 28rem),
            radial-gradient(circle at 12% 88%, rgba(117, 166, 72, 0.12), transparent 30rem),
            linear-gradient(135deg, #06130f 0%, #0a201a 46%, #071a20 100%);
        }
        .eco-network-layer {
          transform: translate3d(var(--pointer-x), var(--pointer-y), 0) scale(1.04);
          transition: transform 900ms cubic-bezier(0.25, 1, 0.5, 1);
          will-change: transform;
        }
        .eco-grid {
          background-image:
            linear-gradient(rgba(131, 211, 181, 0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(131, 211, 181, 0.045) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse at center, black 18%, transparent 78%);
        }
        .eco-node {
          animation: eco-float var(--node-duration) cubic-bezier(0.45, 0, 0.55, 1) infinite alternate,
            eco-pulse 3.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          animation-delay: var(--node-delay);
        }
        .eco-line {
          transform-origin: left center;
          animation: eco-signal 7s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .eco-orbit {
          animation: eco-orbit 26s linear infinite;
        }
        .eco-card-enter {
          animation: eco-enter 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .eco-button-shine::after {
          content: '';
          position: absolute;
          inset: 0;
          transform: translateX(-120%) skewX(-20deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.2), transparent);
          transition: transform 650ms cubic-bezier(0.25, 1, 0.5, 1);
        }
        .eco-button-shine:hover::after { transform: translateX(120%) skewX(-20deg); }
        @keyframes eco-float { to { transform: translate3d(7px, -11px, 0); } }
        @keyframes eco-pulse { 0%, 100% { opacity: .35; box-shadow: 0 0 0 0 rgba(98, 214, 171, .2); } 50% { opacity: .95; box-shadow: 0 0 0 7px rgba(98, 214, 171, 0); } }
        @keyframes eco-signal { 0%, 100% { opacity: .08; } 50% { opacity: .35; } }
        @keyframes eco-orbit { to { transform: rotate(360deg); } }
        @keyframes eco-enter { from { opacity: 0; transform: translateY(18px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          .eco-network-layer { transform: none !important; transition: none !important; }
          .eco-node, .eco-line, .eco-orbit, .eco-card-enter { animation: none !important; }
          .eco-button-shine::after { display: none; }
        }
      `}</style>

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="eco-grid absolute inset-[-5%]" />
        <div className="absolute left-[58%] top-[-14rem] h-[34rem] w-[34rem] rounded-full bg-teal-400/[0.07] blur-3xl" />
        <div className="absolute bottom-[-16rem] left-[-9rem] h-[36rem] w-[36rem] rounded-full bg-lime-300/[0.06] blur-3xl" />
        <div className="eco-network-layer absolute inset-[-2%]">
          {NETWORK_LINES.map((line, index) => (
            <span
              key={`line-${index}`}
              className="eco-line absolute h-px bg-gradient-to-r from-emerald-300/5 via-teal-200/30 to-transparent"
              style={{ left: `${line.left}%`, top: `${line.top}%`, width: `${line.width}%`, transform: `rotate(${line.rotate}deg)`, animationDelay: `${index * -0.6}s` }}
            />
          ))}
          {NETWORK_NODES.map((node, index) => (
            <span
              key={`node-${index}`}
              className="eco-node absolute rounded-full border border-emerald-100/40 bg-teal-200/70"
              style={{ left: `${node.x}%`, top: `${node.y}%`, width: node.size, height: node.size, '--node-delay': node.delay, '--node-duration': node.duration } as React.CSSProperties}
            />
          ))}
        </div>
        <div className="eco-orbit absolute right-[8%] top-[10%] hidden h-64 w-64 rounded-full border border-dashed border-teal-100/10 md:block">
          <span className="absolute left-1/2 top-[-3px] h-1.5 w-1.5 rounded-full bg-teal-200/70 shadow-[0_0_16px_rgba(94,234,212,.65)]" />
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute end-4 top-4 z-30 h-10 rounded-full border-white/15 !bg-[#102820]/80 px-4 text-emerald-50 shadow-sm backdrop-blur-md transition-colors duration-200 hover:border-teal-200/30 hover:!bg-[#17372c]/90 hover:text-white focus-visible:ring-teal-300 sm:end-6 sm:top-6"
        onClick={() => onLocaleChange(locale === 'ar' ? 'en' : 'ar')}
        title={appCopy[locale].language}
      >
        <Globe className="me-2 h-4 w-4 text-teal-200" />
        {locale === 'ar' ? 'English' : 'العربية'}
      </Button>

      <div className="eco-card-enter relative z-10 grid w-full max-w-6xl overflow-hidden rounded-[1.75rem] border border-white/15 bg-[#edf3ed] shadow-[0_30px_100px_-38px_rgba(0,0,0,.75)] ring-1 ring-emerald-100/5 lg:grid-cols-[1.08fr_.92fr]">
        <section className="relative hidden min-h-[680px] overflow-hidden bg-[#0d2d25] p-10 text-emerald-50 lg:flex lg:flex-col xl:p-12" aria-label="Eco Ledger">
          <div aria-hidden="true" className="absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_25%,rgba(68,183,148,.18),transparent_34%),linear-gradient(155deg,transparent_42%,rgba(3,16,14,.32))]" />
            <div className="absolute -end-28 -top-28 h-80 w-80 rounded-full border border-emerald-100/10" />
            <div className="absolute -end-16 -top-16 h-56 w-56 rounded-full border border-emerald-100/10" />
            <div className="absolute bottom-[14%] start-[-8%] h-52 w-52 rotate-12 rounded-[3rem] border border-teal-100/10" />
          </div>

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="absolute inset-0 rounded-xl bg-teal-200/25 blur-md" />
                <img src="/logo.svg" alt={loginCopy[locale].logoAlt} className="relative h-12 w-12 rounded-xl border border-white/20 bg-[#eff8f2] p-1.5 object-contain" />
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight text-white">Eco Ledger</p>
                <p className="mt-0.5 text-xs text-emerald-100/60">{loginCopy[locale].platformDescription}</p>
              </div>
            </div>
            <span className="flex items-center gap-2 rounded-full border border-teal-100/15 bg-teal-100/[0.06] px-3 py-1.5 text-[11px] font-medium text-teal-100/80">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-200 opacity-50 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-200" />
              </span>
              Live network
            </span>
          </div>

          <div className="relative my-auto max-w-lg py-14">
            <Badge className="mb-6 rounded-full border border-emerald-100/15 bg-emerald-100/[0.07] px-3 py-1.5 text-emerald-50 shadow-none hover:bg-emerald-100/[0.07]">
              <CheckCircle2 className="me-1.5 h-3.5 w-3.5 text-teal-200" />
              {loginCopy[locale].verifiedData}
            </Badge>
            <h1 className="font-cairo text-4xl font-bold leading-[1.22] tracking-tight text-white xl:text-5xl">
              {loginCopy[locale].headline}
              <span className="mt-2 block text-[#9fd5bd]">{loginCopy[locale].headlineHighlight}</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-emerald-50/68">
              {loginCopy[locale].description}
            </p>
          </div>

          <div className="relative rounded-2xl border border-white/10 bg-[#123a30]/70 p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Activity className="h-4 w-4 text-teal-200" />
                Environmental intelligence
              </div>
              <div className="flex h-6 items-end gap-1" aria-hidden="true">
                {[45, 70, 52, 88, 64, 100, 76].map((height, index) => (
                  <span key={index} className="w-1 rounded-full bg-teal-200/50" style={{ height: `${height}%` }} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-white/10 rtl:divide-x-reverse">
              <div className="pe-3">
                <Zap className="mb-3 h-4 w-4 text-[#b7db8a]" />
                <p className="text-xs font-semibold text-white">{loginCopy[locale].verifiedData}</p>
                <p className="mt-1 text-[11px] leading-4 text-emerald-50/50">{loginCopy[locale].realTimeMeasurement}</p>
              </div>
              <div className="px-3">
                <Leaf className="mb-3 h-4 w-4 text-[#b7db8a]" />
                <p className="text-xs font-semibold text-white">{loginCopy[locale].avoidedCarbon}</p>
                <p className="mt-1 text-[11px] leading-4 text-emerald-50/50">{loginCopy[locale].ghgProtocol}</p>
              </div>
              <div className="ps-3">
                <ShieldCheck className="mb-3 h-4 w-4 text-[#b7db8a]" />
                <p className="text-xs font-semibold text-white">{loginCopy[locale].hederaAttestation}</p>
                <p className="mt-1 text-[11px] leading-4 text-emerald-50/50">{loginCopy[locale].immutableRecord}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="relative flex min-h-[660px] flex-col justify-center bg-[#f4f7f3] px-5 py-12 sm:px-10 lg:min-h-[680px] lg:px-12 xl:px-14">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-600/20 to-transparent" />
          <div className="mx-auto w-full max-w-md">
            <div className="mb-9 flex items-center gap-3 lg:hidden">
              <img src="/logo.svg" alt={loginCopy[locale].logoAlt} className="h-11 w-11 rounded-xl border border-emerald-950/10 bg-[#e8f2eb] p-1.5 object-contain" />
              <div>
                <p className="text-lg font-bold tracking-tight text-[#10241d]">Eco Ledger</p>
                <p className="mt-0.5 text-xs text-[#52675f]">{loginCopy[locale].platformDescription}</p>
              </div>
            </div>

            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="space-y-3 p-0">
                <div className="flex items-center justify-between gap-4">
                  <Badge variant="outline" className="w-fit rounded-full border-emerald-900/15 bg-[#e7f0e9] px-3 py-1 text-[#25553f]">
                    <ShieldCheck className="me-1.5 h-3.5 w-3.5" />
                    Eco Ledger Secure Access
                  </Badge>
                  <Radio className="h-4 w-4 text-teal-700/45" aria-hidden="true" />
                </div>
                <CardTitle className="font-cairo text-3xl font-bold tracking-tight text-[#10241d] sm:text-4xl">{loginCopy[locale].login}</CardTitle>
                <CardDescription className="max-w-sm text-sm leading-6 text-[#5a6b64]">{loginCopy[locale].loginDescription}</CardDescription>
              </CardHeader>

              <CardContent className="p-0 pt-8">
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold text-[#1c352b]">{loginCopy[locale].email}</Label>
                    <div className="group relative">
                      <Mail className={`pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-200 ${emailInvalid ? 'text-destructive' : 'text-[#648074] group-focus-within:text-teal-700'}`} />
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
                        className="h-12 rounded-xl border-[#c8d4cc] bg-[#fbfdfb] pe-11 text-[#10241d] shadow-[0_1px_2px_rgba(9,35,26,.03)] transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-[#829188] hover:border-[#9eb2a5] focus-visible:border-teal-700 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-teal-700/10"
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
                      <Label htmlFor="password" className="text-sm font-semibold text-[#1c352b]">{loginCopy[locale].password}</Label>
                      <button
                        type="button"
                        className="rounded-md text-xs font-semibold text-[#267256] underline-offset-4 transition-colors duration-200 hover:text-[#164b37] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40 focus-visible:ring-offset-2"
                        onClick={() => toast.info(loginCopy[locale].forgotPasswordMessage)}
                      >
                        {loginCopy[locale].forgotPassword}
                      </button>
                    </div>
                    <div className="group relative">
                      <Lock className={`pointer-events-none absolute end-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-200 ${passwordInvalid ? 'text-destructive' : 'text-[#648074] group-focus-within:text-teal-700'}`} />
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
                        className="h-12 rounded-xl border-[#c8d4cc] bg-[#fbfdfb] pe-11 ps-11 text-[#10241d] shadow-[0_1px_2px_rgba(9,35,26,.03)] transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-[#829188] hover:border-[#9eb2a5] focus-visible:border-teal-700 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-teal-700/10"
                        aria-invalid={!!passwordInvalid}
                        autoComplete="current-password"
                        required
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute start-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#697d74] transition-colors duration-200 hover:bg-emerald-950/5 hover:text-[#183c2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700/40"
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
                    className="eco-button-shine relative h-12 w-full overflow-hidden rounded-xl border border-[#246348] bg-gradient-to-r from-[#174d38] via-[#1c684b] to-[#176054] bg-[length:200%_100%] text-white shadow-[0_10px_25px_-12px_rgba(16,82,59,.65)] transition-[transform,box-shadow,background-position] duration-300 hover:-translate-y-0.5 hover:bg-right hover:text-white hover:shadow-[0_14px_28px_-12px_rgba(16,82,59,.72)] active:translate-y-0 active:scale-[0.99] focus-visible:ring-4 focus-visible:ring-teal-700/20 disabled:translate-y-0 disabled:opacity-60"
                  >
                    <span className="relative z-10 flex items-center justify-center">
                      {loading ? (
                        <><Loader2 className="me-2 h-4 w-4 animate-spin" />{loginCopy[locale].loggingIn}</>
                      ) : loginCopy[locale].login}
                    </span>
                  </Button>
                </form>

                <div className="relative my-7">
                  <Separator className="bg-[#d7e0da]" />
                  <span className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-[#f4f7f3] px-3 text-xs text-[#6c7b74]">
                    {loginCopy[locale].demoAccounts}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemo(account)}
                      className={`group flex min-h-[66px] items-center gap-3 rounded-xl border border-[#d2ddd5] bg-[#f9fbf8] p-3 text-start shadow-[0_1px_2px_rgba(9,35,26,.02)] transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#88aa98] hover:bg-[#f0f6f1] hover:shadow-sm active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${account.ring}`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${account.chip}`}>{account.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-[#1b342a]">{loginCopy[locale][account.role]}</span>
                        <span className="mt-1 block truncate text-[11px] text-[#718179]" dir="ltr">{account.email}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <p className="mt-4 text-center text-xs leading-5 text-[#718179]">{loginCopy[locale].demoHint}</p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>

      <p className="absolute bottom-4 z-10 px-4 text-center text-xs text-emerald-100/45">© 2026 Eco Ledger • {loginCopy[locale].platformDescription}</p>
    </main>
  )
}
