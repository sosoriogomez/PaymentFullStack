// global.css va primero: declara el orden de las capas antes que cualquier CSS Module.
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router/dom';
import { createBrowserServices } from './app/composition';
import { createAppRouter } from './app/router';
import { createAppStore } from './app/store';
import { env } from './shared/config/env';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

const store = createAppStore(createBrowserServices(env));
const router = createAppRouter();

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>,
);
