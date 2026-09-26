import { type IncomingMessage, type ServerResponse } from 'node:http';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

const fakeRequest = (id?: string) =>
  ({ headers: id === undefined ? {} : { [REQUEST_ID_HEADER]: id } }) as IncomingMessage;
const fakeResponse = () => {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => (headers[name] = value),
  } as unknown as ServerResponse;
  return { res, headers };
};

describe('resolveRequestId', () => {
  const generated = '11111111-1111-4111-8111-111111111111';

  it('should reuse a valid incoming UUID and echo it', () => {
    const incoming = '0f8c5a1e-2b3c-4d5e-8f90-123456789abc';
    const { res, headers } = fakeResponse();

    expect(resolveRequestId(fakeRequest(incoming), res, () => generated)).toBe(incoming);
    expect(headers[REQUEST_ID_HEADER]).toBe(incoming);
  });

  it.each([undefined, '', 'drop table', '0f8c5a1e-2b3c-4d5e-8f90-123456789abc-extra'])(
    'should generate a new id when the incoming value is %p',
    (incoming) => {
      const { res, headers } = fakeResponse();

      expect(resolveRequestId(fakeRequest(incoming), res, () => generated)).toBe(generated);
      expect(headers[REQUEST_ID_HEADER]).toBe(generated);
    },
  );

  it('should default to random UUIDs', () => {
    const { res } = fakeResponse();

    expect(resolveRequestId(fakeRequest(), res)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
