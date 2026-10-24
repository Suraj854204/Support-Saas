import { describe, expect, it } from "vitest";

import { parseCsv } from "../csv";
import { parseZendeskCsv } from "../zendesk-mapper";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded commas/newlines, CRLF and BOM", () => {
    const csv = '﻿a,b,c\r\n1,"hello, world","line1\nline2"\r\n"say ""hi""",,x\r\n';
    expect(parseCsv(csv)).toEqual([
      ["a", "b", "c"],
      ["1", "hello, world", "line1\nline2"],
      ['say "hi"', "", "x"],
    ]);
  });

  it("skips blank lines and handles a missing trailing newline", () => {
    expect(parseCsv("a,b\n\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("rejects an unterminated quote instead of swallowing the file", () => {
    expect(() => parseCsv('a,b\n1,"oops')).toThrow(/unterminated/);
  });
});

const header = "Ticket ID,Requester,Requester email,Subject,Description,Status,Priority,Created at";

describe("parseZendeskCsv", () => {
  it("maps Zendesk columns, statuses and priorities", () => {
    const { rows, errors } = parseZendeskCsv(
      `${header}\n101,Asha,ASHA@Example.com,Refund,Where is my refund?,New,High,2024-03-05T10:00:00Z\n102,,b@x.io,Login,,Hold,,2024-03-06`
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ externalId: "101", requesterEmail: "asha@example.com", requesterName: "Asha", status: "open", priority: "high" });
    expect(rows[0]?.createdAt.toISOString()).toBe("2024-03-05T10:00:00.000Z");
    expect(rows[1]).toMatchObject({ status: "on_hold", priority: "normal", requesterName: null, description: "" });
  });

  it("reports bad rows with line numbers while keeping the good ones", () => {
    const { rows, errors, errorCount } = parseZendeskCsv(
      `${header}\n1,A,a@x.io,Ok,d,open,low,2024-01-01\n2,B,not-an-email,S,d,open,low,2024-01-01\n3,C,c@x.io,S,d,weird,low,2024-01-01\n1,D,d@x.io,Dup,d,open,low,2024-01-01`
    );
    expect(rows).toHaveLength(1);
    expect(errorCount).toBe(3);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5]);
    expect(errors[1]?.message).toContain('Unknown status "weird"');
    expect(errors[2]?.message).toContain("Duplicate Ticket ID 1");
  });

  it("explains missing required columns instead of failing every row", () => {
    const { rows, errors } = parseZendeskCsv("Subject,Status\nHi,open");
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toContain("Ticket ID");
    expect(errors[0]?.message).toContain("Requester email");
  });

  it("falls back to the description for a missing subject and rejects empty files", () => {
    expect(parseZendeskCsv(`${header}\n9,A,a@x.io,,Printer is on fire,open,low,2024-01-01`).rows[0]?.subject).toBe("Printer is on fire");
    expect(parseZendeskCsv("").errors[0]?.message).toContain("empty");
  });
});
