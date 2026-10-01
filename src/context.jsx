import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, setCsrf, today } from './lib/api';
import { featureAvailable } from '../shared/catalog';
const emptyNotifications = { items: [], unread: 0, total: 0, page: 1, pages: 1, loading: false };
const isAblating = (error) => ['AUTH_REQUIRED', 'PASSWORD_CHANGE_REQUIRED'].includes(error?.code);
const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);
export function useApi(path, extra = 0) {
  const [state, setState] = useState({ data: null, loading: !!path, error: null });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let live = true;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api(path, { signal: controller.signal })
      .then((data) => {
        if (live) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (live && error.name !== 'AbortError') setState({ data: null, loading: false, error });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [path, revision, extra]);
  return { ...state, refresh };
}
export function AppProvider({ children }) {
  const [session, setSession] = useState(null),
    [config, setConfig] = useState(null),
    [lookups, setLookups] = useState({}),
    [notifications, setNotifications] = useState(emptyNotifications),
    [refreshKey, setRefreshKey] = useState(0),
    [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState(null),
    [toasts, setToasts] = useState([]);
  const timers = useRef([]);
  const toast = useCallback((message, type = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, message, type }]);
    timers.current.push(setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000));
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const dismissToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  const refreshConfig = useCallback(async () => {
    const c = await api('/config');
    setConfig(c);
    return c;
  }, []);
  const refreshLookups = useCallback(async () => {
    const l = await api('/lookups');
    setLookups(l);
    return l;
  }, []);
  const refreshNotifications = useCallback(async (page = 1) => {
    try {
      setNotifications((state) => ({ ...state, loading: true }));
      const result = await api(`/notifications?paginated=1&page=${page}&limit=30`);
      setNotifications((state) => ({
        ...state,
        loading: false,
        page: result.page,
        pages: result.pages,
        total: result.total,
        unread: result.unread,
        items: page === 1 ? result.rows : [...state.items, ...result.rows],
      }));
    } catch (e) {
      setNotifications((state) => ({ ...state, loading: false }));
      if (e.status !== 403) throw e;
    }
  }, []);
  const markNotifications = useCallback(async (id) => {
    await api('/notifications/read', { method: 'PATCH', body: id ? { id } : {} });
    setNotifications((state) => ({
      ...state,
      unread: id ? Math.max(0, state.unread - 1) : 0,
      items: state.items.map((item) => (!id || item.id === id ? { ...item, is_read: 1 } : item)),
    }));
  }, []);
  const notificationChanged = useCallback(() => setRefreshKey((key) => key + 1), []);
  const resetSession = useCallback(() => {
    setSession((state) => ({ ...(state || {}), user: null, csrf: null }));
    setCsrf(null);
    setConfig(null);
    setNotifications(emptyNotifications);
    setLookups({});
  }, []);
  // Data calls fail closed: an ended session shows the login screen instead of a broken page.
  const guard = useCallback(
    async (promise) => {
      try {
        return await promise;
      } catch (error) {
        if (isAblating(error)) {
          resetSession();
          setFatal(error.message);
        }
        throw error;
      }
    },
    [resetSession],
  );
  const acceptSession = useCallback(
    async (response, base = {}) => {
      setCsrf(response.csrf);
      const current = { ...base, ...response };
      setSession(current);
      const c = await refreshConfig();
      if (!response.user.must_change_password) {
        await refreshLookups();
        if (featureAvailable(c, response.user.role, 'notifications.view'))
          await refreshNotifications();
        else setNotifications(emptyNotifications);
      }
      return current;
    },
    [refreshConfig, refreshLookups, refreshNotifications],
  );
  const bootstrap = useCallback(async () => {
    setLoading(true);
    setFatal(null);
    try {
      let me = await api('/auth/me');
      setCsrf(me.csrf);
      if (
        me.installed &&
        me.demo &&
        !me.user &&
        sessionStorage.getItem('demo-logged-out') !== 'yes'
      )
        me = { ...me, ...(await api('/auth/demo', { method: 'POST', body: { role: 'admin' } })) };
      if (me.user) await acceptSession(me, me);
      else {
        setSession(me);
        setConfig(null);
        setLookups({});
      }
    } catch (e) {
      setFatal(e.message);
    } finally {
      setLoading(false);
    }
  }, [acceptSession]);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);
  const login = async (username, password) => {
    sessionStorage.removeItem('demo-logged-out');
    const response = await api('/auth/login', { method: 'POST', body: { username, password } });
    await acceptSession(response, session);
  };
  const refreshAll = useCallback(async () => {
    const c = await refreshConfig();
    const current = session?.user;
    if (current && !current.must_change_password) {
      await refreshLookups();
      if (featureAvailable(c, current.role, 'notifications.view')) await refreshNotifications();
    }
    return c;
  }, [refreshConfig, refreshLookups, refreshNotifications, session]);
  const switchRole = async (role) => {
    sessionStorage.removeItem('demo-logged-out');
    const response = await api('/auth/demo', { method: 'POST', body: { role } });
    await acceptSession(response, session);
    toast('پنل نقش انتخاب‌شده آماده است.');
  };
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {
      /* the session may already be over */
    }
    sessionStorage.setItem('demo-logged-out', 'yes');
    resetSession();
  };
  const can = useCallback(
    (id) => featureAvailable(config, session?.user?.role, id),
    [config, session],
  );
  const moduleOn = (id) => !!config?.modules.find((m) => m.id === id)?.enabled;
  return (
    <AppContext.Provider
      value={{
        session,
        user: session?.user,
        refreshKey,
        today,
        guard,
        resetSession,
        refreshAll,
        markNotifications,
        notificationChanged,
        config,
        setConfig,
        lookups,
        loading,
        fatal,
        toasts,
        toast,
        dismissToast,
        bootstrap,
        acceptSession,
        login,
        switchRole,
        logout,
        can,
        moduleOn,
        refreshConfig,
        refreshLookups,
        notifications,
        refreshNotifications,
        setNotifications,
        setSession,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
