import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@subhub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { password: '' },
  });

  const login = useMutation({
    mutationFn: (values: LoginValues) => api.login(values.password),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], data);
      navigate('/sources', { replace: true });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('auth.invalid'));
    },
  });

  if (me) return <Navigate to="/sources" replace />;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-sm border shadow-sm">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-muted/60 p-2 shadow-xs">
            <img src="/favicon.svg" alt="" className="size-8 rounded" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">{t('app.name')}</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            {t('app.tagline')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => login.mutate(values))}
          >
            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-medium">
                {t('auth.password')}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9 h-10"
                  autoFocus
                  {...form.register('password')}
                />
              </div>
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
            <Button className="w-full h-10" type="submit" disabled={login.isPending}>
              {login.isPending ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <ArrowRight className="size-4 mr-1.5" />
              )}
              {t('auth.signIn')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
