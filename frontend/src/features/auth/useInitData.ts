import { useTelegram } from '../../app/providers/TelegramProvider';

export function useInitData() {
  return useTelegram().initDataRaw;
}

