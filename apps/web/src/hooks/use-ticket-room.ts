"use client";

import { useCallback, useEffect, useState } from "react";

import { getSocket } from "@/lib/socket";
import { useAppSelector } from "@/store";

interface TypingUser {
  userId: string;
  userName: string;
}

export function useTicketRoom(ticketId: string | undefined) {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [viewerCount, setViewerCount] = useState(1);

  useEffect(() => {
    if (!accessToken || !ticketId) return;

    const socket = getSocket(accessToken);
    socket.emit("ticket:join", ticketId);

    const onTypingStart = (payload: { ticketId: string; userId: string; userName: string }) => {
      if (payload.ticketId !== ticketId || payload.userId === currentUserId) return;
      setTypingUsers((prev) =>
        prev.some((u) => u.userId === payload.userId)
          ? prev
          : [...prev, { userId: payload.userId, userName: payload.userName }]
      );
    };

    const onTypingStop = (payload: { ticketId: string; userId: string }) => {
      if (payload.ticketId !== ticketId) return;
      setTypingUsers((prev) => prev.filter((u) => u.userId !== payload.userId));
    };

    const onPresence = (payload: { ticketId: string; viewerCount: number }) => {
      if (payload.ticketId !== ticketId) return;
      setViewerCount(payload.viewerCount);
    };

    socket.on("ticket:typing:start", onTypingStart);
    socket.on("ticket:typing:stop", onTypingStop);
    socket.on("ticket:presence", onPresence);

    return () => {
      socket.emit("ticket:leave", ticketId);
      socket.off("ticket:typing:start", onTypingStart);
      socket.off("ticket:typing:stop", onTypingStop);
      socket.off("ticket:presence", onPresence);
      setTypingUsers([]);
    };
  }, [accessToken, ticketId, currentUserId]);

  const emitTyping = useCallback(
    (state: "start" | "stop") => {
      if (!accessToken || !ticketId) return;
      getSocket(accessToken).emit(`ticket:typing:${state}`, ticketId);
    },
    [accessToken, ticketId]
  );

  return { typingUsers, viewerCount, emitTyping };
}
