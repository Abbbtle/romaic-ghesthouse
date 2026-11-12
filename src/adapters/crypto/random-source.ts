import "server-only";
import { randomInt } from "node:crypto";
import type { RandomSource } from "@/lib/booking/ports";

/** Whole numbers from Node's cryptographic random source, for booking reference codes (the booking core's RandomSource port). */
export const cryptoRandom: RandomSource = {
  randomInt: (max) => randomInt(max),
};
