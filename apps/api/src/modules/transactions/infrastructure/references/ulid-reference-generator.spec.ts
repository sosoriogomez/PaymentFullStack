import { UlidReferenceGenerator } from './ulid-reference-generator';

describe('UlidReferenceGenerator', () => {
  it('should generate unique, time-sortable TX-<ULID> references', () => {
    const generator = new UlidReferenceGenerator();

    const references = Array.from({ length: 50 }, () => generator.next());

    references.forEach((reference) => {
      expect(reference).toMatch(/^TX-[0-9A-HJKMNP-TV-Z]{26}$/);
    });
    expect(new Set(references).size).toBe(references.length);
    expect([...references].sort()).toEqual(references);
  });
});
