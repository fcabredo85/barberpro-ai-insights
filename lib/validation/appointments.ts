import { z } from "zod";

import { isValidIsoDate } from "@/lib/business/dates";
import { HAIRSTYLE_IDS } from "@/lib/tryon/styles";

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, { error: message })
    .optional()
    .transform((v) => (v ? v : undefined));

/** Body of POST /api/appointments. Price, duration and end time are never client-supplied. */
export const bookAppointmentSchema = z.strictObject(
  {
    barberId: z.uuid({ error: "Choose a barber." }),
    serviceId: z.uuid({ error: "Choose a service." }),
    startsAt: z.iso.datetime({ offset: true, error: "Choose an available time." }),
    customerName: z
      .string({ error: "Enter the customer's name." })
      .trim()
      .min(1, { error: "Enter the customer's name." })
      .max(100, { error: "Use 100 characters or fewer." }),
    customerPhone: optionalText(20, "Use 20 characters or fewer.").refine((v) => v === undefined || /^[0-9+() -]{7,20}$/.test(v), {
      error: "Enter a phone number using digits, spaces, +, - or ().",
    }),
    notes: optionalText(500, "Use 500 characters or fewer."),
    savedLookId: z.uuid().optional(),
    styleId: z.enum(HAIRSTYLE_IDS).optional(),
    requestKey: z.uuid({ error: "Missing request key." }),
  },
  { error: "Unexpected field in request." },
);

export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;

export const availabilityQuerySchema = z.object({
  barberId: z.uuid({ error: "Choose a barber." }),
  serviceId: z.uuid({ error: "Choose a service." }),
  date: z.string().refine(isValidIsoDate, { error: "Choose a valid date." }),
});

/** Body of PATCH /api/appointments/:id. */
export const appointmentActionSchema = z.discriminatedUnion(
  "action",
  [
    z.strictObject({ action: z.literal("cancel") }),
    z.strictObject({ action: z.literal("no_show") }),
    z.strictObject({ action: z.literal("complete"), paymentMethod: z.enum(["cash", "gcash"], { error: "Choose how the customer paid." }) }),
  ],
  { error: "Choose a valid action." },
);

export type AppointmentAction = z.infer<typeof appointmentActionSchema>;
