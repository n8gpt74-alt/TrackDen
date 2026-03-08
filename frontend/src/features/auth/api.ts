import { useQuery } from '@tanstack/react-query';

import { useInitData } from './useInitData';
import { useTelegram } from '../../app/providers/TelegramProvider';
import { apiRequest } from '../../shared/api/http';

export type Category = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  is_system: boolean;
};

export type UserSession = {
  telegram_id: number;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
  language_code?: string | null;
  is_premium: boolean;
  default_currency: string;
  timezone: string;
  last_auth_at?: string | null;
};

export type SessionResponse = {
  auth_source: string;
  user: UserSession;
  categories: Category[];
};

export function useSessionQuery() {
  const initDataRaw = useInitData();
  const { isReady, isTelegram } = useTelegram();

  return useQuery({
    enabled: isReady && (!isTelegram || Boolean(initDataRaw)),
    queryKey: ['session'],
    queryFn: () =>
      apiRequest<SessionResponse>('/auth/session', {
        initDataRaw,
      }),
  });
}
