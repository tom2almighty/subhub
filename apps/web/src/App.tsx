import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireAuth } from '@/lib/auth';

const LoginPage = lazy(() =>
  import('@/pages/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const SourcesPage = lazy(() =>
  import('@/pages/SourcesPage').then((module) => ({ default: module.SourcesPage })),
);
const SourceDetailPage = lazy(() =>
  import('@/pages/SourceDetailPage').then((module) => ({ default: module.SourceDetailPage })),
);
const OutputsPage = lazy(() =>
  import('@/pages/OutputsPage').then((module) => ({ default: module.OutputsPage })),
);
const SharesPage = lazy(() =>
  import('@/pages/SharesPage').then((module) => ({ default: module.SharesPage })),
);
const OutputDetailPage = lazy(() =>
  import('@/pages/OutputDetailPage').then((module) => ({ default: module.OutputDetailPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);

function PageFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      {t('common.loading')}
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/sources" replace />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/sources/:id" element={<SourceDetailPage />} />
          <Route path="/outputs" element={<OutputsPage />} />
          <Route path="/outputs/:id" element={<OutputDetailPage />} />
          <Route path="/shares" element={<SharesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/sources" replace />} />
      </Routes>
    </Suspense>
  );
}
