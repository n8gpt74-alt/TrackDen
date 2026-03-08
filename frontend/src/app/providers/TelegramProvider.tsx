import {
  init,
  miniApp,
  retrieveRawInitData,
  themeParams,
  viewport,
} from '@tma.js/sdk';
import { PropsWithChildren, createContext, startTransition, useContext, useEffect, useState } from 'react';

type TelegramContextValue = {
  initDataRaw: string;
  isTelegram: boolean;
  isDark: boolean;
  isReady: boolean;
};

const TelegramContext = createContext<TelegramContextValue>({
  initDataRaw: '',
  isTelegram: false,
  isDark: false,
  isReady: false,
});

function detectTelegram() {
  return typeof window !== 'undefined' && Boolean((window as Window & { Telegram?: unknown }).Telegram);
}

export function TelegramProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<TelegramContextValue>({
    initDataRaw: '',
    isTelegram: false,
    isDark: false,
    isReady: false,
  });

  useEffect(() => {
    let cleanup: VoidFunction | undefined;
    let cancelled = false;

    const bootstrap = async () => {
      const isTelegram = detectTelegram();
      let rawInitData = '';
      let isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

      if (isTelegram) {
        try {
          cleanup = init();
          themeParams.mount();
          miniApp.mount();
          await viewport.mount();
          themeParams.bindCssVars();
          miniApp.bindCssVars();
          viewport.bindCssVars();
          viewport.expand();
          miniApp.ready();
          rawInitData = retrieveRawInitData() ?? '';
          isDark = Boolean(themeParams.isDark());
        } catch {
          rawInitData = '';
        }
      }

      if (cancelled) {
        return;
      }

      startTransition(() => {
        setState({
          initDataRaw: rawInitData,
          isTelegram,
          isDark,
          isReady: true,
        });
      });
    };

    void bootstrap();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <TelegramContext.Provider value={state}>{children}</TelegramContext.Provider>;
}

export function useTelegram() {
  return useContext(TelegramContext);
}

