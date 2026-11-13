import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The cores in src/lib that hold the business rules. Each may depend on the
// ones listed before it, never on the ones after it (booking requests use
// the inventory; the inventory never knows about booking requests).
const kernel = "./src/lib/kernel";
const format = "./src/lib/format";
const forms = "./src/lib/forms";
const accounts = "./src/lib/accounts";
const content = "./src/lib/content";
const media = "./src/lib/media";
const inventory = "./src/lib/inventory";
const rates = "./src/lib/rates";
const booking = "./src/lib/booking";
const channels = "./src/lib/channels";
const reservations = "./src/lib/reservations";
const money = "./src/lib/money";
const tasks = "./src/lib/tasks";
const ledger = "./src/lib/ledger";
const bookkeeping = "./src/lib/bookkeeping";
const tax = "./src/lib/tax";
const reports = "./src/lib/reports";
const privacy = "./src/lib/privacy";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Which parts of src may depend on which. Checked on resolved paths, so a
    // relative import counts the same as an alias.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/lib",
              from: ["./src/app", "./src/components", "./src/hooks", "./src/server", "./src/adapters", "./src/content"],
              message: "src/lib holds the rules and nothing else; adapters, the server and the site depend on it, not the other way round.",
            },
            {
              target: kernel,
              from: [format, forms, accounts, content, media, inventory, rates, booking, channels, reservations, money, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "The kernel depends on nothing else in src/lib.",
            },
            {
              target: format,
              from: [forms, accounts, content, media, inventory, rates, booking, channels, reservations, money, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "Formatting helpers depend only on the kernel.",
            },
            {
              target: forms,
              from: [accounts, content, media, inventory, rates, booking, channels, reservations, money, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "Form state is shared by every core, so it can't depend on one.",
            },
            {
              target: accounts,
              from: [content, media, inventory, rates, booking, channels, reservations, money, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "Accounts don't depend on the other cores.",
            },
            {
              target: content,
              from: [accounts, media, inventory, rates, booking, channels, reservations, money, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "Site content doesn't depend on the other cores.",
            },
            {
              target: media,
              from: [accounts, content, inventory, rates, booking, channels, reservations, money, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "Media doesn't depend on the other cores.",
            },
            {
              target: inventory,
              from: [accounts, content, media, rates, booking, channels, reservations, money, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "The inventory doesn't know about requests, bookings, accounts or content; it gets apartments and permissions through its ports, wired in src/server.",
            },
            {
              target: rates,
              from: [accounts, content, media, booking, channels, reservations, money, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "Rates build on the inventory only.",
            },
            {
              target: booking,
              from: [accounts, content, media, channels, reservations, money, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "Booking requests build on the inventory and rates only; apartments, permissions and consent versions come through their ports.",
            },
            {
              target: channels,
              from: [accounts, content, media, reservations, money, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "Channels build on the inventory (blocks) only; bookings are made from their stays by the reservations core.",
            },
            {
              target: reservations,
              from: [accounts, content, media, money, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "Reservations build on the inventory, rates, requests and channels; money and tasks build on them.",
            },
            {
              target: money,
              from: [accounts, content, media, tasks, ledger, bookkeeping, tax, reports, privacy],
              message: "Money (payments, invoices) builds on reservations; it never depends on tasks, accounts or content.",
            },
            {
              target: tasks,
              from: [accounts, content, money, ledger, bookkeeping, tax, reports, privacy],
              message: "Tasks build on the inventory and reservations; they never see money.",
            },
            {
              target: ledger,
              from: [accounts, content, media, tasks, bookkeeping, tax, reports, privacy],
              message: "The ledger builds on reservations and money (it posts their events); bookkeeping and tax build on it.",
            },
            {
              target: bookkeeping,
              from: [accounts, content, tasks, tax, reports, privacy],
              message: "Bookkeeping (expenses, bank) posts through the ledger; tax reads them both.",
            },
            {
              target: tax,
              from: [accounts, content, tasks, reports, privacy],
              message: "Tax prepares figures from the ledger and bookkeeping; nothing else depends on it.",
            },
            {
              target: reports,
              from: [accounts, content, privacy],
              message: "Reports read the inventory, reservations, money, tasks and the ledger; nothing in src/lib depends on them.",
            },
            {
              target: privacy,
              from: [content, reports],
              message: "Privacy reaches into the cores that hold personal data (reservations, booking requests, tasks, tax's record-keeping period); nothing in src/lib depends on it.",
            },
            {
              target: "./src/content",
              from: ["./src/app", "./src/components", "./src/hooks", "./src/server", "./src/adapters"],
              message: "Seed content is data; it may use src/lib types and nothing else.",
            },
            {
              target: "./src/adapters",
              from: ["./src/app", "./src/components", "./src/hooks", "./src/server", "./src/content"],
              message: "Adapters implement src/lib ports; src/server wires them into the site.",
            },
            {
              target: "./src/server",
              from: ["./src/app", "./src/components", "./src/hooks"],
              message: "Server code serves routes and components; it doesn't import them.",
            },
            {
              target: "./src/components",
              from: ["./src/app", "./src/server", "./src/adapters", "./src/content"],
              message: "Components get their data and actions as props; they don't reach into routes, the server or storage.",
            },
            {
              target: "./src/hooks",
              from: ["./src/app", "./src/server", "./src/adapters", "./src/components", "./src/content"],
              message: "Hooks are browser helpers; they don't reach into routes, the server or storage.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/**/*.ts"],
    ignores: ["src/lib/**/*.test.ts"],
    rules: {
      // The cores run in browsers too. Reach Node through a port.
      "import/no-nodejs-modules": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*", "server-only", "pg", "@electric-sql/*", "@supabase/*"],
              message: "The cores in src/lib don't depend on the framework or on storage; use a port.",
            },
          ],
        },
      ],
    },
  },
  // .next.nosync holds the build output (.next links to it, so iCloud doesn't sync it).
  globalIgnores([".next/**", ".next.nosync/**", "out/**", "build/**", "next-env.d.ts", "data.nosync/**", "node_modules/**"]),
]);

export default eslintConfig;
