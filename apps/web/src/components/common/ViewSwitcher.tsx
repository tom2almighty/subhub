import { LayoutGrid, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ViewMode } from '@/lib/use-view-mode';

const OPTIONS = [
  { value: 'list', icon: List, key: 'common.list' },
  { value: 'card', icon: LayoutGrid, key: 'common.cards' },
] as const;

export function ViewSwitcher({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
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
            aria-label={t(option.key)}
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
