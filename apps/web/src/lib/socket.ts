import { io, type Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

/** Returns the shared socket, (re)connecting if the token has changed. */
export function getSocket(token: string): Socket {
  if (socket && socket.auth && (socket.auth as { token?: string }).token === token) {
    return socket;
  }

  socket?.disconnect();

  socket = io(API_URL, {
    path: "/socket.io",
    auth: { token },
    autoConnect: true,
    transports: ["websocket"],
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
