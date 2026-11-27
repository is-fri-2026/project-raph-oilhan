import { type FormEvent, useState } from "react";
import { login } from "./auth";

/**
 * LoginPage — Custom sign-in form shown instead of redirecting to Keycloak.
 *
 * The user enters their credentials here; this component calls Keycloak's
 * token endpoint directly (Resource Owner Password Credentials grant) so the
 * Keycloak login UI is never visible to the user.
 *
 * @param onSuccess - Called once the user is authenticated.
 */
export default function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-backdrop">
      <div className="login-card">
        {/* Branding */}
        <div className="login-header">
          <p className="eyebrow">SOFTWARE · SECOND LIFE</p>
          <h1 className="login-title">Sign in</h1>
          <p className="login-subtitle">
            Help keep older devices alive by sharing software alternatives.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button
              className="notice-close"
              onClick={() => setError("")}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* Credentials form */}
        <form className="login-form" onSubmit={(e) => void handleSubmit(e)}>
          <label>
            Username or email
            <input
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user1 or you@example.com"
              disabled={loading}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
            />
          </label>

          <button className="button login-submit" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="login-note">
          Account creation is managed by an administrator.
        </p>
      </div>
    </div>
  );
}
