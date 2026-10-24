/*!
 * Loop AI assistant: a chat bubble for any website.
 * Usage: <script src="https://APP/widget/assistant.js" data-key="frm_..." data-api="https://API" defer></script>
 * Answers come from the organisation's published knowledge base. Serious matters and anything the
 * assistant is unsure about are handed to a person, who contacts the visitor (24 hours for serious ones).
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var KEY = script.getAttribute("data-key");
  var API = (script.getAttribute("data-api") || "").replace(/\/$/, "");
  if (!KEY || !API) { console.warn("[assistant] data-key and data-api are required"); return; }

  var host = document.createElement("div");
  host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483000;";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  var css =
    ":host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
    ".btn{width:56px;height:56px;border-radius:50%;border:0;background:#2563eb;color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);font-size:24px}" +
    ".btn:focus-visible,.send:focus-visible,.chip:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}" +
    ".panel{position:absolute;right:0;bottom:70px;width:340px;max-width:calc(100vw - 32px);height:480px;max-height:calc(100vh - 110px);background:#fff;color:#111827;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden}" +
    ".panel.open{display:flex}" +
    ".head{padding:14px 16px;background:#2563eb;color:#fff;font-weight:600;font-size:15px;display:flex;justify-content:space-between;align-items:center}" +
    ".x{background:none;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1}" +
    ".msgs{flex:1;overflow-y:auto;padding:12px;background:#f3f4f6;display:flex;flex-direction:column;gap:8px}" +
    ".m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}" +
    ".m.bot{background:#fff;align-self:flex-start;border-bottom-left-radius:4px}" +
    ".m.me{background:#2563eb;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}" +
    ".m.urgent{border:1px solid #f59e0b;background:#fffbeb}" +
    ".src{font-size:11px;color:#6b7280;align-self:flex-start;margin-top:-4px}" +
    ".row{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}" +
    ".in{flex:1;border:1px solid #d1d5db;border-radius:10px;padding:9px 10px;font-size:14px}" +
    ".send{border:0;background:#2563eb;color:#fff;border-radius:10px;padding:0 14px;font-size:14px;cursor:pointer}" +
    ".send[disabled]{opacity:.5;cursor:default}" +
    ".form{display:flex;flex-direction:column;gap:6px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px;align-self:stretch}" +
    ".form input,.form textarea{border:1px solid #d1d5db;border-radius:8px;padding:7px 9px;font-size:13px;width:100%}" +
    ".form label{font-size:12px;color:#374151}.hp{position:absolute;left:-9999px}" +
    ".chip{border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:4px 10px;font-size:12px;cursor:pointer}" +
    ".err{color:#b91c1c;font-size:12px}" +
    "@media (prefers-color-scheme:dark){.panel{background:#111827;color:#f9fafb}.msgs{background:#0b1220}.m.bot{background:#1f2937;color:#f9fafb}.m.urgent{background:#3b2f0b}.row{background:#111827;border-color:#374151}.in,.form input,.form textarea{background:#1f2937;color:#f9fafb;border-color:#374151}.form{background:#1f2937;border-color:#374151}.form label{color:#d1d5db}.chip{background:#1f2937;color:#f9fafb;border-color:#374151}}";

  var style = document.createElement("style");
  style.textContent = css;
  root.appendChild(style);

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // never innerHTML: visitor and AI text stay inert
    return e;
  }

  var btn = el("button", "btn", "💬");
  btn.setAttribute("aria-label", "Open chat assistant");
  var panel = el("div", "panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat assistant");
  var head = el("div", "head");
  var title = el("span", null, "Help");
  var close = el("button", "x", "×");
  close.setAttribute("aria-label", "Close chat");
  head.appendChild(title); head.appendChild(close);
  var msgs = el("div", "msgs");
  msgs.setAttribute("aria-live", "polite");
  var row = el("form", "row");
  var input = el("input", "in");
  input.placeholder = "Type your question...";
  input.setAttribute("aria-label", "Your message");
  input.maxLength = 1000;
  var send = el("button", "send", "Send");
  send.type = "submit";
  row.appendChild(input); row.appendChild(send);
  panel.appendChild(head); panel.appendChild(msgs); panel.appendChild(row);
  root.appendChild(panel); root.appendChild(btn);

  var history = [];
  var busy = false;
  var started = false;
  var handoffShown = false;

  function add(text, who, urgent) {
    var m = el("div", "m " + who + (urgent ? " urgent" : ""), text);
    msgs.appendChild(m);
    msgs.scrollTop = msgs.scrollHeight;
    return m;
  }

  function api(path, method, body) {
    return fetch(API + path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.success) throw new Error((j.error && j.error.message) || "Something went wrong");
        return j.data;
      });
    });
  }

  function transcript() {
    return history.map(function (t) { return (t.role === "visitor" ? "Visitor: " : "Assistant: ") + t.text; }).join("\n").slice(-5500);
  }

  function showHandoff(urgent) {
    if (handoffShown) return;
    handoffShown = true;
    var lastVisitor = "";
    for (var i = history.length - 1; i >= 0; i--) if (history[i].role === "visitor") { lastVisitor = history[i].text; break; }

    var f = el("form", "form");
    function field(label, name, type, required, ph) {
      var l = el("label", null, label);
      var i = el("input"); i.name = name; i.type = type; i.required = !!required; if (ph) i.placeholder = ph;
      f.appendChild(l); f.appendChild(i); return i;
    }
    field("Your name", "name", "text", false);
    field("Email", "email", "email", true);
    var phone = field(urgent ? "Phone (so we can call you)" : "Phone (optional)", "phone", "tel", false, "+91 ...");
    phone.maxLength = 20;
    var pref = null;
    if (urgent) {
      var pl = el("label", null, "How should we reach you?");
      pref = el("select"); pref.style.cssText = "border:1px solid #d1d5db;border-radius:8px;padding:7px";
      [["call", "Call me"], ["message", "Message me"]].forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; pref.appendChild(op); });
      f.appendChild(pl); f.appendChild(pref);
    }
    var ml = el("label", null, "Message");
    var ta = el("textarea"); ta.rows = 3; ta.required = true; ta.maxLength = 3000; ta.value = lastVisitor;
    var hp = el("input", "hp"); hp.name = "website"; hp.tabIndex = -1; hp.setAttribute("autocomplete", "off"); hp.setAttribute("aria-hidden", "true");
    var err = el("div", "err");
    var go = el("button", "send", "Send to our team"); go.type = "submit"; go.style.padding = "8px 12px";
    f.appendChild(ml); f.appendChild(ta); f.appendChild(hp); f.appendChild(err); f.appendChild(go);
    msgs.appendChild(f); msgs.scrollTop = msgs.scrollHeight;

    f.addEventListener("submit", function (e) {
      e.preventDefault();
      go.disabled = true; err.textContent = "";
      var payload = {
        name: f.elements.name.value, email: f.elements.email.value, phone: f.elements.phone.value,
        message: ta.value, transcript: transcript(), website: hp.value
      };
      if (pref) payload.contactPreference = pref.value;
      api("/api/public/forms/" + encodeURIComponent(KEY) + "/submit", "POST", payload).then(function (d) {
        f.remove();
        var when = d.contactWithinHours ? " A team member will contact you within " + d.contactWithinHours + " hours." : " We will get back to you soon.";
        add("Thanks! Your reference is #" + d.reference + "." + when, "bot", !!d.contactWithinHours);
        handoffShown = false;
      }).catch(function (x) { err.textContent = x.message; go.disabled = false; });
    });
  }

  function ask(text) {
    if (busy || !text) return;
    busy = true; send.disabled = true;
    add(text, "me");
    var thinking = add("Thinking...", "bot");
    var past = history.slice();
    history.push({ role: "visitor", text: text });
    api("/api/public/assistant/" + encodeURIComponent(KEY) + "/chat", "POST", { message: text, history: past })
      .then(function (d) {
        thinking.textContent = d.reply;
        if (d.urgent) thinking.className = "m bot urgent";
        history.push({ role: "assistant", text: d.reply });
        if (d.sources && d.sources.length) msgs.appendChild(el("div", "src", "From: " + d.sources.join(", ")));
        if (d.handoff) showHandoff(d.urgent);
      })
      .catch(function (x) { thinking.textContent = x.message; })
      .then(function () { busy = false; send.disabled = false; msgs.scrollTop = msgs.scrollHeight; input.focus(); });
  }

  function open() {
    panel.classList.add("open");
    if (!started) {
      started = true;
      api("/api/public/assistant/" + encodeURIComponent(KEY) + "/config", "GET")
        .then(function (c) { title.textContent = c.name || "Help"; add("Hi! Ask me anything. If I am not sure, I will connect you with our team.", "bot"); })
        .catch(function () { add("The assistant is not available right now.", "bot"); input.disabled = true; send.disabled = true; });
    }
    input.focus();
  }

  btn.addEventListener("click", function () { panel.classList.contains("open") ? panel.classList.remove("open") : open(); });
  close.addEventListener("click", function () { panel.classList.remove("open"); btn.focus(); });
  panel.addEventListener("keydown", function (e) { if (e.key === "Escape") { panel.classList.remove("open"); btn.focus(); } });
  row.addEventListener("submit", function (e) { e.preventDefault(); var t = input.value.trim(); input.value = ""; ask(t); });
})();
