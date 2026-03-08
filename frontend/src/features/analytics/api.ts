import { useQuery } from '@tanstack/react-query';

import { useTelegram } from '../../app/providers/TelegramProvider';
import { useInitData } from '../auth/useInitData';
import { apiRequest } from '../../shared/api/http';

export type CategorySpendPoint = {
  category_id?: string | null;
  category_name: string;
  amount: number;
  color?: string | null;
};

export type DailySpendPoint = {
  date: string;
  expense: number;
  income: number;
};

export type AnalyticsOverviewResponse = {
  month: string;
  total_expense: number;
  total_income: number;
  balance: number;
  by_category: CategorySpendPoint[];
  by_day: DailySpendPoint[];
};

export function useOverviewQuery(month: string) {
  const initDataRaw = useInitData();
  const { isReady, isTelegram } = useTelegram();

  return useQuery({
    enabled: isReady && (!isTelegram || Boolean(initDataRaw)),
    queryKey: ['analytics', month],
    queryFn: () =>
      apiRequest<AnalyticsOverviewResponse>(`/analytics/overview?month=${month}`, {
        initDataRaw,
      }),
  });
}
