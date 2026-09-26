import { z } from 'zod';
import { es } from '@/shared/i18n/es';
import { createCardSchema, emptyCard } from './card-schema';
import { COLOMBIAN_REGIONS } from './regions';

const messages = es.checkout.delivery.errors;
const PERSON_NAME = /^\p{L}[\p{L} .'-]*$/u;
const COLOMBIAN_MOBILE = /^3\d{9}$/;
const POSTAL_CODE = /^\d{6}$/;

const text = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value.length >= min && value.length <= max, message);

/** Same rules as the API (defense in depth, spec-backend §5.1–5.2); the API decides. */
export const deliverySchema = z.object({
  fullName: z
    .string()
    .trim()
    .refine((value) => value.length >= 3 && value.length <= 80 && PERSON_NAME.test(value), {
      message: messages.fullName,
    }),
  email: z.string().trim().pipe(z.email(messages.email).max(254, messages.email)),
  phone: z.string().trim().regex(COLOMBIAN_MOBILE, messages.phone),
  addressLine1: text(3, 120, messages.addressLine1),
  addressLine2: z.string().trim().max(120, messages.addressLine2),
  region: z
    .string()
    .refine((value) => (COLOMBIAN_REGIONS as readonly string[]).includes(value), messages.region),
  city: text(2, 80, messages.city),
  postalCode: z
    .string()
    .trim()
    .refine((value) => value === '' || POSTAL_CODE.test(value), messages.postalCode),
});

export type DeliveryFormValues = z.infer<typeof deliverySchema>;

const termsSchema = z.object({
  acceptTerms: z.boolean().refine(Boolean, es.checkout.terms.errors.accept),
  acceptPersonalData: z.boolean().refine(Boolean, es.checkout.terms.errors.personalData),
});

/** The whole modal: card + delivery + explicit acceptance of both gateway contracts. */
export const createPaymentFormSchema = (now: () => number = Date.now) =>
  createCardSchema(now).extend(deliverySchema.shape).extend(termsSchema.shape);

export type PaymentFormValues = z.infer<ReturnType<typeof createPaymentFormSchema>>;

export const emptyDeliveryForm: DeliveryFormValues = {
  fullName: '',
  email: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  region: '',
  city: '',
  postalCode: '',
};

/** Fields that may be persisted as a draft (never card data). */
export const DRAFT_FIELDS = [
  'fullName',
  'email',
  'phone',
  'addressLine1',
  'addressLine2',
  'region',
  'city',
  'postalCode',
] as const satisfies readonly (keyof DeliveryFormValues)[];

/** Empty card, the saved drafts (and only them) and both contracts to be accepted again. */
export const initialPaymentForm = (drafts: DeliveryFormValues): PaymentFormValues => ({
  ...emptyCard,
  ...(Object.fromEntries(
    DRAFT_FIELDS.map((field) => [field, drafts[field]]),
  ) as DeliveryFormValues),
  acceptTerms: false,
  acceptPersonalData: false,
});
