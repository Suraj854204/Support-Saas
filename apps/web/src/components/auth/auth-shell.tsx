"use client";

import {
  Bot,
  CheckCircle2,
  Inbox,
  LockKeyhole,
  MessageSquareText,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

type AuthMode =
  | "login"
  | "register"
  | "forgot-password"
  | "reset-password";

type AuthShellProps = {
  title: string;
  subtitle: string;
  mode: AuthMode;
  children: ReactNode;
};

type Ticket = {
  id: string;
  customer: string;
  initials: string;
  subject: string;
  message: string;
  reply: string;
  time: string;
};

const TICKETS: Ticket[] = [
  {
    id: "#4471",
    customer: "Olivia Martin",
    initials: "OM",
    subject: "Refund not received",
    message:
      "My refund was approved 10 days ago but hasn't reached my account yet.",
    reply:
      "Approved refunds normally arrive within 5–10 business days. Since yours has passed that window, I have escalated it to billing with the transaction ID attached.",
    time: "2m ago",
  },
  {
    id: "#4472",
    customer: "Noah Williams",
    initials: "NW",
    subject: "Can't access my account",
    message:
      "I'm getting an error every time I try to log in today.",
    reply:
      "That error means your previous session expired after a password change. I have sent a fresh reset link to your registered email address.",
    time: "6m ago",
  },
  {
    id: "#4473",
    customer: "Emma Davis",
    initials: "ED",
    subject: "Charged twice this month",
    message:
      "I see two identical charges on my card for this billing cycle.",
    reply:
      "You are correct—a payment retry created a duplicate charge. I have refunded the extra payment and it should appear within three business days.",
    time: "11m ago",
  },
];

const FONT_STACK =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const TYPE_INTERVAL_MS = 20;
const HOLD_AFTER_TYPE_MS = 1300;
const HOLD_AFTER_RESOLVE_MS = 1700;

export function AuthShell({
  title,
  subtitle,
  mode,
  children,
}: AuthShellProps) {
  return (
    <main
      className="relative min-h-[100dvh] overflow-hidden bg-[#F3EFE6]"
      style={{ fontFamily: FONT_STACK }}
    >
      <GlobalStyles />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-28 -top-28 h-72 w-72 rounded-full bg-[#D9A441]/10 blur-3xl lg:hidden"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-36 -right-24 h-80 w-80 rounded-full bg-[#2FA9A1]/10 blur-3xl lg:hidden"
      />

      <div className="relative grid min-h-[100dvh] lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]">
        <ProductPanel />

        <AuthenticationPanel
          title={title}
          subtitle={subtitle}
          mode={mode}
        >
          {children}
        </AuthenticationPanel>
      </div>
    </main>
  );
}

function AuthenticationPanel({
  title,
  subtitle,
  mode,
  children,
}: AuthShellProps) {
  const isRegistration = mode === "register";

  return (
    <section
      aria-label="Authentication"
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8 sm:px-7 lg:px-9 xl:px-14"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-10rem] top-[-10rem] h-80 w-80 rounded-full bg-[#D9A441]/[0.08] blur-3xl"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-12rem] left-[-10rem] h-96 w-96 rounded-full bg-[#2FA9A1]/[0.08] blur-3xl"
      />

      <div className="relative z-10 w-full max-w-[470px]">
        <div
          className="auth-reveal mb-7 flex items-center justify-between lg:hidden"
          style={{ animationDelay: "0ms" }}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2.5"
          >
            <LogoIcon />

            <span className="text-lg font-semibold tracking-tight text-[#171B26]">
              SupportFlow
            </span>
          </Link>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#171B26]/10 bg-white/60 px-3 py-1.5 text-[11px] font-medium text-[#5B5C63] backdrop-blur">
            <Bot className="h-3.5 w-3.5 text-[#2FA9A1]" />
            AI support
          </div>
        </div>

        <div
          className="auth-reveal overflow-hidden rounded-[30px] border border-[#171B26]/[0.08] bg-white/75 p-2 shadow-[0_28px_90px_rgba(23,27,38,0.12)] backdrop-blur-xl"
          style={{ animationDelay: "70ms" }}
        >
          <div className="overflow-hidden rounded-[24px] border border-white bg-[#FFFDF8]">
            <div className="border-b border-[#171B26]/[0.06] px-5 py-4 sm:px-7">
              <AuthTabs mode={mode} />
            </div>

            <div className="px-5 pb-2 pt-7 text-center sm:px-8 sm:pt-8">
              <div className="auth-icon-float mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#171B26] shadow-lg shadow-[#171B26]/15">
                {isRegistration ? (
                  <Sparkles className="h-5 w-5 text-[#F3EFE6]" />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-[#F3EFE6]" />
                )}
              </div>

              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8A6D2A]">
                {getModeEyebrow(mode)}
              </p>

              <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[#171B26] sm:text-[28px]">
                {title}
              </h1>

              <p className="mx-auto mt-2.5 max-w-sm text-sm leading-6 text-[#6F7077]">
                {subtitle}
              </p>
            </div>

            <div className="authshell-theme">
              {children}
            </div>
          </div>
        </div>

        <div
          className="auth-reveal mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-[#8B8C93]"
          style={{ animationDelay: "160ms" }}
        >
          <span className="flex items-center gap-1.5">
            <LockKeyhole className="h-3.5 w-3.5 text-[#2FA9A1]" />
            Encrypted sessions
          </span>

          <span
            aria-hidden="true"
            className="h-1 w-1 rounded-full bg-[#C1C2C7]"
          />

          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#2FA9A1]" />
            Secure workspace
          </span>
        </div>

        <div
          className="auth-reveal mt-5 flex items-center justify-center gap-5 text-[11px] text-[#A2A3AB]"
          style={{ animationDelay: "210ms" }}
        >
          <Link
            href="/privacy"
            className="transition hover:text-[#6F551F]"
          >
            Privacy
          </Link>

          <Link
            href="/terms"
            className="transition hover:text-[#6F551F]"
          >
            Terms
          </Link>

          <Link
            href="/security"
            className="transition hover:text-[#6F551F]"
          >
            Security
          </Link>
        </div>
      </div>
    </section>
  );
}

function AuthTabs({
  mode,
}: {
  mode: AuthMode;
}) {
  const activeMode =
    mode === "register" ? "register" : "login";

  return (
    <div className="relative grid grid-cols-2 rounded-xl border border-[#171B26]/[0.08] bg-[#171B26]/[0.035] p-1 text-sm font-medium">
      <span
        aria-hidden="true"
        className="auth-tab-thumb absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-[0_4px_18px_rgba(23,27,38,0.08)]"
        style={{
          transform:
            activeMode === "register"
              ? "translateX(100%)"
              : "translateX(0%)",
        }}
      />

      <Link
        href="/login"
        className={`relative z-10 rounded-lg py-2.5 text-center transition-colors ${
          activeMode === "login"
            ? "text-[#171B26]"
            : "text-[#8B8C93] hover:text-[#4E5058]"
        }`}
      >
        Sign in
      </Link>

      <Link
        href="/register"
        className={`relative z-10 rounded-lg py-2.5 text-center transition-colors ${
          activeMode === "register"
            ? "text-[#171B26]"
            : "text-[#8B8C93] hover:text-[#4E5058]"
        }`}
      >
        Create account
      </Link>
    </div>
  );
}

function ProductPanel() {
  const [reduceMotion, setReduceMotion] =
    useState(false);

  const [activeIndex, setActiveIndex] =
    useState(0);

  const [typedLength, setTypedLength] =
    useState(0);

  const [resolved, setResolved] =
    useState(false);

  const [resolvedFlags, setResolvedFlags] =
    useState<boolean[]>(() =>
      TICKETS.map(() => false),
    );

  useEffect(() => {
    const query = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    setReduceMotion(query.matches);

    const handleChange = (
      event: MediaQueryListEvent,
    ) => {
      setReduceMotion(event.matches);
    };

    query.addEventListener(
      "change",
      handleChange,
    );

    return () => {
      query.removeEventListener(
        "change",
        handleChange,
      );
    };
  }, []);

  useEffect(() => {
    const activeTicket =
      TICKETS[activeIndex];

    if (!activeTicket) {
      return;
    }

    const reply = activeTicket.reply;

    if (reduceMotion) {
      setTypedLength(reply.length);
      setResolved(true);

      setResolvedFlags((current) => {
        const next = [...current];
        next[activeIndex] = true;
        return next;
      });

      return;
    }

    setTypedLength(0);
    setResolved(false);

    let currentIndex = 0;

    let holdTimeout:
      | ReturnType<typeof setTimeout>
      | undefined;

    let nextTimeout:
      | ReturnType<typeof setTimeout>
      | undefined;

    const typeTimer = window.setInterval(
      () => {
        currentIndex += 1;
        setTypedLength(currentIndex);

        if (currentIndex >= reply.length) {
          window.clearInterval(typeTimer);

          holdTimeout = setTimeout(() => {
            setResolved(true);

            setResolvedFlags((current) => {
              const next = [...current];
              next[activeIndex] = true;
              return next;
            });

            nextTimeout = setTimeout(() => {
              const nextIndex =
                (activeIndex + 1) %
                TICKETS.length;

              if (nextIndex === 0) {
                setResolvedFlags(
                  TICKETS.map(() => false),
                );
              }

              setActiveIndex(nextIndex);
            }, HOLD_AFTER_RESOLVE_MS);
          }, HOLD_AFTER_TYPE_MS);
        }
      },
      TYPE_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(typeTimer);

      if (holdTimeout) {
        clearTimeout(holdTimeout);
      }

      if (nextTimeout) {
        clearTimeout(nextTimeout);
      }
    };
  }, [activeIndex, reduceMotion]);

  const activeTicket =
    TICKETS[activeIndex] ?? TICKETS[0];

  const typedReply =
    activeTicket.reply.slice(
      0,
      typedLength,
    );

  const isTyping =
    !reduceMotion &&
    typedLength <
      activeTicket.reply.length;

  return (
    <section
      aria-label="SupportFlow product preview"
      className="relative hidden min-h-[100dvh] overflow-hidden bg-[#0B0C0F] px-8 py-9 text-white lg:flex xl:px-12 xl:py-11"
    >
      <div
        aria-hidden="true"
        className="ambient-one pointer-events-none absolute right-[-9rem] top-[14%] h-[28rem] w-[28rem] rounded-full bg-[#335CFF]/[0.15] blur-[130px]"
      />

      <div
        aria-hidden="true"
        className="ambient-two pointer-events-none absolute bottom-[-10rem] left-[-9rem] h-[25rem] w-[25rem] rounded-full bg-[#2FA9A1]/[0.11] blur-[120px]"
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "26px 26px",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-[650px] flex-1 flex-col">
        <header
          className="product-reveal flex items-center justify-between"
          style={{ animationDelay: "0ms" }}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2.5"
          >
            <LogoIcon dark />

            <span className="text-[15px] font-semibold tracking-tight text-white">
              SupportFlow
            </span>
          </Link>

          <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] font-medium text-slate-400 backdrop-blur">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Platform live
          </div>
        </header>

        <div className="flex flex-1 flex-col justify-center py-10">
          <p
            className="product-reveal text-xs font-medium uppercase tracking-[0.16em] text-[#7C93FF]"
            style={{ animationDelay: "60ms" }}
          >
            AI-assisted support
          </p>

          <h2
            className="product-reveal mt-4 max-w-xl text-[32px] font-semibold leading-[1.15] tracking-[-0.035em] text-white xl:text-[39px]"
            style={{ animationDelay: "110ms" }}
          >
            Read the message once.
            <br />
            Answer it right the first time.
          </h2>

          <p
            className="product-reveal mt-4 max-w-lg text-[14px] leading-6 text-slate-400"
            style={{ animationDelay: "160ms" }}
          >
            Watch SupportFlow understand customer context,
            prepare an accurate reply and resolve support
            conversations in real time.
          </p>

          <div
            className="product-reveal product-card mt-8 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#14161B]/95 shadow-[0_34px_100px_-32px_rgba(0,0,0,0.85)] backdrop-blur"
            style={{ animationDelay: "220ms" }}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Inbox className="h-3.5 w-3.5 text-[#7C93FF]" />

                <p className="text-[12px] font-medium text-slate-300">
                  Support inbox
                </p>
              </div>

              <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Live processing
              </span>
            </div>

            <div className="grid min-h-[286px] grid-cols-[42px_178px_minmax(0,1fr)]">
              <div className="flex flex-col items-center gap-3 border-r border-white/[0.06] py-4">
                <RailIcon
                  icon={Inbox}
                  active
                />

                <RailIcon
                  icon={MessagesSquare}
                />

                <RailIcon icon={Users} />
              </div>

              <div className="border-r border-white/[0.06] p-2">
                <p className="px-2 pb-2 pt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                  Queue · {TICKETS.length}
                </p>

                <div className="space-y-1">
                  {TICKETS.map(
                    (ticket, index) => {
                      const isActive =
                        index === activeIndex;

                      const isResolved =
                        resolvedFlags[index];

                      return (
                        <div
                          key={ticket.id}
                          className={[
                            "ticket-row flex items-start gap-2 rounded-lg px-2 py-2.5",
                            isActive
                              ? "bg-white/[0.065]"
                              : "hover:bg-white/[0.025]",
                          ].join(" ")}
                        >
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[9px] font-semibold text-slate-300">
                            {ticket.initials}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[10.5px] font-medium text-slate-200">
                              {ticket.subject}
                            </p>

                            <p className="mt-0.5 truncate text-[9.5px] text-slate-500">
                              {ticket.time}
                              {isResolved
                                ? " · Resolved"
                                : ""}
                            </p>
                          </div>

                          {isResolved ? (
                            <CheckCircle2 className="mt-1 h-3 w-3 shrink-0 text-emerald-400" />
                          ) : isActive ? (
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#335CFF]" />
                          ) : null}
                        </div>
                      );
                    },
                  )}
                </div>
              </div>

              <div className="flex min-w-0 flex-col p-3.5">
                <div className="flex items-center justify-between gap-4">
                  <p className="truncate text-[11.5px] font-medium text-white">
                    {activeTicket.subject}
                  </p>

                  <span className="shrink-0 font-mono text-[9.5px] text-slate-500">
                    {activeTicket.id}
                  </span>
                </div>

                <div
                  key={`message-${activeIndex}`}
                  className="ticket-content-enter mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.07] text-[8px] font-semibold text-slate-300">
                      {activeTicket.initials}
                    </span>

                    <p className="text-[9.5px] font-medium text-slate-400">
                      {activeTicket.customer}
                    </p>
                  </div>

                  <p className="mt-2 text-[10.5px] leading-[1.5] text-slate-200">
                    {activeTicket.message}
                  </p>
                </div>

                <div
                  key={`reply-${activeIndex}`}
                  className="ticket-content-enter relative mt-2.5 min-h-[108px] rounded-xl border border-[#335CFF]/25 bg-[#335CFF]/[0.07] p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#335CFF]/20">
                        <Bot className="h-3 w-3 text-[#7C93FF]" />
                      </span>

                      <div>
                        <p className="text-[9.5px] font-medium text-slate-300">
                          AI suggested reply
                        </p>
                      </div>
                    </div>

                    <span
                      className={`resolved-chip flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-1 text-[9px] font-medium text-emerald-300 ${
                        resolved
                          ? "resolved-chip-in"
                          : "resolved-chip-out"
                      }`}
                    >
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Resolved
                    </span>
                  </div>

                  <p className="mt-2 text-[10.5px] leading-[1.5] text-slate-200">
                    {typedReply}

                    {isTyping ? (
                      <span
                        aria-hidden="true"
                        className="typing-caret ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] bg-[#7C93FF]"
                      />
                    ) : null}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            className="product-reveal mt-5 grid grid-cols-3 gap-3"
            style={{ animationDelay: "280ms" }}
          >
            <Metric
              label="First response"
              value="1m 42s"
            />

            <Metric
              label="Resolved by AI"
              value="61%"
            />

            <Metric
              label="Customer satisfaction"
              value="98%"
            />
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-white/[0.06] pt-5 text-[11px] text-slate-500">
          <span className="flex items-center gap-2">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Queue synced
          </span>

          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            End-to-end encrypted
          </span>
        </footer>
      </div>
    </section>
  );
}

function LogoIcon({
  dark = false,
}: {
  dark?: boolean;
}) {
  return (
    <span
      className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-lg ${
        dark
          ? "bg-[#335CFF] shadow-[#335CFF]/20"
          : "bg-[#171B26] shadow-[#171B26]/15"
      }`}
    >
      <MessageSquareText className="h-[18px] w-[18px] text-white" />
    </span>
  );
}

function RailIcon({
  icon: Icon,
  active = false,
}: {
  icon: LucideIcon;
  active?: boolean;
}) {
  return (
    <div
      className={
        active
          ? "flex h-7 w-7 items-center justify-center rounded-lg bg-[#335CFF]/15 text-[#7C93FF]"
          : "flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
      }
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="metric-card rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-3.5">
      <p className="text-[15px] font-semibold tracking-tight text-white">
        {value}
      </p>

      <p className="mt-0.5 truncate text-[9.5px] text-slate-500">
        {label}
      </p>
    </div>
  );
}

function getModeEyebrow(
  mode: AuthMode,
): string {
  switch (mode) {
    case "register":
      return "Start your workspace";

    case "forgot-password":
      return "Account recovery";

    case "reset-password":
      return "Secure password update";

    default:
      return "Secure workspace access";
  }
}

function GlobalStyles() {
  return (
    <style jsx global>{`
      @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");

      html,
      body {
        min-height: 100%;
      }

      body {
        overflow-x: hidden;
        font-family: ${FONT_STACK};
      }

      .authshell-theme {
        --background: 0 0% 100%;
        --foreground: 222 47% 11%;
        --card: 0 0% 100%;
        --card-foreground: 222 47% 11%;
        --border: 214 32% 91%;
        --input: 214 32% 91%;
        --ring: 41 69% 55%;
        --primary: 222 25% 12%;
        --primary-foreground: 45 32% 93%;
        --muted: 40 29% 97%;
        --muted-foreground: 220 5% 45%;
        --destructive: 0 72% 51%;
        --radius: 0.75rem;
        font-family: ${FONT_STACK};
      }

      .authshell-theme,
      .authshell-theme * {
        font-family: ${FONT_STACK};
      }

      @keyframes auth-reveal {
        from {
          opacity: 0;
          transform: translate3d(0, 12px, 0)
            scale(0.99);
        }

        to {
          opacity: 1;
          transform: translate3d(0, 0, 0)
            scale(1);
        }
      }

      @keyframes product-reveal {
        from {
          opacity: 0;
          transform: translate3d(-12px, 10px, 0);
        }

        to {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }
      }

      @keyframes icon-float {
        0%,
        100% {
          transform: translate3d(0, 0, 0);
        }

        50% {
          transform: translate3d(0, -4px, 0);
        }
      }

      @keyframes ambient-one {
        0%,
        100% {
          opacity: 0.72;
          transform: translate3d(0, 0, 0)
            scale(1);
        }

        50% {
          opacity: 1;
          transform: translate3d(-18px, 14px, 0)
            scale(1.08);
        }
      }

      @keyframes ambient-two {
        0%,
        100% {
          opacity: 0.55;
          transform: translate3d(0, 0, 0)
            scale(1);
        }

        50% {
          opacity: 0.85;
          transform: translate3d(18px, -12px, 0)
            scale(1.06);
        }
      }

      @keyframes caret-blink {
        0%,
        100% {
          opacity: 1;
        }

        50% {
          opacity: 0;
        }
      }

      @keyframes live-pulse {
        0% {
          box-shadow:
            0 0 0 0 rgba(52, 211, 153, 0.45);
        }

        70% {
          box-shadow:
            0 0 0 5px rgba(52, 211, 153, 0);
        }

        100% {
          box-shadow:
            0 0 0 0 rgba(52, 211, 153, 0);
        }
      }

      @keyframes ticket-enter {
        from {
          opacity: 0;
          transform: translate3d(0, 5px, 0);
        }

        to {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }
      }

      .auth-reveal {
        animation: auth-reveal 560ms
          cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .product-reveal {
        animation: product-reveal 600ms
          cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .auth-icon-float {
        animation: icon-float 4s ease-in-out
          infinite;
      }

      .ambient-one {
        animation: ambient-one 13s ease-in-out
          infinite;
      }

      .ambient-two {
        animation: ambient-two 15s ease-in-out
          infinite;
      }

      .typing-caret {
        animation: caret-blink 850ms step-end
          infinite;
      }

      .live-dot {
        animation: live-pulse 2s ease-out
          infinite;
      }

      .auth-tab-thumb {
        transition:
          transform 300ms
            cubic-bezier(0.22, 1, 0.36, 1),
          box-shadow 300ms ease;
      }

      .product-card {
        transition:
          transform 340ms
            cubic-bezier(0.22, 1, 0.36, 1),
          box-shadow 340ms ease,
          border-color 340ms ease;
      }

      .product-card:hover {
        transform: translate3d(0, -3px, 0);
        border-color: rgba(255, 255, 255, 0.14);
        box-shadow:
          0 42px 120px -35px
          rgba(0, 0, 0, 0.95);
      }

      .ticket-row {
        transition:
          background-color 220ms ease,
          transform 220ms ease;
      }

      .ticket-row:hover {
        transform: translate3d(2px, 0, 0);
      }

      .ticket-content-enter {
        animation: ticket-enter 320ms ease both;
      }

      .resolved-chip {
        transition:
          opacity 220ms ease,
          transform 220ms ease;
      }

      .resolved-chip-out {
        opacity: 0;
        transform: scale(0.9);
      }

      .resolved-chip-in {
        opacity: 1;
        transform: scale(1);
      }

      .metric-card {
        transition:
          transform 220ms ease,
          background-color 220ms ease,
          border-color 220ms ease;
      }

      .metric-card:hover {
        transform: translate3d(0, -2px, 0);
        border-color: rgba(124, 147, 255, 0.25);
        background-color: rgba(51, 92, 255, 0.06);
      }

      @media (prefers-reduced-motion: reduce) {
        .auth-reveal,
        .product-reveal,
        .auth-icon-float,
        .ambient-one,
        .ambient-two,
        .typing-caret,
        .live-dot,
        .ticket-content-enter {
          animation: none !important;
        }

        .auth-tab-thumb,
        .product-card,
        .ticket-row,
        .resolved-chip,
        .metric-card {
          transition: none !important;
        }
      }
    `}</style>
  );
}