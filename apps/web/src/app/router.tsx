import { createBrowserRouter, type RouteObject } from 'react-router';
import { ProductPage } from '@/features/catalog/pages/ProductPage';
import { TransactionStatusPage } from '@/features/transaction/pages/TransactionStatusPage';
import { AppLayout } from './App';
import { NotFoundPage } from './NotFoundPage';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <ProductPage /> },
      { path: 'transactions/:transactionId', element: <TransactionStatusPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
