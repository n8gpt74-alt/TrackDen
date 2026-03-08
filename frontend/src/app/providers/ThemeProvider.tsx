import { PropsWithChildren, useEffect } from 'react';

import { useTelegram } from './TelegramProvider';

export function ThemeProvider({ children }: PropsWithChildren) {
  const { isDark } = useTelegram();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = 'dark';
    root.dataset.telegramTone = isDark ? 'dark' : 'light';
  }, [isDark]);

  return <>{children}</>;
}
