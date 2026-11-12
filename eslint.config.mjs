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
              from: [format, forms, accounts, content, media, inventory, rates, booking, channels, reservations, money, tasks],
              message: "The kernel depends on nothing else in src/lib.",
            },
            {
              target: format,
              from: [forms, accounts, content, media, inventory, rates, booking, channels, reservations, money, tasks],
              message: "Formatting helpers depend only on the kernel.",
            },
            {
              target: forms,
              from: [accounts, content, media, inventory, rates, booking, channels, reservations, money, tasks],
              message: "Form state is shared by every core, so it can't depend on one.",
            },
            {
              target: accounts,
              from: [content, media, inventory, rates, booking, channels, reservations, money, tasks],
              message: "Accounts don't depend on the other cores.",
            },
            {
              target: content,
              from: [accounts, media, inventory, rates, booking, channels, reservations, money, tasks],
              message: "Site content doesn't depend on the other cores.",
            },
            {
              target: media,
              from: [accounts, content, inventory, rates, booking, channels, reservations, money, tasks],
              message: "Media doesn't depend on the other cores.",
            },
            {
              target: inventory,
              from: [accounts, content, media, rates, booking, channels, reservations, money, tasks],
              message: "The inventory doesn't know about requests, bookings, accounts or content; it gets apartments and permissions through its ports, wired in src/server.",
            },
            {
              target: rates,
              from: [accounts, content, media, booking, channels, reservations, money, tasks],
              message: "Rates build on the inventory only.",
            },
            {
              target: booking,
              from: [accounts, content, media, channels, reservations, money, tasks],
              message: "Booking requests build on the inventory and rates only; apartments, permissions and consent versions come through their ports.",
            },
            {
              target: channels,
              from: [accounts, content, media, reservations, money, tasks],
              message: "Channels build on the inventory (blocks) only; bookings are made from their stays by the reservations core.",
            },
            {
              target: reservations,
              from: [accounts, content, media, money, tasks],
              message: "Reservations build on the inventory, rates, requests and channels; money and tasks build on them.",
            },
            {
              target: money,
              from: [accounts, content, media, tasks],
              message: "Money (payments, invoices) builds on reservations; it never depends on tasks, accounts or content.",
            },
            {
              target: tasks,
              from: [accounts, content, money],
              message: "Tasks build on the inventory and reservations; they never see money.",
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
