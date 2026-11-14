import type { FlowInfo } from '@subhub/shared';
import { CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { daysUntilExpire, flowPercent, formatExpire, formatFlow } from '@/lib/format';
import { cn } from '@/lib/utils';

export function FlowBar({
  flow,
  compact = false,
  className,
}: {
  flow: FlowInfo | null;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const percent = flowPercent(flow);
  const days = daysUntilExpire(flow?.expire);

  if (!flow && compact) {
    return (
      <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
        <CalendarClock className="size-3.5 shrink-0" />
        <span>{t('sources.expiresAt')}: ∞</span>
      </div>
    );
  }

  const barColor =
    percent == null
      ? 'bg-primary'
      : percent >= 90
        ? 'bg-destructive'
        : percent >= 70
          ? 'bg-warning'
          : 'bg-success';

  const expireLabel = flow?.expire
    ? days != null && days <= 0
      ? `${formatExpire(flow.expire)} (${t('sources.expired')})`
      : days != null && days <= 7
        ? `${formatExpire(flow.expire)} (${t('sources.daysLeft', { count: days })})`
        : formatExpire(flow.expire)
    : '∞';

  return (
    <div className={cn('space-y-1.5', className)}>
      {flow ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-medium tabular-nums text-foreground/85">
              {formatFlow(flow)}
            </span>
            {percent != null ? (
              <span
                className={cn(
                  'shrink-0 font-mono text-[11px] font-medium tabular-nums',
                  percent >= 90
                    ? 'text-destructive'
                    : percent >= 70
                      ? 'text-warning'
                      : 'text-muted-foreground',
                )}
              >
                {percent}%
              </span>
            ) : null}
          </div>
          {percent != null ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all duration-300', barColor)}
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5 shrink-0" />
        <span
          className={cn(
            days != null && days <= 0 && 'font-medium text-destructive',
            days != null && days > 0 && days <= 7 && 'font-medium text-warning',
          )}
        >
          {t('sources.expiresAt')}: {expireLabel}
        </span>
      </div>
    </div>
  );
}
