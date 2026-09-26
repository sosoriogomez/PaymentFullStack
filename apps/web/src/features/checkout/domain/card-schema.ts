import { z } from 'zod';
import { es } from '@/shared/i18n/es';
import { MAX_INSTALLMENTS } from '../checkout.slice';
import { isCvcValid, isExpiryValid, isHolderNameValid, parseExpiry } from './card-details';
import { type CardNumberProblem, cardNumberProblem } from './card-number';

const messages = es.checkout.card.errors;

const NUMBER_MESSAGES: Record<CardNumberProblem, string> = {
  EMPTY: messages.numberRequired,
  UNSUPPORTED_BRAND: messages.unsupportedBrand,
  INVALID: messages.numberInvalid,
};

const expiryMessage = (value: string, nowMs: number): string | null => {
  const expiry = parseExpiry(value);
  if (!expiry) return messages.expiryIncomplete;
  return isExpiryValid(expiry, nowMs) ? null : messages.expiryInvalid;
};

/** Card section of the payment form. `now` is injected so expiry rules are testable. */
export const createCardSchema = (now: () => number = Date.now) =>
  z.object({
    number: z.string().superRefine((value, ctx) => {
      const problem = cardNumberProblem(value);
      if (problem) ctx.addIssue({ code: 'custom', message: NUMBER_MESSAGES[problem] });
    }),
    holderName: z.string().refine(isHolderNameValid, messages.holderName),
    expiry: z.string().superRefine((value, ctx) => {
      const message = expiryMessage(value, now());
      if (message) ctx.addIssue({ code: 'custom', message });
    }),
    cvc: z.string().refine(isCvcValid, messages.cvc),
    installments: z.number().int().min(1).max(MAX_INSTALLMENTS),
  });

export type CardFormValues = z.infer<ReturnType<typeof createCardSchema>>;

export const emptyCard: CardFormValues = {
  number: '',
  holderName: '',
  expiry: '',
  cvc: '',
  installments: 1,
};
