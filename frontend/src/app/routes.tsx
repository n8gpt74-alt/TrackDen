import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { Skeleton } from '../shared/ui/Skeleton';
import { Shell } from './layout/Shell';

const DashboardPage = lazy(async () => ({
  default: (await import('../pages/DashboardPage')).DashboardPage,
}));
const InsightsPage = lazy(async () => ({
  default: (await import('../pages/InsightsPage')).InsightsPage,
}));
const TransactionsPage = lazy(async () => ({
  default: (await import('../pages/TransactionsPage')).TransactionsPage,
}));
const SettingsPage = lazy(async () => ({
  default: (await import('../pages/SettingsPage')).SettingsPage,
}));

export function AppRoutes() {
  return (
    <Suspense fallback={<div className="px-4 pt-8"><Skeleton className="h-72 w-full" /></div>}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/receipt" element={<Navigate to="/dashboard?sheet=ocr" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

