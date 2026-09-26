import { type CardTokenizer, type CheckoutApi } from '@/shared/api/ports';
import {
  type Clock,
  type IdGenerator,
  type KeyValueStorage,
  type PageVisibility,
} from '@/shared/lib/ports';

/** Every side effect the store may perform, injected as ports (fakes in tests, adapters in the browser). */
export interface AppServices {
  readonly api: CheckoutApi;
  readonly cardTokenizer: CardTokenizer;
  readonly storage: KeyValueStorage;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly pageVisibility: PageVisibility;
}
