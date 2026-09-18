'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Leaf,
  Loader2,
  Lock,
  Mail,
  Pause,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  Wind,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { appCopy, loginCopy, type Locale } from '@/lib/i18n'

interface LoginUser {
  name: string
  [key: string]: unknown
}

interface LoginSectionProps {
  onLoginSuccess: (user: LoginUser) => void
  locale: Locale
  onLocaleChange: (next: Locale) => void
  /**
   * حسابات العرض مخفية افتراضيًا خارج بيئة التطوير.
   * لا تستخدم هذه الحسابات أو كلمات المرور لحسابات إنتاج حقيقية.
   */
  showDemoAccounts?: boolean
}

const DEMO_ACCOUNTS = [
  {
    email: 'admin@bfec.sa',
    password: 'Admin@123456',
    role: 'organizationAdmin',
    icon: ShieldCheck,
  },
  {
    email: 'project@bfec.sa',
    password: 'Project@123456',
    role: 'projectManager',
    icon: Activity,
  },
] as const

const FEATURES = [
  { label: 'verifiedData', sub: 'realTimeMeasurement', icon: Zap },
  { label: 'avoidedCarbon', sub: 'ghgProtocol', icon: Leaf },
  { label: 'hederaAttestation', sub: 'immutableRecord', icon: ShieldCheck },
] as const

const EXTRA_COPY = {
  ar: {
    secureAccess: 'بوابتك إلى Eco Ledger',
    invalidEmail: 'يرجى إدخال بريد إلكتروني صحيح.',
    timeout: 'استغرق الاتصال وقتًا طويلًا. يرجى المحاولة مجددًا.',
    invalidResponse: 'تعذّر قراءة استجابة تسجيل الدخول. يرجى المحاولة مجددًا.',
    pauseMotion: 'إيقاف حركة الخلفية',
    playMotion: 'تشغيل حركة الخلفية',
    reducedMotion: 'الحركة متوقفة وفق تفضيلات جهازك',
    visualNote: 'مشهد توضيحي للاستدامة',
    demoNotice: 'للعرض التجريبي فقط؛ لا تستخدم بيانات حساب إنتاج.',
    welcome: 'مرحبًا بعودتك',
  },
  en: {
    secureAccess: 'Your gateway to Eco Ledger',
    invalidEmail: 'Please enter a valid email address.',
    timeout: 'The connection took too long. Please try again.',
    invalidResponse: 'Unable to read the login response. Please try again.',
    pauseMotion: 'Pause background animation',
    playMotion: 'Play background animation',
    reducedMotion: 'Animation is disabled by your device preferences',
    visualNote: 'Illustrative sustainability scene',
    demoNotice: 'For demonstration only. Do not use production credentials.',
    welcome: 'Welcome back',
  },
} as const

const ECO_STYLES = `
.eco-auth {
  --eco-bg: #061b18;
  --eco-fg: #f0fdf8;
  --eco-muted: #afcbc2;
  --eco-accent: #8df0bf;
  --eco-line: rgba(176, 242, 215, .14);
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  min-height: 100vh;
  min-height: 100svh;
  padding: 6rem 1rem 1.5rem;
  overflow: hidden;
  color: var(--eco-fg);
  color-scheme: dark;
  background:
    radial-gradient(ellipse at 12% 10%, #124b3b 0%, transparent 48%),
    radial-gradient(ellipse at 90% 90%, #083b43 0%, transparent 46%),
    var(--eco-bg);
  -webkit-font-smoothing: antialiased;
}
.eco-auth,
.eco-auth * { box-sizing: border-box; }
.eco-auth button,
.eco-auth input { font: inherit; }
.eco-auth button { -webkit-tap-highlight-color: transparent; }
.eco-auth button:not(:disabled) { cursor: pointer; }
.eco-auth button:disabled { cursor: not-allowed; }
.eco-auth :where(button, a):focus-visible {
  outline: 2px solid var(--eco-accent);
  outline-offset: 4px;
}
.eco-auth ::selection { background: #8df0bf; color: #06241a; }

.eco-auth .eco-backdrop {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}
.eco-auth .eco-aurora {
  position: absolute;
  width: 75%;
  height: 70%;
  border-radius: 50%;
  filter: blur(75px);
  opacity: .45;
  will-change: transform;
}
.eco-auth .eco-aurora-a {
  top: -30%;
  left: -20%;
  background: radial-gradient(ellipse, #1b9968, transparent 68%);
  animation: eco-aurora 22s ease-in-out infinite alternate;
}
.eco-auth .eco-aurora-b {
  right: -25%;
  bottom: -30%;
  background: radial-gradient(ellipse, #087f91, transparent 68%);
  animation: eco-aurora 27s ease-in-out infinite alternate-reverse;
}
.eco-auth .eco-grid {
  position: absolute;
  inset: 0;
  opacity: .3;
  background-image:
    linear-gradient(var(--eco-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--eco-line) 1px, transparent 1px);
  background-size: 64px 64px;
  -webkit-mask-image: radial-gradient(ellipse at center, #000, transparent 75%);
  mask-image: radial-gradient(ellipse at center, #000, transparent 75%);
}
.eco-auth .eco-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: .75;
}
.eco-auth .eco-horizon {
  position: absolute;
  bottom: -28%;
  left: -20%;
  width: 140%;
  height: 48%;
  border-radius: 50%;
  border-top: 1px solid rgba(141, 240, 191, .25);
  background: radial-gradient(ellipse at top, rgba(27, 133, 91, .15), transparent 65%);
  box-shadow: 0 -20px 90px rgba(65, 210, 157, .08);
  animation: eco-breathe 9s ease-in-out infinite;
}

.eco-auth .eco-toolbar {
  position: absolute;
  top: 1.25rem;
  inset-inline-end: max(1rem, calc((100% - 1180px) / 2));
  display: flex;
  align-items: center;
  gap: .65rem;
  z-index: 5;
}
.eco-auth .eco-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .5rem;
  min-height: 42px;
  border: 1px solid rgba(176, 242, 215, .22);
  border-radius: 999px;
  padding: .55rem 1rem;
  color: #e5f9ef;
  background: rgba(10, 40, 32, .9);
  transition: background .2s, border-color .2s, transform .2s;
}
.eco-auth .eco-tool:hover:not(:disabled) {
  background: #164b3c;
  border-color: rgba(141, 240, 191, .55);
  transform: translateY(-2px);
}
.eco-auth .eco-tool-icon { width: 42px; padding: .5rem; }
.eco-auth .eco-tool:disabled { opacity: .6; }

.eco-auth .eco-shell {
  display: grid;
  width: 100%;
  max-width: 1180px;
  border: 1px solid rgba(176, 242, 215, .2);
  border-radius: 30px;
  overflow: hidden;
  background: rgba(8, 35, 28, .94);
  box-shadow:
    0 40px 110px -35px rgba(0, 0, 0, .65),
    inset 0 1px 0 rgba(255, 255, 255, .05);
  animation: eco-enter .8s cubic-bezier(.16, 1, .3, 1) both;
}
@supports (backdrop-filter: blur(20px)) {
  .eco-auth .eco-shell {
    background: rgba(8, 35, 28, .78);
    backdrop-filter: blur(20px);
  }
}
.eco-auth .eco-hero {
  position: relative;
  display: none;
  flex-direction: column;
  padding: 2.5rem;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 40%, rgba(32, 112, 77, .4), transparent 65%),
    linear-gradient(145deg, rgba(26, 83, 60, .7), rgba(7, 42, 35, .8));
}
.eco-auth .eco-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(125deg, rgba(187, 255, 220, .05), transparent 45%);
}
.eco-auth .eco-brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: .8rem;
}
.eco-auth .eco-brand-mark {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  padding: .5rem;
  border-radius: 16px;
  border: 1px solid rgba(176, 242, 215, .24);
  background: rgba(151, 239, 190, .08);
}
.eco-auth .eco-brand-mark img { width: 100%; height: 100%; object-fit: contain; }
.eco-auth .eco-brand-name {
  margin: 0;
  color: #f5fff9;
  font-size: 1.1rem;
  font-weight: 750;
  letter-spacing: -.03em;
}
.eco-auth .eco-brand-sub {
  margin: .25rem 0 0;
  color: var(--eco-muted);
  font-size: .73rem;
  line-height: 1.7;
}
.eco-auth .eco-hero-copy { position: relative; margin-top: 2.4rem; }
.eco-auth .eco-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: .5rem;
  color: #b5f4d1;
  font-size: .74rem;
  font-weight: 600;
}
.eco-auth .eco-status-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: #9ff3bd;
  box-shadow: 0 0 12px rgba(141, 240, 191, .65);
  animation: eco-status 3s ease-in-out infinite;
}
.eco-auth .eco-headline {
  margin: 1rem 0 0;
  font-size: clamp(1.85rem, 3vw, 2.7rem);
  font-weight: 800;
  line-height: 1.45;
  letter-spacing: -.04em;
  text-wrap: balance;
}
.eco-auth .eco-headline span {
  display: block;
  color: #a3f5bd;
  background: linear-gradient(100deg, #c2fda6, #68e3c7, #b8f9de);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.eco-auth .eco-description {
  margin: .9rem 0 0;
  max-width: 32rem;
  font-size: .875rem;
  line-height: 1.95;
  color: #c0d9ce;
}

.eco-auth .eco-scene {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 270px;
  margin: .9rem 0;
  perspective: 900px;
}
.eco-auth .eco-planet-halo {
  position: absolute;
  width: 270px;
  height: 270px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(90, 234, 154, .17), transparent 68%);
  animation: eco-breathe 6s ease-in-out infinite;
}
.eco-auth .eco-planet {
  position: relative;
  width: 172px;
  height: 172px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid rgba(166, 255, 208, .5);
  background:
    radial-gradient(circle at 32% 28%, rgba(182, 255, 184, .28), transparent 35%),
    radial-gradient(circle at 70% 85%, #05291f, transparent 60%),
    #176b4e;
  box-shadow:
    inset -24px -18px 35px rgba(0, 15, 12, .65),
    inset 8px 6px 22px rgba(176, 255, 205, .2),
    0 0 50px rgba(77, 219, 142, .16);
  animation: eco-levitate 7s ease-in-out infinite;
}
.eco-auth .eco-planet::before {
  content: '';
  position: absolute;
  inset: -10% -100%;
  background-image:
    radial-gradient(ellipse at 20% 35%, #95d987 0 8%, transparent 8.5%),
    radial-gradient(ellipse at 32% 59%, #5fc990 0 10%, transparent 10.5%),
    radial-gradient(ellipse at 65% 32%, #87db9a 0 12%, transparent 12.5%),
    radial-gradient(ellipse at 78% 69%, #49ac7b 0 8%, transparent 8.5%);
  background-size: 50% 100%;
  opacity: .65;
  animation: eco-world 32s linear infinite;
}
.eco-auth .eco-planet::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    repeating-linear-gradient(0deg, transparent 0 27px, rgba(189, 255, 220, .13) 28px 29px),
    repeating-linear-gradient(90deg, transparent 0 35px, rgba(189, 255, 220, .1) 36px 37px);
  box-shadow: inset -18px -8px 32px #05281ec4;
}
.eco-auth .eco-orbit {
  position: absolute;
  width: 270px;
  height: 270px;
  border: 1px solid rgba(173, 244, 208, .22);
  border-radius: 50%;
  transform: rotateX(67deg) rotate(-25deg);
}
.eco-auth .eco-orbit-two {
  width: 245px;
  height: 245px;
  transform: rotateX(62deg) rotate(48deg);
  border-style: dashed;
  opacity: .65;
}
.eco-auth .eco-orbit-spin {
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  animation: eco-spin 16s linear infinite;
}
.eco-auth .eco-orbit-spin::after {
  content: '';
  position: absolute;
  top: 50%;
  left: -4px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #d1ffc1;
  box-shadow: 0 0 18px #98ffb1;
}
.eco-auth .eco-orbit-two .eco-orbit-spin {
  animation-duration: 23s;
  animation-direction: reverse;
}
.eco-auth .eco-floating-icon {
  position: absolute;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1px solid rgba(173, 244, 208, .24);
  color: #baf5c7;
  background: rgba(18, 66, 47, .95);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .18);
  animation: eco-levitate 6s ease-in-out infinite;
}
.eco-auth .eco-floating-a { top: 35px; left: 15%; }
.eco-auth .eco-floating-b { bottom: 28px; right: 14%; animation-delay: -2s; }
.eco-auth .eco-floating-c { top: 38px; right: 11%; animation-delay: -4s; }
.eco-auth .eco-scene-note {
  position: absolute;
  bottom: 0;
  font-size: .65rem;
  color: #a7c9b7;
}

.eco-auth .eco-features { display: grid; gap: .65rem; margin-top: auto; }
.eco-auth .eco-feature {
  display: flex;
  align-items: center;
  gap: .75rem;
  padding: .75rem .85rem;
  border: 1px solid rgba(183, 241, 212, .12);
  border-radius: 14px;
  background: rgba(9, 42, 31, .36);
}
.eco-auth .eco-feature-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 10px;
  color: #b1f7c9;
  background: rgba(141, 240, 191, .08);
}
.eco-auth .eco-feature strong { display: block; font-size: .75rem; font-weight: 600; }
.eco-auth .eco-feature small {
  display: block;
  margin-top: .2rem;
  font-size: .65rem;
  color: var(--eco-muted);
}
.eco-auth .eco-feature-line {
  flex: 1;
  height: 1px;
  margin-inline-start: .6rem;
  background: linear-gradient(90deg, transparent, rgba(153, 235, 187, .3), transparent);
}
.eco-auth .eco-trust {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 1.4rem;
  color: #b5d4c5;
  font-size: .65rem;
}
.eco-auth .eco-trust span { display: flex; align-items: center; gap: .4rem; }

.eco-auth .eco-form-side {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem;
  min-width: 0;
  background: linear-gradient(155deg, rgba(9, 35, 29, .7), rgba(5, 25, 23, .94));
}
.eco-auth .eco-form-inner { width: 100%; max-width: 400px; }
.eco-auth .eco-mobile-brand { margin-bottom: 2rem; }
.eco-auth .eco-access {
  display: inline-flex;
  align-items: center;
  gap: .45rem;
  margin-bottom: 1.1rem;
  padding: .4rem .75rem;
  border: 1px solid rgba(176, 242, 215, .16);
  border-radius: 999px;
  background: rgba(141, 240, 191, .05);
  color: #bce8ce;
  font-size: .7rem;
}
.eco-auth .eco-welcome {
  margin: 0 0 .4rem;
  color: #a8c6b9;
  font-size: .8rem;
}
.eco-auth .eco-title {
  margin: 0;
  color: #f3fff8;
  font-size: clamp(1.8rem, 4vw, 2.15rem);
  line-height: 1.5;
  font-weight: 800;
  letter-spacing: -.04em;
}
.eco-auth .eco-form-description {
  margin: .65rem 0 0;
  color: #b3cec1;
  font-size: .85rem;
  line-height: 1.9;
}
.eco-auth .eco-form { display: grid; gap: 1.25rem; margin-top: 1.8rem; }
.eco-auth .eco-field-group { display: grid; gap: .6rem; }
.eco-auth .eco-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: .75rem;
}
.eco-auth .eco-label { color: #e3f5ea; font-size: .82rem; font-weight: 600; }
.eco-auth .eco-input-wrap { position: relative; }
.eco-auth .eco-field {
  display: block;
  width: 100%;
  height: 52px;
  padding: 0 2.8rem;
  border: 1px solid rgba(183, 241, 212, .23);
  border-radius: 14px;
  background: rgba(2, 22, 17, .6);
  color: #f3fff8;
  font-size: .9rem;
  direction: ltr;
  text-align: left;
  caret-color: #a3f5bd;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .025);
  transition: border-color .2s, box-shadow .2s, background .2s;
}
.eco-auth .eco-field::placeholder { color: #8faea1; opacity: 1; }
.eco-auth .eco-field:hover:not(:disabled) { border-color: rgba(183, 241, 212, .4); }
.eco-auth .eco-field:focus-visible {
  outline: none;
  border-color: #8de4b5;
  background: rgba(10, 44, 31, .8);
  box-shadow: 0 0 0 4px rgba(141, 240, 191, .1);
}
.eco-auth .eco-field[aria-invalid='true'] { border-color: #f39b9b; }
.eco-auth .eco-field:disabled { opacity: .65; cursor: not-allowed; }
.eco-auth .eco-field:-webkit-autofill {
  -webkit-text-fill-color: #f3fff8;
  caret-color: #a3f5bd;
  box-shadow: 0 0 0 1000px #102e23 inset;
}
.eco-auth .eco-input-icon {
  position: absolute;
  left: 15px;
  top: 50%;
  width: 17px;
  height: 17px;
  transform: translateY(-50%);
  pointer-events: none;
  color: #94b5a3;
  transition: color .2s;
}
.eco-auth .eco-input-wrap:focus-within .eco-input-icon { color: #b5f8cd; }
.eco-auth .eco-password-toggle {
  position: absolute;
  right: 4px;
  top: 4px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #abcab8;
}
.eco-auth .eco-password-toggle:hover { background: rgba(141, 240, 191, .08); color: #e0ffe9; }
.eco-auth .eco-link {
  padding: .25rem 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #b0e9c7;
  font-size: .73rem;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.eco-auth .eco-link:hover { color: #e1ffe5; }
.eco-auth .eco-field-error { margin: 0; color: #ffc1c1; font-size: .75rem; line-height: 1.6; }
.eco-auth .eco-alert {
  display: flex;
  align-items: flex-start;
  gap: .6rem;
  padding: .85rem;
  border: 1px solid rgba(252, 165, 165, .3);
  border-radius: 12px;
  background: rgba(127, 29, 29, .2);
  color: #ffd0d0;
  font-size: .8rem;
  line-height: 1.8;
}
.eco-auth .eco-submit {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .65rem;
  width: 100%;
  min-height: 52px;
  margin-top: .15rem;
  overflow: hidden;
  border: 1px solid rgba(221, 255, 219, .35);
  border-radius: 14px;
  background: linear-gradient(115deg, #b4f3a7, #79dfb3 58%, #69d4c5);
  color: #073224;
  font-size: .9rem;
  font-weight: 750;
  box-shadow: 0 10px 30px -14px rgba(134, 239, 172, .5);
  transition: transform .2s, box-shadow .2s, filter .2s;
}
.eco-auth .eco-submit::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, .4) 50%, transparent 65%);
  transform: translateX(-130%);
}
.eco-auth .eco-submit:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.06);
  box-shadow: 0 14px 35px -12px rgba(134, 239, 172, .5);
}
.eco-auth .eco-submit:hover:not(:disabled)::after { animation: eco-shine .85s ease; }
.eco-auth .eco-submit:active:not(:disabled) { transform: translateY(0); }
.eco-auth .eco-submit:disabled { opacity: .65; }
.eco-auth .eco-submit-arrow { transition: transform .2s; }
.eco-auth[dir='rtl'] .eco-submit-arrow { transform: rotate(180deg); }
.eco-auth .eco-spinner { animation: eco-spin 1s linear infinite; }

.eco-auth .eco-divider {
  display: flex;
  align-items: center;
  gap: .8rem;
  margin: 1.6rem 0 1rem;
  color: #a8c6b9;
  font-size: .72rem;
}
.eco-auth .eco-divider::before,
.eco-auth .eco-divider::after { content: ''; flex: 1; height: 1px; background: var(--eco-line); }
.eco-auth .eco-demo-grid { display: grid; gap: .7rem; }
.eco-auth .eco-demo {
  display: flex;
  align-items: center;
  gap: .65rem;
  width: 100%;
  min-width: 0;
  padding: .8rem;
  border: 1px solid rgba(183, 241, 212, .16);
  border-radius: 14px;
  color: #e7f8ed;
  background: rgba(141, 240, 191, .035);
  text-align: start;
  transition: background .2s, transform .2s, border-color .2s;
}
.eco-auth .eco-demo:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: rgba(183, 241, 212, .4);
  background: rgba(141, 240, 191, .08);
}
.eco-auth .eco-demo:disabled { opacity: .5; }
.eco-auth .eco-demo-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 10px;
  background: rgba(141, 240, 191, .08);
  color: #b2f3cb;
}
.eco-auth .eco-demo-text { flex: 1; min-width: 0; }
.eco-auth .eco-demo-text strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: .72rem;
}
.eco-auth .eco-demo-text small {
  display: block;
  margin-top: .25rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #a8c6b9;
  font-size: .63rem;
}
.eco-auth .eco-demo-hint,
.eco-auth .eco-demo-notice {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: .4rem;
  margin: 1rem 0 0;
  color: #afcdbd;
  text-align: center;
  font-size: .7rem;
  line-height: 1.8;
}
.eco-auth .eco-demo-notice { margin-top: .5rem; color: #d9cdaa; font-size: .65rem; }
.eco-auth .eco-footer {
  position: relative;
  width: 100%;
  margin: 0;
  color: #a9c7b9;
  text-align: center;
  font-size: .7rem;
  line-height: 1.8;
}
.eco-auth .eco-enter {
  animation: eco-enter .7s cubic-bezier(.16, 1, .3, 1) both;
  animation-delay: var(--eco-delay, 0ms);
}

@media (min-width: 480px) {
  .eco-auth .eco-demo-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 640px) {
  .eco-auth { padding-inline: 2rem; }
  .eco-auth .eco-form-side { padding: 3rem; }
}
@media (min-width: 1024px) {
  .eco-auth .eco-shell { grid-template-columns: 1.08fr 1fr; }
  .eco-auth .eco-hero { display: flex; }
  .eco-auth .eco-mobile-brand { display: none; }
  .eco-auth .eco-form-side { padding: 3rem 2.5rem; }
}
@media (max-width: 480px) {
  .eco-auth .eco-shell { border-radius: 22px; }
  .eco-auth .eco-aurora { filter: blur(45px); }
}
.eco-auth[data-motion='paused'] *,
.eco-auth[data-motion='paused'] *::before,
.eco-auth[data-motion='paused'] *::after {
  animation-play-state: paused !important;
}
.eco-auth[data-motion='paused'] .eco-shell,
.eco-auth[data-motion='paused'] .eco-enter {
  animation: none !important;
  opacity: 1;
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  .eco-auth *,
  .eco-auth *::before,
  .eco-auth *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
@keyframes eco-enter {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes eco-aurora {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(12%, 10%, 0) scale(1.15); }
}
@keyframes eco-levitate {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
@keyframes eco-breathe {
  0%, 100% { opacity: .55; transform: scale(.96); }
  50% { opacity: 1; transform: scale(1.04); }
}
@keyframes eco-spin { to { transform: rotate(360deg); } }
@keyframes eco-world { to { transform: translateX(16.6667%); } }
@keyframes eco-status {
  0%, 100% { opacity: .6; }
  50% { opacity: 1; }
}
@keyframes eco-shine {
  to { transform: translateX(130%); }
}
`

function useMotionPreferences() {
  // بداية ثابتة لتجنب اختلاف SSR واحترام التفضيلات قبل تشغيل الحركة.
  const [reducedMotion, setReducedMotion] = useState(true)
  const [pageHidden, setPageHidden] = useState(false)

useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReducedMotion(media.matches)
    const updateVisibility = () => setPageHidden(document.hidden)

updateMotion()
    updateVisibility()

media.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateVisibility)

return () => {
      media.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])

return { reducedMotion, pageHidden }
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  phase: number
}

/**
 * شبكة جسيمات خفيفة:
 * - سرعة مستقلة عن معدل تحديث الشاشة.
 * - حد أقصى 30 إطارًا في الثانية.
 * - توقف عند إخفاء الصفحة أو خروج المكوّن من المشهد.
 * - ResizeObserver وتنظيف كامل للمستمعات والإطارات.
 */
function NetworkField({ paused }: { paused: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

useEffect(() => {
    const canvas = canvasRef.current
    const root = canvas?.closest<HTMLElement>('.eco-auth')
    if (!canvas || !root) return

const context = canvas.getContext('2d')
    if (!context) return

let width = 1
    let height = 1
    let frame = 0
    let lastTime = 0
    let elapsed = 0
    let visible = true
    let particles: Particle[] = []

const pointer = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      active: false,
    }

const createParticles = () => {
      const count = Math.min(52, Math.max(18, Math.round(width * height / 26000)))

particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 9,
        vy: -(Math.random() * 8 + 3),
        radius: Math.random() * 1.4 + 0.6,
        phase: Math.random() * Math.PI * 2,
      }))
    }

const draw = (delta: number) => {
      elapsed += delta
      context.clearRect(0, 0, width, height)

if (pointer.active && !paused) {
        const easing = 1 - Math.exp(-delta * 8)
        pointer.x += (pointer.targetX - pointer.x) * easing
        pointer.y += (pointer.targetY - pointer.y) * easing

const glow = context.createRadialGradient(
          pointer.x, pointer.y, 0,
          pointer.x, pointer.y, 200,
        )
        glow.addColorStop(0, 'rgba(139, 240, 181, 0.07)')
        glow.addColorStop(1, 'rgba(139, 240, 181, 0)')
        context.fillStyle = glow
        context.fillRect(0, 0, width, height)
      }

for (const particle of particles) {
        particle.x += particle.vx * delta
        particle.y += particle.vy * delta

if (particle.x < -12) particle.x = width + 12
        if (particle.x > width + 12) particle.x = -12
        if (particle.y < -12) particle.y = height + 12
      }

const linkDistance = width < 640 ? 100 : 145
      const maxDistanceSquared = linkDistance * linkDistance

for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i]

for (let j = i + 1; j < particles.length; j += 1) {
          const next = particles[j]
          const dx = particle.x - next.x
          const dy = particle.y - next.y
          const squared = dx * dx + dy * dy

if (squared >= maxDistanceSquared) continue

const alpha = (1 - Math.sqrt(squared) / linkDistance) * 0.2
          context.strokeStyle = `rgba(150, 239, 191, ${alpha})`
          context.lineWidth = 0.7
          context.beginPath()
          context.moveTo(particle.x, particle.y)
          context.lineTo(next.x, next.y)
          context.stroke()
        }

const alpha = 0.4 + (Math.sin(elapsed * 0.8 + particle.phase) + 1) * 0.2
        context.fillStyle = `rgba(183, 255, 208, ${alpha})`
        context.beginPath()
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
        context.fill()
      }
    }

const stop = () => {
      window.cancelAnimationFrame(frame)
      frame = 0
      lastTime = 0
    }

const animate = (time: number) => {
      if (paused || document.hidden || !visible) {
        stop()
        return
      }

if (!lastTime) lastTime = time

const deltaMs = time - lastTime

if (deltaMs >= 1000 / 30) {
        draw(Math.min(deltaMs / 1000, 0.08))
        lastTime = time
      }

frame = window.requestAnimationFrame(animate)
    }

const start = () => {
      stop()
      draw(0)

if (!paused && !document.hidden && visible) {
        frame = window.requestAnimationFrame(animate)
      }
    }

const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)

const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)

createParticles()
      draw(0)
    }

const handlePointer = (event: PointerEvent) => {
      if (paused || event.pointerType === 'touch') return

const rect = canvas.getBoundingClientRect()
      pointer.targetX = event.clientX - rect.left
      pointer.targetY = event.clientY - rect.top

if (!pointer.active) {
        pointer.x = pointer.targetX
        pointer.y = pointer.targetY
      }

pointer.active = true
    }

const resetPointer = () => {
      pointer.active = false
    }

const resizeObserver = new ResizeObserver(resize)
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting
        start()
      },
      { threshold: 0 },
    )

resize()
    resizeObserver.observe(root)
    intersectionObserver.observe(root)
    start()

root.addEventListener('pointermove', handlePointer, { passive: true })
    root.addEventListener('pointerleave', resetPointer)
    document.addEventListener('visibilitychange', start)

return () => {
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      root.removeEventListener('pointermove', handlePointer)
      root.removeEventListener('pointerleave', resetPointer)
      document.removeEventListener('visibilitychange', start)
    }
  }, [paused])

return <canvas ref={canvasRef} className="eco-canvas" aria-hidden="true" />
}

function EcoScene({ caption }: { caption: string }) {
  return (
    <div className="eco-scene">
      <div className="eco-planet-halo" aria-hidden="true" />

<div className="eco-orbit" aria-hidden="true">
        <div className="eco-orbit-spin" />
      </div>

<div className="eco-planet" aria-hidden="true" />

<div className="eco-orbit eco-orbit-two" aria-hidden="true">
        <div className="eco-orbit-spin" />
      </div>

<span className="eco-floating-icon eco-floating-a" aria-hidden="true">
        <Leaf size={21} />
      </span>
      <span className="eco-floating-icon eco-floating-b" aria-hidden="true">
        <Wind size={21} />
      </span>
      <span className="eco-floating-icon eco-floating-c" aria-hidden="true">
        <Zap size={20} />
      </span>

<span className="eco-scene-note">{caption}</span>
    </div>
  )
}

function Brand({ locale }: { locale: Locale }) {
  return (
    <div className="eco-brand">
      <span className="eco-brand-mark">
        {/* الأصل محلي؛ لا توجد حاجة إلى طلب صورة خارجية. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.svg"
          alt={loginCopy[locale].logoAlt}
          width={32}
          height={32}
          decoding="async"
        />
      </span>
      <div>
        <p className="eco-brand-name" dir="ltr">Eco Ledger</p>
        <p className="eco-brand-sub">
          {loginCopy[locale].platformDescription}
        </p>
      </div>
    </div>
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLoginUser(value: unknown): value is LoginUser {
  return isRecord(value) && typeof value.name === 'string'
}

export function LoginSection({
  onLoginSuccess,
  locale,
  onLocaleChange,
  showDemoAccounts = process.env.NODE_ENV === 'development',
}: LoginSectionProps) {
  const copy = loginCopy[locale]
  const extra = EXTRA_COPY[locale === 'ar' ? 'ar' : 'en']
  const isRTL = locale === 'ar'

const id = useId()
  const emailId = `${id}-email`
  const passwordId = `${id}-password`
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  const emailErrorId = `${id}-email-error`
  const passwordErrorId = `${id}-password-error`

const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(false)

const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [motionPaused, setMotionPaused] = useState(false)
  const [touched, setTouched] = useState({
    email: false,
    password: false,
  })

const { reducedMotion, pageHidden } = useMotionPreferences()
  const animationPaused = motionPaused || reducedMotion || pageHidden

const normalizedEmail = email.trim()
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)

const emailError = touched.email
    ? !normalizedEmail
      ? copy.required
      : !emailIsValid
        ? extra.invalidEmail
        : ''
    : ''

const passwordError = touched.password && !password ? copy.required : ''

useEffect(() => {
    mountedRef.current = true

return () => {
      mountedRef.current = false
      requestRef.current?.abort()
    }
  }, [])

// لا نترك رسالة خطأ باللغة السابقة بعد تغيير لغة الواجهة.
  useEffect(() => {
    setError('')
  }, [locale])

const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

// منع الطلبات المكررة حتى قبل إعادة الرسم التالية.
    if (requestRef.current) return

setError('')
    setTouched({ email: true, password: true })

if (!emailIsValid) {
      emailRef.current?.focus()
      return
    }

if (!password) {
      passwordRef.current?.focus()
      return
    }

const controller = new AbortController()
    requestRef.current = controller

let timedOut = false
    let authenticatedUser: LoginUser | null = null

setLoading(true)

const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 15000)

try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          // لا نقصّ المسافات من كلمة المرور.
          password,
        }),
        signal: controller.signal,
      })

let data: unknown = null

try {
        data = await response.json()
      } catch {
        if (controller.signal.aborted) throw new Error('Request aborted')
      }

if (!mountedRef.current || controller.signal.aborted) return

if (!response.ok) {
        // تُعرض الرسالة كنص React فقط، وليس HTML.
        const serverError =
          isRecord(data) &&
          typeof data.error === 'string' &&
          data.error.trim()
            ? data.error
            : copy.loginFailed

setError(serverError)
        return
      }

if (!isRecord(data) || !isLoginUser(data.user)) {
        setError(extra.invalidResponse)
        return
      }

authenticatedUser = data.user
    } catch {
      if (!mountedRef.current) return

if (timedOut) {
        setError(extra.timeout)
      } else if (!controller.signal.aborted) {
        setError(copy.connectionError)
      }
    } finally {
      window.clearTimeout(timeout)

if (requestRef.current === controller) {
        requestRef.current = null
      }

if (mountedRef.current) {
        setLoading(false)
      }
    }

// خارج catch الخاص بالشبكة حتى لا تُصنّف أخطاء المكوّن الأب كأخطاء اتصال.
    if (authenticatedUser && mountedRef.current && !controller.signal.aborted) {
      setPassword('')
      toast.success(
        copy.loginSuccess.replace('{name}', authenticatedUser.name),
      )
      onLoginSuccess(authenticatedUser)
    }
  }

const fillDemo = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    if (loading || requestRef.current) return

setEmail(account.email)
    setPassword(account.password)
    setShowPassword(false)
    setTouched({ email: false, password: false })
    setError('')
    passwordRef.current?.focus()
  }

return (
    <main
      className="eco-auth"
      dir={isRTL ? 'rtl' : 'ltr'}
      lang={isRTL ? 'ar' : 'en'}
      data-motion={animationPaused ? 'paused' : 'running'}
    >
      <style>{ECO_STYLES}</style>

<div className="eco-backdrop" aria-hidden="true">
        <div className="eco-aurora eco-aurora-a" />
        <div className="eco-aurora eco-aurora-b" />
        <div className="eco-grid" />
        <NetworkField paused={animationPaused} />
        <div className="eco-horizon" />
      </div>

<div className="eco-toolbar">
        <button
          type="button"
          className="eco-tool eco-tool-icon"
          disabled={reducedMotion}
          onClick={() => setMotionPaused((current) => !current)}
          aria-label={
            reducedMotion
              ? extra.reducedMotion
              : motionPaused
                ? extra.playMotion
                : extra.pauseMotion
          }
          title={
            reducedMotion
              ? extra.reducedMotion
              : motionPaused
                ? extra.playMotion
                : extra.pauseMotion
          }
        >
          {motionPaused || reducedMotion ? (
            <Play size={16} aria-hidden="true" />
          ) : (
            <Pause size={16} aria-hidden="true" />
          )}
        </button>

<button
          type="button"
          className="eco-tool"
          disabled={loading}
          onClick={() => onLocaleChange(isRTL ? 'en' : 'ar')}
          aria-label={`${appCopy[locale].language}: ${isRTL ? 'English' : 'العربية'}`}
          title={appCopy[locale].language}
        >
          <Globe size={16} aria-hidden="true" />
          <span lang={isRTL ? 'en' : 'ar'}>
            {isRTL ? 'English' : 'العربية'}
          </span>
        </button>
      </div>

<div className="eco-shell">
        <section className="eco-hero" aria-label="Eco Ledger">
          <Brand locale={locale} />

<div className="eco-hero-copy">
            <span className="eco-eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              {copy.platformDescription}
            </span>

<h2 className="eco-headline font-cairo">
              {copy.headline}
              <span>{copy.headlineHighlight}</span>
            </h2>

<p className="eco-description">{copy.description}</p>
          </div>

<EcoScene caption={extra.visualNote} />

<div className="eco-features">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon

return (
                <div
                  key={feature.label}
                  className="eco-feature eco-enter"
                  style={
                    { '--eco-delay': `${index * 90 + 150}ms` } as CSSProperties
                  }
                >
                  <span className="eco-feature-icon">
                    <Icon size={16} aria-hidden="true" />
                  </span>

<div>
                    <strong>{copy[feature.label]}</strong>
                    <small>{copy[feature.sub]}</small>
                  </div>

<span className="eco-feature-line" aria-hidden="true" />
                  <span className="eco-status-dot" aria-hidden="true" />
                </div>
              )
            })}
          </div>

<div className="eco-trust">
            <span>
              <Radio size={13} aria-hidden="true" />
              {copy.realTimeMeasurement}
            </span>
            <span>
              <ShieldCheck size={13} aria-hidden="true" />
              {copy.immutableRecord}
            </span>
          </div>
        </section>

<section className="eco-form-side" aria-labelledby={titleId}>
          <div className="eco-form-inner">
            <div className="eco-mobile-brand">
              <Brand locale={locale} />
            </div>

<header className="eco-enter">
              <div className="eco-access">
                <Leaf size={14} aria-hidden="true" />
                {extra.secureAccess}
              </div>

<p className="eco-welcome">{extra.welcome}</p>

<h1 id={titleId} className="eco-title font-cairo">
                {copy.login}
              </h1>

<p id={descriptionId} className="eco-form-description">
                {copy.loginDescription}
              </p>
            </header>

<form
              className="eco-form"
              onSubmit={handleSubmit}
              aria-describedby={descriptionId}
              aria-busy={loading}
              noValidate
            >
              <div className="eco-field-group">
                <Label htmlFor={emailId} className="eco-label">
                  {copy.email}
                </Label>

<div className="eco-input-wrap">
                  <Mail className="eco-input-icon" aria-hidden="true" />

<Input
                    ref={emailRef}
                    id={emailId}
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="name@company.com"
                    value={email}
                    disabled={loading}
                    required
                    dir="ltr"
                    className="eco-field"
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? emailErrorId : undefined}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      if (error) setError('')
                    }}
                    onBlur={() => {
                      setTouched((current) => ({ ...current, email: true }))
                    }}
                  />
                </div>

{emailError && (
                  <p id={emailErrorId} className="eco-field-error">
                    {emailError}
                  </p>
                )}
              </div>

<div className="eco-field-group">
                <div className="eco-label-row">
                  <Label htmlFor={passwordId} className="eco-label">
                    {copy.password}
                  </Label>

<button
                    type="button"
                    className="eco-link"
                    disabled={loading}
                    onClick={() => toast.info(copy.forgotPasswordMessage)}
                  >
                    {copy.forgotPassword}
                  </button>
                </div>

<div className="eco-input-wrap">
                  <Lock className="eco-input-icon" aria-hidden="true" />

<Input
                    ref={passwordRef}
                    id={passwordId}
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    disabled={loading}
                    required
                    dir="ltr"
                    className="eco-field"
                    aria-invalid={Boolean(passwordError)}
                    aria-describedby={passwordError ? passwordErrorId : undefined}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      if (error) setError('')
                    }}
                    onBlur={() => {
                      setTouched((current) => ({ ...current, password: true }))
                    }}
                  />

<button
                    type="button"
                    className="eco-password-toggle"
                    disabled={loading}
                    aria-controls={passwordId}
                    aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                    title={showPassword ? copy.hidePassword : copy.showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? (
                      <EyeOff size={17} aria-hidden="true" />
                    ) : (
                      <Eye size={17} aria-hidden="true" />
                    )}
                  </button>
                </div>

{passwordError && (
                  <p id={passwordErrorId} className="eco-field-error">
                    {passwordError}
                  </p>
                )}
              </div>

{error && (
                <div role="alert" className="eco-alert">
                  <AlertCircle
                    size={17}
                    className="mt-1 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{error}</span>
                </div>
              )}

<Button type="submit" disabled={loading} className="eco-submit">
                {loading ? (
                  <Loader2 size={18} className="eco-spinner" aria-hidden="true" />
                ) : (
                  <Lock size={16} aria-hidden="true" />
                )}

<span role="status" aria-live="polite">
                  {loading ? copy.loggingIn : copy.login}
                </span>

{!loading && (
                  <ArrowRight
                    size={18}
                    className="eco-submit-arrow"
                    aria-hidden="true"
                  />
                )}
              </Button>
            </form>

{showDemoAccounts && (
              <div className="eco-enter">
                <div className="eco-divider">
                  <span>{copy.demoAccounts}</span>
                </div>

<div className="eco-demo-grid">
                  {DEMO_ACCOUNTS.map((account) => {
                    const Icon = account.icon

return (
                      <button
                        key={account.email}
                        type="button"
                        className="eco-demo"
                        disabled={loading}
                        onClick={() => fillDemo(account)}
                      >
                        <span className="eco-demo-icon">
                          <Icon size={16} aria-hidden="true" />
                        </span>

<span className="eco-demo-text">
                          <strong>{copy[account.role]}</strong>
                          <small dir="ltr">{account.email}</small>
                        </span>
                      </button>
                    )
                  })}
                </div>

<p className="eco-demo-hint">
                  <CheckCircle2
                    size={14}
                    className="mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{copy.demoHint}</span>
                </p>

<p className="eco-demo-notice">{extra.demoNotice}</p>
              </div>
            )}
          </div>
        </section>
      </div>

<p className="eco-footer">
        © 2026 Eco Ledger · {copy.platformDescription}
      </p>
    </main>
  )
}
