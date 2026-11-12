import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@subhub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
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
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t('app.name')}</CardTitle>
          <CardDescription>{t('app.tagline')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((values) => login.mutate(values))}
          >
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
              {form.formState.errors.password ? (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              ) : null}
            </div>
            <Button className="w-full" type="submit" disabled={login.isPending}>
              {login.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('auth.signIn')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
