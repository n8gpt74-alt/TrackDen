import { ErrorBoundary } from 'react-error-boundary';
import { PropsWithChildren } from 'react';

import { CloseIcon } from './premium';

export function AppErrorBoundary({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="premium-card w-full max-w-sm rounded-[30px] p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[20px] border border-[var(--app-stroke)] bg-white/[0.04] text-[var(--app-danger)]">
              <CloseIcon size={22} />
            </div>
            <h1 className="text-xl font-semibold text-white">Экран не загрузился</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--app-muted)]">{error instanceof Error ? error.message : 'Unknown error'}</p>
            <button
              className="sheet-primary-button mt-6 w-full"
              onClick={resetErrorBoundary}
              type="button"
            >
              Перезагрузить
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
