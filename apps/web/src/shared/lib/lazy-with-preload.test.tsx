import { render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { lazyWithPreload } from './lazy-with-preload';

const Greeting = () => <p>Hola</p>;

describe('lazyWithPreload', () => {
  it('should download the chunk once, whether preloaded or rendered', async () => {
    const load = jest.fn(() => Promise.resolve(Greeting));
    const { Component, preload } = lazyWithPreload(load);

    await preload();
    render(
      <Suspense fallback="…">
        <Component />
      </Suspense>,
    );

    expect(await screen.findByText('Hola')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('should wait for the chunk the first time it renders', async () => {
    const { Component } = lazyWithPreload(() => Promise.resolve(Greeting));

    render(
      <Suspense fallback="Cargando">
        <Component />
      </Suspense>,
    );

    expect(screen.getByText('Cargando')).toBeInTheDocument();
    expect(await screen.findByText('Hola')).toBeInTheDocument();
  });

  it('should render without a fallback once the chunk was preloaded', async () => {
    const { Component, preload } = lazyWithPreload(() => Promise.resolve(Greeting));

    await preload();
    render(
      <Suspense fallback="Cargando">
        <Component />
      </Suspense>,
    );

    expect(screen.getByText('Hola')).toBeInTheDocument();
  });

  it('should try again after a failed download', async () => {
    const load = jest
      .fn<Promise<typeof Greeting>, []>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Greeting);
    const { preload } = lazyWithPreload(load);

    await expect(preload()).rejects.toThrow('offline');
    await expect(preload()).resolves.toBe(Greeting);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
