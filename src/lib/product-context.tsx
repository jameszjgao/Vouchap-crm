import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CRM_PRODUCTS, DEFAULT_PRODUCT_ID, isProductId, type ProductId } from './products';

const STORAGE_KEY = 'adaven-crm-product';

type ProductContextValue = {
  productId: ProductId;
  setProductId: (id: ProductId) => void;
};

const ProductContext = createContext<ProductContextValue | null>(null);

export function ProductProvider({ children }: { children: ReactNode }) {
  const [productId, setProductIdState] = useState<ProductId>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && isProductId(stored)) return stored;
    } catch {
      /* ignore */
    }
    return DEFAULT_PRODUCT_ID;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, productId);
    } catch {
      /* ignore */
    }
  }, [productId]);

  const value = useMemo(
    () => ({
      productId,
      setProductId: setProductIdState,
    }),
    [productId],
  );

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProduct(): ProductContextValue {
  const ctx = useContext(ProductContext);
  if (!ctx) {
    return {
      productId: DEFAULT_PRODUCT_ID,
      setProductId: () => undefined,
    };
  }
  return ctx;
}

export { CRM_PRODUCTS };
