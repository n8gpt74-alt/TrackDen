import clsx from 'clsx';

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return <div className={clsx('skeleton-dark rounded-[22px]', className)} />;
}
