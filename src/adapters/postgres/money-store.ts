import "server-only";
import {
  formatNumber,
  invoiceStatuses,
  paymentKinds,
  paymentMethods,
  paymentStatuses,
  type BilledTo,
  type Invoice,
  type InvoiceLine,
  type InvoiceStatus,
  type Payment,
  type PaymentKind,
  type PaymentMethod,
  type PaymentStatus,
} from "@/lib/money/money";
import type { GatewaySettlement, MoneyStore, PaymentRecording } from "@/lib/money/ports";
import { jsonParam, type Database, type SqlTransaction } from "./database";
import { UniqueViolationError } from "./errors";
import { isUuid } from "./uuid";

type PaymentRow = {
  id: string;
  booking_id: string;
  kind: string;
  method: string;
  amount_cents: string | number;
  received_on: string;
  reference: string | null;
  status: string;
  receipt_number: string | null;
  provider_ref: string | null;
  idempotency_key: string | null;
  recorded_by: string | null;
  created_at: Date;
  voided_at: Date | null;
  void_reason: string | null;
};

type InvoiceRow = {
  id: string;
  booking_id: string;
  number: string;
  issued_on: string;
  billed_to: unknown;
  lines: unknown;
  total_cents: string | number;
  status: string;
  void_reason: string | null;
  voided_at: Date | null;
  created_by: string | null;
  created_at: Date;
};

const paymentColumns = `id, booking_id, kind, method, amount_cents, received_on, reference, status, receipt_number, provider_ref, idempotency_key,
  recorded_by, created_at, voided_at, void_reason`;
const invoiceColumns = "id, booking_id, number, issued_on, billed_to, lines, total_cents, status, void_reason, voided_at, created_by, created_at";

const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T => ((values as readonly string[]).includes(value) ? (value as T) : fallback);

function paymentOf(row: PaymentRow): Payment {
  return {
    id: row.id,
    bookingId: row.booking_id,
    // Check constraints allow only the known values; anything else reads as the most cautious one.
    kind: oneOf<PaymentKind>(paymentKinds, row.kind, "extra"),
    method: oneOf<PaymentMethod>(paymentMethods, row.method, "cash"),
    amountCents: Number(row.amount_cents),
    receivedOn: row.received_on,
    reference: row.reference,
    status: oneOf<PaymentStatus>(paymentStatuses, row.status, "pending"),
    receiptNumber: row.receipt_number,
    providerRef: row.provider_ref,
    idempotencyKey: row.idempotency_key,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
  };
}

/** JSON as stored: PGlite gives jsonb parsed, node-postgres too; a string is parsed once more to be safe. */
const json = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

function linesOf(value: unknown): InvoiceLine[] {
  const raw = json(value);
  if (!Array.isArray(raw)) return [];
  return raw.map((line: Record<string, unknown>) => ({
    description: String(line.description ?? ""),
    quantity: Number(line.quantity ?? 1),
    unitCents: Number(line.unitCents ?? 0),
    amountCents: Number(line.amountCents ?? 0),
  }));
}

function billedToOf(value: unknown): BilledTo {
  const raw = (json(value) ?? {}) as Record<string, unknown>;
  return {
    name: String(raw.name ?? ""),
    phone: typeof raw.phone === "string" ? raw.phone : null,
    email: typeof raw.email === "string" ? raw.email : null,
  };
}

function invoiceOf(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    bookingId: row.booking_id,
    number: row.number,
    issuedOn: row.issued_on,
    billedTo: billedToOf(row.billed_to),
    lines: linesOf(row.lines),
    totalCents: Number(row.total_cents),
    vatCents: null,
    status: oneOf<InvoiceStatus>(invoiceStatuses, row.status, "void"),
    voidReason: row.void_reason,
    voidedAt: row.voided_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** The next number in `sequence`, taken under the row's lock: the caller's transaction holds it until it commits. */
async function nextNumber(tx: SqlTransaction, sequence: "receipt" | "invoice"): Promise<number> {
  const row = await tx.get<{ value: string | number }>(
    "update app.number_sequences set next_value = next_value + 1 where name = :sequence returning next_value - 1 as value",
    { sequence },
  );
  if (!row) throw new Error(`The ${sequence} number sequence is missing.`);
  return Number(row.value);
}

/** Payments, invoices and webhook events in Postgres (./migrations/260-money.ts). */
export function createPostgresMoneyStore(db: Database): MoneyStore {
  return {
    async payments(bookingId) {
      if (!isUuid(bookingId)) return [];
      const rows = await db.all<PaymentRow>(`select ${paymentColumns} from app.payments where booking_id = :bookingId order by created_at, id`, { bookingId });
      return rows.map(paymentOf);
    },

    async payment(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<PaymentRow>(`select ${paymentColumns} from app.payments where id = :id`, { id });
      return row ? paymentOf(row) : null;
    },

    async invoices(bookingId) {
      if (!isUuid(bookingId)) return [];
      const rows = await db.all<InvoiceRow>(`select ${invoiceColumns} from app.invoices where booking_id = :bookingId order by created_at, id`, { bookingId });
      return rows.map(invoiceOf);
    },

    async invoice(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<InvoiceRow>(`select ${invoiceColumns} from app.invoices where id = :id`, { id });
      return row ? invoiceOf(row) : null;
    },

    async recordPayment(payment): Promise<PaymentRecording> {
      try {
        return await db.transaction(async (tx) => {
          if (payment.kind === "refund") {
            // One money change per booking at a time: a second refund waits here, then sees the first.
            await tx.get("select id from app.bookings where id = :bookingId for update", { bookingId: payment.bookingId });
            const net = await tx.get<{ paid: number }>(
              `select coalesce(sum(case when kind = 'refund' then -amount_cents else amount_cents end), 0)::int as paid
               from app.payments where booking_id = :bookingId and status = 'received' and voided_at is null`,
              { bookingId: payment.bookingId },
            );
            const paidCents = net?.paid ?? 0;
            if (payment.amountCents > paidCents) return { status: "over-refund", paidCents } as const;
          }
          const receiptNumber = payment.status === "received" ? formatNumber("RC", await nextNumber(tx, "receipt")) : null;
          await tx.run(
            `insert into app.payments (${paymentColumns})
             values (:id, :bookingId, :kind, :method, :amountCents, :receivedOn::date, :reference, :status, :receiptNumber, :providerRef,
               :idempotencyKey, :recordedBy, :createdAt, :voidedAt, :voidReason)`,
            {
              id: payment.id,
              bookingId: payment.bookingId,
              kind: payment.kind,
              method: payment.method,
              amountCents: payment.amountCents,
              receivedOn: payment.receivedOn,
              reference: payment.reference,
              status: payment.status,
              receiptNumber,
              providerRef: payment.providerRef,
              idempotencyKey: payment.idempotencyKey,
              recordedBy: payment.recordedBy,
              createdAt: payment.createdAt,
              voidedAt: payment.voidedAt,
              voidReason: payment.voidReason,
            },
          );
          return { status: "recorded", receiptNumber } as const;
        });
      } catch (error) {
        // The transaction rolled back, the receipt number with it: no gap.
        if (error instanceof UniqueViolationError && (error.constraint === "payments_idempotency_key_unique" || error.constraint === "payments_provider_ref_unique")) {
          return { status: "duplicate" };
        }
        throw error;
      }
    },

    async voidPayment(id, at, reason) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("update app.payments set voided_at = :at, void_reason = :reason where id = :id and voided_at is null", { id, at, reason });
      return changes === 1;
    },

    async issueInvoice(invoice) {
      return db.transaction(async (tx) => {
        const number = formatNumber("INV", await nextNumber(tx, "invoice"));
        await tx.run(
          `insert into app.invoices (${invoiceColumns})
           values (:id, :bookingId, :number, :issuedOn::date, :billedTo, :lines, :totalCents, :status, :voidReason, :voidedAt, :createdBy, :createdAt)`,
          {
            id: invoice.id,
            bookingId: invoice.bookingId,
            number,
            issuedOn: invoice.issuedOn,
            billedTo: jsonParam(invoice.billedTo),
            lines: jsonParam(invoice.lines),
            totalCents: invoice.totalCents,
            status: invoice.status,
            voidReason: invoice.voidReason,
            voidedAt: invoice.voidedAt,
            createdBy: invoice.createdBy,
            createdAt: invoice.createdAt,
          },
        );
        return { number };
      });
    },

    async voidInvoice(id, at, reason) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run("update app.invoices set status = 'void', voided_at = :at, void_reason = :reason where id = :id and status = 'issued'", {
        id,
        at,
        reason,
      });
      return changes === 1;
    },

    async settleGatewayPayment(providerRef, amountCents): Promise<GatewaySettlement> {
      return db.transaction(async (tx) => {
        const row = await tx.get<PaymentRow>(`select ${paymentColumns} from app.payments where provider_ref = :providerRef for update`, { providerRef });
        if (!row) return { status: "not-found" } as const;
        const payment = paymentOf(row);
        if (payment.status !== "pending" || payment.voidedAt) return { status: "already-final", payment } as const;
        if (payment.amountCents !== amountCents) return { status: "amount-mismatch", payment } as const;
        const receiptNumber = formatNumber("RC", await nextNumber(tx, "receipt"));
        await tx.run("update app.payments set status = 'received', receipt_number = :receiptNumber where id = :id", { id: payment.id, receiptNumber });
        return { status: "settled", payment: { ...payment, status: "received", receiptNumber } } as const;
      });
    },

    async failGatewayPayment(providerRef) {
      const { changes } = await db.run("update app.payments set status = 'failed' where provider_ref = :providerRef and status = 'pending'", { providerRef });
      return changes === 1;
    },

    async recordWebhookEvent(event) {
      const { changes } = await db.run(
        `insert into app.payment_events (provider, provider_event_id, received_at, payload_hash)
         values (:provider, :providerEventId, :receivedAt, :payloadHash) on conflict (provider, provider_event_id) do nothing`,
        { provider: event.provider, providerEventId: event.providerEventId, receivedAt: event.receivedAt, payloadHash: event.payloadHash },
      );
      return changes === 1;
    },

    async setWebhookOutcome(provider, providerEventId, outcome) {
      await db.run("update app.payment_events set outcome = :outcome where provider = :provider and provider_event_id = :providerEventId", {
        provider,
        providerEventId,
        outcome: outcome.slice(0, 40),
      });
    },
  };
}
