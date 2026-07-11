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
    "#lw-typing{font-size:11px;color:#6b7280;padding:0 12px 4px;min-height:16px;}" +
    "#lw-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e4e7eb;background:#fff;}" +
    "#lw-input{flex:1;border:1px solid #e4e7eb;border-radius:8px;padding:8px 10px;font-size:13px;outline:none;}" +
    "#lw-input:focus{border-color:" + ACCENT + ";}" +
    "#lw-send{background:" + ACCENT + ";color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;font-weight:600;}" +
    "#lw-send:disabled{opacity:.5;cursor:not-allowed;}";
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
  panel.innerHTML =
    '<div id="lw-header">Chat with us</div>' +
    '<div id="lw-messages"></div>' +
    '<div id="lw-typing"></div>' +
    '<form id="lw-form">' +
    '<input id="lw-input" type="text" placeholder="Type a message..." autocomplete="off" />' +
    '<button id="lw-send" type="submit">Send</button>' +
    "</form>";

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  var messagesEl = panel.querySelector("#lw-messages");
  var typingEl = panel.querySelector("#lw-typing");
  var formEl = panel.querySelector("#lw-form");
  var inputEl = panel.querySelector("#lw-input");

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------
  var renderedIds = {};

  function renderMessage(msg) {
    if (renderedIds[msg.id]) return;
    renderedIds[msg.id] = true;

    var el = document.createElement("div");
    var kind = msg.authorType === "customer" ? "customer" : msg.authorType === "system" ? "system" : "agent";
    el.className = "lw-msg lw-msg-" + kind;
    el.textContent = msg.body;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
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
        if (!res.ok || !json.success) throw new Error((json.error && json.error.message) || "Request failed");
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
    });
  }

  function sendMessage(body) {
    return apiFetch("/api/widget/conversations/" + state.ticketId + "/messages", {
      method: "POST",
      body: { body: body },
    }).then(renderMessage);
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
    if (!text) return;
    inputEl.value = "";
    emitTyping(false);
    sendMessage(text).catch(function (err) {
      console.error("[loop-widget] failed to send message", err);
    });
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
