import { zodResolver } from '@hookform/resolvers/zod';
import { SiGithub } from '@icons-pack/react-simple-icons';
import {
  changePasswordSchema,
  type SubscriptionPaths,
  subscriptionPathsSchema,
} from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Loader2, LogOut } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { z } from 'zod';
import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';

type PasswordValues = z.infer<typeof changePasswordSchema>;

const GITHUB_URL = 'https://github.com/tom2almighty/subhub';
const GITHUB_REPO = 'tom2almighty/subhub';

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<PasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const settings = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const pathsForm = useForm<SubscriptionPaths>({
    resolver: zodResolver(subscriptionPathsSchema),
    defaultValues: { privatePath: '', sharePath: '' },
  });

  useEffect(() => {
    if (settings.data) pathsForm.reset(settings.data);
  }, [settings.data, pathsForm]);

  const updatePaths = useMutation({
    mutationFn: (values: SubscriptionPaths) => api.updateSettings(values),
    onSuccess: (data) => {
      pathsForm.reset(data);
      queryClient.setQueryData(['settings'], data);
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
      void queryClient.invalidateQueries({ queryKey: ['output'] });
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
      toast.success(t('settings.pathsSaved'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changePassword = useMutation({
    mutationFn: (values: PasswordValues) =>
      api.changePassword(values.currentPassword, values.newPassword),
    onSuccess: () => {
      form.reset();
      toast.success(t('auth.passwordChanged'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear();
      navigate('/login', { replace: true });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t('settings.title')} />

      <Tabs defaultValue="account" className="min-h-0 flex-1 flex flex-col">
        <TabsList className="w-full shrink-0 grid grid-cols-4 sm:w-fit sm:inline-flex">
          <TabsTrigger value="account" className="text-xs sm:text-sm px-2 sm:px-4">
            {t('settings.tabs.account')}
          </TabsTrigger>
          <TabsTrigger value="paths" className="text-xs sm:text-sm px-2 sm:px-4">
            {t('settings.tabs.paths')}
          </TabsTrigger>
          <TabsTrigger value="security" className="text-xs sm:text-sm px-2 sm:px-4">
            {t('settings.tabs.security')}
          </TabsTrigger>
          <TabsTrigger value="about" className="text-xs sm:text-sm px-2 sm:px-4">
            {t('settings.tabs.about')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="mt-4 min-h-0 flex-1 overflow-y-auto outline-none">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>{t('settings.account')}</CardTitle>
              <CardDescription>{t('settings.singleUserHint')}</CardDescription>
            </CardHeader>
            <CardFooter className="pt-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                <LogOut className="size-4 mr-1.5" />
                {t('auth.logout')}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="paths" className="mt-4 min-h-0 flex-1 overflow-y-auto outline-none">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>{t('settings.paths')}</CardTitle>
              <CardDescription>{t('settings.pathsHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                id="paths-form"
                className="space-y-4"
                onSubmit={pathsForm.handleSubmit((values) => updatePaths.mutate(values))}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="private-path">{t('settings.privatePath')}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-muted-foreground">/</span>
                    <Input
                      id="private-path"
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono text-sm"
                      {...pathsForm.register('privatePath')}
                    />
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">/…</span>
                  </div>
                  {pathsForm.formState.errors.privatePath ? (
                    <p className="text-xs text-destructive">
                      {pathsForm.formState.errors.privatePath.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="share-path">{t('settings.sharePath')}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-muted-foreground">/</span>
                    <Input
                      id="share-path"
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono text-sm"
                      {...pathsForm.register('sharePath')}
                    />
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">/…</span>
                  </div>
                  {pathsForm.formState.errors.sharePath ? (
                    <p className="text-xs text-destructive">
                      {pathsForm.formState.errors.sharePath.message}
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{t('settings.pathHint')}</p>
              </form>
            </CardContent>
            <CardFooter className="justify-end border-t pt-4">
              <Button
                type="submit"
                form="paths-form"
                disabled={updatePaths.isPending || settings.isLoading}
              >
                {updatePaths.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                {t('common.save')}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4 min-h-0 flex-1 overflow-y-auto outline-none">
          <Card className="max-w-xl">
            <CardHeader>
              <CardTitle>{t('settings.security')}</CardTitle>
              <CardDescription>{t('settings.securityHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((values) => changePassword.mutate(values))}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="current-password">{t('auth.currentPassword')}</Label>
                  <Input
                    id="current-password"
                    type="password"
                    autoComplete="current-password"
                    {...form.register('currentPassword')}
                  />
                  {form.formState.errors.currentPassword ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.currentPassword.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">{t('auth.newPassword')}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    {...form.register('newPassword')}
                  />
                  {form.formState.errors.newPassword ? (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.newPassword.message}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t('auth.passwordHint')}</p>
                  )}
                </div>
                <div className="pt-2">
                  <Button type="submit" disabled={changePassword.isPending}>
                    {changePassword.isPending ? (
                      <Loader2 className="size-4 animate-spin mr-1.5" />
                    ) : null}
                    {t('auth.changePassword')}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="about" className="mt-4 min-h-0 flex-1 overflow-y-auto outline-none">
          <Card className="max-w-xl overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 p-4 text-sm">
              <span className="text-muted-foreground">{t('settings.version')}</span>
              <span className="font-mono text-xs font-medium text-foreground">
                {t('app.name')} {__APP_VERSION__}
              </span>
            </div>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 border-t p-4 text-sm transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center gap-2 font-medium">
                <SiGithub size={16} color="currentColor" className="text-muted-foreground" />
                {t('settings.github')}
              </span>
              <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                {GITHUB_REPO}
                <ArrowUpRight className="size-3.5" />
              </span>
            </a>
            <div className="flex items-center justify-between gap-3 border-t p-4 text-sm">
              <span className="text-muted-foreground">{t('settings.license')}</span>
              <Badge variant="outline" className="font-mono text-xs">
                AGPL-3.0
              </Badge>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
