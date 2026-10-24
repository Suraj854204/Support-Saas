import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";

import { aiReplyService } from "./ai-reply.service";
import { widgetService } from "./widget.service";

import { AppError } from "@/lib/app-error";
import { signWidgetToken, verifyWidgetToken } from "@/lib/jwt";
import { KAFKA_TOPICS, publishEvent } from "@/lib/kafka";
import { callRequestsService } from "@/modules/call-requests/call-requests.service";
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

    const { org, customer, ticket, created } = await widgetService.startConversation(orgSlug, existingCustomerId, req.body);
    const conversation = await widgetService.getConversation(org.id, customer.id, ticket.id);

    // A brand-new widget conversation is a new ticket: tell staff live and fire
    // outgoing webhooks, same as tickets created from the dashboard.
    if (created) {
      emitToOrg(org.id, "ticket:created", ticket);
      void publishEvent(KAFKA_TOPICS.TICKET_CREATED, {
        eventId: uuid(),
        orgId: org.id,
        occurredAt: new Date().toISOString(),
        ticketId: ticket.id,
        customerId: ticket.customerId,
        channel: ticket.channel,
        subject: ticket.subject,
      });
    }

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

    const { message, duplicate } = await widgetService.addCustomerMessage(
      req.widgetAuth.orgId,
      req.widgetAuth.customerId,
      ticketId,
      req.body.body,
      req.body.clientMessageId,
      req.body.attachmentIds
    );

    // A retried message is acknowledged but never re-announced, re-published or re-answered.
    if (!duplicate) {
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

      // The AI answers (or hands over) in the background; the visitor gets it by push or poll.
      // A message that is only a file has no text for the AI to read, so it goes straight to the team.
      if (message.body.trim().length > 0) {
        void aiReplyService.handleCustomerMessage({ orgId: req.widgetAuth.orgId, ticketId, customerMessageId: message.id });
      }
    }

    // Only customer-safe fields go back out.
    const customerView = {
      id: message.id,
      ticketId: message.ticketId,
      authorType: message.authorType,
      body: message.body,
      aiGenerated: message.aiGenerated,
      deliveryStatus: message.deliveryStatus,
      createdAt: message.createdAt,
      attachments: message.attachments,
    };
    res.status(duplicate ? 200 : 201).json({ success: true, data: customerView, meta: { duplicate } });
  },

  async uploadAttachment(req: Request, res: Response) {
    if (!req.widgetAuth) throw AppError.unauthorized();
    if (!req.file) throw AppError.validation("Choose a file to upload");
    const view = await widgetService.uploadFile(req.widgetAuth.orgId, req.widgetAuth.customerId, req.params.ticketId as string, req.file);
    res.status(201).json({ success: true, data: view });
  },

  async requestCall(req: Request, res: Response) {
    if (!req.widgetAuth) throw AppError.unauthorized();
    const ticketId = req.params.ticketId as string;
    const { request, duplicate } = await callRequestsService.createFromCustomer(req.widgetAuth.orgId, req.widgetAuth.customerId, ticketId, req.body);
    if (!duplicate) emitToOrg(req.widgetAuth.orgId, "call:requested", { ticketId, requestId: request.id });
    res.status(duplicate ? 200 : 201).json({ success: true, data: request, meta: { duplicate } });
  },

  async requestHuman(req: Request, res: Response) {
    if (!req.widgetAuth) throw AppError.unauthorized();
    const result = await aiReplyService.requestHuman(req.widgetAuth.orgId, req.widgetAuth.customerId, req.params.ticketId as string);
    if (!result) throw AppError.notFound("Conversation not found");
    res.status(200).json({ success: true, data: result });
  },
};
