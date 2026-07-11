"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { disconnectSocket, getSocket } from "@/lib/socket";
import { useAppSelector } from "@/store";

export function useRealtimeTickets() {
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken) return;

    const socket = getSocket(accessToken);

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tickets"] });

    socket.on("ticket:created", invalidate);
    socket.on("ticket:updated", invalidate);
    socket.on("ticket:message", invalidate);

    return () => {
      socket.off("ticket:created", invalidate);
      socket.off("ticket:updated", invalidate);
      socket.off("ticket:message", invalidate);
    };
  }, [accessToken, queryClient]);

  useEffect(() => () => disconnectSocket(), []);
}
