import { createContext, useContext, useMemo } from "react";

interface TenantConfig {
  id: string;
  name: string;
  subtitle: string;
  logo: string;
  pageTitle: string;
  brandColor?: string;
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
    id: "ama",
    name: "AMA GLOBAL",
    subtitle: "AI ENTERPRISE PLATFORM",
    logo: "",
    pageTitle: "AMA Global — AI Enterprise Platform",
    brandColor: "#00AEEF",
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

  // persistent/ama subdomains must be checked before cogniify (since they contain cogniify.ai)
  if (hostname.includes("persistent")) {
    return TENANTS.find((t) => t.id === "persistent")!;
  }
  if (hostname.includes("ama")) {
    return TENANTS.find((t) => t.id === "ama")!;
  }

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
