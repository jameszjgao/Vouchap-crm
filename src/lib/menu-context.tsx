import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { MenuKey } from './menu-permissions';

type MenuPermissionsContextValue = {
  allowed: Set<MenuKey>;
  can: (key: MenuKey) => boolean;
};

const MenuPermissionsContext = createContext<MenuPermissionsContextValue | null>(null);

export function MenuPermissionsProvider({
  allowed,
  children,
}: {
  allowed: Set<MenuKey>;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      allowed,
      can: (key: MenuKey) => allowed.has(key),
    }),
    [allowed]
  );
  return (
    <MenuPermissionsContext.Provider value={value}>
      {children}
    </MenuPermissionsContext.Provider>
  );
}

export function useMenuPermissions(): MenuPermissionsContextValue {
  const ctx = useContext(MenuPermissionsContext);
  if (!ctx) return { allowed: new Set(), can: () => false };
  return ctx;
}
