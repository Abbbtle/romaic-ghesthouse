import type { PaymentMethod } from "@/lib/money/money";

/**
 * The chart of accounts: a guesthouse's draft chart (build-plan, "Draft chart
 * of accounts"), for the owner's accountant to confirm. Codes are four
 * digits; the first says the kind (1 assets, 2 liabilities, 3 equity, 4
 * income, 5–6 expenses). System accounts are the ones automatic postings
 * use: they can be renamed by a migration but never switched off.
 */

export const accountKinds = ["asset", "liability", "equity", "income", "expense"] as const;
export type AccountKind = (typeof accountKinds)[number];

export const accountKindNames: Record<AccountKind, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

/** Which side increases an account: debits for assets and expenses, credits for the rest. */
export function debitNormal(kind: AccountKind): boolean {
  return kind === "asset" || kind === "expense";
}

export type LedgerAccount = {
  /** "1000". */
  code: string;
  name: string;
  kind: AccountKind;
  /** Used by automatic postings: can't be switched off. */
  system: boolean;
  active: boolean;
};

/** The codes automatic postings use. */
export const systemAccounts = {
  bank: "1000",
  cashOnHand: "1010",
  gatewayClearing: "1020",
  otaReceivables: "1100",
  guestReceivables: "1200",
  vatInput: "1300",
  equipment: "1500",
  accumulatedDepreciation: "1510",
  guestDeposits: "2000",
  vatOutput: "2100",
  payePayable: "2200",
  uifPayable: "2210",
  sdlPayable: "2220",
  otaCommissionPayable: "2300",
  loans: "2400",
  ownersCapital: "3000",
  drawings: "3100",
  retainedEarnings: "3200",
  accommodation: "4000",
  meals: "4100",
  laundry: "4200",
  otherIncome: "4900",
  otaCommission: "5000",
  bankCharges: "5100",
  cleaningAndLinen: "5200",
  utilities: "5300",
  municipalRates: "5400",
  repairs: "5500",
  insurance: "5600",
  internetAndPhone: "5700",
  advertising: "5800",
  salaries: "6000",
  employerUifSdl: "6100",
  depreciation: "6200",
} as const;

/** Each channel's receivable (what it collected and still owes the guesthouse), by the channel's key (src/lib/channels). */
export const channelReceivables: Record<string, string> = {
  "booking-com": "1110",
  airbnb: "1111",
  expedia: "1112",
  lekkeslaap: "1113",
  safarinow: "1114",
};

const account = (code: string, name: string, kind: AccountKind, system = true, active = true): LedgerAccount => ({ code, name, kind, system, active });

/**
 * The chart as it starts. VAT accounts start switched off: the business is
 * treated as not VAT-registered until the owner says otherwise (open
 * question #1), so nothing posts VAT.
 */
export const defaultChart: readonly LedgerAccount[] = [
  account(systemAccounts.bank, "Bank", "asset"),
  account(systemAccounts.cashOnHand, "Cash on hand", "asset"),
  account(systemAccounts.gatewayClearing, "Payment gateway clearing", "asset"),
  account(systemAccounts.otaReceivables, "Channel receivables (other)", "asset"),
  account(channelReceivables["booking-com"]!, "Booking.com receivable", "asset"),
  account(channelReceivables.airbnb!, "Airbnb receivable", "asset"),
  account(channelReceivables.expedia!, "Expedia receivable", "asset"),
  account(channelReceivables.lekkeslaap!, "LekkeSlaap receivable", "asset"),
  account(channelReceivables.safarinow!, "SafariNow receivable", "asset"),
  account(systemAccounts.guestReceivables, "Guest receivables", "asset"),
  account(systemAccounts.vatInput, "VAT input", "asset", true, false),
  account(systemAccounts.equipment, "Equipment and furniture", "asset"),
  account(systemAccounts.accumulatedDepreciation, "Accumulated depreciation", "asset"),
  account(systemAccounts.guestDeposits, "Guest deposits received", "liability"),
  account(systemAccounts.vatOutput, "VAT output", "liability", true, false),
  account(systemAccounts.payePayable, "PAYE payable", "liability"),
  account(systemAccounts.uifPayable, "UIF payable", "liability"),
  account(systemAccounts.sdlPayable, "SDL payable", "liability"),
  account(systemAccounts.otaCommissionPayable, "Channel commission payable", "liability"),
  account(systemAccounts.loans, "Loans", "liability"),
  account(systemAccounts.ownersCapital, "Owner's capital", "equity"),
  account(systemAccounts.drawings, "Drawings", "equity"),
  account(systemAccounts.retainedEarnings, "Retained earnings", "equity"),
  account(systemAccounts.accommodation, "Accommodation", "income"),
  account(systemAccounts.meals, "Breakfast and meals", "income"),
  account(systemAccounts.laundry, "Laundry and ironing", "income"),
  account(systemAccounts.otherIncome, "Other income", "income"),
  account(systemAccounts.otaCommission, "Channel commission", "expense"),
  account(systemAccounts.bankCharges, "Gateway and bank charges", "expense"),
  account(systemAccounts.cleaningAndLinen, "Cleaning supplies and linen", "expense"),
  account(systemAccounts.utilities, "Electricity, water and gas", "expense"),
  account(systemAccounts.municipalRates, "Municipal rates", "expense"),
  account(systemAccounts.repairs, "Repairs and maintenance", "expense"),
  account(systemAccounts.insurance, "Insurance", "expense"),
  account(systemAccounts.internetAndPhone, "Internet and phone", "expense"),
  account(systemAccounts.advertising, "Advertising", "expense"),
  account(systemAccounts.salaries, "Salaries and wages", "expense"),
  account(systemAccounts.employerUifSdl, "Employer UIF and SDL", "expense"),
  account(systemAccounts.depreciation, "Depreciation", "expense"),
];

/** The kind an account code belongs to, from its first digit. */
export function kindOfCode(code: string): AccountKind | null {
  const first = code[0];
  if (first === "1") return "asset";
  if (first === "2") return "liability";
  if (first === "3") return "equity";
  if (first === "4") return "income";
  if (first === "5" || first === "6") return "expense";
  return null;
}

/** Where money received by `method` lands: the bank, cash, the gateway's clearing account, or the channel that collected it. */
export function cashAccountFor(method: PaymentMethod, channel: string, mainBank: string): string {
  switch (method) {
    case "cash":
      return systemAccounts.cashOnHand;
    case "gateway":
      return systemAccounts.gatewayClearing;
    case "channel-collected":
      return channelReceivables[channel] ?? systemAccounts.otaReceivables;
    case "card-machine":
    case "eft":
      return mainBank;
  }
}

/** Accounts that hold cash, for the cash-flow statement: the bank accounts (10xx), cash on hand and gateway clearing. */
export function isCashAccount(code: string): boolean {
  return /^10\d\d$/.test(code);
}
