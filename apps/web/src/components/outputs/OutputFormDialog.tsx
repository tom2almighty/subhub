import { zodResolver } from '@hookform/resolvers/zod';
import {
  type OutputDto,
  type SourceDto,
  TARGET_LABELS,
  TARGETS,
  targetSchema,
} from '@subhub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';

const formSchema = z.object({
  name: z.string().trim().min(1),
  target: targetSchema,
  sourceIds: z.array(z.number()),
  enabled: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function OutputFormDialog({
  open,
  onOpenChange,
  output,
  sources,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  output?: OutputDto;
  sources: SourceDto[];
  onSaved?: (output: OutputDto) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', target: 'surge', sourceIds: [], enabled: true },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: output?.name ?? '',
      target: output?.target ?? 'surge',
      sourceIds: output?.sourceIds ?? [],
      enabled: output?.enabled ?? true,
    });
  }, [form, open, output]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      output ? api.updateOutput(output.id, values) : api.createOutput(values),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
      if (saved.id) void queryClient.invalidateQueries({ queryKey: ['output', saved.id] });
      toast.success(output ? t('common.save') : t('outputs.new'));
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selected = form.watch('sourceIds');
  const enabled = form.watch('enabled');

  function toggleSource(id: number, checked: boolean) {
    const next = checked ? [...selected, id] : selected.filter((item) => item !== id);
    form.setValue('sourceIds', next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{output ? t('common.edit') : t('outputs.new')}</DialogTitle>
          <DialogDescription>{t('app.tagline')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="space-y-2">
            <Label htmlFor="output-name">{t('outputs.name')}</Label>
            <Input id="output-name" {...form.register('name')} />
          </div>
          <div className="space-y-2">
            <Label>{t('outputs.defaultTarget')}</Label>
            <Select
              value={form.watch('target')}
              onValueChange={(value) => form.setValue('target', value as (typeof TARGETS)[number])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGETS.map((target) => (
                  <SelectItem key={target} value={target}>
                    {TARGET_LABELS[target]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('outputs.defaultTargetHint')}</p>
          </div>
          <div className="space-y-2">
            <Label>{t('outputs.sources')}</Label>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {sources.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">{t('sources.empty')}</div>
              ) : (
                sources.map((source) => (
                  <label
                    key={source.id}
                    htmlFor={`output-source-${source.id}`}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-accent"
                  >
                    <Checkbox
                      id={`output-source-${source.id}`}
                      checked={selected.includes(source.id)}
                      onCheckedChange={(checked) => toggleSource(source.id, checked === true)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{source.name}</span>
                    <span className="text-xs text-muted-foreground">{source.nodeCount}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t('outputs.sourceOrder')}</p>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="output-enabled" className="text-sm font-normal">
              {t('common.enabled')}
            </Label>
            <Switch
              id="output-enabled"
              checked={enabled}
              onCheckedChange={(checked) => form.setValue('enabled', checked)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
