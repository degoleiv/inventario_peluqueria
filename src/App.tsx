import { useCallback, useState } from "react";
import { HashRouter } from "react-router-dom";
import { hasValidSession } from "./auth/token";
import { LoginPage } from "./pages/LoginPage";
import { AuthenticatedRoutes } from "./AuthenticatedShell";

function App() {
  const [sessionKey, setSessionKey] = useState(0);
  const onLoggedIn = useCallback(() => setSessionKey((k) => k + 1), []);

  if (!hasValidSession()) {
    return <LoginPage onLoggedIn={onLoggedIn} />;
  }

  return (
    <HashRouter key={sessionKey}>
      <AuthenticatedRoutes />
    </HashRouter>
  );
}

export default App;
export type { NavKey } from "./nav";
