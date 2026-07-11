import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";

import { widgetService } from "./widget.service";

import { AppError } from "@/lib/app-error";
import { signWidgetToken, verifyWidgetToken } from "@/lib/jwt";
import { KAFKA_TOPICS, publishEvent } from "@/lib/kafka";
import { emitToOrg, emitToTicketWidgetRoom } from "@/sockets";


function existingCustomerIdFromHeader(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  try {
    return verifyWidgetToken(header.slice("Bearer ".length)).sub;
  } catch {
    return undefined; // expired/invalid — just start a fresh identity
  }
}

export const widgetController = {
  async startConversation(req: Request, res: Response) {
    const orgSlug = req.params.orgSlug as string;
    const existingCustomerId = existingCustomerIdFromHeader(req);

    const { org, customer, ticket } = await widgetService.startConversation(orgSlug, existingCustomerId, req.body);
    const conversation = await widgetService.getConversation(org.id, customer.id, ticket.id);

    const token = signWidgetToken({ sub: customer.id, orgId: org.id });

    const body: ApiResponse<{
      token: string;
      ticketId: string;
      customerId: string;
      messages: typeof conversation.messages;
    }> = {
      success: true,
      data: { token, ticketId: ticket.id, customerId: customer.id, messages: conversation.messages },
    };
    res.status(201).json(body);
  },

  async getConversation(req: Request, res: Response) {
    if (!req.widgetAuth) throw AppError.unauthorized();
    const conversation = await widgetService.getConversation(
      req.widgetAuth.orgId,
      req.widgetAuth.customerId,
      req.params.ticketId as string
    );
    res.json({ success: true, data: conversation } satisfies ApiResponse<typeof conversation>);
  },

  async addMessage(req: Request, res: Response) {
    if (!req.widgetAuth) throw AppError.unauthorized();
    const ticketId = req.params.ticketId as string;

    const message = await widgetService.addCustomerMessage(
      req.widgetAuth.orgId,
      req.widgetAuth.customerId,
      ticketId,
      req.body.body
    );

    // Staff sees it in the org-wide list and the ticket detail view; the
    // widget room echo lets other tabs/devices of the same visitor sync.
    emitToOrg(req.widgetAuth.orgId, "ticket:message", message);
    emitToTicketWidgetRoom(ticketId, "ticket:message", message);

    void publishEvent(KAFKA_TOPICS.MESSAGE_SENT, {
      eventId: uuid(),
      orgId: req.widgetAuth.orgId,
      occurredAt: new Date().toISOString(),
      ticketId,
      messageId: message.id,
      authorType: "customer",
      body: message.body,
    });

    res.status(201).json({ success: true, data: message } satisfies ApiResponse<typeof message>);
  },
};
