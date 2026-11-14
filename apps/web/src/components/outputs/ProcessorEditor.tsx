import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  PROXY_TYPES,
  type Processor,
  type ProcessorTraceStep,
  type ProxyType,
} from '@subhub/shared';
import type { TFunction } from 'i18next';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  GripVertical,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { cn } from '@/lib/utils';

const PROCESSOR_GROUPS = [
  {
    label: 'processors.groupFilter',
    types: ['filter', 'type-filter', 'useless-filter', 'dedupe'],
  },
  {
    label: 'processors.groupTransform',
    types: ['rename', 'prefix-suffix', 'source-tag', 'flag', 'dns', 'sort', 'sort-regex', 'set'],
  },
  {
    label: 'processors.groupScript',
    types: ['script', 'script-filter', 'add'],
  },
] as const satisfies { label: string; types: Processor['type'][] }[];

function newId(): string {
  return crypto.randomUUID();
}

function defaultProcessor(type: Processor['type']): Processor {
  const id = newId();
  switch (type) {
    case 'filter':
      return {
        id,
        type,
        args: { field: 'name', pattern: '', mode: 'include', flags: 'i' },
      };
    case 'type-filter':
      return { id, type, args: { types: [], mode: 'include' } };
    case 'useless-filter':
      return { id, type, args: {} };
    case 'dedupe':
      return { id, type, args: { by: 'fingerprint' } };
    case 'rename':
      return { id, type, args: { field: 'name', pattern: '', replacement: '', flags: 'gi' } };
    case 'prefix-suffix':
      return { id, type, args: { prefix: '', suffix: '' } };
    case 'source-tag':
      return { id, type, args: { position: 'prefix', format: '[{{source}}] ' } };
    case 'sort':
      return { id, type, args: { by: 'name', order: 'asc' } };
    case 'sort-regex':
      return { id, type, args: { patterns: [] } };
    case 'set':
      return { id, type, args: { fields: { udp: true } } };
    case 'script':
      return {
        id,
        type,
        args: {
          mode: 'inline',
          content: 'function operator(proxies) {\n  return proxies\n}',
          arguments: {},
        },
      };
    case 'script-filter':
      return {
        id,
        type,
        args: {
          mode: 'inline',
          content: 'function filter(proxies) {\n  return proxies.map(() => true)\n}',
          arguments: {},
        },
      };
    case 'add':
      return { id, type, args: { content: '', position: 'back' } };
    case 'flag':
      return { id, type, args: { position: 'prefix', twAsCn: true } };
    case 'dns':
      return { id, type, args: { servers: [], timeoutMs: 5000, cacheTtlMinutes: 30 } };
  }
}

function JsonTextarea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
  rows?: number;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = useState(false);

  return (
    <div className="space-y-1">
      <Textarea
        rows={rows}
        value={text}
        placeholder={placeholder}
        className="font-mono text-xs"
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          try {
            onChange(next.trim() ? JSON.parse(next) : {});
            setError(false);
          } catch {
            setError(true);
          }
        }}
      />
      {error ? <p className="text-xs text-destructive">{t('common.invalidJson')}</p> : null}
    </div>
  );
}

function ArgsEditor({
  processor,
  onChange,
}: {
  processor: Processor;
  onChange: (processor: Processor) => void;
}) {
  const { t } = useTranslation();
  const args = processor.args as Record<string, any>;

  function patch(values: Record<string, unknown>) {
    onChange({ ...processor, args: { ...args, ...values } } as Processor);
  }

  switch (processor.type) {
    case 'filter':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('processors.field')}>
            <Select value={args.field} onValueChange={(value) => patch({ field: value })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{t('processors.name')}</SelectItem>
                <SelectItem value="server">{t('processors.server')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t('processors.mode')}>
            <Select value={args.mode} onValueChange={(value) => patch({ mode: value })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="include">{t('processors.include')}</SelectItem>
                <SelectItem value="exclude">{t('processors.exclude')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t('processors.pattern')} className="sm:col-span-2">
            <Input
              value={args.pattern ?? ''}
              placeholder="香港|HK|Hong"
              onChange={(event) => patch({ pattern: event.target.value })}
            />
          </Field>
        </div>
      );
    case 'type-filter':
      return (
        <div className="space-y-3">
          <Field label={t('processors.mode')}>
            <Select value={args.mode} onValueChange={(value) => patch({ mode: value })}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="include">{t('processors.include')}</SelectItem>
                <SelectItem value="exclude">{t('processors.exclude')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex flex-wrap gap-3">
            {PROXY_TYPES.map((type) => (
              <label
                key={type}
                htmlFor={`processor-type-${type}`}
                className="flex items-center gap-1.5 text-xs uppercase"
              >
                <Checkbox
                  id={`processor-type-${type}`}
                  checked={args.types?.includes(type)}
                  onCheckedChange={(checked) => {
                    const current = new Set<ProxyType>(args.types ?? []);
                    if (checked === true) current.add(type);
                    else current.delete(type);
                    patch({ types: [...current] });
                  }}
                />
                {type}
              </label>
            ))}
          </div>
        </div>
      );
    case 'dedupe':
      return (
        <Field label={t('processors.by')}>
          <Select value={args.by} onValueChange={(value) => patch({ by: value })}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fingerprint">{t('processors.fingerprint')}</SelectItem>
              <SelectItem value="server">{t('processors.server')}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      );
    case 'rename':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('processors.field')}>
            <Select value={args.field} onValueChange={(value) => patch({ field: value })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{t('processors.name')}</SelectItem>
                <SelectItem value="server">{t('processors.server')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t('processors.pattern')}>
            <Input
              value={args.pattern ?? ''}
              onChange={(event) => patch({ pattern: event.target.value })}
            />
          </Field>
          <Field label={t('processors.replacement')} className="sm:col-span-2">
            <Input
              value={args.replacement ?? ''}
              onChange={(event) => patch({ replacement: event.target.value })}
            />
          </Field>
        </div>
      );
    case 'prefix-suffix':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('processors.prefix')}>
            <Input
              value={args.prefix ?? ''}
              onChange={(event) => patch({ prefix: event.target.value })}
            />
          </Field>
          <Field label={t('processors.suffix')}>
            <Input
              value={args.suffix ?? ''}
              onChange={(event) => patch({ suffix: event.target.value })}
            />
          </Field>
        </div>
      );
    case 'source-tag': {
      const position = args.position ?? 'prefix';
      const format = args.format ?? '[{{source}}] ';
      return (
        <div className="space-y-2.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('processors.sourceTagPosition')}>
              <Select
                value={position}
                onValueChange={(value) => {
                  const nextPos = value as 'prefix' | 'suffix';
                  const nextFormat =
                    nextPos === 'suffix' && format === '[{{source}}] '
                      ? ' - {{source}}'
                      : nextPos === 'prefix' && format === ' - {{source}}'
                        ? '[{{source}}] '
                        : format;
                  patch({ position: nextPos, format: nextFormat });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prefix">{t('processors.flagPrefix')}</SelectItem>
                  <SelectItem value="suffix">{t('processors.flagSuffix')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('processors.sourceTagFormat')}>
              <Input
                value={format}
                onChange={(event) => patch({ format: event.target.value })}
              />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">{t('processors.sourceTagHint')}</p>
        </div>
      );
    }
    case 'sort':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('processors.by')}>
            <Select value={args.by} onValueChange={(value) => patch({ by: value })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{t('processors.name')}</SelectItem>
                <SelectItem value="server">{t('processors.server')}</SelectItem>
                <SelectItem value="port">{t('processors.port')}</SelectItem>
                <SelectItem value="type">{t('processors.type')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t('processors.order')}>
            <Select value={args.order} onValueChange={(value) => patch({ order: value })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">{t('processors.asc')}</SelectItem>
                <SelectItem value="desc">{t('processors.desc')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      );
    case 'sort-regex':
      return (
        <Field label={t('processors.patterns')}>
          <Textarea
            rows={4}
            className="font-mono text-xs"
            value={(args.patterns ?? []).join('\n')}
            onChange={(event) =>
              patch({
                patterns: event.target.value
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
      );
    case 'set':
      return (
        <Field label={t('processors.fields')}>
          <JsonTextarea
            value={args.fields ?? {}}
            onChange={(value) => patch({ fields: value })}
            placeholder='{"udp": true}'
          />
        </Field>
      );
    case 'flag':
      return (
        <div className="space-y-3">
          <Field label={t('processors.flagPosition')}>
            <Select value={args.position} onValueChange={(value) => patch({ position: value })}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prefix">{t('processors.flagPrefix')}</SelectItem>
                <SelectItem value="suffix">{t('processors.flagSuffix')}</SelectItem>
                <SelectItem value="replace">{t('processors.flagReplace')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-start justify-between gap-4 border-t pt-3">
            <div className="min-w-0">
              <div className="text-sm">{t('processors.flagTwAsCn')}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{t('processors.flagHint')}</div>
            </div>
            <Switch
              checked={args.twAsCn !== false}
              onCheckedChange={(checked) => patch({ twAsCn: checked })}
            />
          </div>
        </div>
      );
    case 'dns':
      return (
        <div className="space-y-3">
          <Field label={t('processors.dnsServers')}>
            <Textarea
              rows={3}
              className="font-mono text-xs"
              placeholder={'https://dns.google/dns-query\ntls://1.1.1.1'}
              value={(args.servers ?? []).join('\n')}
              onChange={(event) =>
                patch({
                  servers: event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <p className="text-xs text-muted-foreground">{t('processors.dnsServersHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('processors.dnsTimeout')}>
              <Input
                type="number"
                inputMode="numeric"
                min={1000}
                max={30000}
                value={args.timeoutMs ?? 5000}
                onChange={(event) =>
                  patch({ timeoutMs: Number.parseInt(event.target.value, 10) || 5000 })
                }
              />
            </Field>
            <Field label={t('processors.dnsCacheTtl')}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={1440}
                value={args.cacheTtlMinutes ?? 30}
                onChange={(event) =>
                  patch({ cacheTtlMinutes: Number.parseInt(event.target.value, 10) || 0 })
                }
              />
            </Field>
          </div>
        </div>
      );
    case 'script':
    case 'script-filter':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('processors.scriptMode')}>
              <Select value={args.mode} onValueChange={(value) => patch({ mode: value })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inline">{t('processors.inline')}</SelectItem>
                  <SelectItem value="link">{t('processors.link')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={t('processors.scriptArguments')}>
              <JsonTextarea
                value={args.arguments ?? {}}
                onChange={(value) => patch({ arguments: value })}
                rows={2}
              />
            </Field>
          </div>
          <Field label={t('processors.scriptContent')}>
            <Textarea
              rows={8}
              className="font-mono text-xs"
              value={args.content ?? ''}
              onChange={(event) => patch({ content: event.target.value })}
            />
          </Field>
        </div>
      );
    case 'add':
      return (
        <div className="space-y-3">
          <Field label={t('processors.position')}>
            <Select value={args.position} onValueChange={(value) => patch({ position: value })}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="back">{t('processors.back')}</SelectItem>
                <SelectItem value="front">{t('processors.front')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={t('processors.addContent')}>
            <Textarea
              rows={5}
              className="font-mono text-xs"
              value={args.content ?? ''}
              onChange={(event) => patch({ content: event.target.value })}
            />
          </Field>
        </div>
      );
    default:
      return null;
  }
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function processorSummary(processor: Processor, t: TFunction): string {
  switch (processor.type) {
    case 'filter':
      return processor.args.pattern ? `${processor.args.field} · ${processor.args.pattern}` : '';
    case 'type-filter':
      return processor.args.types.join(', ');
    case 'dedupe':
      return processor.args.by;
    case 'rename':
      return processor.args.pattern
        ? `${processor.args.pattern} → ${processor.args.replacement}`
        : '';
    case 'prefix-suffix':
      return `${processor.args.prefix}…${processor.args.suffix}`;
    case 'source-tag':
      return `${t(`processors.${processor.args.position === 'suffix' ? 'flagSuffix' : 'flagPrefix'}`)} · ${processor.args.format}`;
    case 'sort':
    case 'sort-regex':
      return processor.type === 'sort'
        ? `${processor.args.by} · ${t(`processors.${processor.args.order}`)}`
        : processor.args.patterns.slice(0, 2).join(', ');
    case 'set':
      return Object.keys(processor.args.fields).join(', ');
    case 'script':
    case 'script-filter':
      return processor.args.mode;
    case 'add':
      return t(`processors.${processor.args.position}`);
    case 'dns':
      return processor.args.servers.join(', ');
    case 'flag': {
      const positionKey = {
        prefix: 'processors.flagPrefix',
        suffix: 'processors.flagSuffix',
        replace: 'processors.flagReplace',
      } as const;
      return `${t(positionKey[processor.args.position])}${processor.args.twAsCn ? ' · TW→CN' : ''}`;
    }
    default:
      return '';
  }
}

const PROCESSOR_PRESETS: {
  key: string;
  create: () => Processor[];
}[] = [
  {
    key: 'cleanAndFlag',
    create: () => [
      { id: newId(), type: 'useless-filter', args: {} },
      { id: newId(), type: 'dedupe', args: { by: 'fingerprint' } },
      { id: newId(), type: 'flag', args: { position: 'prefix', twAsCn: true } },
    ],
  },
  {
    key: 'dropUseless',
    create: () => [{ id: newId(), type: 'useless-filter', args: {} }],
  },
  {
    key: 'dedupe',
    create: () => [{ id: newId(), type: 'dedupe', args: { by: 'fingerprint' } }],
  },
  {
    key: 'mainstreamProtocols',
    create: () => [
      {
        id: newId(),
        type: 'type-filter',
        args: { types: ['vless', 'trojan', 'ss', 'hysteria2'], mode: 'include' },
      },
    ],
  },
  {
    key: 'sortByRegion',
    create: () => [
      {
        id: newId(),
        type: 'sort-regex',
        args: {
          patterns: [
            '香港|HK|Hong',
            '台湾|TW|Taiwan',
            '日本|JP|Japan',
            '新加坡|SG|Singapore',
            '美国|US|United States',
          ],
        },
      },
    ],
  },
];

export function ProcessorEditor({
  value,
  onChange,
  trace,
}: {
  value: Processor[];
  onChange: (processors: Processor[]) => void;
  trace?: ProcessorTraceStep[];
}) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const traceMap = new Map(trace?.map((step) => [step.id, step]));

  function update(index: number, processor: Processor) {
    onChange(value.map((item, i) => (i === index ? processor : item)));
  }

  function duplicate(index: number) {
    const source = value[index];
    if (!source) return;
    const copy = { ...structuredClone(source), id: newId() };
    const next = [...value];
    next.splice(index + 1, 0, copy);
    onChange(next);
    setOpenId(copy.id);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = value.findIndex((item) => item.id === active.id);
    const newIndex = value.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(value, oldIndex, newIndex));
  }

  function add(type: Processor['type']) {
    const processor = defaultProcessor(type);
    onChange([...value, processor]);
    setOpenId(processor.id);
  }

  function applyPreset(create: () => Processor[]) {
    const items = create();
    onChange([...value, ...items]);
    if (items.length === 1 && items[0]) setOpenId(items[0].id);
  }

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">{t('processors.empty')}</p>
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={value.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {value.map((processor, index) => (
            <SortableProcessor
              key={processor.id}
              processor={processor}
              index={index}
              total={value.length}
              step={traceMap.get(processor.id)}
              open={openId === processor.id}
              onToggle={() => setOpenId(openId === processor.id ? null : processor.id)}
              onChange={(next) => update(index, next)}
              onMoveUp={() => index > 0 && onChange(arrayMove(value, index, index - 1))}
              onMoveDown={() =>
                index < value.length - 1 && onChange(arrayMove(value, index, index + 1))
              }
              onDuplicate={() => duplicate(index)}
              onRemove={() => onChange(value.filter((_, i) => i !== index))}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className="flex flex-col gap-2 sm:flex-row">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-dashed text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-4" />
              {t('processors.addProcessor')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            {PROCESSOR_GROUPS.map((group, groupIndex) => (
              <div key={group.label}>
                {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {t(group.label)}
                </DropdownMenuLabel>
                {group.types.map((type) => (
                  <DropdownMenuItem key={type} onClick={() => add(type)}>
                    {t(`processors.${type}`)}
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="border-dashed text-muted-foreground hover:text-foreground sm:w-auto"
            >
              <Sparkles className="size-4 text-primary" />
              {t('processors.presets')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t('processors.presetsHint')}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PROCESSOR_PRESETS.map((preset) => (
              <DropdownMenuItem key={preset.key} onClick={() => applyPreset(preset.create)}>
                {t(`processors.preset_${preset.key}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function SortableProcessor({
  processor,
  index,
  total,
  step,
  open,
  onToggle,
  onChange,
  onMoveUp,
  onMoveDown,
  onDuplicate,
  onRemove,
}: {
  processor: Processor;
  index: number;
  total: number;
  step?: ProcessorTraceStep;
  open: boolean;
  onToggle: () => void;
  onChange: (processor: Processor) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: processor.id });
  const summary = processorSummary(processor, t);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'overflow-hidden rounded-lg border bg-card transition-colors',
        processor.disabled && 'bg-muted/30',
        isDragging && 'relative z-10 opacity-70',
      )}
    >
      <div className="flex items-center gap-2 py-2 pr-2 pl-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t('processors.drag')}
          className="flex size-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs text-muted-foreground">
          {index + 1}
        </span>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {t(`processors.${processor.type}`)}
              </span>
              {step && !step.disabled ? (
                <span
                  className={cn(
                    'shrink-0 rounded-full px-1.5 py-0.2 font-mono text-[10px] tabular-nums',
                    step.afterCount < step.beforeCount
                      ? 'bg-warning/15 text-warning'
                      : step.afterCount > step.beforeCount
                        ? 'bg-success/15 text-success'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {step.beforeCount} → {step.afterCount}
                </span>
              ) : null}
            </span>
            <span
              className={cn(
                'mt-0.5 block truncate text-xs text-muted-foreground',
                !summary && 'hidden',
              )}
            >
              {summary}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
        <Switch
          aria-label={t('common.enabled')}
          checked={!processor.disabled}
          onCheckedChange={(checked) => onChange({ ...processor, disabled: !checked })}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={index === 0} onClick={onMoveUp}>
              <ArrowUp className="size-4" />
              {t('common.moveUp')}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index >= total - 1} onClick={onMoveDown}>
              <ArrowDown className="size-4" />
              {t('common.moveDown')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="size-4" />
              {t('common.duplicate')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onRemove}>
              <Trash2 className="size-4" />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open ? (
        <div className="border-t bg-muted/20 p-3">
          <ArgsEditor processor={processor} onChange={onChange} />
        </div>
      ) : null}
    </div>
  );
}
