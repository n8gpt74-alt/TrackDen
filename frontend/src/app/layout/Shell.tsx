import clsx from 'clsx';
import { App as KonstaApp, KonstaProvider } from 'konsta/react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { BudgetActionSheet } from '../../features/budgets/BudgetActionSheet';
import { FinanceActionSheet } from '../../features/finance-sheet/FinanceActionSheet';
import { useFinanceSheet } from '../../features/finance-sheet/useFinanceSheet';
import { AutomationActionSheet } from '../../features/intelligence/AutomationActionSheet';
import { SubscriptionActionSheet } from '../../features/subscriptions/SubscriptionActionSheet';
import { ActivityIcon, ChartIcon, HomeIcon, PlusIcon } from '../../shared/ui/premium';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Главная', icon: HomeIcon },
  { path: '/insights', label: 'Статистика', icon: ChartIcon },
  { path: '/transactions', label: 'История', icon: ActivityIcon },
] as const;

export function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { openSheet } = useFinanceSheet();

  return (
    <KonstaProvider dark theme="material">
      <KonstaApp className="app-shell">
        <main className="screen-shell">
          <Outlet />
        </main>

        <div className="nav-wrap">
          <button className="premium-fab" onClick={() => openSheet('add')} type="button">
            <PlusIcon size={24} strokeWidth={2.2} />
          </button>
          <nav className="premium-nav" aria-label="Основная навигация">
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;

              return (
                <button
                  key={item.path}
                  className={clsx('nav-link', isActive && 'nav-link--active')}
                  onClick={() => navigate(item.path)}
                  type="button"
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <FinanceActionSheet />
        <BudgetActionSheet />
        <AutomationActionSheet />
        <SubscriptionActionSheet />
      </KonstaApp>
    </KonstaProvider>
  );
}
