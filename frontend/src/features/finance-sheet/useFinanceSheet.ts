import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

export type FinanceSheetMode = 'add' | 'ocr' | 'edit' | 'budget';

const SHEET_MODES = new Set<FinanceSheetMode>(['add', 'ocr', 'edit', 'budget']);

export function useFinanceSheet() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const rawMode = searchParams.get('sheet');
  const mode = rawMode && SHEET_MODES.has(rawMode as FinanceSheetMode) ? (rawMode as FinanceSheetMode) : null;
  const transactionId = searchParams.get('transactionId');

  const openSheet = (nextMode: FinanceSheetMode, options?: { transactionId?: string | null; pathname?: string }) => {
    const params = new URLSearchParams(searchParams);
    params.set('sheet', nextMode);

    if (options?.transactionId) {
      params.set('transactionId', options.transactionId);
    } else {
      params.delete('transactionId');
    }

    navigate({
      pathname: options?.pathname ?? location.pathname,
      search: `?${params.toString()}`,
    });
  };

  const closeSheet = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('sheet');
    params.delete('transactionId');

    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : '',
      },
      { replace: true },
    );
  };

  return {
    isOpen: mode !== null,
    mode,
    transactionId,
    openSheet,
    closeSheet,
  };
}
