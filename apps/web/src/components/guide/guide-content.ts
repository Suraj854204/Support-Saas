import {
  BarChart3,
  BookOpen,
  Clock,
  Code2,
  Inbox,
  Sparkles,
  Users,
  Users2,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { IllustrationKey } from "./illustrations";

export interface GuideStep {
  title: string;
  text: string;
}

export interface GuideSection {
  id: string;
  label: string;
  icon: LucideIcon;
  illustration: IllustrationKey;
  /** One sentence: what this part of Loop is for. */
  summary: string;
  /** Why you would care, in plain words. */
  why: string;
  steps: GuideStep[];
  tip?: string;
  href: string;
  cta: string;
  adminOnly?: boolean;
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "inbox",
    label: "Inbox",
    icon: Inbox,
    illustration: "inbox",
    summary: "Every customer message lands here as a ticket, in one list.",
    why: "No more hunting through shared mailboxes. You always see what is waiting and what is urgent.",
    steps: [
      { title: "Open the Inbox", text: "Click Inbox in the sidebar (or press T). New tickets appear at the top." },
      { title: "Open a ticket", text: "Click a row to read the conversation and see the customer on the right." },
      { title: "Reply or add a private note", text: "Switch between Reply (customer sees it) and Note (only your team sees it)." },
      { title: "Set status and priority", text: "Mark it Pending while you wait, or Solved when done. Raise priority for urgent cases." },
    ],
    tip: "Use the filters on top (status, priority, assignee) and save time with bulk actions on selected rows.",
    href: "/tickets",
    cta: "Open Inbox",
  },
  {
    id: "ai",
    label: "AI replies",
    icon: Sparkles,
    illustration: "ai",
    summary: "The AI drafts a reply from your knowledge base and shows how sure it is.",
    why: "You stay in control: nothing is sent until a person clicks. You also see which article the answer came from.",
    steps: [
      { title: "Open a ticket", text: "The AI suggestion appears above the reply box after a moment." },
      { title: "Check the confidence", text: "A high percentage means it found a close match in your articles. A low one means review carefully." },
      { title: "Look at the sources", text: "The article chips show where the answer came from. Click to verify." },
      { title: "Use, edit or ignore", text: "Click Use this reply, change a word or two, then send. Your rating helps improve results." },
    ],
    tip: "Good answers need good articles. If the AI is often unsure, add or improve articles on that topic.",
    href: "/tickets",
    cta: "See it on a ticket",
  },
  {
    id: "knowledge",
    label: "Knowledge base",
    icon: BookOpen,
    illustration: "knowledge",
    summary: "Your help articles. The AI reads only the ones you publish.",
    why: "One good article answers the same question for every customer, and teaches the AI your policies.",
    steps: [
      { title: "Create an article", text: "Click New article and write the answer the way you would tell a customer." },
      { title: "Add tags", text: "Tags like refunds or billing make articles easier to find later." },
      { title: "Publish it", text: "Drafts are private. Set the status to Published so the AI can use it." },
      { title: "Keep it fresh", text: "When a policy changes, edit the article. Old answers disappear from the AI right away." },
    ],
    tip: "Start with your top 5 repeat questions. That alone usually covers a big share of tickets.",
    href: "/knowledge",
    cta: "Write an article",
  },
  {
    id: "customers",
    label: "Customers",
    icon: Users,
    illustration: "customer",
    summary: "One profile per person with their whole history.",
    why: "Anyone on your team can pick up a conversation without asking the customer to repeat themselves.",
    steps: [
      { title: "Profiles are created for you", text: "When someone writes in, Loop finds or creates their profile by email." },
      { title: "Open a profile", text: "See every past ticket, notes and details in one place." },
      { title: "Add context", text: "Add notes or tags like VIP so the next agent knows how to help." },
    ],
    href: "/customers",
    cta: "Open Customers",
  },
  {
    id: "automations",
    label: "Automations",
    icon: Workflow,
    illustration: "automation",
    summary: "Rules that do the boring parts for you: When this happens, if that is true, then do this.",
    why: "Routing, tagging and escalation happen the same way every time, even at 3 a.m.",
    steps: [
      { title: "Pick a trigger", text: "For example: ticket created, or customer replied." },
      { title: "Add conditions", text: "Narrow it down: priority is urgent, subject contains refund, and so on." },
      { title: "Choose actions", text: "Assign to a team, set priority, add a tag, or send a webhook." },
      { title: "Test before you switch on", text: "Use Simulate to see what the rule would do on a real ticket, without changing anything." },
    ],
    tip: "Start with one small rule, watch the run log for a day, then add more.",
    href: "/settings/automations",
    cta: "Build a rule",
    adminOnly: true,
  },
  {
    id: "sla",
    label: "SLA timers",
    icon: Clock,
    illustration: "sla",
    summary: "Response-time promises, tracked automatically.",
    why: "You see which tickets are close to missing a promise before it happens.",
    steps: [
      { title: "Set your targets", text: "In Settings, choose how fast you want to answer by priority." },
      { title: "Watch the timers", text: "Tickets show a countdown. It turns amber as time runs short." },
      { title: "Act early", text: "The dashboard counts tickets at risk so you can jump on them first." },
    ],
    href: "/settings",
    cta: "Open Settings",
    adminOnly: true,
  },
  {
    id: "teams",
    label: "Teams",
    icon: Users2,
    illustration: "team",
    summary: "Group people and share the work fairly.",
    why: "Tickets reach the right people and nobody is overloaded.",
    steps: [
      { title: "Create a team", text: "For example Billing or Technical." },
      { title: "Add members", text: "Invite teammates by email from Settings if they are not here yet." },
      { title: "Route work", text: "Assign by team manually or with an automation rule. Check workloads to keep things balanced." },
    ],
    href: "/teams",
    cta: "Open Teams",
  },
  {
    id: "insights",
    label: "AI insights",
    icon: BarChart3,
    illustration: "insights",
    summary: "See how well the AI is doing, and why.",
    why: "Numbers tell you whether to trust it more, or fix an article.",
    steps: [
      { title: "Read the headline numbers", text: "Approval rate shows how often agents accept the AI reply." },
      { title: "Check the trend", text: "The chart shows changes over time. Sudden drops often point to a missing article." },
      { title: "Open a trace", text: "Click any AI answer to see what it read and why it replied that way." },
    ],
    tip: "The chart here is sample data. Yours fills in as the AI is used.",
    href: "/ai-insights",
    cta: "Open insights",
    adminOnly: true,
  },
  {
    id: "developers",
    label: "Developers",
    icon: Code2,
    illustration: "developer",
    summary: "Connect Loop to your own systems with webhooks and API keys.",
    why: "Your app can react to tickets instantly, or create tickets by itself.",
    steps: [
      { title: "Create an API key", text: "Keep it secret. It is shown once." },
      { title: "Add a webhook endpoint", text: "Give a URL on your server and choose which events to receive." },
      { title: "Verify the signature", text: "Each event is signed with X-Support-Signature so you know it is really from Loop." },
      { title: "Check deliveries", text: "The log shows every attempt and lets you retry a failed one." },
    ],
    href: "/developers",
    cta: "Open Developers",
    adminOnly: true,
  },
];

export interface FirstTenStep {
  minute: string;
  title: string;
  text: string;
  href: string;
  adminOnly?: boolean;
}

export const FIRST_TEN_MINUTES: FirstTenStep[] = [
  { minute: "0–2", title: "Look around", text: "Open the Inbox and click any ticket to see how it looks.", href: "/tickets" },
  { minute: "2–5", title: "Teach the AI", text: "Publish your first help article.", href: "/knowledge" },
  { minute: "5–7", title: "Invite a teammate", text: "Work is better together.", href: "/settings" },
  { minute: "7–9", title: "Connect your email", text: "Customer emails become tickets on their own.", href: "/settings/integrations", adminOnly: true },
  { minute: "9–10", title: "Automate one thing", text: "Create a simple rule.", href: "/settings/automations", adminOnly: true },
];

export const GLOSSARY: Array<{ term: string; meaning: string }> = [
  { term: "Ticket", meaning: "One customer issue, with all its messages." },
  { term: "Status", meaning: "Where it stands: open, pending, on hold, solved or closed." },
  { term: "Note", meaning: "A private message only your team can read." },
  { term: "Confidence", meaning: "How closely the AI found a matching article. Higher is safer." },
  { term: "SLA", meaning: "The response-time promise you set for a ticket." },
  { term: "Webhook", meaning: "A message Loop sends to your server when something happens." },
];
