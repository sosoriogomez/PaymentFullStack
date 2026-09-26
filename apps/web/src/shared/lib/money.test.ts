import { formatCOP } from './money';

describe('formatCOP', () => {
  it.each([
    [150_000_00, '150.000'],
    [163_000_00, '163.000'],
    [99_900_00, '99.900'],
    [0, '0'],
  ])('should format %i cents as Colombian pesos without decimals', (cents, digits) => {
    const formatted = formatCOP(cents);

    expect(formatted).toContain('$');
    expect(formatted.replace(/\s/g, '')).toBe(`$${digits}`);
  });
});
