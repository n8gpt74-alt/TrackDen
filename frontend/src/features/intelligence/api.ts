import { useMutation, useQuery } from '@tanstack/react-query';

import { useTelegram } from '../../app/providers/TelegramProvider';
import { isLocalDataMode } from '../../shared/api/mode';
import {
  deleteQuickTemplate,
  deleteSmartRule,
  getAutomationOverview,
  getForecastOverview,
  getMerchantInsights,
  getQuickTemplateById,
  getWeeklyReview,
  markQuickTemplateUsed,
  saveQuickTemplate,
  saveSmartRule,
  toggleSmartRule,
} from '../../shared/api/localIntelligence';
import { useInitData } from '../auth/useInitData';
import type { QuickTemplateInput, SmartRuleInput } from './model';

function useLocalEnabled() {
  const initDataRaw = useInitData();
  const { isReady, isTelegram } = useTelegram();
  const enabled = isReady && (isLocalDataMode() || !isTelegram || Boolean(initDataRaw));
  return { enabled, initDataRaw };
}

export function useAutomationOverviewQuery() {
  const { enabled, initDataRaw } = useLocalEnabled();

  return useQuery({
    enabled,
    queryKey: ['intelligence', 'automation'],
    queryFn: () => getAutomationOverview(initDataRaw),
  });
}

export function useForecastOverviewQuery(month: string) {
  const { enabled, initDataRaw } = useLocalEnabled();

  return useQuery({
    enabled,
    queryKey: ['intelligence', 'forecast', month],
    queryFn: () => getForecastOverview(month, initDataRaw),
  });
}

export function useWeeklyReviewQuery() {
  const { enabled, initDataRaw } = useLocalEnabled();

  return useQuery({
    enabled,
    queryKey: ['intelligence', 'weekly-review'],
    queryFn: () => getWeeklyReview(initDataRaw),
  });
}

export function useMerchantInsightsQuery(month: string) {
  const { enabled, initDataRaw } = useLocalEnabled();

  return useQuery({
    enabled,
    queryKey: ['intelligence', 'merchant-insights', month],
    queryFn: () => getMerchantInsights(month, initDataRaw),
  });
}

export function useQuickTemplateQuery(id: string | null) {
  const { enabled, initDataRaw } = useLocalEnabled();

  return useQuery({
    enabled: enabled && Boolean(id),
    queryKey: ['intelligence', 'template', id],
    queryFn: () => getQuickTemplateById(id!, initDataRaw),
  });
}

export function useSaveSmartRuleMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: (input: SmartRuleInput) => saveSmartRule(input, initDataRaw),
  });
}

export function useDeleteSmartRuleMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: (id: string) => deleteSmartRule(id, initDataRaw),
  });
}

export function useToggleSmartRuleMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => toggleSmartRule(id, active, initDataRaw),
  });
}

export function useSaveQuickTemplateMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: (input: QuickTemplateInput) => saveQuickTemplate(input, initDataRaw),
  });
}

export function useDeleteQuickTemplateMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: (id: string) => deleteQuickTemplate(id, initDataRaw),
  });
}

export function useMarkQuickTemplateUsedMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: (id: string) => markQuickTemplateUsed(id, initDataRaw),
  });
}
