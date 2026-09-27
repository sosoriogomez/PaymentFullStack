import { z } from 'zod';
import './zod-config';

describe('zod configuration', () => {
  it('should parse without compiling code at runtime, which the CSP forbids', () => {
    expect(z.config().jitless).toBe(true);
  });
});
