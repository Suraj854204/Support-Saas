'use client';

import {
  Bot,
  CheckCircle2,
  Inbox,
  LockKeyhole,
  MessageSquareText,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Terminal,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const TICKETS = [
  {
    id: '#4471',
    customer: 'Olivia Martin',
    initials: 'OM',
    subject: 'Refund not received',
    message: 'My refund was approved 10 days ago but hasn\u2019t reached my account yet.',
    reply:
      'Approved refunds normally arrive within 5\u201310 business days. Since yours has passed that window, I have escalated it to billing with the transaction ID attached.',
    time: '2m ago',
    tag: 'Billing',
  },
  {
    id: '#4472',
    customer: 'Noah Williams',
    initials: 'NW',
    subject: "Can't access my account",
    message: 'I\u2019m getting an error every time I try to log in today.',
    reply:
      'That error means your previous session expired after a password change. I have sent a fresh reset link to your registered email address.',
    time: '6m ago',
    tag: 'Access',
  },
  {
    id: '#4473',
    customer: 'Emma Davis',
    initials: 'ED',
    subject: 'Charged twice this month',
    message: 'I see two identical charges on my card for this billing cycle.',
    reply:
      'You are correct\u2014a payment retry created a duplicate charge. I have refunded the extra payment and it should appear within three business days.',
    time: '11m ago',
    tag: 'Billing',
  },
];

const AGENTS = [
  { name: 'Ava',   color: 'from-amber-300 to-amber-500',   status: 'online' },
  { name: 'Leo',   color: 'from-indigo-300 to-indigo-500', status: 'online' },
  { name: 'Mira',  color: 'from-emerald-300 to-emerald-500', status: 'online' },
  { name: 'Kai',   color: 'from-rose-300 to-rose-500',    status: 'away' },
  { name: 'Zoe',   color: 'from-sky-300 to-sky-500',      status: 'online' },
];

const TYPE_INTERVAL_MS = 20;
const HOLD_AFTER_TYPE_MS = 1300;
const HOLD_AFTER_RESOLVE_MS = 1700;

export function AuthShell({ title, subtitle, mode, children }) {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#0A0B10] text-white">
      <GlobalStyles />
      <BackgroundGrid />
      <ShellThemeToggle />

      <div className="relative grid min-h-[100dvh] lg:grid-cols-[minmax(0,1.1fr)_minmax(440px,0.72fr)]">
        <OperationsPanel />
        <AuthenticationPanel title={title} subtitle={subtitle} mode={mode}>
          {children}
        </AuthenticationPanel>
      </div>
    </main>
  );
}

function BackgroundGrid() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage:
            'radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 100%)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-14rem] top-[8%] h-[32rem] w-[32rem] rounded-full bg-[#7C93FF]/[0.18] blur-[130px] ambient-one"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-12rem] bottom-[-12rem] h-[30rem] w-[30rem] rounded-full bg-[#E8C77E]/[0.14] blur-[130px] ambient-two"
      />
    </>
  );
}

function ShellThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="fixed right-4 top-4 z-40 h-10 w-10 lg:right-6 lg:top-6" />;

  const resolved = theme === 'system' ? systemTheme : theme;
  const isDark = resolved !== 'light';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="group fixed right-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.04] text-white/80 shadow-[0_4px_16px_rgba(0,0,0,0.25)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/[0.08] hover:text-white lg:right-6 lg:top-6"
    >
      {isDark ? <Sun className="h-[17px] w-[17px] transition group-hover:rotate-45" /> : <Moon className="h-[17px] w-[17px] transition group-hover:-rotate-12" />}
    </button>
  );
}

/* ---------------- OPERATIONS (LEFT) PANEL ---------------- */

function OperationsPanel() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [typedLength, setTypedLength] = useState(0);
  const [resolved, setResolved] = useState(false);
  const [resolvedFlags, setResolvedFlags] = useState(() => TICKETS.map(() => false));
  const [resolvedCount, setResolvedCount] = useState(2847);

  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(q.matches);
    const h = (e) => setReduceMotion(e.matches);
    q.addEventListener('change', h);
    return () => q.removeEventListener('change', h);
  }, []);

  useEffect(() => {
    const t = TICKETS[activeIndex];
    if (!t) return;
    const reply = t.reply;
    if (reduceMotion) {
      setTypedLength(reply.length);
      setResolved(true);
      setResolvedFlags((c) => { const n = [...c]; n[activeIndex] = true; return n; });
      return;
    }
    setTypedLength(0);
    setResolved(false);
    let i = 0;
    let holdTimeout, nextTimeout;
    const timer = window.setInterval(() => {
      i += 1;
      setTypedLength(i);
      if (i >= reply.length) {
        window.clearInterval(timer);
        holdTimeout = setTimeout(() => {
          setResolved(true);
          setResolvedCount((v) => v + 1);
          setResolvedFlags((c) => { const n = [...c]; n[activeIndex] = true; return n; });
          nextTimeout = setTimeout(() => {
            const next = (activeIndex + 1) % TICKETS.length;
            if (next === 0) setResolvedFlags(TICKETS.map(() => false));
            setActiveIndex(next);
          }, HOLD_AFTER_RESOLVE_MS);
        }, HOLD_AFTER_TYPE_MS);
      }
    }, TYPE_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      if (holdTimeout) clearTimeout(holdTimeout);
      if (nextTimeout) clearTimeout(nextTimeout);
    };
  }, [activeIndex, reduceMotion]);

  const active = TICKETS[activeIndex] ?? TICKETS[0];
  const typedReply = active.reply.slice(0, typedLength);
  const isTyping = !reduceMotion && typedLength < active.reply.length;

  return (
    <section aria-label="SupportFlow live operations" className="relative hidden overflow-hidden px-8 py-10 lg:flex xl:px-14 xl:py-12">
      <div className="relative z-10 mx-auto flex w-full max-w-[600px] flex-1 flex-col">
        {/* Header */}
        <header className="product-reveal flex items-center justify-between" style={{ animationDelay: '0ms' }}>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <LogoMark />
            <span className="text-[16px] font-semibold tracking-tight text-white">SupportFlow</span>
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-3 py-1.5 text-[10.5px] font-medium text-slate-300 backdrop-blur">
            <Terminal className="h-3 w-3 text-[#E8C77E]" />
            Console v3.2
            <span className="mx-0.5 h-1 w-1 rounded-full bg-white/20" />
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Live
          </div>
        </header>

        {/* Hero copy */}
        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="product-reveal inline-flex w-fit items-center gap-2 rounded-full border border-white/[0.08] bg-gradient-to-r from-[#7C93FF]/[0.14] to-transparent px-3 py-1 backdrop-blur" style={{ animationDelay: '60ms' }}>
            <Sparkles className="h-3 w-3 text-[#B4C0FF]" />
            <p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-[#B4C0FF]">Mission control for support</p>
          </div>

          <h2 className="product-reveal mt-6 max-w-xl text-[34px] font-semibold leading-[1.08] tracking-[-0.035em] text-white xl:text-[40px]" style={{ animationDelay: '110ms' }}>
            Every conversation,
            <br />
            <span className="italic font-normal text-white/70">answered before</span>
            <br />
            <span className="bg-gradient-to-r from-[#E8C77E] via-white to-[#B4C0FF] bg-clip-text text-transparent">you finish reading.</span>
          </h2>

          <p className="product-reveal mt-5 max-w-md text-[13.5px] leading-[1.65] text-slate-400" style={{ animationDelay: '160ms' }}>
            SupportFlow reads context, drafts accurate replies and closes tickets while your team focuses on the conversations that matter.
          </p>

          {/* Live metrics row */}
          <div className="product-reveal mt-8 grid grid-cols-4 gap-3" style={{ animationDelay: '220ms' }}>
            <StatCard label="Resolved today" value={resolvedCount.toLocaleString()} accent="text-[#E8C77E]" trend="+128" />
            <StatCard label="Avg response"   value="1m 42s" trend="-32%" />
            <StatCard label="AI deflection"  value="61%"     accent="text-[#B4C0FF]" trend="+8%" />
            <StatCard label="CSAT"            value="98%"     trend="+2%" />
          </div>

          {/* AI drafting card */}
          <div className="product-reveal mt-6 relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-[#12141C]/95 to-[#0C0D13]/95 shadow-[0_30px_90px_-30px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)] product-card" style={{ animationDelay: '280ms' }}>
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[#7C93FF]/60 to-transparent" />

            {/* Card header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#7C93FF]/15 ring-1 ring-inset ring-[#7C93FF]/20">
                  <Inbox className="h-3.5 w-3.5 text-[#B4C0FF]" />
                </div>
                <p className="text-[11.5px] font-medium text-slate-200">Active ticket</p>
                <span className="font-mono text-[9.5px] text-slate-500">{active.id}</span>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9.5px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Processing
              </span>
            </div>

            {/* Customer message */}
            <div className="grid grid-cols-1 gap-2.5 p-3.5 sm:grid-cols-[1fr_1fr]">
              <div key={`msg-${activeIndex}`} className="ticket-content-enter rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-white/20 to-white/5 text-[9px] font-semibold text-white">{active.initials}</span>
                    <div>
                      <p className="text-[10.5px] font-medium text-slate-100">{active.customer}</p>
                      <p className="text-[9px] text-slate-500">{active.time} \u00b7 {active.tag}</p>
                    </div>
                  </div>
                </div>
                <p className="mt-2.5 text-[11px] leading-[1.55] text-slate-300">{active.message}</p>
              </div>

              <div key={`reply-${activeIndex}`} className="ticket-content-enter relative min-h-[120px] overflow-hidden rounded-xl border border-[#7C93FF]/25 bg-gradient-to-br from-[#7C93FF]/[0.1] to-[#7C93FF]/[0.02] p-3">
                <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#B4C0FF]/50 to-transparent" />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7C93FF]/25 ring-1 ring-inset ring-[#B4C0FF]/25">
                      <Bot className="h-3 w-3 text-[#B4C0FF]" />
                    </span>
                    <p className="text-[10.5px] font-medium text-slate-200">Drafted reply</p>
                  </div>
                  <span className={`resolved-chip flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-1 text-[9.5px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/25 ${resolved ? 'resolved-chip-in' : 'resolved-chip-out'}`}>
                    <CheckCircle2 className="h-2.5 w-2.5" />
                    Sent
                  </span>
                </div>
                <p className="mt-2.5 text-[11px] leading-[1.55] text-slate-100">
                  {typedReply}
                  {isTyping ? <span aria-hidden="true" className="typing-caret ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] bg-[#B4C0FF]" /> : null}
                </p>
              </div>
            </div>

            {/* Queue rail */}
            <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-black/20 px-4 py-3">
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <TrendingUp className="h-3 w-3 text-emerald-400" />
                Queue
              </div>
              <div className="flex items-center gap-1.5">
                {TICKETS.map((t, i) => (
                  <div
                    key={t.id}
                    className={[
                      'flex items-center gap-1.5 rounded-full px-2 py-1 text-[9.5px] transition',
                      i === activeIndex
                        ? 'bg-[#7C93FF]/15 text-[#B4C0FF] ring-1 ring-inset ring-[#7C93FF]/25'
                        : resolvedFlags[i]
                        ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20'
                        : 'bg-white/[0.04] text-slate-400 ring-1 ring-inset ring-white/[0.06]',
                    ].join(' ')}
                  >
                    {resolvedFlags[i] ? <CheckCircle2 className="h-2.5 w-2.5" /> : i === activeIndex ? <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#B4C0FF]" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />}
                    {t.id}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Agents row */}
          <div className="product-reveal mt-6 flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3" style={{ animationDelay: '340ms' }}>
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-[10.5px] font-medium text-slate-300">Agents online</p>
            </div>
            <div className="flex -space-x-2">
              {AGENTS.map((a) => (
                <span key={a.name} className={`relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${a.color} text-[10px] font-semibold text-black/70 ring-2 ring-[#0A0B10]`} title={a.name}>
                  {a.name[0]}
                  <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[#0A0B10] ${a.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                </span>
              ))}
              <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-[9.5px] font-semibold text-slate-300 ring-2 ring-[#0A0B10]">+8</span>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-white/[0.06] pt-5 text-[11px] text-slate-500">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/80" />
            End-to-end encrypted
          </span>
          <span className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-[#E8C77E]" />
            Deployed in 47 countries
          </span>
        </footer>
      </div>
    </section>
  );
}

function StatCard({ label, value, trend, accent = 'text-white' }) {
  return (
    <div className="metric-card group relative overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.01] px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className={`text-[17px] font-semibold tracking-tight ${accent}`}>{value}</p>
        {trend ? <span className="text-[9.5px] font-medium text-emerald-400">{trend}</span> : null}
      </div>
      <p className="mt-1 truncate text-[9.5px] uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-6 -right-6 h-16 w-16 rounded-full bg-white/[0.03] blur-2xl transition group-hover:bg-[#7C93FF]/10" />
    </div>
  );
}

/* ---------------- AUTH (RIGHT) PANEL ---------------- */

function AuthenticationPanel({ title, subtitle, mode, children }) {
  const showTabs = mode === 'login' || mode === 'register';
  return (
    <section aria-label="Authentication" className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-10 sm:px-6 lg:border-l lg:border-white/[0.06] lg:px-8 xl:px-12">
      <div className="relative z-10 w-full max-w-[420px]">
        {/* Mobile brand */}
        <div className="auth-reveal mb-6 flex items-center justify-between lg:hidden" style={{ animationDelay: '0ms' }}>
          <Link href="/" className="inline-flex items-center gap-2.5">
            <LogoMark />
            <span className="text-[16px] font-semibold tracking-tight text-white">SupportFlow</span>
          </Link>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-slate-300 backdrop-blur">
            <Bot className="h-3.5 w-3.5 text-[#B4C0FF]" />
            AI support
          </div>
        </div>

        {/* Floating card with gradient border */}
        <div className="auth-reveal relative rounded-[28px] p-[1px]" style={{ animationDelay: '70ms' }}>
          <div aria-hidden="true" className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-[#E8C77E]/30 via-white/[0.06] to-[#7C93FF]/30" />
          <div className="relative overflow-hidden rounded-[27px] bg-[#0F1117]/95 shadow-[0_28px_80px_-25px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
            {/* Top light streak */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-[#E8C77E]/70 to-transparent" />

            {showTabs ? (
              <div className="px-5 pt-5 sm:px-6">
                <AuthTabs mode={mode} />
              </div>
            ) : null}

            <div className="px-5 pb-2 pt-6 text-center sm:px-8 sm:pt-7">
              <div className="auth-icon-float relative mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-white/[0.15] to-white/[0.04] ring-1 ring-inset ring-white/[0.08]">
                <ModeIcon mode={mode} />
                <span aria-hidden="true" className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#E8C77E] shadow-[0_0_12px_rgba(232,199,126,0.8)]" />
              </div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#E8C77E]">{getModeEyebrow(mode)}</p>
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em] text-white sm:text-[28px]">{title}</h1>
              <p className="mx-auto mt-2.5 max-w-sm text-[13px] leading-6 text-slate-400">{subtitle}</p>
            </div>

            <div className="authshell-theme">{children}</div>

            {/* Trust footer inside card */}
            <div className="flex items-center justify-between border-t border-white/[0.05] bg-white/[0.015] px-6 py-3 text-[10.5px] text-slate-500">
              <span className="flex items-center gap-1.5"><LockKeyhole className="h-3 w-3 text-emerald-400/70" /> Encrypted</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-emerald-400/70" /> SOC 2 Type II</span>
              <span className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-[#E8C77E]" /> 99.99% uptime</span>
            </div>
          </div>
        </div>

        <div className="auth-reveal mt-5 flex items-center justify-center gap-5 text-[11px] text-slate-500" style={{ animationDelay: '210ms' }}>
          <Link href="/privacy" className="transition hover:text-slate-300">Privacy</Link>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-slate-600" />
          <Link href="/terms" className="transition hover:text-slate-300">Terms</Link>
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-slate-600" />
          <Link href="/security" className="transition hover:text-slate-300">Security</Link>
        </div>
      </div>
    </section>
  );
}

function ModeIcon({ mode }) {
  const cls = 'h-5 w-5 text-white';
  switch (mode) {
    case 'register': return <Sparkles className={cls} />;
    case 'forgot-password':
    case 'reset-password': return <LockKeyhole className={cls} />;
    default: return <ShieldCheck className={cls} />;
  }
}

function AuthTabs({ mode }) {
  const active = mode === 'register' ? 'register' : 'login';
  return (
    <div className="relative grid grid-cols-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1 text-[13px] font-medium">
      <span aria-hidden="true" className="auth-tab-thumb absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-b from-white/[0.14] to-white/[0.06] shadow-[0_6px_20px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.1)]" style={{ transform: active === 'register' ? 'translateX(100%)' : 'translateX(0%)' }} />
      <Link href="/login" className={`relative z-10 rounded-xl py-2.5 text-center transition-colors ${active === 'login' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>Sign in</Link>
      <Link href="/register" className={`relative z-10 rounded-xl py-2.5 text-center transition-colors ${active === 'register' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}>Create account</Link>
    </div>
  );
}

function LogoMark() {
  return (
    <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#7C93FF] to-[#3852E8] shadow-[0_8px_20px_-6px_rgba(124,147,255,0.6),inset_0_1px_0_rgba(255,255,255,0.2)]">
      <MessageSquareText className="h-[18px] w-[18px] text-white" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/15" />
    </span>
  );
}

function getModeEyebrow(mode) {
  switch (mode) {
    case 'register': return 'Start your workspace';
    case 'forgot-password': return 'Account recovery';
    case 'reset-password': return 'Secure password update';
    case 'login': return 'Secure workspace access';
    default: return 'Secure workspace access';
  }
}

function GlobalStyles() {
  return (
    <style jsx global>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Instrument+Serif&display=swap');

      html, body { min-height: 100%; }
      body {
        overflow-x: hidden;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #0A0B10;
        color: #F5F5F7;
      }
      h1, h2, .italic { font-family: 'Instrument Serif', 'Inter', serif; font-style: italic; }

      .authshell-theme {
        --background: 228 16% 8%;
        --foreground: 220 20% 94%;
        --card: 228 16% 8%;
        --card-foreground: 220 20% 94%;
        --border: 225 10% 18%;
        --input: 225 10% 18%;
        --ring: 41 69% 55%;
        --primary: 45 32% 93%;
        --primary-foreground: 222 25% 12%;
        --muted: 225 10% 14%;
        --muted-foreground: 224 8% 63%;
        --destructive: 0 91% 74%;
        --radius: 0.75rem;
      }

      @keyframes auth-reveal {
        from { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.985); }
        to   { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
      }
      @keyframes product-reveal {
        from { opacity: 0; transform: translate3d(-14px, 12px, 0); }
        to   { opacity: 1; transform: translate3d(0, 0, 0); }
      }
      @keyframes icon-float {
        0%,100% { transform: translate3d(0,0,0); }
        50%     { transform: translate3d(0,-4px,0); }
      }
      @keyframes ambient-one {
        0%,100% { opacity: 0.75; transform: translate3d(0,0,0) scale(1); }
        50%     { opacity: 1;    transform: translate3d(-20px,16px,0) scale(1.08); }
      }
      @keyframes ambient-two {
        0%,100% { opacity: 0.6;  transform: translate3d(0,0,0) scale(1); }
        50%     { opacity: 0.9;  transform: translate3d(20px,-14px,0) scale(1.06); }
      }
      @keyframes caret-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      @keyframes live-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(52,211,153,0.5); }
        70%  { box-shadow: 0 0 0 6px rgba(52,211,153,0); }
        100% { box-shadow: 0 0 0 0 rgba(52,211,153,0); }
      }
      @keyframes ticket-enter {
        from { opacity: 0; transform: translate3d(0, 6px, 0); }
        to   { opacity: 1; transform: translate3d(0, 0, 0); }
      }

      .auth-reveal     { animation: auth-reveal 620ms cubic-bezier(0.22,1,0.36,1) both; }
      .product-reveal  { animation: product-reveal 660ms cubic-bezier(0.22,1,0.36,1) both; }
      .auth-icon-float { animation: icon-float 4s ease-in-out infinite; }
      .ambient-one     { animation: ambient-one 13s ease-in-out infinite; }
      .ambient-two     { animation: ambient-two 15s ease-in-out infinite; }
      .typing-caret    { animation: caret-blink 850ms step-end infinite; }
      .live-dot        { animation: live-pulse 2s ease-out infinite; }

      .auth-tab-thumb { transition: transform 320ms cubic-bezier(0.22,1,0.36,1), box-shadow 320ms ease; }
      .product-card   { transition: transform 360ms cubic-bezier(0.22,1,0.36,1), box-shadow 360ms ease, border-color 360ms ease; }
      .product-card:hover { transform: translate3d(0,-4px,0); border-color: rgba(255,255,255,0.15); }

      .ticket-content-enter { animation: ticket-enter 340ms ease both; }
      .resolved-chip     { transition: opacity 240ms ease, transform 240ms ease; }
      .resolved-chip-out { opacity: 0; transform: scale(0.9); }
      .resolved-chip-in  { opacity: 1; transform: scale(1); }

      .metric-card { transition: transform 240ms ease, border-color 240ms ease, background-color 240ms ease; }
      .metric-card:hover { transform: translate3d(0,-2px,0); border-color: rgba(124,147,255,0.28); }

      @media (prefers-reduced-motion: reduce) {
        .auth-reveal, .product-reveal, .auth-icon-float, .ambient-one, .ambient-two, .typing-caret, .live-dot, .ticket-content-enter { animation: none !important; }
        .auth-tab-thumb, .product-card, .metric-card, .resolved-chip { transition: none !important; }
      }
    `}</style>
  );
}
