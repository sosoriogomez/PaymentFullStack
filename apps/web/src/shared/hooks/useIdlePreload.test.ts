import { renderHook } from '@testing-library/react';
import { useIdlePreload } from './useIdlePreload';

describe('useIdlePreload', () => {
  afterEach(() => {
    jest.useRealTimers();
    Reflect.deleteProperty(window, 'requestIdleCallback');
    Reflect.deleteProperty(window, 'cancelIdleCallback');
  });

  it('should wait for the browser to be idle', () => {
    let idle: IdleRequestCallback = () => undefined;
    window.requestIdleCallback = jest.fn((callback: IdleRequestCallback) => {
      idle = callback;
      return 7;
    });
    window.cancelIdleCallback = jest.fn();
    const preload = jest.fn(() => Promise.resolve());

    const { unmount } = renderHook(() => {
      useIdlePreload(preload);
    });
    expect(preload).not.toHaveBeenCalled();
    idle({ didTimeout: false, timeRemaining: () => 10 });
    unmount();

    expect(preload).toHaveBeenCalledTimes(1);
    expect(window.cancelIdleCallback).toHaveBeenCalledWith(7);
  });

  it('should fall back to a timer where requestIdleCallback does not exist', () => {
    jest.useFakeTimers();
    const preload = jest.fn(() => Promise.reject(new Error('offline')));

    renderHook(() => {
      useIdlePreload(preload);
    });
    jest.advanceTimersByTime(1999);
    expect(preload).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);

    expect(preload).toHaveBeenCalledTimes(1);
  });

  it('should not preload after unmounting', () => {
    jest.useFakeTimers();
    const preload = jest.fn(() => Promise.resolve());

    const { unmount } = renderHook(() => {
      useIdlePreload(preload);
    });
    unmount();
    jest.runAllTimers();

    expect(preload).not.toHaveBeenCalled();
  });
});
