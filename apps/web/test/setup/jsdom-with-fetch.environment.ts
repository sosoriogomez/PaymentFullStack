import { TestEnvironment } from 'jest-environment-jsdom';

/**
 * jsdom does not implement the Fetch API. React Router's data routers build a `Request` for every
 * navigation, so the Node implementations are exposed (with Node's AbortController, which
 * `Request` requires for its `signal`).
 */
export default class JsdomWithFetchEnvironment extends TestEnvironment {
  constructor(...args: ConstructorParameters<typeof TestEnvironment>) {
    super(...args);
    Object.assign(this.global, {
      fetch,
      Request,
      Response,
      Headers,
      FormData,
      ReadableStream,
      AbortController,
      AbortSignal,
    });
  }
}
