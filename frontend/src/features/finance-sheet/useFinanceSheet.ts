import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

export type FinanceSheetMode = 'add' | 'ocr' | 'edit' | 'budget' | 'subscriptions' | 'subscription-edit' | 'automation';

const SHEET_MODES = new Set<FinanceSheetMode>(['add', 'ocr', 'edit', 'budget', 'subscriptions', 'subscription-edit', 'automation']);

type OpenSheetOptions = {
  pathname?: string;
  subscriptionId?: string | null;
  templateId?: string | null;
  transactionId?: string | null;
};

export function useFinanceSheet() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const rawMode = searchParams.get('sheet');
  const mode = rawMode && SHEET_MODES.has(rawMode as FinanceSheetMode) ? (rawMode as FinanceSheetMode) : null;
  const transactionId = searchParams.get('transactionId');
  const subscriptionId = searchParams.get('subscriptionId');
  const templateId = searchParams.get('templateId');

  const openSheet = (nextMode: FinanceSheetMode, options?: OpenSheetOptions) => {
    const params = new URLSearchParams(searchParams);
    params.set('sheet', nextMode);

    if (options?.transactionId) {
      params.set('transactionId', options.transactionId);
    } else {
      params.delete('transactionId');
    }

    if (options?.subscriptionId) {
      params.set('subscriptionId', options.subscriptionId);
    } else {
      params.delete('subscriptionId');
    }

    if (options?.templateId) {
      params.set('templateId', options.templateId);
    } else {
      params.delete('templateId');
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
    params.delete('subscriptionId');
    params.delete('templateId');

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
    subscriptionId,
    templateId,
    openSheet,
    closeSheet,
  };
}
