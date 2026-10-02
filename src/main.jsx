import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import '@fontsource-variable/vazirmatn';
import './styles.css';
import './polish.css';
import { AppProvider, useApp } from './context';
import { featureAvailable } from '../shared/catalog';
import { loadCachedUiTheme } from './lib/ui-theme';
// پالت انتخابی مدیر باید قبل از اولین رنگ‌آمیزی صفحه اعمال شود تا ورودی‌ها
// و صفحهٔ ورود هم با همان تم دیده شوند (مقدار از /api/config هم دوباره همگام می‌شود).
loadCachedUiTheme();
const routeFeatures = {
  students: 'students.view',
  teachers: 'teachers.view',
  classes: 'classes.view',
  education: 'subjects.view',
  finance: 'invoices.view',
  library: 'books.view',
  services: 'routes.view',
  announcements: 'announcements.view',
  attendance: 'attendance.view',
  tickets: 'tickets.view',
  calendar: 'events.view',
  reports: 'reports.view',
  notifications: 'notifications.view',
  meetings: 'meeting_slots.view',
  modules: 'settings.modules',
  settings: 'settings.school',
};
import Layout from './components/Layout';
import { Button, Empty, ErrorBox, Icon, Loading, Toasts } from './components/ui';
import { ForcedPassword } from './components/PasswordForm';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Resources = lazy(() => import('./pages/Resources'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Tickets = lazy(() => import('./pages/Tickets'));
const Modules = lazy(() => import('./pages/Modules'));
const Reports = lazy(() => import('./pages/Reports'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Settings = lazy(() => import('./pages/Settings'));
const Profile = lazy(() => import('./pages/Profile'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Auth = lazy(() => import('./pages/Auth'));
const Install = lazy(() => import('./pages/Install'));
const Meetings = lazy(() => import('./pages/Meetings'));
const PrintCards = lazy(() => import('./pages/PrintCards'));
class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error) {
    console.error(error);
  }
  render() {
    return this.state.error ? (
      <div className="boot-screen">
        <ErrorBox error="نمایش صفحه با مشکل روبه‌رو شد. صفحه را تازه کنید." />
        <Button onClick={() => window.location.reload()}>بارگذاری دوباره</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Guarded({ feature, children }) {
  const { config, user } = useApp();
  if (feature && !featureAvailable(config, user?.role, feature))
    return <Navigate to="/" replace state={{ denied: true }} />;
  return children;
}
function App() {
  const { loading, fatal, bootstrap, user, session, toasts, dismissToast, logout } = useApp(),
    location = useLocation();
  if (loading)
    return (
      <div className="boot-screen">
        <span className="brand-icon">
          <Icon name="GraduationCap" size={38} />
        </span>
        <h1>مدرسه‌یار</h1>
        <p>همه‌چیز برای یک شروع خوب...</p>
        <div className="boot-progress">
          <span />
        </div>
      </div>
    );
  if (fatal)
    return (
      <div className="boot-screen">
        <ErrorBox error={fatal} onRetry={bootstrap} />
      </div>
    );
  if (!session?.installed && location.pathname !== '/install')
    return <Navigate to="/install" replace />;
  return (
    <>
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="route-loading">
              <Loading rows={5} />
            </div>
          }
        >
          {user?.must_change_password ? (
            <div className="boot-screen">
              <span className="brand-icon">
                <Icon name="GraduationCap" size={32} />
              </span>
              <h1>مدرسه‌یار</h1>
              <p>یک قدم تا ورود امن</p>
              <Button variant="secondary" onClick={() => logout()}>
                خروج از حساب
              </Button>
              <ForcedPassword />
            </div>
          ) : (
            <Routes>
              <Route path="/install" element={<Install />} />
              <Route path="/login" element={user ? <Navigate to="/" replace /> : <Auth />} />
              <Route
                path="/print/cards/:classId?"
                element={
                  user ? <PrintCards /> : <Navigate to="/login" replace state={{ print: true }} />
                }
              />
              <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
                <Route index element={<Dashboard />} />
                {[
                  'students',
                  'teachers',
                  'classes',
                  'education',
                  'finance',
                  'library',
                  'services',
                  'announcements',
                ].map((id) => (
                  <Route
                    key={id}
                    path={id}
                    element={
                      <Guarded feature={routeFeatures[id]}>
                        <Resources moduleId={id} />
                      </Guarded>
                    }
                  />
                ))}
                <Route
                  path="attendance"
                  element={
                    <Guarded feature={routeFeatures.attendance}>
                      <Attendance />
                    </Guarded>
                  }
                />
                <Route
                  path="tickets"
                  element={
                    <Guarded feature={routeFeatures.tickets}>
                      <Tickets />
                    </Guarded>
                  }
                />
                <Route
                  path="meetings"
                  element={
                    <Guarded feature={routeFeatures.meetings}>
                      <Meetings />
                    </Guarded>
                  }
                />
                <Route
                  path="calendar"
                  element={
                    <Guarded feature={routeFeatures.calendar}>
                      <Calendar />
                    </Guarded>
                  }
                />
                <Route
                  path="modules"
                  element={
                    <Guarded feature={routeFeatures.modules}>
                      <Modules />
                    </Guarded>
                  }
                />
                <Route
                  path="reports"
                  element={
                    <Guarded feature={routeFeatures.reports}>
                      <Reports />
                    </Guarded>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <Guarded feature={routeFeatures.settings}>
                      <Settings />
                    </Guarded>
                  }
                />
                <Route path="profile" element={<Profile />} />
                <Route path="notifications" element={<Notifications />} />
                <Route
                  path="*"
                  element={
                    <div className="panel">
                      <Empty
                        title="این صفحه پیدا نشد"
                        description="از منوی مدرسه وارد بخش مورد نظرتان شوید."
                        icon="Search"
                        action={
                          <Link className="btn btn-primary" to="/">
                            بازگشت به داشبورد
                          </Link>
                        }
                      />
                    </div>
                  }
                />
              </Route>
            </Routes>
          )}
        </Suspense>
      </ErrorBoundary>
      <Toasts toasts={toasts} dismiss={dismissToast} />
    </>
  );
}
const basename =
  import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/'
    ? import.meta.env.BASE_URL.replace(/\/$/, '')
    : undefined;
createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={basename}>
    <AppProvider>
      <App />
    </AppProvider>
  </BrowserRouter>,
);
