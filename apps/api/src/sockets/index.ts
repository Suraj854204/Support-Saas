import type { Server as HttpServer } from "http";

import { Server, type Socket } from "socket.io";

import { env } from "@/config/env";
import { verifyAccessToken, verifyWidgetToken } from "@/lib/jwt";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

let io: Server | undefined;

function orgRoom(orgId: string) {
  return `org:${orgId}`;
}

/** Staff room — agents/admins viewing a ticket. Receives everything, including internal notes. */
function ticketRoom(ticketId: string) {
  return `ticket:${ticketId}`;
}

/** Widget room — the customer's own browser session(s). Never receives internal notes or org-wide data. */
function ticketWidgetRoom(ticketId: string) {
  return `ticket:${ticketId}:widget`;
}

interface StaffSocketData {
  kind: "staff";
  userId: string;
  orgId: string;
  role: string;
  userName: string;
}

interface WidgetSocketData {
  kind: "widget";
  customerId: string;
  orgId: string;
}

type SocketData = StaffSocketData | WidgetSocketData;

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.NEXT_PUBLIC_APP_URL, credentials: true },
    path: "/socket.io",
  });

  // Auth handshake: client connects with `auth: { token }`. Staff access
  // tokens and public widget tokens are tried in turn — each results in a
  // socket with a different `kind` and therefore different room privileges.
  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Missing auth token"));

    try {
      const payload = verifyAccessToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { name: true } });
      socket.data = {
        kind: "staff",
        userId: payload.sub,
        orgId: payload.orgId,
        role: payload.role,
        userName: user?.name ?? "Someone",
      } satisfies StaffSocketData;
      return next();
    } catch {
      // fall through to widget token
    }

    try {
      const payload = verifyWidgetToken(token);
      socket.data = { kind: "widget", customerId: payload.sub, orgId: payload.orgId } satisfies WidgetSocketData;
      return next();
    } catch {
      return next(new Error("Invalid or expired auth token"));
    }
  });

  io.on("connection", (socket) => {
    const data = socket.data as SocketData;

    if (data.kind === "staff") {
      socket.join(orgRoom(data.orgId));
      logger.debug({ userId: data.userId, orgId: data.orgId, socketId: socket.id }, "Staff socket connected");
    } else {
      logger.debug({ customerId: data.customerId, orgId: data.orgId, socketId: socket.id }, "Widget socket connected");
    }

    socket.on("ticket:join", async (ticketId: string) => {
      if (data.kind === "staff") {
        socket.join(ticketRoom(ticketId));
        const room = io?.sockets.adapter.rooms.get(ticketRoom(ticketId));
        io?.to(ticketRoom(ticketId)).emit("ticket:presence", { ticketId, viewerCount: room?.size ?? 1 });
        return;
      }

      // Widget socket: verify this ticket actually belongs to this customer
      // before allowing the join — otherwise any visitor could guess a
      // ticket id and eavesdrop on someone else's conversation.
      const owns = await prisma.ticket.findFirst({
        where: { id: ticketId, orgId: data.orgId, customerId: data.customerId },
        select: { id: true },
      });
      if (owns) socket.join(ticketWidgetRoom(ticketId));
    });

    socket.on("ticket:leave", (ticketId: string) => {
      if (data.kind === "staff") {
        socket.leave(ticketRoom(ticketId));
        const room = io?.sockets.adapter.rooms.get(ticketRoom(ticketId));
        io?.to(ticketRoom(ticketId)).emit("ticket:presence", { ticketId, viewerCount: room?.size ?? 0 });
      } else {
        socket.leave(ticketWidgetRoom(ticketId));
      }
    });

    // Staff typing relays to other agents AND the customer's widget room
    // ("Agent is typing"); customer typing relays to the staff room only
    // ("Customer is typing") — see the ownership guard below.
    socket.on("ticket:typing:start", (ticketId: string) => {
      if (data.kind === "staff") {
        const payload = { ticketId, userId: data.userId, userName: data.userName };
        socket.to(ticketRoom(ticketId)).emit("ticket:typing:start", payload);
        io?.to(ticketWidgetRoom(ticketId)).emit("ticket:typing:start", payload);
      } else {
        // Customer is typing — only staff viewing this ticket need to know.
        // Guard: only relay if this socket actually joined the ticket's widget
        // room (ownership was verified then), so a visitor can't spam typing
        // noise for tickets that aren't theirs.
        if (!socket.rooms.has(ticketWidgetRoom(ticketId))) return;
        const payload = { ticketId, userId: data.customerId, userName: "Customer" };
        io?.to(ticketRoom(ticketId)).emit("ticket:typing:start", payload);
      }
    });

    socket.on("ticket:typing:stop", (ticketId: string) => {
      if (data.kind === "staff") {
        const payload = { ticketId, userId: data.userId };
        socket.to(ticketRoom(ticketId)).emit("ticket:typing:stop", payload);
        io?.to(ticketWidgetRoom(ticketId)).emit("ticket:typing:stop", payload);
      } else {
        if (!socket.rooms.has(ticketWidgetRoom(ticketId))) return;
        const payload = { ticketId, userId: data.customerId };
        io?.to(ticketRoom(ticketId)).emit("ticket:typing:stop", payload);
      }
    });

    socket.on("disconnect", () => {
      if (data.kind === "staff") {
        logger.debug({ userId: data.userId, orgId: data.orgId, socketId: socket.id }, "Staff socket disconnected");
      } else {
        logger.debug({ customerId: data.customerId, socketId: socket.id }, "Widget socket disconnected");
      }
    });
  });

  return io;
}

/** Broadcast an event to every connected staff client in an organization. */
export function emitToOrg(orgId: string, event: string, payload: unknown): void {
  if (!io) return; // socket server not initialized (e.g. running under tests)
  io.to(orgRoom(orgId)).emit(event, payload);
}

/** Broadcast an event to every staff client currently viewing a specific ticket. */
export function emitToTicket(ticketId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(ticketRoom(ticketId)).emit(event, payload);
}

/** Broadcast an event to the customer's own widget session(s) for a ticket. Never send internal notes here. */
export function emitToTicketWidgetRoom(ticketId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(ticketWidgetRoom(ticketId)).emit(event, payload);
}

export function getSocketServer(): Server | undefined {
  return io;
}
