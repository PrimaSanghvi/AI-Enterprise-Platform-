import { createContext, useContext, useEffect, useMemo } from "react";

interface TenantConfig {
  id: string;
  name: string;
  subtitle: string;
  logo: string;
  pageTitle: string;
  brandColor?: string;
}

// Brand logos are served from the GCS-backed branding endpoint (same one the
// deployed app uses: /api/backend/api/branding/logo/<brand>). In production the
// relative path resolves against the app's own domain; in local dev it points
// at the public deployment so logos load without running that backend locally.
// Override with VITE_BRANDING_BASE if the endpoint lives elsewhere.
const BRANDING_BASE =
  import.meta.env.VITE_BRANDING_BASE ??
  (import.meta.env.DEV
    ? "https://claims-os.cogniify.ai/api/backend/api/branding/logo"
    : "/api/backend/api/branding/logo");

/** URL of a brand's logo on the branding endpoint (empty for brands without one). */
function brandingLogo(brand: string): string {
  return `${BRANDING_BASE}/${brand}`;
}

const TENANTS: TenantConfig[] = [
  {
    id: "cogniify",
    name: "COGNIIFY",
    subtitle: "AI ENTERPRISE PLATFORM",
    logo: brandingLogo("cogniify"),
    pageTitle: "Cogniify — AI Enterprise Platform",
  },
  {
    id: "persistent",
    name: "PERSISTENT",
    subtitle: "AI ENTERPRISE PLATFORM",
    logo: brandingLogo("persistent"),
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
    logo: brandingLogo("cogniify"),
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

  // Update the browser tab title and favicon to the resolved brand. The favicon
  // reuses the same GCS-backed branding logo so each tenant gets its own tab icon.
  useEffect(() => {
    document.title = tenant.pageTitle;

    if (tenant.logo) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      // PNG from the branding endpoint; drop the SVG type so the browser sniffs it.
      link.removeAttribute("type");
      link.href = tenant.logo;
    }
  }, [tenant]);

  return (
    <TenantContext.Provider value={tenant}>
      {children}
    </TenantContext.Provider>
  );
}
