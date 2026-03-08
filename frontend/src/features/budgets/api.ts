import { useMutation, useQuery } from '@tanstack/react-query';

import { useTelegram } from '../../app/providers/TelegramProvider';
import { getBudgetConfig, getBudgetOverview, saveBudgetConfig } from '../../shared/api/localBudgets';
import { isLocalDataMode } from '../../shared/api/mode';
import { useInitData } from '../auth/useInitData';
import type { BudgetConfig } from './model';

export function useBudgetConfigQuery() {
  const initDataRaw = useInitData();
  const { isReady } = useTelegram();
  const enabled = isReady && isLocalDataMode();

  return useQuery({
    enabled,
    queryKey: ['budgets', 'config'],
    queryFn: () => getBudgetConfig(initDataRaw),
  });
}

export function useBudgetOverviewQuery(month: string) {
  const initDataRaw = useInitData();
  const { isReady } = useTelegram();
  const enabled = isReady && isLocalDataMode();

  return useQuery({
    enabled,
    queryKey: ['budgets', 'overview', month],
    queryFn: () => getBudgetOverview(month, initDataRaw),
  });
}

export function useSaveBudgetConfigMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: async (config: BudgetConfig) => saveBudgetConfig(config, initDataRaw),
  });
}

