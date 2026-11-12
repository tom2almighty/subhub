import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from './api';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useMe();
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }
  if (isError || !data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
