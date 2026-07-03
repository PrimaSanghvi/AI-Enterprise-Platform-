import { createContext, useContext, useState, useEffect } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Light is the default for every first-time visitor, regardless of the
  // browser/OS color-scheme preference — we never read matchMedia here.
  // Only a previously-saved user choice (set via toggleTheme, post-login)
  // can override it.
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("cogniify_theme");
    return stored === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    localStorage.setItem("cogniify_theme", theme);
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
