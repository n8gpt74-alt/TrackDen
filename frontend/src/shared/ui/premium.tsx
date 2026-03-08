import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type IconProps = {
  className?: string;
  size?: number;
  strokeWidth?: number;
};

function BaseIcon({ children, className, size = 20, strokeWidth = 1.8 }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={clsx('shrink-0', className)}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6.8 9a5.2 5.2 0 1 1 10.4 0c0 5.2 2 6.6 2 6.6H4.8S6.8 14.2 6.8 9Z" />
      <path d="M10 18.2a2.3 2.3 0 0 0 4 0" />
    </BaseIcon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </BaseIcon>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8Z" />
      <path d="M5 15.5 6 18l2.5 1L6 20l-1 2.5L4 20l-2.5-1L4 18Z" />
      <path d="M19 14.5 19.8 16l1.7.8-1.7.7L19 19l-.8-1.5-1.7-.7 1.7-.8Z" />
    </BaseIcon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m3.5 10.4 8.5-6.9 8.5 6.9" />
      <path d="M5.8 9.7v10h12.4v-10" />
    </BaseIcon>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5 19V9" />
      <path d="M12 19V5" />
      <path d="M19 19v-7" />
      <path d="M4 19h16" />
    </BaseIcon>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 7.5h10" />
      <path d="M7 12h10" />
      <path d="M7 16.5h10" />
      <circle cx="4.5" cy="7.5" r=".8" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r=".8" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="16.5" r=".8" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m15 5-7 7 7 7" />
    </BaseIcon>
  );
}

export function DotsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 16V7" />
      <path d="m8.5 10.5 3.5-3.5 3.5 3.5" />
      <path d="M5 18.5h14" />
    </BaseIcon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </BaseIcon>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m4 20 4.5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9L4 20Z" />
      <path d="m13.5 6.5 3 3" />
    </BaseIcon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5.5 7.5h13" />
      <path d="M9 7.5v10" />
      <path d="M15 7.5v10" />
      <path d="M7.5 7.5 8.3 5h7.4l.8 2.5" />
      <path d="M7 7.5v11a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5v-11" />
    </BaseIcon>
  );
}

export function ArrowUpRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </BaseIcon>
  );
}

export function ArrowDownLeftIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m17 7-10 10" />
      <path d="M15 17H7V9" />
    </BaseIcon>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 4.8h10v14.4l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2z" />
      <path d="M9 9.5h6" />
      <path d="M9 13h6" />
    </BaseIcon>
  );
}

export function IconCircleButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={clsx('icon-circle-button', className)}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx('segmented-control', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          className={clsx('segmented-control__button', value === option.value && 'segmented-control__button--active')}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
