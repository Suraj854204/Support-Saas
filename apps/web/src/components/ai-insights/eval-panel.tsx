"use client";

import { CheckCircle2, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateEvalCase,
  useDeleteEvalCase,
  useEvalCases,
  useEvalRuns,
  useRunEval,
  type EvalRunRow,
} from "@/hooks/use-ai-insights";
import { ApiRequestError } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";

const toList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function EvalPanel() {
  const { data: cases, isLoading } = useEvalCases();
  const { data: runs } = useEvalRuns();
  const createCase = useCreateEvalCase();
  const deleteCase = useDeleteEvalCase();
  const runEval = useRunEval();

  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [forbidden, setForbidden] = useState("");
  const [expectFallback, setExpectFallback] = useState(false);
  const [lastRun, setLastRun] = useState<EvalRunRow | null>(null);

  const onAdd = () => {
    if (question.trim().length < 3) {
      toast.error("Enter a question (at least 3 characters).");
      return;
    }
    createCase.mutate(
      { question: question.trim(), expectedKeywords: toList(expected), forbiddenKeywords: toList(forbidden), expectFallback },
      {
        onSuccess: () => {
          setQuestion("");
          setExpected("");
          setForbidden("");
          setExpectFallback(false);
        },
        onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't save the test."),
      }
    );
  };

  const onRun = () =>
    runEval.mutate(undefined, {
      onSuccess: (run) => {
        setLastRun(run);
        toast.success(`${run.passed}/${run.total} tests passed`);
      },
      onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't run the tests."),
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Add a test question</CardTitle>
          <p className="text-xs text-muted-foreground">
            After editing your knowledge base, re-run these to confirm the AI still answers correctly (and still declines what it shouldn&apos;t
            answer).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-q">Customer question</Label>
            <Input id="ev-q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="How long do refunds take?" maxLength={1000} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ev-exp">Reply must contain (comma-separated)</Label>
              <Input id="ev-exp" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="7 days, original payment method" disabled={expectFallback} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-forb">Reply must NOT contain</Label>
              <Input id="ev-forb" value={forbidden} onChange={(e) => setForbidden(e.target.value)} placeholder="3 days" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={expectFallback} onCheckedChange={(v) => setExpectFallback(v === true)} />
            The AI should decline to answer this (question is outside the knowledge base)
          </label>
          <Button size="sm" onClick={onAdd} disabled={createCase.isPending}>
            Save test
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Tests ({cases?.length ?? 0})</h2>
        <Button size="sm" onClick={onRun} disabled={runEval.isPending || !cases || cases.length === 0}>
          {runEval.isPending ? "Running..." : "Run all tests"}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !cases || cases.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tests yet.</p>
      ) : (
        <div className="space-y-2">
          {cases.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium">{c.question}</p>
                  <div className="flex flex-wrap gap-1">
                    {c.expectFallback && <Badge variant="muted">should decline</Badge>}
                    {c.expectedKeywords.map((k) => (
                      <Badge key={`e-${k}`} variant="success" className="font-normal">
                        + {k}
                      </Badge>
                    ))}
                    {c.forbiddenKeywords.map((k) => (
                      <Badge key={`f-${k}`} variant="danger" className="font-normal">
                        − {k}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete test"
                  onClick={() => deleteCase.mutate(c.id, { onError: () => toast.error("Couldn't delete the test.") })}
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {lastRun?.results && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Latest run: {lastRun.passed}/{lastRun.total} passed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lastRun.results.map((r) => (
              <div key={r.caseId} className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-start gap-2 text-sm">
                  {r.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
                  <span className="font-medium">{r.question}</span>
                </div>
                {!r.passed && r.reasons.map((reason, i) => (
                  <p key={i} className="pl-6 text-xs text-danger">
                    {reason}
                  </p>
                ))}
                <p className="whitespace-pre-wrap pl-6 text-xs text-muted-foreground">{r.reply}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {runs && runs.length > 0 && (
        <div className="space-y-1">
          <h2 className="text-sm font-medium">History</h2>
          <ul className="divide-y divide-border rounded-md border border-border text-xs">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-3 py-2">
                <span>{relativeTime(r.createdAt)}</span>
                <span className="font-mono">
                  {r.passed}/{r.total} passed · {Math.round(r.avgConfidence * 100)}% conf · {r.avgLatencyMs} ms
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
