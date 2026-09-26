import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('should render the store shell with its main landmark', () => {
    render(<App />);

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Productos' })).toBeInTheDocument();
  });

  it('should warn that payments run in sandbox mode', () => {
    render(<App />);

    expect(screen.getByRole('contentinfo')).toHaveTextContent(/sandbox/i);
  });
});
