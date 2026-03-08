import { useMutation, useQuery } from '@tanstack/react-query';

import { useTelegram } from '../../app/providers/TelegramProvider';
import {
  confirmRecurringCandidate,
  deleteSubscription,
  dismissRecurringCandidate,
  getSubscriptionManagerData,
  getSubscriptionOverview,
  saveSubscription,
  updateSubscriptionStatus,
} from '../../shared/api/localSubscriptions';
import { isLocalDataMode } from '../../shared/api/mode';
import { useInitData } from '../auth/useInitData';
import type { SubscriptionStatus, SubscriptionUpsertInput } from './model';

export function useSubscriptionManagerQuery() {
  const initDataRaw = useInitData();
  const { isReady } = useTelegram();

  return useQuery({
    enabled: isReady && isLocalDataMode(),
    queryKey: ['subscriptions', 'manager'],
    queryFn: () => getSubscriptionManagerData(initDataRaw),
  });
}

export function useSubscriptionOverviewQuery(month: string) {
  const initDataRaw = useInitData();
  const { isReady } = useTelegram();

  return useQuery({
    enabled: isReady && isLocalDataMode(),
    queryKey: ['subscriptions', 'overview', month],
    queryFn: () => getSubscriptionOverview(month, initDataRaw),
  });
}

export function useConfirmRecurringCandidateMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: async (candidateId: string) => confirmRecurringCandidate(candidateId, initDataRaw),
  });
}

export function useDismissRecurringCandidateMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: async (candidateId: string) => dismissRecurringCandidate(candidateId, initDataRaw),
  });
}

export function useSaveSubscriptionMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: async (input: SubscriptionUpsertInput) => saveSubscription(input, initDataRaw),
  });
}

export function useSubscriptionStatusMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SubscriptionStatus }) => updateSubscriptionStatus(id, status, initDataRaw),
  });
}

export function useDeleteSubscriptionMutation() {
  const initDataRaw = useInitData();

  return useMutation({
    mutationFn: async (id: string) => deleteSubscription(id, initDataRaw),
  });
}
