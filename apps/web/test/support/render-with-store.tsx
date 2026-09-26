import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { Provider } from 'react-redux';
import { createAppStore, type ListenerRegistration, type RootState } from '@/app/store';
import { createFakeServices, type FakeServices } from '../fakes/fake-services';

export interface RenderWithStoreOptions extends Omit<RenderOptions, 'wrapper'> {
  readonly preloadedState?: Partial<RootState>;
  readonly services?: FakeServices;
  readonly registrations?: readonly ListenerRegistration[];
}

/** Renders with a real store (real reducers, thunks and listeners) wired to fake services. */
export function renderWithStore(ui: ReactElement, options: RenderWithStoreOptions = {}) {
  const {
    preloadedState,
    services = createFakeServices(),
    registrations = [],
    ...renderOptions
  } = options;
  const store = createAppStore(services, preloadedState, registrations);
  const user = userEvent.setup();
  const view = render(<Provider store={store}>{ui}</Provider>, renderOptions);
  return { ...view, store, services, user };
}
