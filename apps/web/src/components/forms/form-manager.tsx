"use client";

import { Check, Copy, ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCreateForm, useDeleteForm, useForms, useUpdateForm, type IntakeFormRow } from "@/hooks/use-forms";
import { ApiRequestError } from "@/lib/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const endpoint = (key: string) => `${API_URL}/api/public/forms/${key}/submit`;

function htmlSnippet(key: string) {
  return `<form id="support-form">
  <input name="name" placeholder="Your name" />
  <input name="email" type="email" placeholder="Email" required />
  <input name="subject" placeholder="Subject" />
  <textarea name="message" placeholder="How can we help?" required></textarea>
  <!-- spam trap: keep hidden, real visitors never fill it -->
  <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" />
  <button type="submit">Send</button>
</form>
<script>
  document.getElementById("support-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await fetch("${endpoint(key)}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    const json = await res.json();
    alert(json.success ? "Thanks! Reference #" + json.data.reference : json.error.message);
  });
</script>`;
}

function curlSnippet(key: string) {
  return `curl -X POST "${endpoint(key)}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Asha","email":"asha@example.com","subject":"Refund","message":"Where is my refund?","fields":{"Order number":"1042"}}'`;
}

function assistantSnippet(key: string) {
  const app = typeof window !== "undefined" ? window.location.origin : "https://YOUR-APP-ADDRESS";
  return `<script src="${app}/widget/assistant.js" data-key="${key}" data-api="${API_URL}" defer></script>`;
}

function googleScript(key: string) {
  return `// Sends every new Google Form response to your support inbox.
var ENDPOINT = "${endpoint(key)}";

function onFormSubmit(e) {
  var response = e.response;
  var email = response.getRespondentEmail() || "";
  var name = "", subject = "", message = "", phone = "", pref = "";
  var fields = {};
  var count = 0;

  response.getItemResponses().forEach(function (item) {
    var title = String(item.getItem().getTitle() || "").trim();
    var value = String(item.getResponse() || "").trim();
    if (!title || !value) return;
    var t = title.toLowerCase();
    if (!email && t.indexOf("email") !== -1) email = value;
    else if (!pref && /prefer|call or message|how.*contact/.test(t)) pref = /call|phone/i.test(value) ? "call" : "message";
    else if (!phone && /phone|mobile|whatsapp|contact number/.test(t)) phone = value.replace(/[^0-9+()\\s-]/g, "").slice(0, 20);
    else if (!name && t.indexOf("name") !== -1) name = value;
    else if (!subject && t.indexOf("subject") !== -1) subject = value;
    else if (!message && /message|query|question|issue|problem|describe|details/.test(t)) message = value;
    else if (count < 10) { fields[title.slice(0, 40)] = value.slice(0, 500); count++; }
  });

  UrlFetchApp.fetch(ENDPOINT, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      name: name,
      email: email || "no-email-" + response.getId().slice(0, 12) + "@google-form.invalid",
      subject: subject,
      message: message || "New Google Form response",
      phone: phone,
      contactPreference: pref || undefined,
      fields: fields
    })
  });
}`;
}

function CopyBlock({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/50 p-3 pr-12 font-mono text-[11px] leading-relaxed">{text}</pre>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Copy ${label}`}
        className="absolute right-2 top-2 h-7 w-7"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          } catch {
            toast.error("Couldn't copy. Select the text and copy it.");
          }
        }}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

function FormCard({ form }: { form: IntakeFormRow }) {
  const update = useUpdateForm();
  const del = useDeleteForm();
  const [origins, setOrigins] = useState(form.allowedOrigins.join("\n"));

  const saveOrigins = () => {
    const list = origins.split("\n").map((o) => o.trim()).filter(Boolean);
    update.mutate(
      { id: form.id, allowedOrigins: list },
      {
        onSuccess: () => toast.success("Allowed sites saved"),
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't save."),
      }
    );
  };

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{form.name}</p>
          <p className="text-xs text-muted-foreground">{form.source === "google_form" ? "Google Form · " : form.source === "assistant" ? "AI assistant · " : "Website form · "}{form.submissions} submissions</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {form.isActive ? "Accepting" : "Paused"}
          <Switch checked={form.isActive} onCheckedChange={(v) => update.mutate({ id: form.id, isActive: v })} />
        </label>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${form.name}`}
          onClick={() => {
            if (!window.confirm(`Delete "${form.name}"? Old messages stay in your inbox, but the form stops working.`)) return;
            del.mutate(form.id, { onSuccess: () => toast.success("Form deleted"), onError: () => toast.error("Couldn't delete it.") });
          }}
        >
          <Trash2 className="h-4 w-4 text-danger" />
        </Button>
      </div>

      {form.source === "assistant" ? (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">A chat bubble for your website. It answers visitors from your published knowledge base articles, says so when it is not sure instead of guessing, and hands serious matters to your team with a 24-hour contact promise. Chats that need a person become tickets under Form messages.</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Allowed websites (one per line, optional)</Label>
            <Textarea value={origins} onChange={(e) => setOrigins(e.target.value)} className="min-h-16 font-mono text-xs" placeholder="https://www.yourshop.com" />
            <Button size="sm" variant="outline" onClick={saveOrigins} disabled={update.isPending}>Save sites</Button>
          </div>
          <p className="text-xs text-muted-foreground">Paste this just before <code>&lt;/body&gt;</code> on every page where the assistant should appear.</p>
          <CopyBlock text={assistantSnippet(form.publicKey)} label="assistant embed" />
        </div>
      ) : form.source === "google_form" ? (
        <div className="space-y-3">
          {form.googleFormUrl && (
            <a href={form.googleFormUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Open your Google Form
            </a>
          )}
          <ol className="list-decimal space-y-1.5 pl-5 text-xs text-muted-foreground">
            <li>Open your Google Form in edit mode, click the <b>⋮</b> menu (top right) and choose <b>Apps Script</b>.</li>
            <li>Delete the sample code, paste the code below, and click <b>Save</b>.</li>
            <li>Click the <b>Triggers</b> clock icon (left), then <b>Add Trigger</b>. Choose function <b>onFormSubmit</b>, event source <b>From form</b>, event type <b>On form submit</b>, then Save and allow access when Google asks.</li>
            <li>Send a test response. It appears under Form messages within seconds.</li>
          </ol>
          <CopyBlock text={googleScript(form.publicKey)} label="Google script" />
          <p className="text-[11px] text-muted-foreground">Tip: in the form&apos;s Settings turn on <b>Collect email addresses</b>, or add a question called &quot;Email&quot;. Without an email your team can read the message but cannot reply to the person. Your app must be reachable on the internet (not localhost) for Google to deliver.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Allowed websites (one per line, optional)</Label>
            <Textarea value={origins} onChange={(e) => setOrigins(e.target.value)} className="min-h-16 font-mono text-xs" placeholder="https://www.yourshop.com" />
            <p className="text-[11px] text-muted-foreground">Leave empty to accept the form from any site. Browsers send the site name; this stops casual misuse, not a determined bot, so the spam trap and rate limit stay on.</p>
            <Button size="sm" variant="outline" onClick={saveOrigins} disabled={update.isPending}>Save sites</Button>
          </div>

          <Tabs defaultValue="html">
            <TabsList>
              <TabsTrigger value="html">HTML form</TabsTrigger>
              <TabsTrigger value="curl">API call</TabsTrigger>
            </TabsList>
            <TabsContent value="html" className="space-y-2">
              <p className="text-xs text-muted-foreground">Paste this on your website. Style it however you like.</p>
              <CopyBlock text={htmlSnippet(form.publicKey)} label="HTML form" />
            </TabsContent>
            <TabsContent value="curl" className="space-y-2">
              <p className="text-xs text-muted-foreground">From your own server or any tool. Optional extra answers go in <code>fields</code>.</p>
              <CopyBlock text={curlSnippet(form.publicKey)} label="API call" />
            </TabsContent>
          </Tabs>
        </>
      )}
      <p className="text-[11px] text-muted-foreground">The key in the address is public by design. It can only submit messages, never read anything.</p>
    </div>
  );
}

export function FormManager({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: forms, isLoading } = useForms();
  const create = useCreateForm();
  const [name, setName] = useState("");
  const [origins, setOrigins] = useState("");
  const [kind, setKind] = useState<"web" | "google_form" | "assistant">("web");
  const [gUrl, setGUrl] = useState("");

  const onCreate = () => {
    if (!name.trim()) return toast.error("Give the form a name.");
    if (kind === "google_form" && !gUrl.trim()) return toast.error("Paste your Google Form link.");
    create.mutate(
      {
        name: name.trim(),
        source: kind,
        allowedOrigins: kind !== "google_form" ? origins.split("\n").map((o) => o.trim()).filter(Boolean) : [],
        ...(kind === "google_form" && { googleFormUrl: gUrl.trim() }),
      },
      {
        onSuccess: () => { setName(""); setOrigins(""); setGUrl(""); toast.success("Form added. Follow the steps below."); },
        onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't create the form."),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-2xl grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Your forms</DialogTitle>
          <DialogDescription>Add an AI assistant, connect a Google Form, or put a form on any website. Every response becomes a ticket and shows up under Form messages.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-sm font-medium">New form</p>
          <div className="inline-flex rounded-md bg-muted p-1 text-sm" role="tablist" aria-label="Form type">
            {([["web", "Website form"], ["google_form", "Google Form"], ["assistant", "AI assistant"]] as const).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`rounded-sm px-3 py-1 transition-colors ${kind === k ? "bg-surface font-medium shadow-card" : "text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "assistant" ? "Website assistant" : "Contact page, Pricing page..."} aria-label="Form name" />
          {kind === "google_form" ? (
            <Input value={gUrl} onChange={(e) => setGUrl(e.target.value)} placeholder="Paste your Google Form link (docs.google.com/forms/... or forms.gle/...)" aria-label="Google Form link" />
          ) : (
            <Textarea value={origins} onChange={(e) => setOrigins(e.target.value)} className="min-h-14 font-mono text-xs" placeholder={"Allowed websites, one per line (optional)\nhttps://www.yourshop.com"} aria-label="Allowed websites" />
          )}
          <Button size="sm" onClick={onCreate} disabled={create.isPending}>{create.isPending ? "Creating..." : "Create form"}</Button>
        </div>

        {isLoading ? null : (forms ?? []).map((f) => <FormCard key={f.id} form={f} />)}
      </DialogContent>
    </Dialog>
  );
}
