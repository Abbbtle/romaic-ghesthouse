import type { Migration } from "../migrate";

/**
 * Tax parameters and registrations (see ../tax-store.ts and src/lib/tax).
 *
 * - app.tax_parameters: dated, versioned config citing the sars.gov.za page
 *   each value was read on (brief rule 6). Append-only: a change is a new
 *   version (code, version unique), never an edit. A verified version has a
 *   value; an unverified one has none and says why in its note. Only pages on
 *   sars.gov.za may be cited.
 * - app.tax_registrations: append-only history of the business's
 *   registrations (VAT, turnover tax, income tax, PAYE, UIF, SDL); the latest
 *   per kind is current. Reference numbers are sealed by the app
 *   (AES-256-GCM, bound to the row's id) with only their last digits in the
 *   clear. Nothing is registered until the owner records it (open questions
 *   #1–#3).
 *
 * Seeded with every parameter as it was read on www.sars.gov.za on
 * 2026-11-12 (the notes quote the pages), checked for Weberu while the app
 * was built: checked_by "Weberu, during the build", created_by null (the
 * pages show these as checked during the build). Values a page gave no start date
 * for are recorded from 1 March 2026, the start of the year of assessment
 * they were checked in; an earlier period needs a version of its own. Two
 * are seeded unverified: VAT on long stays (stated only in a 2016 guide) and
 * turnover tax interim payment dates (the page's dates are for 2014/15).
 */
export const taxParametersMigration: Migration = {
  id: "340-tax-parameters",
  sql: /* sql */ `
    create table app.tax_parameters (
      id uuid primary key,
      code text not null constraint tax_parameters_code check (code ~ '^[a-z0-9]+([.-][a-z0-9]+)*$' and length(code) <= 60),
      version integer not null constraint tax_parameters_version check (version >= 1),
      value jsonb,
      unit text not null constraint tax_parameters_unit check (unit in ('percent', 'cents', 'years', 'table', 'rule')),
      effective_from date not null,
      effective_to date,
      source_url text not null constraint tax_parameters_source_sars check (source_url ~ '^https://(www\\.)?sars\\.gov\\.za(/[^[:space:]]*)?$' and length(source_url) <= 500),
      source_title text not null constraint tax_parameters_source_title check (length(btrim(source_title)) between 1 and 200),
      checked_on date not null,
      checked_by text not null constraint tax_parameters_checked_by check (length(btrim(checked_by)) between 1 and 120),
      note text not null constraint tax_parameters_note check (length(btrim(note)) between 1 and 1500),
      status text not null constraint tax_parameters_status check (status in ('verified', 'unverified')),
      created_at timestamptz not null,
      created_by uuid,
      constraint tax_parameters_version_unique unique (code, version),
      constraint tax_parameters_value_when_verified check ((status = 'verified') = (value is not null and value <> 'null'::jsonb)),
      constraint tax_parameters_dates check (effective_to is null or effective_to >= effective_from)
    );
    select app.make_append_only('app.tax_parameters');

    create table app.tax_registrations (
      id uuid primary key,
      kind text not null constraint tax_registrations_kind check (kind in ('vat', 'turnover', 'income-tax', 'paye', 'uif', 'sdl')),
      registered boolean not null,
      effective_from date,
      reference_sealed text constraint tax_registrations_reference_length check (reference_sealed is null or length(reference_sealed) <= 500),
      reference_last4 text constraint tax_registrations_reference_last4 check (reference_last4 is null or reference_last4 ~ '^[0-9A-Za-z]{1,4}$'),
      details jsonb not null default '{}'::jsonb constraint tax_registrations_details check (jsonb_typeof(details) = 'object'),
      recorded_at timestamptz not null,
      recorded_by uuid,
      constraint tax_registrations_dated check (effective_from is not null),
      constraint tax_registrations_reference_pair check ((reference_sealed is null) = (reference_last4 is null))
    );
    create index tax_registrations_by_kind on app.tax_registrations (kind, recorded_at);
    select app.make_append_only('app.tax_registrations');

    insert into app.tax_parameters (id, code, version, value, unit, effective_from, effective_to, source_url, source_title, checked_on, checked_by, note, status, created_at) values
      ('00000340-0000-4000-8000-000000000001', 'vat.standard-rate', 1, '15', 'percent', '2025-05-01', null,
        'https://www.sars.gov.za/types-of-tax/value-added-tax/', 'Value-Added Tax', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 08/09/2026: "VAT is levied at the standard rate of 15% on the supply of goods and services by registered vendors." It says the Rates Bill [B14-2025] "proposes to maintain the Value-Added Tax (VAT) rate at 15% from 1 May 2025", reversing the planned rise to 15.5%. Recorded from 1 May 2025, the date the page gives; earlier periods need a version of their own.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000002', 'vat.compulsory-threshold', 1, '230000000', 'cents', '2026-04-01', null,
        'https://www.sars.gov.za/types-of-tax/value-added-tax/register-for-vat/', 'Register for VAT', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 08/10/2026: registering is compulsory if the value of taxable supplies "is in excess of R2.3 million in any consecutive 12 month period". SARS "is administering new VAT registration applications based on the increased threshold announced with effect from 1 April 2026" (the Regulation is not yet updated). The Value-Added Tax page says the threshold "is increased from R1 million to R2.3 million" from 1 April 2026.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000003', 'vat.voluntary-threshold', 1, '12000000', 'cents', '2026-04-01', null,
        'https://www.sars.gov.za/types-of-tax/value-added-tax/register-for-vat/', 'Register for VAT', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 08/10/2026: a person may register voluntarily if taxable supplies are less than R2.3 million "but has, under certain circumstances, exceeded R120 000 in the past period of 12 months". The Value-Added Tax page says "The voluntary registration threshold is increased from R50 000 to R120 000"; SARS applies the increased thresholds from 1 April 2026.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000004', 'vat.commercial-accommodation-threshold', 1, '12000000', 'cents', '2016-04-01', null,
        'https://www.sars.gov.za/types-of-tax/value-added-tax/register-for-vat/', 'Register for VAT', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 08/10/2026, listing examples of when you are not carrying on an enterprise: supplying "commercial accommodation" where the total value of those supplies made or reasonably expected "does not exceed R120 000 in any consecutive period of 12 months". The start date is from SARS's VAT 411 guide (2016 edition), which says R120 000 applies from 1 April 2016 (R60 000 before).$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000005', 'vat.long-stay-rule', 1, null, 'rule', '2026-03-01', null,
        'https://www.sars.gov.za/lapd-vat-g04-vat-411-guide-for-entertainment-accommodation-and-catering', 'VAT 411 Guide for Entertainment, Accommodation and Catering', '2026-11-12', 'Weberu, during the build',
        $n$Not confirmed on a current SARS page. The only SARS source found is the VAT 411 guide (2016 edition, still published, its examples still at 14% VAT): "if the person stays for an unbroken period of 29 days or more, only 60% of the all-inclusive charge for the accommodation and any domestic goods and services included in the all-inclusive tariff for the accommodation is subject to VAT at the standard rate." Ask the accountant to confirm it still applies.$n$,
        'unverified', now()),
      ('00000340-0000-4000-8000-000000000006', 'vat.filing-categories', 1,
        '{"A": {"months": 2, "endMonths": [1, 3, 5, 7, 9, 11], "who": "The Commissioner decides who falls in this category."},
          "B": {"months": 2, "endMonths": [2, 4, 6, 8, 10, 12], "who": "The Commissioner decides who falls in this category."},
          "C": {"months": 1, "endMonths": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "who": "Taxable supplies over R30 million in 12 months, on written application, or for repeatedly failing to meet VAT obligations."},
          "D": {"months": 6, "endMonths": [2, 8], "who": "Mainly farmers with taxable supplies under R1.5 million in 12 months, and micro businesses on turnover tax."},
          "E": {"months": 12, "endMonths": "year-end", "who": "Companies or trusts letting fixed property or renting movable goods, or administering connected companies."}}',
        'rule', '2026-03-01', null,
        'https://www.sars.gov.za/types-of-tax/value-added-tax/tax-periods-for-vat-vendors/', 'Tax periods for VAT', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 31/01/2025: Category A "every 2 Calendar Months", periods ending January, March, May, July, September and November; Category B every 2 months ending February, April, June, August, October and December (the Commissioner decides who is in A or B); Category C "every 1 Calendar Month" (taxable supplies that "exceeded or is likely to exceed R30 million in any consecutive period of 12 months", on application, or for repeated non-compliance); Category D "every 6 Calendar Months", ending February and August (farmers under R1.5 million, Sixth Schedule micro businesses); Category E "every 12 Calendar Months", ending on the last day of the year of assessment. No start date given: recorded from 1 March 2026.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000007', 'vat.return-due', 1, '{"manualDay": 25, "efilingLastBusinessDay": true}', 'rule', '2026-03-01', null,
        'https://www.sars.gov.za/types-of-tax/value-added-tax/getting-ready-for-vat/', 'Obligations of a VAT vendor', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 19/08/2026: returns and payments are due "on or before the 25th day or the last business day of the month (if registered for eFiling)" following the month the tax period ends. "Where the 25th day is not a business day", the due date moves to the business day before. No start date given: recorded from 1 March 2026.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000008', 'turnover.threshold', 1, '230000000', 'cents', '2026-04-01', null,
        'https://www.sars.gov.za/types-of-tax/turnover-tax/', 'Turnover Tax', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 22/09/2026: micro businesses "with a qualifying annual turnover of R2.3 million or less" qualify; the threshold has increased from R1 million to R2.3 million, effective 1 April 2026.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000009', 'turnover.rate-table', 1,
        '{"bands": [{"overCents": 0, "baseCents": 0, "ratePercent": 0}, {"overCents": 60000000, "baseCents": 0, "ratePercent": 1}, {"overCents": 95000000, "baseCents": 350000, "ratePercent": 2}, {"overCents": 140000000, "baseCents": 1250000, "ratePercent": 3}]}',
        'table', '2026-03-01', '2027-02-28',
        'https://www.sars.gov.za/types-of-tax/turnover-tax/', 'Turnover Tax', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 22/09/2026, "Year of assessment ending on any date between 1 March 2026 and 28 February 2027": R1 - 600 000: 0% of taxable turnover; 600 001 - 950 000: 1% of taxable turnover above 600 000; 950 001 - 1 400 000: 3 500 + 2% of taxable turnover above 950 000; 1 400 001 and above: 12 500 + 3% of the taxable turnover above 1 400 000. The dates are those of the year's end.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000010', 'turnover.interim-payments', 1, null, 'rule', '2026-03-01', null,
        'https://www.sars.gov.za/types-of-tax/turnover-tax/', 'Turnover Tax', '2026-11-12', 'Weberu, during the build',
        $n$Not confirmed for this year. The page gives the first interim payment as the "last business day of August i.e. 29 August 2014" and the second as the "last business day of February i.e. 27 February 2015": its dates are for 2014/15 only.$n$,
        'unverified', now()),
      ('00000340-0000-4000-8000-000000000011', 'provisional.periods', 1,
        '{"firstMonthsFromStart": 6, "secondLastBusinessDayOfYear": true, "thirdFebruaryYearEndMonth": 9, "thirdOtherMonthsAfterEnd": 6}',
        'rule', '2026-03-01', null,
        'https://www.sars.gov.za/types-of-tax/provisional-tax/', 'Provisional Tax', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 21/08/2026: the first payment is due "within six months of the start of the year of assessment" (31 August for years starting in March, earlier if that is not a business day); the second "no later than the last working day of the year of assessment"; the voluntary third, for companies with a February year end and other non-company persons, by "the last business day of September", and for other companies "within six months of the end of the year of assessment". No start date given: recorded from 1 March 2026.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000012', 'paye.emp201-due', 1, '{"daysAfterMonthEnd": 7}', 'rule', '2026-03-01', null,
        'https://www.sars.gov.za/types-of-tax/pay-as-you-earn/', 'Pay As You Earn', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 23/09/2026: payment is due "within seven days after the end of the month during which the amount was deducted"; "If the last day for payment falls on a public holiday or weekend", "the payment must be made on the last business day before the public holiday or weekend". The EMP201 declares PAYE, SDL, UIF and ETI together. No start date given: recorded from 1 March 2026.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000013', 'uif.rates', 1, '{"employeePercent": 1, "employerPercent": 1}', 'rule', '2026-03-01', null,
        'https://www.sars.gov.za/types-of-tax/unemployment-insurance-fund/', 'Unemployment Insurance Fund', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 19/08/2026: the employee's contribution "must be 1% of the remuneration paid by the employer to the employee"; the employer adds 1%: "The employer must pay a total contribution of 2%". Employees working less than 24 hours a month for the employer are excluded. No start date given for the rates: recorded from 1 March 2026.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000014', 'uif.ceiling', 1, '1771200', 'cents', '2021-06-01', null,
        'https://www.sars.gov.za/types-of-tax/unemployment-insurance-fund/', 'Unemployment Insurance Fund', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 19/08/2026: contributions are worked out on remuneration up to "R 17 712 per month (R 212 544 annually)", with effect from 1 June 2021.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000015', 'sdl.rate', 1, '1', 'percent', '2026-03-01', null,
        'https://www.sars.gov.za/types-of-tax/skills-development-levy/', 'Skills Development Levy', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 19/08/2026: SDL is "1% of the total amount paid in salaries to employees" (overtime, bonuses and commissions included), paid with the EMP201 "within seven days after the end of the month". No start date given: recorded from 1 March 2026.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000016', 'sdl.threshold', 1, '50000000', 'cents', '2026-03-01', null,
        'https://www.sars.gov.za/types-of-tax/skills-development-levy/', 'Skills Development Levy', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 19/08/2026: employers whose remuneration liable for SDL over the next 12 months "won't exceed R500 000" are exempt and needn't register for SDL. No start date given: recorded from 1 March 2026.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000017', 'records.keep-years', 1, '5', 'years', '2026-03-01', null,
        'https://www.sars.gov.za/businesses-and-employers/record-keeping/', 'Record keeping', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 19/08/2026: after submitting a return, "Five years: counting from the date of submission of a return until the last day of the period"; longer while a return is outstanding, an objection or appeal is open ("until the disputed assessment or decision becomes final"), or an audit or investigation is under way. No start date given: recorded from 1 March 2026.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000018', 'income-tax.individual-table', 1,
        '{"bands": [{"overCents": 0, "baseCents": 0, "ratePercent": 18}, {"overCents": 24510000, "baseCents": 4411800, "ratePercent": 26}, {"overCents": 38310000, "baseCents": 7999800, "ratePercent": 31}, {"overCents": 53020000, "baseCents": 12559900, "ratePercent": 36}, {"overCents": 69580000, "baseCents": 18521500, "ratePercent": 39}, {"overCents": 88700000, "baseCents": 25978300, "ratePercent": 41}, {"overCents": 187860000, "baseCents": 66633900, "ratePercent": 45}]}',
        'table', '2026-03-01', '2027-02-28',
        'https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/', 'Rates of Tax for Individuals', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 28/10/2026, 2027 tax year (1 March 2026 - 28 February 2027): not exceeding R245 100: 18%; 245 101 - 383 100: 44 118 + 26% above 245 100; 383 101 - 530 200: 79 998 + 31% above 383 100; 530 201 - 695 800: 125 599 + 36% above 530 200; 695 801 - 887 000: 185 215 + 39% above 695 800; 887 001 - 1 878 600: 259 783 + 41% above 887 000; 1 878 601 and above: 666 339 + 45% above 1 878 600.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000019', 'income-tax.individual-rebates', 1, '{"primaryCents": 1782000, "secondaryCents": 976500, "tertiaryCents": 324900}', 'rule', '2026-03-01', '2027-02-28',
        'https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/', 'Rates of Tax for Individuals', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 28/10/2026, tax rebates for 2027: primary R17 820; secondary (65 and older) R9 765; tertiary (75 and older) R3 249. Tax thresholds for 2027: R99 000 under 65; R153 250 from 65; R171 300 from 75.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000020', 'income-tax.company-rate', 1, '27', 'percent', '2026-04-01', '2027-03-31',
        'https://www.sars.gov.za/tax-rates/income-tax/companies-trusts-and-small-business-corporations-sbc/', 'Companies, Trusts and Small Business Corporations (SBC)', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 28/10/2026: for years of assessment ending "1 April 2026 to 31 March 2027", the company rate is "27%". The dates are those of the year's end.$n$,
        'verified', now()),
      ('00000340-0000-4000-8000-000000000021', 'income-tax.sbc-table', 1,
        '{"bands": [{"overCents": 0, "baseCents": 0, "ratePercent": 0}, {"overCents": 9900000, "baseCents": 0, "ratePercent": 7}, {"overCents": 36500000, "baseCents": 1862000, "ratePercent": 21}, {"overCents": 55000000, "baseCents": 5747000, "ratePercent": 27}]}',
        'table', '2026-04-01', '2027-03-31',
        'https://www.sars.gov.za/tax-rates/income-tax/companies-trusts-and-small-business-corporations-sbc/', 'Companies, Trusts and Small Business Corporations (SBC)', '2026-11-12', 'Weberu, during the build',
        $n$Page last updated 28/10/2026, years of assessment ending between 1 April 2026 and 31 March 2027: not exceeding 99 000: 0%; 99 001 - 365 000: 7% of taxable income above 99 000; 365 001 - 550 000: 18 620 + 21% above 365 000; 550 001 and above: 57 470 + 27% of the amount above 550 000. The dates are those of the year's end.$n$,
        'verified', now());

    select app.secure_schema();
  `,
};
