import { createAction } from '@reduxjs/toolkit';

/** Leaves the checkout and forgets everything about it (also clears the transaction slice). */
export const checkoutReset = createAction('checkout/reset');
