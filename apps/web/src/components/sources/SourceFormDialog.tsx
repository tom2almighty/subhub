import { zodResolver } from '@hookform/resolvers/zod';
import type { SourceDto } from '@subhub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

const formSchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(['remote', 'manual']),
  url: z.string().trim(),
  flowUrl: z.string().trim(),
  content: z.string(),
  userAgent: z.string(),
  headersText: z.string(),
  refreshInterval: z.coerce.number().int().min(0).max(10080),
  noFlow: z.boolean(),
  enabled: z.boolean(),
  autoCreateOutput: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function SourceFormDialog({
  open,
  onOpenChange,
  source,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: SourceDto;
  onSaved?: (source: SourceDto) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      kind: 'remote',
      url: '',
      flowUrl: '',
      content: '',
      userAgent: '',
      headersText: '',
      refreshInterval: 60,
      noFlow: false,
      enabled: true,
      autoCreateOutput: true,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: source?.name ?? '',
      kind: source?.kind ?? 'remote',
      url: source?.url ?? '',
      flowUrl: source?.flowUrl ?? '',
      content: source?.content ?? '',
      userAgent: source?.userAgent ?? '',
      headersText: source?.headers ? JSON.stringify(source.headers, null, 2) : '',
      refreshInterval: source?.refreshInterval ?? 60,
      noFlow: source?.noFlow ?? false,
      enabled: source?.enabled ?? true,
      autoCreateOutput: true,
    });
  }, [form, open, source]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      let headers: Record<string, string> = {};
      if (values.headersText.trim()) {
        try {
          const parsed = JSON.parse(values.headersText);
          if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
            throw new Error('Headers must be a JSON object');
          }
          headers = Object.fromEntries(
            Object.entries(parsed).map(([key, value]) => [key, `${value}`]),
          );
        } catch {
          throw new Error(t('sources.headersInvalid'));
        }
      }
      const body = {
        name: values.name,
        kind: values.kind,
        url: values.url,
        flowUrl: values.flowUrl,
        content: values.content,
        userAgent: values.userAgent,
        headers,
        refreshInterval: values.refreshInterval,
        noFlow: values.noFlow,
        enabled: values.enabled,
      };

      const saved = source ? await api.updateSource(source.id, body) : await api.createSource(body);

      if (!source && values.autoCreateOutput && saved?.id) {
        try {
          await api.createOutput({
            name: saved.name,
            target: 'surge',
            sourceIds: [saved.id],
            enabled: true,
          });
        } catch {
          // If output name collision occurs, try with a suffix
          try {
            await api.createOutput({
              name: `${saved.name} (Direct)`,
              target: 'surge',
              sourceIds: [saved.id],
              enabled: true,
            });
          } catch {
            // ignore
          }
        }
      }

      return saved;
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
      if (saved.id) void queryClient.invalidateQueries({ queryKey: ['source', saved.id] });
      toast.success(source ? t('common.save') : t('sources.new'));
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const kind = form.watch('kind');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{source ? t('sources.edit') : t('sources.new')}</DialogTitle>
          <DialogDescription>{t('app.tagline')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="space-y-2">
            <Label htmlFor="source-name">{t('sources.name')}</Label>
            <Input id="source-name" {...form.register('name')} />
          </div>
          <div className="space-y-2">
            <Label>{t('sources.kind')}</Label>
            <Select
              value={kind}
              onValueChange={(value) => form.setValue('kind', value as 'remote' | 'manual')}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="remote">{t('sources.remote')}</SelectItem>
                <SelectItem value="manual">{t('sources.manual')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind === 'remote' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="source-url">{t('sources.url')}</Label>
                <Input id="source-url" placeholder="https://..." {...form.register('url')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="source-flow-url">{t('sources.flowUrl')}</Label>
                <Input
                  id="source-flow-url"
                  placeholder="https://..."
                  {...form.register('flowUrl')}
                />
                <p className="text-xs text-muted-foreground">{t('sources.flowUrlHint')}</p>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="source-content">{t('sources.content')}</Label>
              <Textarea
                id="source-content"
                rows={7}
                placeholder="ss://...&#10;vmess://..."
                className="font-mono text-xs"
                {...form.register('content')}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="source-ua">{t('sources.userAgent')}</Label>
            <Input id="source-ua" placeholder="Mozilla/5.0 ..." {...form.register('userAgent')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source-headers">{t('sources.headers')}</Label>
            <Textarea
              id="source-headers"
              rows={3}
              placeholder='{"X-Header": "value"}'
              className="font-mono text-xs"
              {...form.register('headersText')}
            />
            <p className="text-xs text-muted-foreground">{t('sources.headersHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="source-interval">{t('sources.refreshInterval')}</Label>
            <Input
              id="source-interval"
              type="number"
              inputMode="numeric"
              {...form.register('refreshInterval')}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="source-noflow" className="text-sm font-normal">
              {t('sources.noFlow')}
            </Label>
            <Switch
              id="source-noflow"
              checked={form.watch('noFlow')}
              onCheckedChange={(checked) => form.setValue('noFlow', checked)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label htmlFor="source-enabled" className="text-sm font-normal">
              {t('sources.enabled')}
            </Label>
            <Switch
              id="source-enabled"
              checked={form.watch('enabled')}
              onCheckedChange={(checked) => form.setValue('enabled', checked)}
            />
          </div>

          {!source ? (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <div className="space-y-0.5 pr-2">
                <Label htmlFor="source-auto-output" className="text-sm font-medium cursor-pointer">
                  {t('sources.autoCreateOutput')}
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t('sources.autoCreateOutputHint')}
                </p>
              </div>
              <Switch
                id="source-auto-output"
                checked={form.watch('autoCreateOutput')}
                onCheckedChange={(checked) => form.setValue('autoCreateOutput', checked)}
              />
            </div>
          ) : null}

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
              {mutation.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
              {source ? t('common.save') : t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
