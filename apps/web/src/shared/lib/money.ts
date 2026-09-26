const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Amounts travel as integer cents everywhere; they are formatted only when rendered. */
export const formatCOP = (cents: number): string => COP.format(cents / 100);
