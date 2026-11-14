import { PROXY_TYPES, type ProxyNode, type ProxyType } from '@subhub/shared';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SS_CIPHERS = [
  'aes-128-gcm',
  'aes-256-gcm',
  'chacha20-ietf-poly1305',
  '2022-blake3-aes-128-gcm',
  '2022-blake3-aes-256-gcm',
  '2022-blake3-chacha20-poly1305',
];

export function NodeEditorDialog({
  open,
  onOpenChange,
  initialNode,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialNode?: ProxyNode;
  saving?: boolean;
  onSave: (node: ProxyNode) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('basic');
  const [name, setName] = useState('');
  const [type, setType] = useState<ProxyType>('vless');
  const [server, setServer] = useState('');
  const [port, setPort] = useState('443');
  const [uuid, setUuid] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [cipher, setCipher] = useState('aes-256-gcm');
  const [udp, setUdp] = useState(true);
  const [tls, setTls] = useState(true);
  const [sni, setSni] = useState('');
  const [skipCertVerify, setSkipCertVerify] = useState(false);
  const [flow, setFlow] = useState('');
  const [network, setNetwork] = useState('tcp');
  const [wsPath, setWsPath] = useState('');
  const [wsHost, setWsHost] = useState('');
  const [grpcService, setGrpcService] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab('basic');
    setError('');
    setName(initialNode?.name ?? '');
    setType(initialNode?.type ?? 'vless');
    setServer(initialNode?.server ?? '');
    setPort(initialNode?.port ? String(initialNode.port) : '443');
    setUuid(initialNode?.uuid ?? '');
    setPassword(initialNode?.password ?? '');
    setUsername(initialNode?.username ?? '');
    setCipher(initialNode?.cipher ?? 'aes-256-gcm');
    setUdp(initialNode?.udp ?? true);
    setTls(initialNode?.tls ?? false);
    setSni(initialNode?.sni ?? initialNode?.servername ?? '');
    setSkipCertVerify(initialNode?.['skip-cert-verify'] ?? false);
    setFlow(initialNode?.flow ?? '');
    setNetwork(initialNode?.network ?? 'tcp');
    setWsPath(initialNode?.['ws-opts']?.path ?? '');
    const hostVal = initialNode?.['ws-opts']?.headers?.Host ?? initialNode?.['ws-opts']?.host;
    setWsHost(Array.isArray(hostVal) ? (hostVal[0] ?? '') : (hostVal ?? ''));
    setGrpcService(initialNode?.['grpc-opts']?.['grpc-service-name'] ?? '');
  }, [open, initialNode]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('sources.nodeNameRequired'));
      setTab('basic');
      return;
    }
    const parsedPort = Number(port);
    if (
      type !== 'tailscale' &&
      (!server.trim() || !Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)
    ) {
      setError(t('sources.nodeEndpointRequired'));
      setTab('basic');
      return;
    }

    const next: ProxyNode = {
      ...(initialNode ?? {}),
      name: trimmedName,
      type,
      udp,
    };

    if (type !== 'tailscale') {
      next.server = server.trim();
      next.port = parsedPort;
    }

    if (type === 'vmess' || type === 'vless' || type === 'tuic') {
      if (uuid.trim()) next.uuid = uuid.trim();
    }
    if (
      type === 'ss' ||
      type === 'trojan' ||
      type === 'hysteria2' ||
      type === 'anytls' ||
      type === 'tuic' ||
      type === 'http' ||
      type === 'socks5'
    ) {
      if (password.trim()) next.password = password.trim();
    }
    if (type === 'http' || type === 'socks5') {
      if (username.trim()) next.username = username.trim();
    }
    if (type === 'ss' || type === 'vmess') {
      if (cipher.trim()) next.cipher = cipher.trim();
    }

    next.tls = tls;
    if (sni.trim()) next.sni = sni.trim();
    else delete next.sni;
    next['skip-cert-verify'] = skipCertVerify;
    if (flow.trim()) next.flow = flow.trim();
    else delete next.flow;

    if (network && network !== 'tcp') {
      next.network = network;
      if (network === 'ws') {
        next['ws-opts'] = {
          ...(next['ws-opts'] ?? {}),
          ...(wsPath.trim() ? { path: wsPath.trim() } : {}),
          ...(wsHost.trim()
            ? { headers: { ...(next['ws-opts']?.headers ?? {}), Host: wsHost.trim() } }
            : {}),
        };
      } else if (network === 'grpc' && grpcService.trim()) {
        next['grpc-opts'] = {
          ...(next['grpc-opts'] ?? {}),
          'grpc-service-name': grpcService.trim(),
        };
      }
    } else {
      delete next.network;
    }

    onSave(next);
  }

  const usesUuid = type === 'vless' || type === 'vmess' || type === 'tuic';
  const usesPassword =
    type === 'ss' ||
    type === 'trojan' ||
    type === 'hysteria2' ||
    type === 'anytls' ||
    type === 'tuic' ||
    type === 'http' ||
    type === 'socks5';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initialNode ? t('sources.editNode') : t('sources.addNode')}</DialogTitle>
          <DialogDescription>{t('sources.nodeFormHint')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">{t('sources.nodeTabBasic')}</TabsTrigger>
              <TabsTrigger value="auth">{t('sources.nodeTabAuth')}</TabsTrigger>
              <TabsTrigger value="transport">{t('sources.nodeTabTransport')}</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="mt-4 space-y-3 outline-none">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="node-name">{t('sources.name')}</Label>
                  <Input
                    id="node-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="HK 01"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('processors.type')}</Label>
                  <Select value={type} onValueChange={(v) => setType(v as ProxyType)}>
                    <SelectTrigger className="w-full uppercase">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROXY_TYPES.map((item) => (
                        <SelectItem key={item} value={item} className="uppercase">
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {type !== 'tailscale' ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="node-server">{t('processors.server')}</Label>
                    <Input
                      id="node-server"
                      value={server}
                      onChange={(e) => setServer(e.target.value)}
                      placeholder="example.com"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="node-port">{t('processors.port')}</Label>
                    <Input
                      id="node-port"
                      type="number"
                      inputMode="numeric"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="node-udp" className="text-sm font-normal">
                  UDP
                </Label>
                <Switch id="node-udp" checked={udp} onCheckedChange={setUdp} />
              </div>
            </TabsContent>

            <TabsContent value="auth" className="mt-4 space-y-3 outline-none">
              {usesUuid ? (
                <div className="space-y-1.5">
                  <Label htmlFor="node-uuid">UUID</Label>
                  <Input
                    id="node-uuid"
                    value={uuid}
                    onChange={(e) => setUuid(e.target.value)}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="font-mono text-xs"
                  />
                </div>
              ) : null}

              {type === 'http' || type === 'socks5' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="node-user">Username</Label>
                  <Input
                    id="node-user"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              ) : null}

              {usesPassword ? (
                <div className="space-y-1.5">
                  <Label htmlFor="node-pass">{t('auth.password')}</Label>
                  <Input
                    id="node-pass"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              ) : null}

              {type === 'ss' || type === 'vmess' ? (
                <div className="space-y-1.5">
                  <Label>Cipher</Label>
                  <Select value={cipher} onValueChange={setCipher}>
                    <SelectTrigger className="w-full font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SS_CIPHERS.map((c) => (
                        <SelectItem key={c} value={c} className="font-mono text-xs">
                          {c}
                        </SelectItem>
                      ))}
                      {type === 'vmess' ? (
                        <SelectItem value="auto" className="font-mono text-xs">
                          auto
                        </SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {type === 'vless' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="node-flow">Flow</Label>
                  <Input
                    id="node-flow"
                    value={flow}
                    onChange={(e) => setFlow(e.target.value)}
                    placeholder="xtls-rprx-vision"
                    className="font-mono text-xs"
                  />
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="transport" className="mt-4 space-y-3 outline-none">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Network</Label>
                  <Select value={network} onValueChange={setNetwork}>
                    <SelectTrigger className="w-full font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp">tcp</SelectItem>
                      <SelectItem value="ws">ws</SelectItem>
                      <SelectItem value="grpc">grpc</SelectItem>
                      <SelectItem value="h2">h2</SelectItem>
                      <SelectItem value="xhttp">xhttp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="node-sni">SNI</Label>
                  <Input
                    id="node-sni"
                    value={sni}
                    onChange={(e) => setSni(e.target.value)}
                    placeholder="cdn.example.com"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              {network === 'ws' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="node-ws-path">WS Path</Label>
                    <Input
                      id="node-ws-path"
                      value={wsPath}
                      onChange={(e) => setWsPath(e.target.value)}
                      placeholder="/ws"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="node-ws-host">WS Host</Label>
                    <Input
                      id="node-ws-host"
                      value={wsHost}
                      onChange={(e) => setWsHost(e.target.value)}
                      placeholder="cdn.example.com"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              ) : null}

              {network === 'grpc' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="node-grpc">gRPC Service Name</Label>
                  <Input
                    id="node-grpc"
                    value={grpcService}
                    onChange={(e) => setGrpcService(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <Label htmlFor="node-tls" className="text-sm font-normal">
                    TLS
                  </Label>
                  <Switch id="node-tls" checked={tls} onCheckedChange={setTls} />
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <Label htmlFor="node-skip-cert" className="text-sm font-normal">
                    {t('sources.skipCertVerify')}
                  </Label>
                  <Switch
                    id="node-skip-cert"
                    checked={skipCertVerify}
                    onCheckedChange={setSkipCertVerify}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
