// ============================================================================
// Core domain entities — the single source of truth for shapes shared across
// the web app, API, and AI service. Postgres is the system of record for
// these; Mongo/Elasticsearch/Qdrant hold derived/denormalized copies.
// ============================================================================

export type UUID = string;
export type ISODateString = string;

// ---------------------------------------------------------------------------
// Organizations & multi-tenancy
// ---------------------------------------------------------------------------

export type PlanTier = "free" | "starter" | "growth" | "enterprise";

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  planTier: PlanTier;
  logoUrl: string | null;
  domain: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Users & roles
// ---------------------------------------------------------------------------

export type UserRole = "owner" | "admin" | "agent" | "viewer";

export interface User {
  id: UUID;
  orgId: UUID;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
  lastSeenAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Customer {
  id: UUID;
  orgId: UUID;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  externalId: string | null;
  metadata: Record<string, unknown>;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export type TicketStatus = "open" | "pending" | "on_hold" | "solved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketChannel = "email" | "chat" | "web_widget" | "api" | "social";

export interface Ticket {
  id: UUID;
  orgId: UUID;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  channel: TicketChannel;
  customerId: UUID;
  assigneeId: UUID | null;
  teamId: UUID | null;
  tags: string[];
  aiSummary: string | null;
  aiSentiment: "positive" | "neutral" | "negative" | null;
  slaBreachAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  resolvedAt: ISODateString | null;
}

export type MessageAuthorType = "customer" | "agent" | "ai" | "system";

export interface TicketMessage {
  id: UUID;
  ticketId: UUID;
  authorType: MessageAuthorType;
  authorId: UUID | null;
  body: string;
  bodyFormat: "text" | "html" | "markdown";
  isInternalNote: boolean;
  attachments: Attachment[];
  aiGenerated: boolean;
  createdAt: ISODateString;
}

export interface Attachment {
  id: UUID;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
}

// ---------------------------------------------------------------------------
// Teams & routing
// ---------------------------------------------------------------------------

export interface Team {
  id: UUID;
  orgId: UUID;
  name: string;
  memberIds: UUID[];
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Knowledge base (RAG source documents)
// ---------------------------------------------------------------------------

export interface KnowledgeArticle {
  id: UUID;
  orgId: UUID;
  title: string;
  content: string;
  status: "draft" | "published" | "archived";
  tags: string[];
  vectorIndexed: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------------
// AI-specific
// ---------------------------------------------------------------------------

export interface AiSuggestion {
  id: UUID;
  ticketId: UUID;
  suggestedReply: string;
  confidence: number;
  sourceArticleIds: UUID[];
  createdAt: ISODateString;
}
