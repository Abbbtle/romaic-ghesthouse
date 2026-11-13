import "server-only";
import { isParameterCode, parameterUnits, type ParameterCode, type ParameterUnit, type TaxParameter } from "@/lib/tax/parameters";
import type { ParameterAdding, TaxStore } from "@/lib/tax/ports";
import { registrationKinds, type RegistrationDetails, type RegistrationKind, type RegistrationRecord } from "@/lib/tax/registrations";
import { returnKinds, returnStatuses, type ReturnFigures, type ReturnKind, type ReturnStatus, type TaxReturn, type UsedParameter } from "@/lib/tax/returns";
import { jsonParam, type Database } from "./database";
import { UniqueViolationError } from "./errors";
import { isUuid } from "./uuid";

type ParameterRow = {
  id: string;
  code: string;
  version: number;
  value: unknown;
  unit: string;
  effective_from: string;
  effective_to: string | null;
  source_url: string;
  source_title: string;
  checked_on: string;
  checked_by: string;
  note: string;
  status: string;
  created_at: Date;
  created_by: string | null;
};

type RegistrationRow = {
  id: string;
  kind: string;
  registered: boolean;
  effective_from: string | null;
  reference_sealed: string | null;
  reference_last4: string | null;
  details: unknown;
  recorded_at: Date;
  recorded_by: string | null;
};

type ReturnRow = {
  id: string;
  kind: string;
  period_start: string;
  period_end: string;
  label: string;
  status: string;
  figures: unknown;
  parameters: unknown;
  due_on: string | null;
  prepared_at: Date;
  prepared_by: string | null;
  reviewed_at: Date | null;
  reviewed_by: string | null;
  filed_on: string | null;
  filed_at: Date | null;
  filed_by: string | null;
  proof_file_id: string | null;
  submission_reference: string | null;
  created_at: Date;
};

const parameterColumns = "id, code, version, value, unit, effective_from, effective_to, source_url, source_title, checked_on, checked_by, note, status, created_at, created_by";
const returnColumns =
  "id, kind, period_start, period_end, label, status, figures, parameters, due_on, prepared_at, prepared_by, reviewed_at, reviewed_by, filed_on, filed_at, filed_by, proof_file_id, submission_reference, created_at";

/** JSON as stored: PGlite and node-postgres give jsonb parsed; a string is parsed once more to be safe. */
const json = (value: unknown): unknown => (typeof value === "string" ? JSON.parse(value) : value);

const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T => ((values as readonly string[]).includes(value) ? (value as T) : fallback);

function parameterOf(row: ParameterRow): TaxParameter | null {
  if (!isParameterCode(row.code)) return null;
  return {
    id: row.id,
    code: row.code as ParameterCode,
    version: Number(row.version),
    value: row.value === null ? null : json(row.value),
    unit: oneOf<ParameterUnit>(parameterUnits, row.unit, "rule"),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    sourceUrl: row.source_url,
    sourceTitle: row.source_title,
    checkedOn: row.checked_on,
    checkedBy: row.checked_by,
    note: row.note,
    status: row.status === "verified" ? "verified" : "unverified",
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function registrationOf(row: RegistrationRow): RegistrationRecord {
  return {
    id: row.id,
    kind: oneOf<RegistrationKind>(registrationKinds, row.kind, "vat"),
    registered: row.registered,
    effectiveFrom: row.effective_from,
    referenceLast4: row.reference_last4,
    referenceSealed: row.reference_sealed,
    details: (json(row.details) ?? {}) as RegistrationDetails,
    recordedAt: row.recorded_at,
    recordedBy: row.recorded_by,
  };
}

function returnOf(row: ReturnRow): TaxReturn {
  return {
    id: row.id,
    kind: oneOf<ReturnKind>(returnKinds, row.kind, "vat201"),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    label: row.label,
    status: oneOf<ReturnStatus>(returnStatuses, row.status, "draft"),
    figures: json(row.figures) as ReturnFigures,
    parameters: json(row.parameters) as UsedParameter[],
    dueOn: row.due_on,
    preparedAt: row.prepared_at,
    preparedBy: row.prepared_by,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    filedOn: row.filed_on,
    filedAt: row.filed_at,
    filedBy: row.filed_by,
    proofFileId: row.proof_file_id,
    submissionReference: row.submission_reference,
    createdAt: row.created_at,
  };
}

/** Tax parameters, registrations and returns in Postgres (migrations 340 and 350): the database refuses edits to parameters and registrations, and keeps the rules for returns. */
export function createPostgresTaxStore(db: Database): TaxStore {
  async function update(sql: string, params: Record<string, string | Date | null>): Promise<boolean> {
    if (typeof params.id !== "string" || !isUuid(params.id)) return false;
    const { changes } = await db.run(sql, params);
    return changes === 1;
  }

  return {
    async parameters() {
      const rows = await db.all<ParameterRow>(`select ${parameterColumns} from app.tax_parameters order by code, version`);
      return rows.map(parameterOf).filter((parameter): parameter is TaxParameter => parameter !== null);
    },

    async addParameter(parameter): Promise<ParameterAdding> {
      if ((parameter.status === "verified") !== (parameter.value !== null)) return { status: "invalid", reason: "A verified version needs a value; an unverified one has none." };
      if (!isUuid(parameter.id)) throw new Error("A parameter's id must be a UUID.");
      const values = {
        id: parameter.id,
        code: parameter.code,
        value: parameter.value === null ? null : jsonParam(parameter.value),
        unit: parameter.unit,
        effectiveFrom: parameter.effectiveFrom,
        effectiveTo: parameter.effectiveTo,
        sourceUrl: parameter.sourceUrl,
        sourceTitle: parameter.sourceTitle,
        checkedOn: parameter.checkedOn,
        checkedBy: parameter.checkedBy,
        note: parameter.note,
        status: parameter.status,
        createdAt: parameter.createdAt,
        createdBy: parameter.createdBy,
      };
      // The next number for the code, in the same statement; two saves at once clash on (code, version), and the later one tries again.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const row = await db.get<{ version: number }>(
            `insert into app.tax_parameters (${parameterColumns})
             select :id::uuid, :code::text, coalesce(max(version), 0) + 1, :value::jsonb, :unit::text, :effectiveFrom::date, :effectiveTo::date, :sourceUrl::text, :sourceTitle::text,
                    :checkedOn::date, :checkedBy::text, :note::text, :status::text, :createdAt::timestamptz, :createdBy::uuid
             from app.tax_parameters where code = :code
             returning version`,
            values,
          );
          return { status: "added", version: Number(row?.version) };
        } catch (error) {
          if (!(error instanceof UniqueViolationError && error.constraint === "tax_parameters_version_unique")) throw error;
        }
      }
      return { status: "invalid", reason: "Someone else added a version at the same moment. Reload the page and try again." };
    },

    async registrations() {
      const rows = await db.all<RegistrationRow>(
        "select id, kind, registered, effective_from, reference_sealed, reference_last4, details, recorded_at, recorded_by from app.tax_registrations order by recorded_at, id",
      );
      return rows.map(registrationOf);
    },

    async recordRegistration(record) {
      if (!isUuid(record.id)) throw new Error("A registration's id must be a UUID.");
      await db.run(
        `insert into app.tax_registrations (id, kind, registered, effective_from, reference_sealed, reference_last4, details, recorded_at, recorded_by)
         values (:id, :kind, :registered, :effectiveFrom::date, :referenceSealed, :referenceLast4, :details, :recordedAt, :recordedBy)`,
        {
          id: record.id,
          kind: record.kind,
          registered: record.registered,
          effectiveFrom: record.effectiveFrom,
          referenceSealed: record.referenceSealed,
          referenceLast4: record.referenceLast4,
          details: jsonParam(record.details),
          recordedAt: record.recordedAt,
          recordedBy: record.recordedBy,
        },
      );
    },

    async returns() {
      const rows = await db.all<ReturnRow>(`select ${returnColumns} from app.tax_returns order by period_end desc, created_at desc`);
      return rows.map(returnOf);
    },

    async taxReturn(id) {
      if (!isUuid(id)) return null;
      const row = await db.get<ReturnRow>(`select ${returnColumns} from app.tax_returns where id = :id`, { id });
      return row ? returnOf(row) : null;
    },

    async returnFor(kind, periodStart, periodEnd) {
      const row = await db.get<ReturnRow>(`select ${returnColumns} from app.tax_returns where kind = :kind and period_start = :periodStart::date and period_end = :periodEnd::date`, {
        kind,
        periodStart,
        periodEnd,
      });
      return row ? returnOf(row) : null;
    },

    async createReturn(draft) {
      if (!isUuid(draft.id)) throw new Error("A return's id must be a UUID.");
      try {
        await db.run(
          `insert into app.tax_returns (${returnColumns})
           values (:id, :kind, :periodStart::date, :periodEnd::date, :label, :status, :figures, :parameters, :dueOn::date, :preparedAt, :preparedBy, :reviewedAt, :reviewedBy,
                   :filedOn::date, :filedAt, :filedBy, :proofFileId, :submissionReference, :createdAt)`,
          {
            id: draft.id,
            kind: draft.kind,
            periodStart: draft.periodStart,
            periodEnd: draft.periodEnd,
            label: draft.label,
            status: draft.status,
            figures: jsonParam(draft.figures),
            parameters: jsonParam(draft.parameters),
            dueOn: draft.dueOn,
            preparedAt: draft.preparedAt,
            preparedBy: draft.preparedBy,
            reviewedAt: draft.reviewedAt,
            reviewedBy: draft.reviewedBy,
            filedOn: draft.filedOn,
            filedAt: draft.filedAt,
            filedBy: draft.filedBy,
            proofFileId: draft.proofFileId,
            submissionReference: draft.submissionReference,
            createdAt: draft.createdAt,
          },
        );
        return "created";
      } catch (error) {
        if (error instanceof UniqueViolationError && error.constraint === "tax_returns_one_per_period") return "exists";
        throw error;
      }
    },

    async refreshDraft(id, refresh) {
      if (!isUuid(id)) return false;
      const { changes } = await db.run(
        `update app.tax_returns set figures = :figures, parameters = :parameters, due_on = :dueOn::date, label = :label, prepared_at = :preparedAt, prepared_by = :preparedBy
         where id = :id and status = 'draft'`,
        { id, figures: jsonParam(refresh.figures), parameters: jsonParam(refresh.parameters), dueOn: refresh.dueOn, label: refresh.label, preparedAt: refresh.preparedAt, preparedBy: refresh.preparedBy },
      );
      return changes === 1;
    },

    markReviewed: (id, at, by) => update("update app.tax_returns set status = 'reviewed', reviewed_at = :at, reviewed_by = :by where id = :id and status = 'draft'", { id, at, by }),

    backToDraft: (id) => update("update app.tax_returns set status = 'draft', reviewed_at = null, reviewed_by = null where id = :id and status = 'reviewed'", { id }),

    markFiled: async (id, filing) =>
      isUuid(filing.proofFileId) &&
      update(
        `update app.tax_returns set status = 'filed', filed_on = :filedOn::date, filed_at = :filedAt, filed_by = :filedBy, proof_file_id = :proofFileId, submission_reference = :submissionReference
         where id = :id and status = 'reviewed'`,
        { id, filedOn: filing.filedOn, filedAt: filing.filedAt, filedBy: filing.filedBy, proofFileId: filing.proofFileId, submissionReference: filing.submissionReference },
      ),

    discardDraft: (id) => update("delete from app.tax_returns where id = :id and status = 'draft'", { id }),
  };
}
