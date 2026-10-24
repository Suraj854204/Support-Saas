/**
 * Loop chat widget — embed with:
 *   <script src="https://your-app.example.com/widget/widget.js" data-org="acme-demo" defer></script>
 *
 * Deliberately framework-free: this file runs unmodified on any host page,
 * regardless of that site's own build tooling. Socket.IO's client is loaded
 * lazily from a CDN only once the visitor actually opens the chat.
 */
(function () {
  "use strict";

  var scriptTag = document.currentScript;
  var ORG_SLUG = scriptTag.getAttribute("data-org");
  var API_URL = scriptTag.getAttribute("data-api-url") || "http://localhost:4000";
  var ACCENT = scriptTag.getAttribute("data-accent") || "#5B6EF5";

  if (!ORG_SLUG) {
    console.error("[loop-widget] missing required data-org attribute on the script tag");
    return;
  }

  var STORAGE_TOKEN_KEY = "loop_widget_token_" + ORG_SLUG;
  var STORAGE_TICKET_KEY = "loop_widget_ticket_" + ORG_SLUG;

  var state = {
    open: false,
    token: localStorage.getItem(STORAGE_TOKEN_KEY) || null,
    ticketId: localStorage.getItem(STORAGE_TICKET_KEY) || null,
    messages: [],
    socket: null,
  };

  // ---------------------------------------------------------------------
  // Styles (scoped with an `lw-` prefix so we never collide with host CSS)
  // ---------------------------------------------------------------------
  var style = document.createElement("style");
  style.textContent =
    "#lw-launcher{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:9999px;" +
    "background:" + ACCENT + ";box-shadow:0 8px 24px rgba(0,0,0,.2);border:none;cursor:pointer;" +
    "display:flex;align-items:center;justify-content:center;z-index:2147483000;transition:transform .15s ease;}" +
    "#lw-launcher:hover{transform:scale(1.06);}" +
    "#lw-panel{position:fixed;bottom:88px;right:20px;width:360px;max-width:calc(100vw - 40px);height:520px;" +
    "max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.24);" +
    "display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}" +
    "#lw-panel.lw-open{display:flex;}" +
    "#lw-header{background:" + ACCENT + ";color:#fff;padding:16px;font-weight:600;font-size:14px;}" +
    "#lw-messages{flex:1;overflow-y:auto;padding:12px;background:#f7f8fa;display:flex;flex-direction:column;gap:8px;}" +
    ".lw-msg{max-width:80%;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.4;word-wrap:break-word;}" +
    ".lw-msg-customer{align-self:flex-end;background:" + ACCENT + ";color:#fff;border-bottom-right-radius:2px;}" +
    ".lw-msg-agent{align-self:flex-start;background:#fff;color:#14171f;border:1px solid #e4e7eb;border-bottom-left-radius:2px;}" +
    ".lw-msg-system{align-self:center;background:transparent;color:#6b7280;font-size:11px;}" +
    ".lw-msg-ai{align-self:flex-start;background:#fff;color:#14171f;border:1px solid #c7d2fe;border-bottom-left-radius:2px;}" +
    ".lw-who{display:block;font-size:10px;font-weight:600;color:#6b7280;margin-bottom:2px;text-transform:uppercase;letter-spacing:.04em;}" +
    ".lw-msg-pending{opacity:.6;}" +
    ".lw-msg-failed{background:#fee2e2;color:#7f1d1d;border:1px solid #fecaca;cursor:pointer;}" +
    "#lw-human{background:transparent;border:none;border-top:1px solid #e4e7eb;color:#4b5563;font-size:12px;padding:6px 12px;cursor:pointer;text-align:left;}" +
    "#lw-human:hover:not(:disabled){text-decoration:underline;}#lw-human:disabled{color:#9ca3af;cursor:default;}" +
    "#lw-typing{font-size:11px;color:#6b7280;padding:0 12px 4px;min-height:16px;}" +
    "#lw-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e4e7eb;background:#fff;}" +
    "#lw-input{flex:1;border:1px solid #e4e7eb;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;}" +
    "#lw-input:focus{border-color:" + ACCENT + ";}" +
    "#lw-send{background:" + ACCENT + ";color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;font-weight:600;}" +
    "#lw-send:disabled{opacity:.5;cursor:not-allowed;}" +
    "#lw-attach{background:transparent;border:1px solid #e4e7eb;border-radius:8px;width:36px;cursor:pointer;color:#4b5563;font-size:16px;line-height:1;}" +
    "#lw-attach:hover{background:#f3f4f6;}" +
    "#lw-chips{display:none;flex-wrap:wrap;gap:6px;padding:8px 12px 0;background:#fff;border-top:1px solid #e4e7eb;}" +
    ".lw-chip{display:flex;align-items:center;gap:6px;max-width:100%;background:#f3f4f6;border-radius:8px;padding:4px 8px;font-size:12px;color:#14171f;}" +
    ".lw-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px;}" +
    ".lw-chip button{border:none;background:transparent;cursor:pointer;color:#6b7280;font-size:14px;line-height:1;padding:0;}" +
    ".lw-chip-error{background:#fee2e2;color:#7f1d1d;}" +
    ".lw-files{display:flex;flex-direction:column;gap:6px;margin-top:6px;}" +
    ".lw-files img,.lw-files video{max-width:100%;max-height:200px;border-radius:8px;display:block;background:#000;}" +
    ".lw-files audio{max-width:100%;}" +
    ".lw-file{display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:underline;font-size:12px;word-break:break-all;}" +
    "#lw-panel.lw-drop{outline:3px dashed " + ACCENT + ";outline-offset:-6px;}" +
    "#lw-actions{display:flex;border-top:1px solid #e4e7eb;}#lw-actions button{flex:1;}" +
    "#lw-call{background:transparent;border:none;border-top:1px solid #e4e7eb;border-left:1px solid #e4e7eb;color:#4b5563;font-size:12px;padding:6px 12px;cursor:pointer;text-align:left;}" +
    "#lw-call:hover:not(:disabled){text-decoration:underline;}#lw-call:disabled{color:#9ca3af;cursor:default;}" +
    "#lw-callform{display:none;flex-direction:column;gap:6px;padding:10px 12px;border-top:1px solid #e4e7eb;background:#f9fafb;font-size:12px;}" +
    "#lw-callform input{border:1px solid #e4e7eb;border-radius:8px;padding:7px 9px;font-size:13px;outline:none;}" +
    "#lw-callform .lw-row{display:flex;gap:6px;}#lw-callform .lw-err{color:#b91c1c;}" +
    "#lw-callform button{border:none;border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;}" +
    "#lw-callgo{background:" + ACCENT + ";color:#fff;font-weight:600;}#lw-callno{background:transparent;color:#4b5563;}";
  document.head.appendChild(style);

  // ---------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------
  var launcher = document.createElement("button");
  launcher.id = "lw-launcher";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

  var panel = document.createElement("div");
  panel.id = "lw-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat with support");
  panel.innerHTML =
    '<div id="lw-header">Chat with us</div>' +
    '<div id="lw-messages" role="log" aria-live="polite"></div>' +
    '<div id="lw-typing" aria-live="polite"></div>' +
    '<div id="lw-actions"><button id="lw-human" type="button" style="border-left:none">Talk to a person</button>' +
    '<button id="lw-call" type="button">Request a call</button></div>' +
    '<form id="lw-callform" aria-label="Request a call">' +
    '<input id="lw-callphone" type="tel" placeholder="Your phone number (with country code)" aria-label="Phone number" maxlength="25" autocomplete="tel" />' +
    '<input id="lw-calltime" type="text" placeholder="Best time to call (optional)" aria-label="Best time to call" maxlength="100" />' +
    '<div class="lw-err" id="lw-callerr" role="alert"></div>' +
    '<div class="lw-row"><button id="lw-callgo" type="submit">Request call</button><button id="lw-callno" type="button">Cancel</button></div>' +
    "</form>" +
    '<div id="lw-chips" aria-live="polite"></div>' +
    '<form id="lw-form">' +
    '<button id="lw-attach" type="button" aria-label="Attach a file" title="Attach a photo, screenshot, video or document">&#128206;</button>' +
    '<input id="lw-file" type="file" multiple hidden accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/ogg,audio/wav,audio/mp4,application/pdf,application/zip,application/msword,application/vnd.ms-excel,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.pdf,.txt,.csv,.zip,.md,.json,.log,.rtf" />' +
    '<input id="lw-input" type="text" placeholder="Type a message..." aria-label="Message" maxlength="5000" autocomplete="off" />' +
    '<button id="lw-send" type="submit">Send</button>' +
    "</form>";

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  var messagesEl = panel.querySelector("#lw-messages");
  var typingEl = panel.querySelector("#lw-typing");
  var formEl = panel.querySelector("#lw-form");
  var inputEl = panel.querySelector("#lw-input");
  var humanBtn = panel.querySelector("#lw-human");
  var callBtn = panel.querySelector("#lw-call");
  var callForm = panel.querySelector("#lw-callform");
  var callErr = panel.querySelector("#lw-callerr");
  var chipsEl = panel.querySelector("#lw-chips");
  var attachBtn = panel.querySelector("#lw-attach");
  var fileInput = panel.querySelector("#lw-file");
  var sendBtn = panel.querySelector("#lw-send");

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  var renderedIds = {};
  var pendingByClientId = {};

  function newClientId() {
    var bytes = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return "w" + Array.prototype.map.call(bytes, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  function decorate(el, msg) {
    var kind = msg.authorType === "customer" ? "customer" : msg.authorType === "system" ? "system" : msg.authorType === "ai" ? "ai" : "agent";
    el.className = "lw-msg lw-msg-" + kind;
    el.textContent = "";
    if (kind === "ai" || kind === "agent") {
      var who = document.createElement("span");
      who.className = "lw-who";
      who.textContent = kind === "ai" ? "AI assistant" : "Support team";
      el.appendChild(who);
    }
    if (msg.body) el.appendChild(document.createTextNode(msg.body));
    renderAttachments(el, msg.attachments);
  }

  // ---------------------------------------------------------------------
  // Files: links are short-lived, so a failed load re-reads the conversation for fresh ones.
  // ---------------------------------------------------------------------
  var MAX_FILES = 5;
  var MAX_BYTES = 50 * 1024 * 1024;
  var fileEls = {};
  var refreshing = false;

  function abs(url) { return /^\//.test(url) ? API_URL + url : url; }

  function sizeLabel(n) {
    return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB";
  }

  function trackFile(id, el, attr, key) {
    (fileEls[id] = fileEls[id] || []).push({ el: el, attr: attr, key: key });
  }

  function refreshLinks() {
    if (refreshing || !state.ticketId) return;
    refreshing = true;
    apiFetch("/api/widget/conversations/" + state.ticketId).then(function (c) {
      (c.messages || []).forEach(function (m) {
        (m.attachments || []).forEach(function (a) {
          (fileEls[a.id] || []).forEach(function (t) { t.el[t.attr] = abs(a[t.key]); });
        });
      });
    }, function () {}).then(function () { setTimeout(function () { refreshing = false; }, 5000); });
  }

  function renderAttachments(el, attachments) {
    if (!attachments || !attachments.length) return;
    var box = document.createElement("div");
    box.className = "lw-files";
    attachments.forEach(function (a) {
      var node;
      if (a.kind === "image") {
        node = document.createElement("a");
        node.href = abs(a.downloadUrl);
        node.target = "_blank";
        node.rel = "noopener noreferrer";
        var img = document.createElement("img");
        img.src = abs(a.url);
        img.alt = a.filename;
        img.loading = "lazy";
        img.addEventListener("error", refreshLinks);
        trackFile(a.id, img, "src", "url");
        trackFile(a.id, node, "href", "downloadUrl");
        node.appendChild(img);
      } else if (a.kind === "video" || a.kind === "audio") {
        node = document.createElement(a.kind);
        node.controls = true;
        node.preload = "metadata";
        node.src = abs(a.url);
        node.setAttribute("aria-label", a.filename);
        node.addEventListener("error", refreshLinks);
        trackFile(a.id, node, "src", "url");
      } else {
        node = document.createElement("a");
        node.className = "lw-file";
        node.href = abs(a.downloadUrl);
        node.target = "_blank";
        node.rel = "noopener noreferrer";
        node.textContent = "\uD83D\uDCCE " + a.filename + " (" + sizeLabel(a.sizeBytes) + ")";
        trackFile(a.id, node, "href", "downloadUrl");
      }
      box.appendChild(node);
    });
    el.appendChild(box);
  }

  // Files waiting to be sent with the next message.
  var pendingFiles = [];

  function renderChips() {
    chipsEl.textContent = "";
    chipsEl.style.display = pendingFiles.length ? "flex" : "none";
    pendingFiles.forEach(function (p) {
      var chip = document.createElement("div");
      chip.className = "lw-chip" + (p.error ? " lw-chip-error" : "");
      var label = document.createElement("span");
      label.textContent = p.name + (p.error ? " - " + p.error : p.view ? "" : " - uploading...");
      label.title = label.textContent;
      var x = document.createElement("button");
      x.type = "button";
      x.setAttribute("aria-label", "Remove " + p.name);
      x.textContent = "\u00D7";
      x.addEventListener("click", function () {
        pendingFiles = pendingFiles.filter(function (q) { return q !== p; });
        renderChips();
      });
      chip.appendChild(label);
      chip.appendChild(x);
      chipsEl.appendChild(chip);
    });
    sendBtn.disabled = pendingFiles.some(function (p) { return !p.view && !p.error; });
  }

  function uploadFile(file) {
    if (pendingFiles.length >= MAX_FILES) return;
    var p = { name: file.name || "screenshot.png", view: null, error: null };
    pendingFiles.push(p);
    renderChips();
    if (file.size > MAX_BYTES) { p.error = "too large (max 50 MB)"; renderChips(); return; }
    var ready = state.ticketId ? Promise.resolve() : startOrResumeConversation();
    ready.then(function () {
      var form = new FormData();
      form.append("file", file, p.name);
      return fetch(API_URL + "/api/widget/conversations/" + state.ticketId + "/attachments", {
        method: "POST",
        headers: { Authorization: "Bearer " + state.token },
        body: form,
      });
    }).then(function (res) {
      return res.json().then(function (json) {
        if (!res.ok || !json.success) throw new Error((json.error && json.error.message) || "Upload failed");
        p.view = json.data;
      });
    }).catch(function (err) {
      p.error = err && err.message ? err.message.slice(0, 80) : "Upload failed";
    }).then(renderChips);
  }

  function addFiles(list) {
    Array.prototype.slice.call(list || []).slice(0, MAX_FILES).forEach(uploadFile);
  }

  function renderMessage(msg) {
    if (!msg || renderedIds[msg.id]) return;
    var pending = msg.clientMessageId && pendingByClientId[msg.clientMessageId];
    var el = pending ? pending.el : document.createElement("div");
    renderedIds[msg.id] = true;
    if (pending) delete pendingByClientId[msg.clientMessageId];
    decorate(el, msg);
    if (!pending) messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (msg.authorType !== "customer") setThinking(false);
  }

  var thinkingTimer = null;
  function setThinking(on) {
    if (thinkingTimer) clearTimeout(thinkingTimer);
    typingEl.textContent = on ? "Support is replying..." : "";
    if (on) thinkingTimer = setTimeout(function () { typingEl.textContent = ""; }, 45000);
  }

  function setTyping(isTyping) {
    typingEl.textContent = isTyping ? "Agent is typing..." : "";
  }

  // ---------------------------------------------------------------------
  // API calls
  // ---------------------------------------------------------------------
  function apiFetch(path, options) {
    options = options || {};
    var headers = { "Content-Type": "application/json" };
    if (state.token) headers.Authorization = "Bearer " + state.token;
    return fetch(API_URL + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      return res.json().then(function (json) {
        if (!res.ok || !json.success) {
          var e = new Error((json.error && json.error.message) || "Request failed");
          e.fatal = res.status >= 400 && res.status < 500 && res.status !== 429;
          throw e;
        }
        return json.data;
      });
    });
  }

  function startOrResumeConversation() {
    return apiFetch("/api/widget/" + ORG_SLUG + "/conversations", { method: "POST", body: {} }).then(function (data) {
      state.token = data.token;
      state.ticketId = data.ticketId;
      localStorage.setItem(STORAGE_TOKEN_KEY, data.token);
      localStorage.setItem(STORAGE_TICKET_KEY, data.ticketId);
      (data.messages || []).forEach(renderMessage);
      connectSocket();
      startPolling(false);
    });
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /**
   * Sends once per message id. Network failures are retried with the SAME clientMessageId, so the server
   * stores the message at most once however many times this runs.
   */
  function deliver(entry, attempt) {
    return apiFetch("/api/widget/conversations/" + state.ticketId + "/messages", {
      method: "POST",
      body: { body: entry.body, clientMessageId: entry.id, attachmentIds: entry.attachmentIds || [] },
    }).then(
      function (saved) {
        entry.el.classList.remove("lw-msg-pending", "lw-msg-failed");
        entry.el.removeAttribute("title");
        saved.clientMessageId = entry.id;
        renderMessage(saved);
        setThinking(true);
        startPolling(true);
      },
      function (err) {
        if (attempt < 3 && !(err && err.fatal)) {
          return wait(800 * Math.pow(2, attempt)).then(function () { return deliver(entry, attempt + 1); });
        }
        entry.el.classList.remove("lw-msg-pending");
        entry.el.classList.add("lw-msg-failed");
        entry.el.setAttribute("title", "Not sent. Click to retry.");
        entry.el.setAttribute("role", "button");
        entry.el.tabIndex = 0;
        entry.el.textContent = (entry.body || "(file)") + "  (not sent. Click to retry)";
        var retry = function () {
          entry.el.removeEventListener("click", retry);
          entry.el.textContent = entry.body || "(file)";
          entry.el.classList.remove("lw-msg-failed");
          entry.el.classList.add("lw-msg-pending");
          entry.el.removeAttribute("role");
          deliver(entry, 0);
        };
        entry.el.addEventListener("click", retry);
        entry.el.addEventListener("keydown", function (e) { if (e.key === "Enter") retry(); });
      }
    );
  }

  function sendMessage(body, files) {
    files = files || [];
    var entry = { id: newClientId(), body: body, attachmentIds: files.map(function (f) { return f.id; }), el: document.createElement("div") };
    entry.el.className = "lw-msg lw-msg-customer lw-msg-pending";
    entry.el.textContent = body;
    if (files.length) renderAttachments(entry.el, files);
    messagesEl.appendChild(entry.el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    pendingByClientId[entry.id] = entry;
    return deliver(entry, 0);
  }

  function requestHuman() {
    humanBtn.disabled = true;
    humanBtn.textContent = "A person has been asked to join";
    apiFetch("/api/widget/conversations/" + state.ticketId + "/human", { method: "POST", body: {} }).then(
      function () { startPolling(true); },
      function () {
        humanBtn.disabled = false;
        humanBtn.textContent = "Couldn't reach the team. Try again";
      }
    );
  }

  // Polling is the safety net behind the live socket: a missed push never loses a reply.
  var pollTimer = null;
  var fastUntil = 0;
  function startPolling(fast) {
    if (fast) fastUntil = Date.now() + 60000;
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (!state.open || !state.ticketId) return;
      if (document.hidden && Date.now() > fastUntil) return;
      apiFetch("/api/widget/conversations/" + state.ticketId).then(function (c) {
        (c.messages || []).forEach(renderMessage);
      }, function () {});
    }, 4000);
  }

  // ---------------------------------------------------------------------
  // Realtime — Socket.IO client loaded lazily from a CDN on first open
  // ---------------------------------------------------------------------
  function loadSocketIoScript(callback) {
    if (window.io) return callback();
    var s = document.createElement("script");
    s.src = "https://cdn.socket.io/4.8.1/socket.io.min.js";
    s.onload = callback;
    s.onerror = function () {
      console.error("[loop-widget] failed to load Socket.IO — live updates disabled, falling back to no realtime");
    };
    document.head.appendChild(s);
  }

  function connectSocket() {
    loadSocketIoScript(function () {
      if (!window.io || state.socket) return;

      state.socket = window.io(API_URL, {
        path: "/socket.io",
        auth: { token: state.token },
        transports: ["websocket"],
      });

      state.socket.on("connect", function () {
        state.socket.emit("ticket:join", state.ticketId);
      });

      state.socket.on("ticket:message", function (msg) {
        renderMessage(msg);
      });

      state.socket.on("ticket:typing:start", function () {
        setTyping(true);
      });

      state.socket.on("ticket:typing:stop", function () {
        setTyping(false);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------
  function openPanel() {
    state.open = true;
    panel.classList.add("lw-open");

    if (state.token && state.ticketId) {
      apiFetch("/api/widget/conversations/" + state.ticketId)
        .then(function (conversation) {
          (conversation.messages || []).forEach(renderMessage);
          connectSocket();
          startPolling(false);
        })
        .catch(function () {
          // Stored token expired/invalid — start fresh.
          localStorage.removeItem(STORAGE_TOKEN_KEY);
          localStorage.removeItem(STORAGE_TICKET_KEY);
          state.token = null;
          state.ticketId = null;
          startOrResumeConversation();
        });
    } else {
      startOrResumeConversation();
    }

    inputEl.focus();
  }

  humanBtn.addEventListener("click", function () {
    if (state.ticketId) requestHuman();
  });

  panel.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { panel.classList.remove("lw-open"); state.open = false; launcher.focus(); }
  });

  launcher.addEventListener("click", function () {
    if (state.open) {
      panel.classList.remove("lw-open");
      state.open = false;
    } else {
      openPanel();
    }
  });

  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = inputEl.value.trim();
    var files = pendingFiles.filter(function (p) { return p.view; }).map(function (p) { return p.view; });
    if (!text && !files.length) return;
    inputEl.value = "";
    pendingFiles = [];
    renderChips();
    emitTyping(false);
    if (!state.ticketId) {
      startOrResumeConversation().then(function () { sendMessage(text, files); });
    } else {
      sendMessage(text, files);
    }
  });

  // Request a call: the team phones the visitor; nothing is dialled from the browser.
  callBtn.addEventListener("click", function () {
    callForm.style.display = callForm.style.display === "flex" ? "none" : "flex";
    callErr.textContent = "";
    if (callForm.style.display === "flex") panel.querySelector("#lw-callphone").focus();
  });
  panel.querySelector("#lw-callno").addEventListener("click", function () { callForm.style.display = "none"; });
  callForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var phone = panel.querySelector("#lw-callphone").value.trim();
    var when = panel.querySelector("#lw-calltime").value.trim();
    if (!/^\+?[\d\s().-]{7,25}$/.test(phone)) { callErr.textContent = "Please enter a valid phone number."; return; }
    var ready = state.ticketId ? Promise.resolve() : startOrResumeConversation();
    ready.then(function () {
      return apiFetch("/api/widget/conversations/" + state.ticketId + "/call-request", { method: "POST", body: { phone: phone, preferredTime: when || undefined } });
    }).then(function () {
      callForm.style.display = "none";
      callBtn.disabled = true;
      callBtn.textContent = "Call requested";
      startPolling(true);
    }, function (err) { callErr.textContent = (err && err.message) || "Couldn't send your request. Try again."; });
  });

  // Attach button, paste (screenshots) and drag-and-drop.
  attachBtn.addEventListener("click", function () { fileInput.click(); });
  fileInput.addEventListener("change", function () { addFiles(fileInput.files); fileInput.value = ""; });
  inputEl.addEventListener("paste", function (e) {
    var files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) { e.preventDefault(); addFiles(files); }
  });
  panel.addEventListener("dragover", function (e) { e.preventDefault(); panel.classList.add("lw-drop"); });
  panel.addEventListener("dragleave", function (e) { if (e.target === panel) panel.classList.remove("lw-drop"); });
  panel.addEventListener("drop", function (e) {
    e.preventDefault();
    panel.classList.remove("lw-drop");
    addFiles(e.dataTransfer && e.dataTransfer.files);
  });

  // --- Typing indicator (visitor -> agent) ---
  var typingTimeout = null;
  var isTyping = false;

  function emitTyping(typing) {
    if (!state.socket || !state.ticketId) return;
    if (typing === isTyping) return;
    isTyping = typing;
    state.socket.emit(typing ? "ticket:typing:start" : "ticket:typing:stop", state.ticketId);
  }

  inputEl.addEventListener("input", function () {
    emitTyping(true);
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(function () {
      emitTyping(false);
    }, 2000);
  });

  inputEl.addEventListener("blur", function () {
    if (typingTimeout) clearTimeout(typingTimeout);
    emitTyping(false);
  });
})();
