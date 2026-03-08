import clsx from 'clsx';
import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren, ReactNode } from 'react';

import { CloseIcon, IconCircleButton } from './premium';

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
type SurfaceTone = 'default' | 'hero' | 'soft' | 'danger';

type ScreenHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

type SectionHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

type PremiumStatTileProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  className?: string;
};

type EmptyStateCardProps = {
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
};

type BottomSheetScaffoldProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  onClose: () => void;
};

type ConfirmStateCardProps = {
  title: ReactNode;
  description: ReactNode;
  tone?: Extract<Tone, 'warning' | 'danger' | 'success'>;
  action?: ReactNode;
  className?: string;
};

type ListRowProps = {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
};

const STATUS_TONE_CLASS: Record<Tone, string> = {
  neutral: 'status-badge--neutral',
  accent: 'status-badge--accent',
  success: 'status-badge--success',
  warning: 'status-badge--warning',
  danger: 'status-badge--danger',
};

const SURFACE_TONE_CLASS: Record<SurfaceTone, string> = {
  default: 'surface-card',
  hero: 'surface-card surface-card--hero',
  soft: 'surface-card surface-card--soft',
  danger: 'surface-card surface-card--danger',
};

export function ScreenHeader({ eyebrow, title, description, leading, actions, className }: ScreenHeaderProps) {
  return (
    <header className={clsx('screen-header', className)}>
      <div className="screen-header__main">
        {leading ? <div className="screen-header__leading">{leading}</div> : null}
        <div className="screen-header__copy">
          {eyebrow ? <p className="soft-kicker">{eyebrow}</p> : null}
          <h1 className="screen-header__title">{title}</h1>
          {description ? <p className="screen-header__description">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="screen-header__actions">{actions}</div> : null}
    </header>
  );
}

export function SurfaceCard({ className, children, tone = 'default', ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>> & { tone?: SurfaceTone }) {
  return (
    <div className={clsx(SURFACE_TONE_CLASS[tone], className)} {...props}>
      {children}
    </div>
  );
}

export function HeroPanel({ eyebrow, title, description, actions, children, className }: PropsWithChildren<Omit<SectionHeaderProps, 'action'> & { actions?: ReactNode }>) {
  return (
    <SurfaceCard className={clsx('hero-panel', className)} tone="hero">
      <div className="hero-panel__header">
        <div>
          {eyebrow ? <p className="soft-kicker">{eyebrow}</p> : null}
          <h2 className="hero-panel__title">{title}</h2>
          {description ? <p className="hero-panel__description">{description}</p> : null}
        </div>
        {actions ? <div className="hero-panel__actions">{actions}</div> : null}
      </div>
      {children}
    </SurfaceCard>
  );
}

export function SectionHeader({ eyebrow, title, description, action, className }: SectionHeaderProps) {
  return (
    <div className={clsx('section-header', className)}>
      <div className="section-header__copy">
        {eyebrow ? <p className="soft-kicker">{eyebrow}</p> : null}
        <h2 className="section-header__title">{title}</h2>
        {description ? <p className="section-header__description">{description}</p> : null}
      </div>
      {action ? <div className="section-header__action">{action}</div> : null}
    </div>
  );
}

export function PremiumStatTile({ label, value, hint, tone = 'neutral', className }: PremiumStatTileProps) {
  return (
    <div className={clsx('stat-tile', STATUS_TONE_CLASS[tone], className)}>
      <p className="stat-tile__label">{label}</p>
      <p className="stat-tile__value">{value}</p>
      {hint ? <p className="stat-tile__hint">{hint}</p> : null}
    </div>
  );
}

export function ActionPill({ className, children, type = 'button', variant = 'ghost', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'primary' | 'danger' | 'success' }) {
  return (
    <button
      className={clsx('pill-button', `pill-button--${variant}`, className)}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusBadge({ children, className, tone = 'neutral' }: PropsWithChildren<{ className?: string; tone?: Tone }>) {
  return <span className={clsx('status-badge', STATUS_TONE_CLASS[tone], className)}>{children}</span>;
}

export function EmptyStateCard({ title, description, action, className }: EmptyStateCardProps) {
  return (
    <SurfaceCard className={clsx('empty-state-card', className)} tone="soft">
      <h3 className="empty-state-card__title">{title}</h3>
      <p className="empty-state-card__description">{description}</p>
      {action ? <div className="empty-state-card__action">{action}</div> : null}
    </SurfaceCard>
  );
}

export function ReviewCard({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <SurfaceCard className={clsx('review-card', className)} tone="soft">{children}</SurfaceCard>;
}

export function ConfirmStateCard({ title, description, tone = 'danger', action, className }: ConfirmStateCardProps) {
  return (
    <div className={clsx('confirm-card', `confirm-card--${tone}`, className)}>
      <div>
        <h3 className="confirm-card__title">{title}</h3>
        <p className="confirm-card__description">{description}</p>
      </div>
      {action ? <div className="confirm-card__action">{action}</div> : null}
    </div>
  );
}

export function ListCard({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <SurfaceCard className={clsx('list-card', className)} tone="soft">{children}</SurfaceCard>;
}

export function ListRow({ leading, title, subtitle, trailing, onClick, className }: ListRowProps) {
  const content = (
    <>
      <div className="list-row__leading">{leading}</div>
      <div className="list-row__content">
        <p className="list-row__title">{title}</p>
        {subtitle ? <p className="list-row__subtitle">{subtitle}</p> : null}
      </div>
      {trailing ? <div className="list-row__trailing">{trailing}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button className={clsx('list-row list-row--interactive', className)} onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return <div className={clsx('list-row', className)}>{content}</div>;
}

export function BottomSheetScaffold({ eyebrow, title, description, leading, actions, footer, children, className, onClose }: BottomSheetScaffoldProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className={clsx('premium-sheet', className)} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <div className="sheet-header__row">
            <div className="sheet-header__main">
              {leading ? <div className="sheet-header__leading">{leading}</div> : null}
              <div className="sheet-header__copy">
                {eyebrow ? <p className="soft-kicker">{eyebrow}</p> : null}
                <h2 className="sheet-header__title">{title}</h2>
                {description ? <p className="sheet-header__description">{description}</p> : null}
              </div>
            </div>
            <div className="sheet-header__actions">
              {actions ?? (
                <IconCircleButton onClick={onClose}>
                  <CloseIcon size={18} />
                </IconCircleButton>
              )}
            </div>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
