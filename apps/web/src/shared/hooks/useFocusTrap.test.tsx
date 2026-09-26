import { render } from '@testing-library/react';
import { useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';

function EmptyTrap() {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  return <div ref={ref} tabIndex={-1} data-testid="trap" />;
}

describe('useFocusTrap', () => {
  it('should focus the container itself when it has nothing focusable and swallow Tab', () => {
    const { getByTestId } = render(<EmptyTrap />);
    const trap = getByTestId('trap');

    expect(trap).toHaveFocus();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    trap.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('should ignore keys other than Tab', () => {
    const { getByTestId } = render(<EmptyTrap />);

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    getByTestId('trap').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
