'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Globe, Mail, Lock, Eye, EyeOff, Loader2, ShieldCheck, Leaf, Zap, AlertCircle, CheckCircle2, Activity, Radio } from 'lucide-react'
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
    ring: 'focus-visible:ring-emerald-400',
    chip: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25',
  },
  {
    email: 'project@bfec.sa',
    password: 'Project@123456',
    role: 'projectManager',
    icon: '📋',
    ring: 'focus-visible:ring-teal-400',
    chip: 'bg-teal-500/15 text-teal-200 border-teal-400/25',
  },
] as const

/* Inline design tokens + motion, scoped to `.eco-auth` so no external CSS file is touched. */
const ECO_STYLES = `
.eco-auth {
  --eco-line: rgba(148, 233, 213, 0.075);
  --eco-border: rgba(148, 233, 213, 0.14);
  --eco-border-strong: rgba(94, 234, 212, 0.34);
  --eco-fg: #e8f5f1;
  --eco-muted: #8fa8a2;
  --eco-emerald: #34d399;
  --eco-teal: #2dd4bf;
  --eco-cyan: #22d3ee;
  --eco-panel: rgba(8, 21, 20, 0.74);
  position: relative;
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 2.75rem 1rem 3.5rem;
  background: radial-gradient(120% 85% at 84% 4%, #13332d 0%, rgba(9, 25, 23, 0.92) 44%, #03080a 100%);
  color: var(--eco-fg);
  -webkit-font-smoothing: antialiased;
}
.eco-auth .eco-backdrop { position: absolute; inset: 0; pointer-events: none; }
.eco-auth .eco-grid {
  position: absolute; inset: -2px;
  background-image:
    linear-gradient(var(--eco-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--eco-line) 1px, transparent 1px);
  background-size: 58px 58px;
  -webkit-mask-image: radial-gradient(78% 68% at 50% 42%, #000 0%, transparent 100%);
  mask-image: radial-gradient(78% 68% at 50% 42%, #000 0%, transparent 100%);
}
.eco-auth .eco-blob { position: absolute; border-radius: 9999px; filter: blur(90px); opacity: 0.5; }
.eco-auth .eco-blob-a {
  inset-inline-end: -7rem; top: -9rem; height: 27rem; width: 27rem;
  background: radial-gradient(circle at 50% 50%, rgba(45, 212, 191, 0.5), rgba(6, 78, 59, 0) 70%);
  animation: eco-float 22s cubic-bezier(0.45, 0, 0.55, 1) infinite;
}
.eco-auth .eco-blob-b {
  inset-inline-start: -9rem; bottom: -12rem; height: 31rem; width: 31rem;
  background: radial-gradient(circle at 50% 50%, rgba(34, 211, 238, 0.32), rgba(8, 47, 73, 0) 70%);
  animation: eco-float 28s cubic-bezier(0.45, 0, 0.55, 1) infinite reverse;
}
.eco-auth .eco-canvas { position: absolute; inset: 0; height: 100%; width: 100%; opacity: 0.62; }
.eco-auth .eco-scan {
  position: absolute; inset-inline: 0; height: 34vh;
  background: linear-gradient(180deg, rgba(45, 212, 191, 0) 0%, rgba(45, 212, 191, 0.055) 50%, rgba(45, 212, 191, 0) 100%);
  animation: eco-scan 14s linear infinite;
}
.eco-auth .eco-vignette {
  position: absolute; inset: 0;
  background: radial-gradient(105% 85% at 50% 45%, rgba(3, 8, 10, 0) 35%, rgba(3, 8, 10, 0.78) 100%);
}
.eco-auth .eco-shell {
  position: relative; z-index: 10;
  display: grid; width: 100%; max-width: 72rem; align-items: stretch;
  overflow: hidden; border-radius: 28px;
  border: 1px solid var(--eco-border);
  background: var(--eco-panel);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.05) inset,
    0 40px 90px -40px rgba(0, 0, 0, 0.85),
    0 0 0 1px rgba(6, 20, 18, 0.5);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  animation: eco-rise 620ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
@media (min-width: 1024px) { .eco-auth .eco-shell { grid-template-columns: 1.08fr 0.92fr; } }
.eco-auth .eco-hero {
  position: relative; display: none; flex-direction: column; overflow: hidden;
  padding: 2.75rem 2.6rem;
  background:
    radial-gradient(115% 90% at 12% 0%, rgba(16, 71, 60, 0.9) 0%, rgba(6, 27, 25, 0.95) 55%, rgba(3, 13, 16, 1) 100%);
}
@media (min-width: 1024px) { .eco-auth .eco-hero { display: flex; min-height: 660px; } }
.eco-auth .eco-hero::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(148, 233, 213, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 233, 213, 0.05) 1px, transparent 1px);
  background-size: 44px 44px;
  -webkit-mask-image: linear-gradient(160deg, #000 5%, transparent 65%);
  mask-image: linear-gradient(160deg, #000 5%, transparent 65%);
}
.eco-auth .eco-ring {
  position: absolute; border-radius: 9999px; border: 1px solid rgba(148, 233, 213, 0.12);
}
.eco-auth .eco-ring-lg { top: -6rem; inset-inline-end: -6rem; height: 20rem; width: 20rem; }
.eco-auth .eco-ring-sm { bottom: 6rem; inset-inline-start: -5rem; height: 13rem; width: 13rem; border-style: dashed; }
.eco-auth .eco-dot-live {
  display: inline-block; height: 6px; width: 6px; border-radius: 9999px; background: #6ee7b7;
  box-shadow: 0 0 0 0 rgba(110, 231, 183, 0.65);
  animation: eco-ping 2.4s cubic-bezier(0.25, 1, 0.5, 1) infinite;
}
.eco-auth .eco-telemetry { display: flex; flex-direction: column; gap: 1.05rem; }
.eco-auth .eco-track { height: 3px; border-radius: 9999px; background: rgba(148, 233, 213, 0.1); overflow: hidden; }
.eco-auth .eco-fill {
  display: block; height: 100%; border-radius: 9999px;
  background: linear-gradient(90deg, var(--eco-emerald), var(--eco-cyan));
  transform-origin: left center;
  animation: eco-bar 1400ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
[dir='rtl'] .eco-auth .eco-fill { transform-origin: right center; }
.eco-auth .eco-trust { display: flex; flex-wrap: wrap; align-items: center; gap: 0.85rem 1rem; }
.eco-auth .eco-trust-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.7rem; letter-spacing: 0.02em; color: rgba(232, 245, 241, 0.66); }
.eco-auth .eco-trust-sep { height: 1rem; width: 1px; background: rgba(148, 233, 213, 0.18); }
.eco-auth .eco-form-side { position: relative; display: flex; flex-direction: column; justify-content: center; padding: 2.5rem 1.5rem; background: linear-gradient(180deg, rgba(6, 18, 17, 0.55), rgba(4, 12, 14, 0.75)); }
@media (min-width: 640px) { .eco-auth .eco-form-side { padding: 3rem 2.5rem; } }
@media (min-width: 1024px) { .eco-auth .eco-form-side { padding: 3.25rem 3rem; } }
.eco-auth .eco-lang {
  position: absolute; top: 1.25rem; inset-inline-end: 1.25rem; z-index: 20;
  height: 2.25rem; border-radius: 9999px;
  border: 1px solid var(--eco-border) !important;
  background: rgba(8, 22, 21, 0.7) !important;
  color: var(--eco-fg) !important;
  backdrop-filter: blur(10px);
  transition: border-color 200ms cubic-bezier(0.25, 1, 0.5, 1), background-color 200ms cubic-bezier(0.25, 1, 0.5, 1), transform 150ms cubic-bezier(0.25, 1, 0.5, 1);
}
.eco-auth .eco-lang:hover { border-color: var(--eco-border-strong) !important; background: rgba(13, 38, 34, 0.85) !important; transform: translateY(-1px); }
.eco-auth .eco-field {
  height: 3rem !important; border-radius: 14px !important;
  border: 1px solid rgba(148, 233, 213, 0.16) !important;
  background: rgba(3, 14, 14, 0.6) !important;
  color: var(--eco-fg) !important;
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset !important;
  transition: border-color 220ms cubic-bezier(0.25, 1, 0.5, 1), box-shadow 220ms cubic-bezier(0.25, 1, 0.5, 1), background-color 220ms cubic-bezier(0.25, 1, 0.5, 1);
}
.eco-auth .eco-field::placeholder { color: rgba(143, 168, 162, 0.6); }
.eco-auth .eco-field:hover { border-color: rgba(148, 233, 213, 0.28) !important; }
.eco-auth .eco-field:focus-visible {
  border-color: var(--eco-border-strong) !important;
  background: rgba(3, 18, 18, 0.8) !important;
  box-shadow: 0 0 0 4px rgba(45, 212, 191, 0.14), 0 0 22px -6px rgba(45, 212, 191, 0.5) !important;
  outline: none !important;
}
.eco-auth .eco-field[aria-invalid='true'] { border-color: rgba(248, 113, 113, 0.6) !important; }
.eco-auth .eco-submit {
  position: relative; height: 3rem; width: 100%; border-radius: 14px;
  border: 1px solid rgba(167, 243, 208, 0.24);
  background: linear-gradient(115deg, #0f766e 0%, #15803d 42%, #0e7490 100%);
  background-size: 200% 100%;
  color: #f0fdf9;
  font-weight: 600; letter-spacing: 0.01em;
  box-shadow: 0 14px 34px -16px rgba(16, 185, 129, 0.75);
  transition: transform 160ms cubic-bezier(0.25, 1, 0.5, 1), box-shadow 240ms cubic-bezier(0.25, 1, 0.5, 1), background-position 600ms cubic-bezier(0.25, 1, 0.5, 1);
  overflow: hidden;
}
.eco-auth .eco-submit:hover:not(:disabled) {
  background-position: 100% 0;
  transform: translateY(-1px);
  box-shadow: 0 18px 40px -14px rgba(34, 211, 238, 0.7);
}
.eco-auth .eco-submit:active:not(:disabled) { transform: translateY(0) scale(0.994); }
.eco-auth .eco-submit::after {
  content: ''; position: absolute; top: 0; bottom: 0; width: 38%;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0));
  transform: translateX(-160%);
}
.eco-auth .eco-submit:hover:not(:disabled)::after { animation: eco-sheen 900ms cubic-bezier(0.25, 1, 0.5, 1); }
.eco-auth .eco-submit:disabled { opacity: 0.72; }
.eco-auth .eco-demo {
  display: flex; align-items: center; gap: 0.75rem; width: 100%;
  border-radius: 14px; border: 1px solid rgba(148, 233, 213, 0.12);
  background: rgba(3, 14, 14, 0.5); padding: 0.7rem;
  text-align: start;
  transition: border-color 200ms cubic-bezier(0.25, 1, 0.5, 1), background-color 200ms cubic-bezier(0.25, 1, 0.5, 1), transform 160ms cubic-bezier(0.25, 1, 0.5, 1);
}
.eco-auth .eco-demo:hover { border-color: var(--eco-border-strong); background: rgba(6, 30, 28, 0.8); transform: translateY(-1px); }
.eco-auth .eco-demo:active { transform: translateY(0) scale(0.993); }
.eco-auth .eco-link {
  color: #7dd3c0; text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px;
  transition: color 200ms cubic-bezier(0.25, 1, 0.5, 1);
}
.eco-auth .eco-link:hover { color: #a7f3d0; }
@keyframes eco-rise { from { opacity: 0; transform: translateY(18px) scale(0.994); } to { opacity: 1; transform: none; } }
@keyframes eco-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes eco-float { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 50% { transform: translate3d(-2.2rem, 1.8rem, 0) scale(1.07); } }
@keyframes eco-scan { 0% { top: -36vh; } 100% { top: 106vh; } }
@keyframes eco-ping { 0% { box-shadow: 0 0 0 0 rgba(110, 231, 183, 0.6); } 70% { box-shadow: 0 0 0 8px rgba(110, 231, 183, 0); } 100% { box-shadow: 0 0 0 0 rgba(110, 231, 183, 0); } }
@keyframes eco-bar { from { transform: scaleX(0.04); opacity: 0.2; } to { transform: scaleX(1); opacity: 1; } }
@keyframes eco-sheen { from { transform: translateX(-160%); } to { transform: translateX(320%); } }
.eco-auth .eco-in { animation: eco-fade-up 520ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.eco-auth .eco-in-2 { animation-delay: 80ms; }
.eco-auth .eco-in-3 { animation-delay: 160ms; }
.eco-auth .eco-in-4 { animation-delay: 240ms; }
@media (prefers-reduced-motion: reduce) {
  .eco-auth .eco-shell,
  .eco-auth .eco-in,
  .eco-auth .eco-fill,
  .eco-auth .eco-blob-a,
  .eco-auth .eco-blob-b,
  .eco-auth .eco-scan,
  .eco-auth .eco-submit::after,
  .eco-auth .eco-dot-live {
    animation: none !important;
  }
  .eco-auth .eco-fill { opacity: 1; }
  .eco-auth .eco-submit,
  .eco-auth .eco-demo,
  .eco-auth .eco-lang,
  .eco-auth .eco-field { transition: none !important; }
  .eco-auth .eco-scan { display: none; }
}
`

/**
 * Animated environmental data network rendered on canvas.
 * Pure DOM/Canvas: no extra packages, respects `prefers-reduced-motion`,
 * pauses on hidden tabs and cleans up every listener/frame on unmount.
 */
function NetworkField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = motionQuery.matches
    let frame = 0
    let width = 0
    let height = 0
    let nodes: { x: number; y: number; vx: number; vy: number; r: number; depth: number }[] = []
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }

    const build = () => {
      const count = Math.max(16, Math.min(58, Math.round((width * height) / 28000)))
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        r: Math.random() * 1.3 + 0.7,
        depth: Math.random() * 0.7 + 0.3,
      }))
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      build()
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      const offsetX = (pointer.x - 0.5) * 24
      const offsetY = (pointer.y - 0.5) * 24

      if (!reduced) {
        for (const node of nodes) {
          node.x += node.vx
          node.y += node.vy
          if (node.x < -20) node.x = width + 20
          if (node.x > width + 20) node.x = -20
          if (node.y < -20) node.y = height + 20
          if (node.y > height + 20) node.y = -20
        }
      }

      const linkDistance = width < 640 ? 108 : 148
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (distance < linkDistance) {
            ctx.strokeStyle = `rgba(45, 212, 191, ${((1 - distance / linkDistance) * 0.28).toFixed(3)})`
            ctx.lineWidth = 0.6
            ctx.beginPath()
            ctx.moveTo(nodes[i].x + offsetX * nodes[i].depth, nodes[i].y + offsetY * nodes[i].depth)
            ctx.lineTo(nodes[j].x + offsetX * nodes[j].depth, nodes[j].y + offsetY * nodes[j].depth)
            ctx.stroke()
          }
        }
      }

      for (const node of nodes) {
        ctx.beginPath()
        ctx.fillStyle = 'rgba(110, 231, 183, 0.7)'
        ctx.arc(node.x + offsetX * node.depth, node.y + offsetY * node.depth, node.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const loop = () => {
      pointer.x += (pointer.tx - pointer.x) * 0.06
      pointer.y += (pointer.ty - pointer.y) * 0.06
      draw()
      frame = window.requestAnimationFrame(loop)
    }

    const stop = () => {
      if (frame) {
        window.cancelAnimationFrame(frame)
        frame = 0
      }
    }

    const start = () => {
      stop()
      if (reduced || document.hidden) {
        draw()
        return
      }
      frame = window.requestAnimationFrame(loop)
    }

    const handlePointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      pointer.tx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
      pointer.ty = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    }

    const handleMotionChange = () => {
      reduced = motionQuery.matches
      start()
    }

    const handleVisibility = () => start()

    resize()
    start()

    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', handlePointer, { passive: true })
    motionQuery.addEventListener('change', handleMotionChange)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stop()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', handlePointer)
      motionQuery.removeEventListener('change', handleMotionChange)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  return <canvas ref={canvasRef} aria-hidden="true" className="eco-canvas" />
}

const TELEMETRY = [
  { label: 'verifiedData', sub: 'realTimeMeasurement', icon: Zap, width: '86%', accent: 'text-lime-200' },
  { label: 'avoidedCarbon', sub: 'ghgProtocol', icon: Leaf, width: '64%', accent: 'text-emerald-200' },
  { label: 'hederaAttestation', sub: 'immutableRecord', icon: ShieldCheck, width: '93%', accent: 'text-cyan-200' },
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
    <main
      className="eco-auth"
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
    >
      <style>{ECO_STYLES}</style>

      <div className="eco-backdrop" aria-hidden="true">
        <div className="eco-blob eco-blob-a" />
        <div className="eco-blob eco-blob-b" />
        <NetworkField />
        <div className="eco-grid" />
        <div className="eco-scan" />
        <div className="eco-vignette" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="eco-lang px-4 text-sm font-medium"
        onClick={() => onLocaleChange(locale === 'ar' ? 'en' : 'ar')}
        title={appCopy[locale].language}
      >
        <Globe className="me-2 h-4 w-4" />
        {locale === 'ar' ? 'English' : 'العربية'}
      </Button>

      <div className="eco-shell">
        <section className="eco-hero" aria-label="Eco Ledger">
          <div className="eco-ring eco-ring-lg" aria-hidden="true" />
          <div className="eco-ring eco-ring-sm" aria-hidden="true" />

          <div className="relative flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-1.5 shadow-[0_0_24px_-8px_rgba(45,212,191,0.8)]">
              <img src="/logo.svg" alt={loginCopy[locale].logoAlt} className="h-full w-full object-contain" />
            </span>
            <div>
              <p className="text-lg font-semibold tracking-tight text-white">Eco Ledger</p>
              <p className="mt-0.5 text-xs text-emerald-100/55">{loginCopy[locale].platformDescription}</p>
            </div>
          </div>

          <div className="relative my-auto max-w-md pt-14">
            <Badge className="mb-5 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-emerald-100 hover:bg-emerald-400/10">
              <span className="eco-dot-live me-2" />
              {loginCopy[locale].verifiedData}
            </Badge>
            <h1 className="font-cairo text-[2.1rem] font-bold leading-[1.28] tracking-tight text-white">
              {loginCopy[locale].headline}
              <span className="block text-emerald-300">{loginCopy[locale].headlineHighlight}</span>
            </h1>
            <p className="mt-5 max-w-prose text-[0.95rem] leading-7 text-emerald-50/65">
              {loginCopy[locale].description}
            </p>

            <div className="eco-telemetry mt-9">
              {TELEMETRY.map((row, index) => (
                <div key={row.label} className={`eco-in eco-in-${index + 2}`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-xs font-semibold text-emerald-50/90">
                      <row.icon className={`h-3.5 w-3.5 ${row.accent}`} />
                      {loginCopy[locale][row.label]}
                    </span>
                    <span className="text-[0.65rem] text-emerald-100/45">{loginCopy[locale][row.sub]}</span>
                  </div>
                  <div className="eco-track">
                    <span className="eco-fill" style={{ width: row.width, animationDelay: `${140 + index * 110}ms` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="eco-trust eco-in eco-in-4 relative pt-8">
            <span className="eco-trust-item"><Radio className="h-3.5 w-3.5 text-emerald-300" />{loginCopy[locale].realTimeMeasurement}</span>
            <span className="eco-trust-sep" aria-hidden="true" />
            <span className="eco-trust-item"><Activity className="h-3.5 w-3.5 text-cyan-300" />{loginCopy[locale].immutableRecord}</span>
          </div>
        </section>

        <section className="eco-form-side">
          <div className="eco-in mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-1.5">
                <img src="/logo.svg" alt={loginCopy[locale].logoAlt} className="h-full w-full object-contain" />
              </span>
              <div>
                <p className="text-lg font-semibold tracking-tight text-white">Eco Ledger</p>
                <p className="mt-0.5 text-xs text-emerald-100/55">{loginCopy[locale].platformDescription}</p>
              </div>
            </div>

            <Card className="border-0 bg-transparent shadow-none">
              <CardHeader className="space-y-2 p-0">
                <Badge variant="outline" className="w-fit rounded-full border-emerald-300/20 bg-emerald-400/5 px-3 py-1 text-emerald-100/90">
                  <ShieldCheck className="me-1.5 h-3.5 w-3.5" />
                  Eco Ledger Secure Access
                </Badge>
                <CardTitle className="font-cairo text-[1.85rem] font-bold tracking-tight text-white">
                  {loginCopy[locale].login}
                </CardTitle>
                <CardDescription className="max-w-sm text-sm leading-6 text-emerald-50/55">
                  {loginCopy[locale].loginDescription}
                </CardDescription>
              </CardHeader>

              <CardContent className="p-0 pt-7">
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold text-emerald-50/90">
                      {loginCopy[locale].email}
                    </Label>
                    <div className="relative">
                      <Mail className={`absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${emailInvalid ? 'text-red-400' : 'text-emerald-300/50'}`} />
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
                        className="eco-field pe-10"
                        aria-invalid={!!emailInvalid}
                        autoComplete="email"
                        autoFocus
                        required
                        dir="ltr"
                      />
                    </div>
                    {emailInvalid && <p className="text-xs text-red-400">{loginCopy[locale].required}</p>}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="password" className="text-sm font-semibold text-emerald-50/90">
                        {loginCopy[locale].password}
                      </Label>
                      <button
                        type="button"
                        className="eco-link rounded text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#04100f]"
                        onClick={() => toast.info(loginCopy[locale].forgotPasswordMessage)}
                      >
                        {loginCopy[locale].forgotPassword}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className={`absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors ${passwordInvalid ? 'text-red-400' : 'text-emerald-300/50'}`} />
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
                        className="eco-field pe-10 ps-10"
                        aria-invalid={!!passwordInvalid}
                        autoComplete="current-password"
                        required
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute start-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-emerald-200/50 transition-colors hover:text-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
                        aria-label={showPassword ? loginCopy[locale].hidePassword : loginCopy[locale].showPassword}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordInvalid && <p className="text-xs text-red-400">{loginCopy[locale].required}</p>}
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="eco-in flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-200"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <Button type="submit" disabled={loading} className="eco-submit">
                    {loading ? (
                      <><Loader2 className="me-2 h-4 w-4 animate-spin" />{loginCopy[locale].loggingIn}</>
                    ) : loginCopy[locale].login}
                  </Button>
                </form>

                <div className="relative my-7">
                  <Separator className="bg-emerald-300/12" />
                  <span className="absolute start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#04100f] px-3 text-xs text-emerald-100/45">
                    {loginCopy[locale].demoAccounts}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemo(account)}
                      className={`eco-demo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#04100f] ${account.ring}`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-base ${account.chip}`}>
                        {account.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-emerald-50">{loginCopy[locale][account.role]}</span>
                        <span className="mt-1 block truncate text-[11px] text-emerald-100/45" dir="ltr">{account.email}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs leading-5 text-emerald-100/40">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300/70" />
                  {loginCopy[locale].demoHint}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>

      <p className="absolute bottom-4 z-10 text-center text-xs text-emerald-100/35">
        © 2026 Eco Ledger • {loginCopy[locale].platformDescription}
      </p>
    </main>
  )
}
