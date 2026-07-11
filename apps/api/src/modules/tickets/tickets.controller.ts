import type { ApiResponse } from "@support-saas/shared-types";
import type { Request, Response } from "express";
import { v4 as uuid } from "uuid";

import { ticketsService } from "./tickets.service";

import { AppError } from "@/lib/app-error";
import { KAFKA_TOPICS, publishEvent } from "@/lib/kafka";
import { emitToOrg, emitToTicket, emitToTicketWidgetRoom } from "@/sockets";

export const ticketsController = {
  async create(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const ticket = await ticketsService.create(req.auth.orgId, req.auth.userId, req.body);
    emitToOrg(req.auth.orgId, "ticket:created", ticket);
    void publishEvent(KAFKA_TOPICS.TICKET_CREATED, {
      eventId: uuid(),
      orgId: req.auth.orgId,
      occurredAt: new Date().toISOString(),
      ticketId: ticket.id,
      customerId: ticket.customerId,
      channel: ticket.channel,
      subject: ticket.subject,
    });
    res.status(201).json({ success: true, data: ticket } satisfies ApiResponse<typeof ticket>);
  },

  async list(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const { items, meta } = await ticketsService.list(req.auth.orgId, req.query as never);
    res.json({ success: true, data: items, meta } satisfies ApiResponse<typeof items>);
  },

  async getById(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const ticket = await ticketsService.getById(req.auth.orgId, req.params.id as string);
    res.json({ success: true, data: ticket } satisfies ApiResponse<typeof ticket>);
  },

  async update(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const ticket = await ticketsService.update(req.auth.orgId, req.params.id as string, req.body);
    emitToOrg(req.auth.orgId, "ticket:updated", ticket);
    emitToTicket(ticket.id, "ticket:updated", ticket);
    void publishEvent(KAFKA_TOPICS.TICKET_UPDATED, {
      eventId: uuid(),
      orgId: req.auth.orgId,
      occurredAt: new Date().toISOString(),
      ticketId: ticket.id,
      changedFields: Object.keys(req.body),
      status: ticket.status,
    });
    res.json({ success: true, data: ticket } satisfies ApiResponse<typeof ticket>);
  },

  async addMessage(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const message = await ticketsService.addMessage(
      req.auth.orgId,
      req.params.id as string,
      req.auth.userId,
      req.body
    );
    emitToOrg(req.auth.orgId, "ticket:message", message);
    emitToTicket(message.ticketId, "ticket:message", message);
    if (!message.isInternalNote) {
      emitToTicketWidgetRoom(message.ticketId, "ticket:message", message);
    }
    void publishEvent(KAFKA_TOPICS.MESSAGE_SENT, {
      eventId: uuid(),
      orgId: req.auth.orgId,
      occurredAt: new Date().toISOString(),
      ticketId: message.ticketId,
      messageId: message.id,
      authorType: message.authorType,
      body: message.body,
    });
    res.status(201).json({ success: true, data: message } satisfies ApiResponse<typeof message>);
  },

  async aiSuggest(req: Request, res: Response) {
    if (!req.auth) throw AppError.unauthorized();
    const suggestion = await ticketsService.getAiSuggestion(req.auth.orgId, req.params.id as string);
    res.json({ success: true, data: suggestion } satisfies ApiResponse<typeof suggestion>);
  },
};
