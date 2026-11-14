import { useState } from "react";
import { saveProfile, skipOnboarding } from "./api";

const GEMINI_URL = "https://aistudio.google.com/apikey";
const V0_URL = "https://v0.app/chat/settings/keys";

export default function Onboarding({ onDone, onSkip, replay = false, initialStep = 0 }) {
  const [step, setStep] = useState(Math.min(initialStep, 2));
  const [gemini, setGemini] = useState("");
  const [v0, setV0] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setBusy(true); setError("");
    try {
      const profile = await saveProfile({
        geminiKey: gemini.trim() || null,
        v0Key: v0.trim() || null,
        finishOnboarding: true,
      });
      onDone(profile.user, profile);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const skip = async () => {
    if (replay) { onSkip(); return; }
    setBusy(true); setError("");
    try {
      onSkip(await skipOnboarding());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="guide">
      <section className="guide-card">
        <p className="kicker">GUIDE DES CLÉS · {step + 1}/3</p>
        <div className="steps" aria-hidden="true"><i className={step >= 0 ? "on" : ""} /><i className={step >= 1 ? "on" : ""} /><i className={step >= 2 ? "on" : ""} /></div>
        {step === 0 && (
          <>
            <h2>Les clés de l’atelier</h2>
            <p>Chaque compte garde ses propres clés. Gemini construit les données et le brief. v0 dessine l’interface. Gamma, pour la présentation, utilise la clé du serveur.</p>
            <div className="paths">
              <a href={GEMINI_URL} target="_blank" rel="noreferrer">1 · Clé Gemini<br /><span>aistudio.google.com/apikey</span></a>
              <a href={V0_URL} target="_blank" rel="noreferrer">2 · Clé v0<br /><span>v0.app → Settings → Keys</span></a>
            </div>
            <button className="go wide" type="button" onClick={() => setStep(1)}>Commencer par Gemini</button>
          </>
        )}
        {step === 1 && (
          <>
            <h2>Clé Gemini</h2>
            <ol className="path">
              <li>Ouvre Google AI Studio.</li>
              <li>Choisis <b>Get API key</b>, puis crée une clé.</li>
              <li>Copie-la et colle-la ci-dessous.</li>
            </ol>
            <a className="ext" href={GEMINI_URL} target="_blank" rel="noreferrer">Ouvrir la page de la clé Gemini</a>
            <label>Clé Gemini
              <input type="password" autoComplete="off" value={gemini} placeholder="AIza…" onChange={(e) => setGemini(e.target.value)} />
            </label>
            <div className="row-actions">
              <button type="button" onClick={() => setStep(0)}>Retour</button>
              <button className="go" type="button" onClick={() => setStep(2)}>Continuer vers v0</button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h2>Clé v0</h2>
            <ol className="path">
              <li>Ouvre les réglages de v0.</li>
              <li>Va dans <b>Settings</b>, puis <b>API Keys</b>.</li>
              <li>Crée une clé, copie-la et colle-la ici.</li>
            </ol>
            <a className="ext" href={V0_URL} target="_blank" rel="noreferrer">Ouvrir la page de la clé v0</a>
            <label>Clé v0
              <input type="password" autoComplete="off" value={v0} placeholder="v0_…" onChange={(e) => setV0(e.target.value)} />
            </label>
            <div className="row-actions">
              <button type="button" onClick={() => setStep(1)} disabled={busy}>Retour</button>
              <button className="go" type="button" onClick={finish} disabled={busy}>{busy ? "Enregistrement…" : "Entrer dans l’atelier"}</button>
            </div>
          </>
        )}
        {error && <p className="err">⚠️ {error}</p>}
        <button className="textlink" type="button" onClick={skip} disabled={busy}>{replay ? "Fermer le guide" : "Passer et configurer plus tard"}</button>
      </section>
    </div>
  );
}
