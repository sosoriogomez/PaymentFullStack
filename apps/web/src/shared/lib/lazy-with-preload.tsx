import { type ComponentType, lazy } from 'react';

/**
 * `React.lazy` whose chunk can also be requested ahead of time (`useIdlePreload`). Both share one
 * download; a failed one is forgotten, so the next attempt fetches the chunk again. Once the chunk
 * is in, the component renders right away: no Suspense fallback flashes (and moves the focus).
 */
export function lazyWithPreload<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | undefined;
  let pending: Promise<ComponentType<P>> | undefined;
  const preload = () => {
    pending ??= load().then(
      (component) => {
        loaded = component;
        return component;
      },
      (error: unknown) => {
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };
  const Lazy = lazy(async () => ({ default: await preload() }));
  function Component(props: P) {
    const Loaded = loaded;
    return Loaded ? <Loaded {...props} /> : <Lazy {...props} />;
  }
  return { Component, preload };
}
