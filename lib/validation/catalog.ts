import { z } from "zod";

import { MAX_PRICE_CENTAVOS, parsePercentToBasisPoints, parsePesosToCentavos } from "@/lib/business/money";

const nameField = (what: string) =>
  z
    .string({ error: `Enter the ${what} name.` })
    .trim()
    .min(1, { error: `Enter the ${what} name.` })
    .max(100, { error: `${what[0]!.toUpperCase()}${what.slice(1)} name must be at most 100 characters.` });

/** Commission percentage typed by the owner, e.g. "40" or "12.5" -> basis points. */
export const commissionPercentField = z
  .string({ error: "Enter a commission rate." })
  .trim()
  .min(1, { error: "Enter a commission rate." })
  .transform((value, ctx) => {
    const bp = parsePercentToBasisPoints(value);
    if (bp === null) {
      ctx.addIssue({ code: "custom", message: "Commission rate must be between 0% and 100%, with up to 2 decimals." });
      return z.NEVER;
    }
    return bp;
  });

/** Peso price typed by the owner, e.g. "250" or "1,250.50" -> centavos. */
export const pesoPriceField = z
  .string({ error: "Enter a price." })
  .trim()
  .min(1, { error: "Enter a price." })
  .transform((value, ctx) => {
    const centavos = parsePesosToCentavos(value);
    if (centavos === null) {
      ctx.addIssue({ code: "custom", message: "Enter a peso amount like 250 or 250.50." });
      return z.NEVER;
    }
    if (centavos <= 0) {
      ctx.addIssue({ code: "custom", message: "Price must be more than ₱0.00." });
      return z.NEVER;
    }
    if (centavos > MAX_PRICE_CENTAVOS) {
      ctx.addIssue({ code: "custom", message: "Price must be at most ₱100,000.00." });
      return z.NEVER;
    }
    return centavos;
  });

export const barberFormSchema = z.object({
  name: nameField("barber"),
  commissionRate: commissionPercentField,
});

export const serviceFormSchema = z.object({
  name: nameField("service"),
  price: pesoPriceField,
});

export const recordIdSchema = z.uuid({ error: "Invalid record." });

export const activeFlagSchema = z.enum(["true", "false"]).transform((v) => v === "true");

export type BarberFormInput = z.infer<typeof barberFormSchema>;
export type ServiceFormInput = z.infer<typeof serviceFormSchema>;
