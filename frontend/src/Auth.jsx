import { useEffect, useState } from "react";
import { login, loginGoogle, setToken, signup } from "./api";
import Logo from "./Logo";
import { googleIdToken, googleRedirectToken } from "./firebase";
import TechScene from "./Scene";

function GoogleButton({ onClick, disabled }) {
  return (
    <button type="button" className="google-btn" onClick={onClick} disabled={disabled}>
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" />
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" />
      </svg>
      Continuer avec Google
    </button>
  );
}

export default function Auth({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const enter = (session) => {
    setToken(session.token);
    onAuth(session.user);
  };

  useEffect(() => {
    let stop = false;
    googleRedirectToken()
      .then(async (token) => {
        if (!token || stop) return;
        setBusy(true);
        try {
          const session = await loginGoogle(token);
          if (stop) return;
          setToken(session.token);
          onAuth(session.user);
        } catch (err) {
          if (!stop) {
            setError(err.message);
            setBusy(false);
          }
        }
      })
      .catch((err) => {
        if (!stop) setError(err.message || "La connexion Google a échoué.");
      });
    return () => { stop = true; };
  }, [onAuth]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (mode === "signup" && password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const session = mode === "signup"
        ? await signup({ name, email, password })
        : await login({ email, password });
      enter(session);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const withGoogle = async () => {
    setBusy(true); setError("");
    try {
      enter(await loginGoogle(await googleIdToken()));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="gate">
      <TechScene />
      <section className="gate-copy">
        <p className="kicker">ATELIER LOGICIEL</p>
        <h1>De l’idée au système.</h1>
        <p>Trois étapes sur le même projet : les données, l’interface, puis la présentation.</p>
        <ul>
          <li>Données, interface v0 et diaporama Gamma</li>
          <li>Prompt améliorable sans repartir de zéro</li>
          <li>Connexion e-mail ou Gmail</li>
        </ul>
      </section>
      <section className="gate-card">
        <Logo />
        <div className="switch">
          <button type="button" className={mode === "login" ? "on" : ""} onClick={() => { setMode("login"); setError(""); }}>Connexion</button>
          <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => { setMode("signup"); setError(""); }}>Inscription</button>
        </div>
        <h2>{mode === "login" ? "Reprendre la session" : "Créer un compte"}</h2>
        <GoogleButton onClick={withGoogle} disabled={busy} />
        <div className="or">ou avec un e-mail</div>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label>Nom
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ton nom" />
            </label>
          )}
          <label>E-mail
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="toi@gmail.com" />
          </label>
          <label>Mot de passe
            <input type="password" required minLength={mode === "signup" ? 8 : 1} value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "8 caractères minimum" : "Ton mot de passe"} />
          </label>
          {mode === "signup" && (
            <label>Confirmer
              <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="Répète le mot de passe" />
            </label>
          )}
          {error && <p className="err">⚠️ {error}</p>}
          <button className="go wide" type="submit" disabled={busy}>{busy ? "Connexion…" : mode === "login" ? "Entrer" : "Créer le compte"}</button>
        </form>
      </section>
    </div>
  );
}
