import { Columns2, Columns3, Rows3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ColumnCount } from '@/lib/use-columns';

const OPTIONS = [
  { value: 1 as const, icon: Rows3 },
  { value: 2 as const, icon: Columns2 },
  { value: 3 as const, icon: Columns3 },
];

export function ColumnSwitcher({
  value,
  onChange,
}: {
  value: ColumnCount;
  onChange: (value: ColumnCount) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="hidden items-center gap-0.5 rounded-md border border-border p-0.5 sm:flex">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        return (
          <Button
            key={option.value}
            variant={value === option.value ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label={`${t('common.columns')} ${option.value}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <Icon className="size-3.5" />
          </Button>
        );
      })}
    </div>
  );
}
