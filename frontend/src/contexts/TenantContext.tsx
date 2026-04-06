import { createContext, useContext, useMemo } from "react";

interface TenantConfig {
  id: string;
  name: string;
  subtitle: string;
  logo: string;
  pageTitle: string;
}

const TENANTS: TenantConfig[] = [
  {
    id: "cogniify",
    name: "COGNIIFY",
    subtitle: "AI ENTERPRISE PLATFORM",
    logo: "/cogniify_logo.png",
    pageTitle: "Cogniify — AI Enterprise Platform",
  },
  {
    id: "persistent",
    name: "PERSISTENT",
    subtitle: "AI ENTERPRISE PLATFORM",
    logo: "/persistent_logo.png",
    pageTitle: "Persistent — AI Enterprise Platform",
  },
  {
    id: "rialto",
    name: "RIALTO",
    subtitle: "AI ENTERPRISE PLATFORM",
    logo: "/cogniify_logo.png",
    pageTitle: "Rialto — AI Enterprise Platform",
  },
];

const DEFAULT_TENANT = TENANTS[0]; // cogniify

function resolveTenant(): TenantConfig {
  const hostname = window.location.hostname;

  for (const tenant of TENANTS) {
    if (hostname.includes(tenant.id)) {
      return tenant;
    }
  }

  // Fallback: localhost or unknown → cogniify
  return DEFAULT_TENANT;
}

const TenantContext = createContext<TenantConfig>(DEFAULT_TENANT);

export function useTenant() {
  return useContext(TenantContext);
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const tenant = useMemo(() => resolveTenant(), []);

  // Update browser tab title
  useMemo(() => {
    document.title = tenant.pageTitle;
  }, [tenant]);

  return (
    <TenantContext.Provider value={tenant}>
      {children}
    </TenantContext.Provider>
  );
}
