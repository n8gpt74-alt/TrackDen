import { BrowserRouter } from 'react-router-dom';

import { AppErrorBoundary } from '../shared/ui/ErrorBoundary';
import { QueryProvider } from './providers/QueryProvider';
import { TelegramProvider } from './providers/TelegramProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { AppRoutes } from './routes';

export function App() {
  return (
    <TelegramProvider>
      <ThemeProvider>
        <QueryProvider>
          <BrowserRouter>
            <AppErrorBoundary>
              <AppRoutes />
            </AppErrorBoundary>
          </BrowserRouter>
        </QueryProvider>
      </ThemeProvider>
    </TelegramProvider>
  );
}

