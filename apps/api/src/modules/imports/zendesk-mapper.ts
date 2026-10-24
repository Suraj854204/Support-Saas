import { z } from "zod";

import { parseCsv } from "./csv";

export const MAX_IMPORT_ROWS = 5000;
const MAX_ERRORS_REPORTED = 100;

type Status = "open" | "pending" | "on_hold" | "solved" | "closed";
type Priority = "low" | "normal" | "high" | "urgent";

export interface MappedTicketRow {
  line: number;
  externalId: string;
  requesterEmail: string;
  requesterName: string | null;
  subject: string;
  description: string;
  status: Status;
  priority: Priority;
  createdAt: Date;
}

export interface RowError {
  line: number;
  message: string;
}

/** Header aliases (lower-cased) → canonical field. Covers Zendesk's default export and plain CSVs. */
const HEADER_ALIASES: Record<string, string> = {
  "ticket id": "id",
  id: "id",
  requester: "name",
  "requester name": "name",
  "requester email": "email",
  email: "email",
  subject: "subject",
  description: "description",
  status: "status",
  priority: "priority",
  "created at": "createdAt",
  "created at (timestamp)": "createdAt",
  created: "createdAt",
};

const STATUS_MAP: Record<string, Status> = {
  new: "open",
  open: "open",
  pending: "pending",
  hold: "on_hold",
  on_hold: "on_hold",
  "on-hold": "on_hold",
  solved: "solved",
  closed: "closed",
};

const PRIORITY_MAP: Record<string, Priority> = {
  low: "low",
  normal: "normal",
  high: "high",
  urgent: "urgent",
};

const emailSchema = z.string().email().max(254);

export function buildExternalTag(externalId: string): string {
  return `zd-${externalId}`;
}

export interface ParsedImport {
  rows: MappedTicketRow[];
  errors: RowError[];
  totalRows: number;
  errorCount: number;
}

export function parseZendeskCsv(csv: string): ParsedImport {
  let table: string[][];
  try {
    table = parseCsv(csv);
  } catch (err) {
    return { rows: [], errors: [{ line: 0, message: (err as Error).message }], totalRows: 0, errorCount: 1 };
  }

  const [header, ...body] = table;
  if (!header) return { rows: [], errors: [{ line: 0, message: "The file is empty" }], totalRows: 0, errorCount: 1 };

  const columnIndex = new Map<string, number>();
  header.forEach((name, idx) => {
    const canonical = HEADER_ALIASES[name.trim().toLowerCase()];
    if (canonical && !columnIndex.has(canonical)) columnIndex.set(canonical, idx);
  });

  const missing = ["id", "email", "subject"].filter((c) => !columnIndex.has(c));
  if (missing.length > 0) {
    const labels: Record<string, string> = { id: "Ticket ID", email: "Requester email", subject: "Subject" };
    return {
      rows: [],
      errors: [{ line: 1, message: `Missing required column(s): ${missing.map((m) => labels[m]).join(", ")}` }],
      totalRows: body.length,
      errorCount: 1,
    };
  }

  if (body.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      errors: [{ line: 0, message: `Too many rows (${body.length}). Import at most ${MAX_IMPORT_ROWS} tickets per file.` }],
      totalRows: body.length,
      errorCount: 1,
    };
  }

  const cell = (row: string[], col: string): string => {
    const idx = columnIndex.get(col);
    return idx === undefined ? "" : (row[idx] ?? "").trim();
  };

  const rows: MappedTicketRow[] = [];
  const errors: RowError[] = [];
  let errorCount = 0;
  const seenIds = new Set<string>();

  const fail = (line: number, message: string) => {
    errorCount++;
    if (errors.length < MAX_ERRORS_REPORTED) errors.push({ line, message });
  };

  body.forEach((row, i) => {
    const line = i + 2; // 1-based, header is line 1

    const externalId = cell(row, "id");
    if (!externalId || !/^[A-Za-z0-9_-]{1,64}$/.test(externalId)) return fail(line, "Missing or invalid Ticket ID");
    if (seenIds.has(externalId)) return fail(line, `Duplicate Ticket ID ${externalId} in file`);

    const email = cell(row, "email").toLowerCase();
    if (!emailSchema.safeParse(email).success) return fail(line, "Missing or invalid requester email");

    const description = cell(row, "description");
    const subject = (cell(row, "subject") || description.slice(0, 80)).slice(0, 200);
    if (!subject) return fail(line, "Ticket has neither a subject nor a description");

    const rawStatus = cell(row, "status").toLowerCase();
    const status = rawStatus ? STATUS_MAP[rawStatus] : "open";
    if (!status) return fail(line, `Unknown status "${rawStatus}"`);

    const rawPriority = cell(row, "priority").toLowerCase();
    const priority = rawPriority ? PRIORITY_MAP[rawPriority] : "normal";
    if (!priority) return fail(line, `Unknown priority "${rawPriority}"`);

    const rawCreated = cell(row, "createdAt");
    const createdAt = rawCreated ? new Date(rawCreated) : new Date();
    if (Number.isNaN(createdAt.getTime())) return fail(line, `Unparseable created date "${rawCreated}"`);

    seenIds.add(externalId);
    rows.push({
      line,
      externalId,
      requesterEmail: email,
      requesterName: cell(row, "name").slice(0, 200) || null,
      subject,
      description: description.slice(0, 20_000),
      status,
      priority,
      createdAt,
    });
  });

  return { rows, errors, totalRows: body.length, errorCount };
}
