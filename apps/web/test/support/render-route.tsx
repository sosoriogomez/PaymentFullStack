import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '@/app/router';
import { createAppStore } from '@/app/store';
import { createFakeServices } from '../fakes/fake-services';
import { type RenderWithStoreOptions } from './render-with-store';

/** Renders the real routes (real store, fake services) at the given path. */
export function renderRoute(
  path: string,
  options: Omit<RenderWithStoreOptions, keyof RenderOptions> = {},
) {
  const { preloadedState, services = createFakeServices(), registrations = [] } = options;
  const store = createAppStore(services, preloadedState, registrations);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return { ...view, store, services, router, user };
}
