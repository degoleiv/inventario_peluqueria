import { useEffect, useState } from "react";
import {
  bootstrapAdmin,
  fetchBootstrapNeeded,
  loginApi,
} from "../api";
import { setAccessToken } from "../auth/token";
import "../App.css";

type Props = { onLoggedIn: () => void };

export function LoginPage({ onLoggedIn }: Props) {
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetchBootstrapNeeded();
        if (!cancel) setNeedsBootstrap(r.needed);
      } catch {
        if (!cancel) setNeedsBootstrap(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (needsBootstrap) {
        const r = await bootstrapAdmin({
          email,
          password,
          nombre: nombre.trim() || undefined,
        });
        setAccessToken(r.accessToken);
      } else {
        const r = await loginApi({ email, password });
        setAccessToken(r.accessToken);
      }
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de acceso");
    } finally {
      setLoading(false);
    }
  }

  if (needsBootstrap === null) {
    return (
      <div className="layout login-wrap">
        <p className="muted">Comprobando instalación…</p>
      </div>
    );
  }

  return (
    <div className="layout login-wrap">
      <section className="card login-card">
        <h1 className="title">Peluquería</h1>
        <p className="subtitle">
          {needsBootstrap
            ? "Creá el primer usuario administrador (solo esta vez)."
            : "Iniciá sesión con tu cuenta."}
        </p>
        {error ? (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        ) : null}
        <form className="form" onSubmit={onSubmit}>
          {needsBootstrap ? (
            <label className="field">
              <span>Nombre (opcional)</span>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </label>
          ) : null}
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              autoComplete={needsBootstrap ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="actions">
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? "Entrando…" : needsBootstrap ? "Crear administrador" : "Entrar"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
