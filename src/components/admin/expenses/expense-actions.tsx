"use client";

import { Paperclip, RefreshCw } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ConfirmedActionResult } from "../confirm-button";
import { VoidButton } from "../money/void-button";
import { useQuickAction, type QuickResult } from "../tasks/use-quick-action";
import { useToast } from "../toast";
import { acceptedReceiptTypes, prepareReceipt } from "./prepare-receipt";

/** What can still happen to an expense: add its receipt, post it if that failed, void it. */
export function ExpenseActions({
  expenseId,
  subject,
  canAddReceipt,
  notPosted,
  canVoid,
  receiptMaxBytes,
  actions,
}: {
  expenseId: string;
  /** For the void question: "the R450 expense to Welkom Hardware". */
  subject: string;
  canAddReceipt: boolean;
  notPosted: boolean;
  canVoid: boolean;
  receiptMaxBytes: number;
  actions: {
    voidExpense: (id: string, reason: string) => Promise<ConfirmedActionResult>;
    addReceipt: (data: FormData) => Promise<QuickResult>;
    retryPosting: (id: string) => Promise<QuickResult>;
  };
}) {
  const uploading = useQuickAction();
  const posting = useQuickAction();
  const toasts = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const problem = uploading.problem ?? posting.problem;

  async function addReceipt(file: File | undefined) {
    if (!file) return;
    const prepared = await prepareReceipt(file, receiptMaxBytes);
    if (picker.current) picker.current.value = "";
    if (!prepared.ok) {
      uploading.setProblem(prepared.problem);
      return;
    }
    const data = new FormData();
    data.set("expenseId", expenseId);
    data.set("receipt", prepared.file);
    uploading.run(() => actions.addReceipt(data), "Receipt added");
  }

  if (!canAddReceipt && !notPosted && !canVoid) return null;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {notPosted && (
          <Button size="sm" variant="primary" icon={<RefreshCw aria-hidden="true" />} pending={posting.pending} pendingLabel="Posting…" onClick={() => posting.run(() => actions.retryPosting(expenseId), "Posted to the books")}>
            Post to the books
          </Button>
        )}
        {canAddReceipt && (
          <>
            <Button size="sm" variant={notPosted ? "secondary" : "primary"} icon={<Paperclip aria-hidden="true" />} pending={uploading.pending} pendingLabel="Adding receipt…" onClick={() => picker.current?.click()}>
              Add receipt
            </Button>
            <input ref={picker} type="file" accept={acceptedReceiptTypes} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => void addReceipt(event.currentTarget.files?.[0])} />
          </>
        )}
        {canVoid && (
          <VoidButton
            subject={subject}
            description="It stays on record, crossed out, with your reason, and its journal is reversed in the books."
            action={(reason) => actions.voidExpense(expenseId, reason)}
            onDone={() => toasts?.show({ message: "Expense voided" })}
          />
        )}
      </div>
      {problem && (
        <p role="alert" className="text-sm font-medium text-danger-700">
          {problem}
        </p>
      )}
    </div>
  );
}
