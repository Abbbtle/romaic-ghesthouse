"use client";

import { ActionForm } from "../action-form";
import { ConfirmButton, type ConfirmedActionResult } from "../confirm-button";
import { EmptyState } from "../empty-state";
import { PageHeader } from "../page-header";
import { Panel } from "../panel";
import { StatusPill } from "../status-pill";
import { SheetForm } from "../sheet-form";
import { useToast } from "../toast";
import { DateField, NumberField, Switch, TextField } from "@/components/ui/fields";
import { Notice } from "@/components/ui/notice";
import type { FormAction } from "@/lib/forms/form-state";
import type { FieldErrors } from "@/lib/kernel/result";

export type RatedApartmentRow = {
  slug: string;
  name: string;
  sleeps: number;
  /** Amounts as a form shows them ("850" or "850.50"), and a one-line summary. */
  plan: { nightly: string; baseGuests: number; extraGuest: string; minNights: number; active: boolean; summary: string } | null;
};

export type SeasonRow = {
  id: string;
  name: string;
  firstNight: string;
  lastNight: string;
  nightsLabel: string;
  minNights: number | null;
  /** Prices as a form shows them, by apartment slug. */
  prices: Record<string, string>;
  /** "Family apartment with shower: R1,100 a night". */
  priceLines: string[];
};

type RatesScreenProps = {
  apartments: readonly RatedApartmentRow[];
  seasons: readonly SeasonRow[];
  canManage: boolean;
  actions: {
    saveRatePlan: FormAction;
    removeRatePlan: (apartment: string) => Promise<ConfirmedActionResult>;
    addSeason: FormAction;
    changeSeason: FormAction;
    removeSeason: (id: string) => Promise<ConfirmedActionResult>;
  };
};

/** An amount typed in rand, as the server reads it: digits, an optional "R", spaces, commas and up to two decimals. */
const randPattern = /^(?:R\s?)?[\d\s,]{1,13}(?:\.\d{1,2})?$/i;
const isAmount = (value: string) => randPattern.test(value.trim()) && /\d/.test(value);

/** The plan form's rules, checked as each field is left; the server checks them again. */
function planProblems(sleeps: number) {
  return (data: FormData): FieldErrors => {
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const whole = (name: string) => (/^\d+$/.test(text(name)) ? Number(text(name)) : NaN);
    const errors: FieldErrors = {};
    if (!isAmount(text("nightly"))) errors.nightly = "Enter the price of a night, like 850.";
    const base = whole("baseGuests");
    if (!(base >= 1 && base <= sleeps)) errors.baseGuests = `Enter 1 to ${sleeps}: this apartment sleeps up to ${sleeps}.`;
    if (!isAmount(text("extraGuest"))) errors.extraGuest = "Enter the charge per extra guest, or 0.";
    const nights = whole("minNights");
    if (!(nights >= 1 && nights <= 30)) errors.minNights = "Enter the shortest stay, 1 to 30 nights.";
    return errors;
  };
}

/** The season form's rules. */
function seasonProblems(data: FormData): FieldErrors {
  const text = (name: string) => String(data.get(name) ?? "").trim();
  const errors: FieldErrors = {};
  if (!text("name")) errors.name = "Name the season, like Festive season.";
  if (!text("firstNight")) errors.firstNight = "Choose the season's first night.";
  if (!text("lastNight")) errors.lastNight = "Choose the season's last night.";
  else if (text("firstNight") && text("lastNight") < text("firstNight")) errors.lastNight = "Choose a last night on or after the first night.";
  const minNights = text("minNights");
  if (minNights && !(/^\d+$/.test(minNights) && Number(minNights) >= 1 && Number(minNights) <= 30)) errors.minNights = "Enter 1 to 30 nights, or leave it empty.";
  const prices = [...data.keys()].filter((key) => key.startsWith("price."));
  for (const key of prices) if (text(key) && !isAmount(text(key))) errors[key] = "Enter the price in rand, like 950, or leave it empty.";
  if (!prices.some((key) => text(key)) && !minNights) errors.form = "Give the season a price for at least one apartment, or a minimum stay.";
  return errors;
}

function SeasonFields({ apartments, season }: { apartments: readonly RatedApartmentRow[]; season?: SeasonRow }) {
  return (
    // A grid of its own: ActionForm doesn't space its children.
    <div className="grid gap-4">
      <TextField name="name" label="Name" maxLength={60} defaultValue={season?.name} placeholder="e.g. Festive season" />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField name="firstNight" label="First night" defaultValue={season?.firstNight} />
        <DateField name="lastNight" label="Last night" defaultValue={season?.lastNight} hint="The night of this date is in the season." />
      </div>
      <NumberField
        name="minNights"
        label="Shortest stay in this season"
        optional
        defaultValue={season?.minNights ?? undefined}
        hint="Nights. Leave it empty to keep each apartment's own minimum."
      />
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-bold text-ink">Nightly price in this season</legend>
        <p className="text-sm text-fg-3">Leave an apartment empty to keep its usual price. Extra guest charges stay as they are.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {apartments.map((apartment) => (
            <TextField
              key={apartment.slug}
              name={`price.${apartment.slug}`}
              label={apartment.name}
              optional
              inputMode="decimal"
              defaultValue={season?.prices[apartment.slug] ?? ""}
              placeholder="e.g. 950"
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** One apartment's rate, in its sheet: the price, who it's for, the shortest stay, and (once there's a rate) whether the website shows it. */
function PlanForm({
  apartment,
  actions,
  onSaved,
  onRemoved,
}: {
  apartment: RatedApartmentRow;
  actions: RatesScreenProps["actions"];
  onSaved: () => void;
  onRemoved: (message: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <ActionForm
        action={actions.saveRatePlan}
        validate={planProblems(apartment.sleeps)}
        footer="button"
        submitLabel={apartment.plan ? "Save rate" : "Set rate"}
        pendingLabel="Saving…"
        onSaved={onSaved}
      >
        <input type="hidden" name="apartment" value={apartment.slug} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="nightly"
            label="Price a night"
            inputMode="decimal"
            defaultValue={apartment.plan?.nightly ?? ""}
            placeholder="e.g. 850"
            hint="In rand, for up to the guests below."
          />
          <NumberField
            name="baseGuests"
            label="For up to"
            defaultValue={apartment.plan?.baseGuests ?? Math.min(2, apartment.sleeps)}
            hint={`Guests. It sleeps up to ${apartment.sleeps}.`}
          />
          <TextField name="extraGuest" label="Each extra guest, a night" inputMode="decimal" defaultValue={apartment.plan?.extraGuest ?? "0"} hint="In rand, or 0." />
          <NumberField name="minNights" label="Shortest stay" defaultValue={apartment.plan?.minNights ?? 1} hint="Nights." />
        </div>
        {/* A new rate is shown once it's set; the switch only appears when there's a rate to hide. */}
        {apartment.plan ? (
          <Switch
            name="active"
            label="Show this price on the website"
            defaultChecked={apartment.plan.active}
            onLabel="Shown"
            offLabel="Hidden"
            hint="Turn it off to go back to Price on request without losing the rate."
          />
        ) : (
          <input type="hidden" name="active" value="on" />
        )}
      </ActionForm>
      {apartment.plan && (
        <div className="border-t border-hairline pt-3">
          <ConfirmButton
            size="sm"
            variant="ghost"
            tone="primary"
            title={`Remove the rate for the ${apartment.name}?`}
            description="The website goes back to Price on request for it. Bookings already made keep their price."
            confirmLabel="Remove rate"
            pendingLabel="Removing…"
            action={() => actions.removeRatePlan(apartment.slug)}
            onDone={() => onRemoved(`Rate removed for the ${apartment.name}`)}
          >
            Remove rate
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}

/**
 * Nightly rates and seasons (Pattern: settings list). Each apartment's rate
 * is what the website shows ("From R850 a night") and what a stay costs;
 * seasons change the nightly price or the shortest stay for their nights.
 * Without a rate, the website says "Price on request". Only the owner and
 * sales see this page; read-only for anyone without rates:manage.
 */
export function RatesScreen({ apartments, seasons, canManage, actions }: RatesScreenProps) {
  const toasts = useToast();
  const done = (message: string) => toasts?.show({ message });
  const noRates = apartments.every((apartment) => apartment.plan === null);

  return (
    <>
      <PageHeader title="Rates" description="What a night costs in each apartment, and seasons with different prices. The website shows these prices." />
      <div className="grid max-w-admin gap-8">
        {noRates && apartments.length > 0 && (
          <Notice tone="info" live="off" title="No rates yet">
            Until an apartment has a rate, the website says &ldquo;Price on request&rdquo; for it, and guests ask for a price when they send a request.
          </Notice>
        )}

        <section aria-labelledby="plans-title" className="grid gap-4">
          <h2 id="plans-title" className="text-h3 font-bold text-ink">
            Nightly rates
          </h2>
          {apartments.length === 0 && <EmptyState title="No apartments on the website">Add apartments in Website › Apartments, then set their rates here.</EmptyState>}
          {apartments.length > 0 && (
            <ul className="divide-y divide-hairline rounded-md border border-hairline bg-white">
              {apartments.map((apartment) => (
                <li key={apartment.slug} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 lg:px-5">
                  <div className="grid min-w-0 gap-0.5">
                    <h3 className="text-base font-bold text-ink">{apartment.name}</h3>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-fg-2">
                      {apartment.plan ? apartment.plan.summary : "Price on request: no rate yet"}
                      {apartment.plan && !apartment.plan.active && <StatusPill>Not shown on the website</StatusPill>}
                    </p>
                  </div>
                  {canManage && (
                    <SheetForm
                      trigger={apartment.plan ? "Change" : "Set rate"}
                      variant="secondary"
                      size="sm"
                      title={`${apartment.name}: rate`}
                      description="What a night costs, for how many guests, and the shortest stay. The website shows it as “From R… a night”."
                    >
                      {(close) => <PlanForm apartment={apartment} actions={actions} onSaved={close} onRemoved={(message) => (close(), done(message))} />}
                    </SheetForm>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!canManage && apartments.length > 0 && <p className="text-sm text-fg-3">Only the owner and sales can change rates.</p>}
        </section>

        <section aria-labelledby="seasons-title" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="seasons-title" className="text-h3 font-bold text-ink">
              Seasons
            </h2>
            <p className="text-sm text-fg-2">Different nightly prices, or a longer shortest stay, for some nights. Seasons can&apos;t overlap.</p>
          </div>
          {seasons.length > 0 ? (
            <ul className="grid gap-4">
              {seasons.map((season) => (
                <li key={season.id}>
                  <Panel title={season.name} headingLevel={3} description={season.nightsLabel}>
                    <div className="grid gap-3">
                      <ul className="grid gap-1 text-sm text-fg">
                        {season.priceLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                        {season.minNights && <li>Shortest stay: {season.minNights} nights</li>}
                      </ul>
                      {canManage && (
                        <div className="grid gap-3">
                          <details className="rounded-sm border border-hairline p-3">
                            <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-link underline underline-offset-4">Edit season</summary>
                            <div className="pt-4">
                              <ActionForm action={actions.changeSeason} validate={seasonProblems} footer="button" submitLabel="Save season" pendingLabel="Saving…">
                                <input type="hidden" name="seasonId" value={season.id} />
                                <SeasonFields apartments={apartments} season={season} />
                              </ActionForm>
                            </div>
                          </details>
                          <div>
                            <ConfirmButton
                              size="sm"
                              variant="ghost"
                              tone="primary"
                              title={`Remove the season ${season.name}?`}
                              description="Its nights go back to each apartment's usual price and shortest stay. Bookings already made keep their price."
                              confirmLabel="Remove season"
                              pendingLabel="Removing…"
                              action={() => actions.removeSeason(season.id)}
                              onDone={() => done(`${season.name} removed`)}
                            >
                              Remove season
                            </ConfirmButton>
                          </div>
                        </div>
                      )}
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-hairline bg-white px-4 py-3 text-sm text-fg-3">No seasons: every night is at each apartment&apos;s usual price.</p>
          )}
          {canManage && apartments.length > 0 && (
            <Panel title="Add a season">
              <ActionForm action={actions.addSeason} validate={seasonProblems} footer="button" submitLabel="Add season" pendingLabel="Adding…" resetOnSave>
                <SeasonFields apartments={apartments} />
              </ActionForm>
            </Panel>
          )}
        </section>
      </div>
    </>
  );
}
