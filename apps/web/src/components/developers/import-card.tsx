"use client";

import { FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useImportTickets, type ImportSummary } from "@/hooks/use-data-connections";
import { ApiRequestError } from "@/lib/api-client";

const MAX_BYTES = 10 * 1024 * 1024;

export function ImportCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const importTickets = useImportTickets();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [done, setDone] = useState<ImportSummary | null>(null);

  const onFile = async (file: File | undefined) => {
    setPreview(null);
    setDone(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("File is larger than 10 MB. Split it and import in parts.");
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    importTickets.mutate(
      { csv: text, dryRun: true },
      {
        onSuccess: setPreview,
        onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't read that file."),
      }
    );
  };

  const runImport = () => {
    if (!csv) return;
    importTickets.mutate(
      { csv, dryRun: false },
      {
        onSuccess: (res) => {
          setDone(res);
          setPreview(null);
          setCsv(null);
          if (inputRef.current) inputRef.current.value = "";
          toast.success(`Imported ${res.created} ticket${res.created === 1 ? "" : "s"}`);
        },
        onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Import failed."),
      }
    );
  };

  const stats = (s: ImportSummary) => [
    ["Rows in file", s.totalRows],
    [s.dryRun ? "Will be created" : "Created", s.dryRun ? s.toCreate : s.created],
    ["Already imported", s.duplicates],
    ["Invalid rows", s.invalid],
    ...(s.dryRun ? [["New customers", s.newCustomers]] : [["Failed", s.failed]]),
  ] as Array<[string, number]>;

  const summary = preview ?? done;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <FileUp className="h-4 w-4" /> Import tickets from Zendesk / CSV
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Upload a Zendesk tickets export (or any CSV with <span className="font-mono">Ticket ID, Requester email, Subject</span> and optionally{" "}
          <span className="font-mono">Requester, Description, Status, Priority, Created at</span>). You&apos;ll see a preview first; nothing is
          created until you confirm. Imports never email customers, and re-uploading the same file skips tickets already imported.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs"
          onChange={(e) => void onFile(e.target.files?.[0])}
          disabled={importTickets.isPending}
        />

        {summary && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">
              {summary.dryRun ? `Preview of ${fileName}` : "Import finished"}
            </p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {stats(summary).map(([label, value]) => (
                <div key={label} className="rounded-md border border-border p-2">
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className="text-lg font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {summary.errors.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
                {summary.errors.map((e, i) => (
                  <li key={i} className="text-danger">
                    {e.line > 0 ? `Line ${e.line}: ` : ""}
                    {e.message}
                  </li>
                ))}
              </ul>
            )}
            {preview && (
              <Button size="sm" disabled={importTickets.isPending || preview.toCreate === 0} onClick={runImport}>
                {importTickets.isPending ? "Importing..." : `Import ${preview.toCreate} ticket${preview.toCreate === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
