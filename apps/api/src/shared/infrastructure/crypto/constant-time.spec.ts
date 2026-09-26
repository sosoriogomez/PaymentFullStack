import { constantTimeEquals } from './constant-time';

describe('constantTimeEquals', () => {
  it.each([
    ['secret', 'secret', true],
    ['secret', 'Secret', false],
    ['secret', 'secret-longer', false],
    ['', '', true],
  ])('%p vs %p → %s', (received, expected, equal) => {
    expect(constantTimeEquals(received, expected)).toBe(equal);
  });
});
