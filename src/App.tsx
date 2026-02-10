import { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { getCurrentOpsUser, signOut, OpsUser } from './lib/ops-auth';
import { getMyMenuPermissions, getDefaultMenuPermissions, MENU_KEYS, type MenuKey } from './lib/menu-permissions';
import { MenuPermissionsProvider } from './lib/menu-context';
import './App.css';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Skus = lazy(() => import('./pages/Skus'));
const SpaceOrders = lazy(() => import('./pages/SpaceOrders'));
const Leads = lazy(() => import('./pages/Leads'));
const OpsUsers = lazy(() => import('./pages/OpsUsers'));
const RolePermissions = lazy(() => import('./pages/RolePermissions'));
const Sidebar = lazy(() => import('./components/Sidebar'));
const Header = lazy(() => import('./components/Header'));

function DefaultRedirect({ allowed }: { allowed: Set<MenuKey> }) {
  if (allowed.has(MENU_KEYS.OVERVIEW_PANORAMA)) return <Navigate to="/overview/panorama" replace />;
  if (allowed.has(MENU_KEYS.OVERVIEW_MY)) return <Navigate to="/overview/my" replace />;
  if (allowed.has(MENU_KEYS.CUSTOMERS_ALL)) return <Navigate to="/customers/all" replace />;
  if (allowed.has(MENU_KEYS.CUSTOMERS_MY)) return <Navigate to="/customers/my" replace />;
  if (allowed.has(MENU_KEYS.ORDERS_ALL)) return <Navigate to="/orders/all" replace />;
  if (allowed.has(MENU_KEYS.ORDERS_MY)) return <Navigate to="/orders/my" replace />;
  if (allowed.has(MENU_KEYS.SKU_EDITION)) return <Navigate to="/sku/edition" replace />;
  if (allowed.has(MENU_KEYS.SKU_ADDON)) return <Navigate to="/sku/addon" replace />;
  if (allowed.has(MENU_KEYS.TEAM_MEMBERS)) return <Navigate to="/team/members" replace />;
  if (allowed.has(MENU_KEYS.ROLES_PERMISSIONS)) return <Navigate to="/team/roles" replace />;
  return <Navigate to="/overview/my" replace />;
}

function App() {
  const [session, setSession] = useState<unknown>(null);
  const [opsUser, setOpsUser] = useState<OpsUser | null>(null);
  const [menuAllowed, setMenuAllowed] = useState<Set<MenuKey>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(s ?? null);
        if (!s?.user) {
          setOpsUser(null);
          setMenuAllowed(new Set());
          setLoading(false);
          return;
        }
        const user = await getCurrentOpsUser();
        if (!mounted) return;
        setOpsUser(user);
        setMenuAllowed(getDefaultMenuPermissions(user?.role ?? 'ops'));
        getMyMenuPermissions(user?.role ?? 'ops').then((set) => {
          if (mounted) setMenuAllowed(set);
        });
      } catch {
        if (mounted) {
          setSession(null);
          setOpsUser(null);
          setMenuAllowed(new Set());
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s ?? null);
      if (!s?.user) {
        setOpsUser(null);
        setMenuAllowed(new Set());
        return;
      }
      getCurrentOpsUser()
        .then((user) => {
          if (mounted && user) {
            setOpsUser(user);
            setMenuAllowed(getDefaultMenuPermissions(user.role));
            getMyMenuPermissions(user.role).then((set) => { if (mounted) setMenuAllowed(set); });
          }
        })
        .catch(() => { if (mounted) setOpsUser(null); });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setSession(null);
    setOpsUser(null);
    setMenuAllowed(new Set());
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader" />
        <p style={{ marginTop: '1rem', color: '#94a3b8' }}>加载中…</p>
      </div>
    );
  }

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="app-container">
        <Suspense
          fallback={
            <div className="loading-container">
              <div className="loader" />
              <p style={{ marginTop: '1rem', color: '#94a3b8' }}>加载中…</p>
            </div>
          }
        >
          {session && opsUser ? (
            <MenuPermissionsProvider allowed={menuAllowed}>
              <div className="crm-layout">
                <Sidebar opsUser={opsUser} onSignOut={handleSignOut} />
                <div className="crm-main">
                  <Header opsUser={opsUser} onSignOut={handleSignOut} />
                  <div className="crm-content">
                    <Routes>
                      <Route path="/" element={<DefaultRedirect allowed={menuAllowed} />} />
                      <Route path="/overview/panorama" element={<Dashboard opsUser={opsUser} mode="panorama" />} />
                      <Route path="/overview/my" element={<Dashboard opsUser={opsUser} mode="my" />} />
                      <Route path="/customers/all" element={<Leads opsUser={opsUser} view="all" />} />
                      <Route path="/customers/my" element={<Leads opsUser={opsUser} view="my" />} />
                      <Route path="/orders/all" element={<SpaceOrders opsUser={opsUser} view="all" />} />
                      <Route path="/orders/my" element={<SpaceOrders opsUser={opsUser} view="my" />} />
                      <Route path="/sku/edition" element={<Skus tab="edition" />} />
                      <Route path="/sku/addon" element={<Skus tab="addon" />} />
                      <Route path="/team/members" element={<OpsUsers />} />
                      <Route path="/team/roles" element={<RolePermissions />} />
                      <Route path="*" element={<DefaultRedirect allowed={menuAllowed} />} />
                    </Routes>
                  </div>
                </div>
              </div>
            </MenuPermissionsProvider>
          ) : (
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          )}
        </Suspense>
      </div>
    </Router>
  );
}

export default App;
