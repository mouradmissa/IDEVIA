import { useEffect, useState } from "react";
import { getProfile, saveProfile } from "./api";

const blank = () => ({ name: "", hint: "", value: "", isNew: true });

function keyLabel(info) {
  if (!info) return "";
  if (info.personal) return `Personnelle ${info.hint}`;
  if (info.source === "server") return "Clé du serveur";
  return "Absente";
}

export default function Profile({ user, onSaved, onLogout, onGuide }) {
  const [info, setInfo] = useState(null);
  const [gemini, setGemini] = useState("");
  const [v0, setV0] = useState("");
  const [gamma, setGamma] = useState("");
  const [clearGemini, setClearGemini] = useState(false);
  const [clearV0, setClearV0] = useState(false);
  const [clearGamma, setClearGamma] = useState(false);
  const [model, setModel] = useState("");
  const [rows, setRows] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  const apply = (profile) => {
    setInfo(profile);
    setModel(profile.model || "");
    setRows((profile.extra || []).map((key) => ({ name: key.name, hint: key.hint, value: "", isNew: false })));
    setRemoved([]);
    setGemini("");
    setV0("");
    setGamma("");
    setClearGemini(false);
    setClearV0(false);
    setClearGamma(false);
    onSaved?.(profile);
  };

  useEffect(() => {
    getProfile().then(apply).catch((e) => setError(e.message));
  }, []);

  const save = async () => {
    setBusy(true); setError(""); setSaved("");
    const extra = [];
    for (const row of rows) {
      const name = row.name.trim();
      const value = row.value.trim();
      if (!name && !value) continue;
      if (!name || !value) {
        setError("Chaque nouvelle clé a besoin d’un nom et d’une valeur.");
        setBusy(false);
        return;
      }
      extra.push({ name, value });
    }
    try {
      const profile = await saveProfile({
        geminiKey: gemini.trim() || null,
        v0Key: v0.trim() || null,
        gammaKey: gamma.trim() || null,
        model: model.trim() || null,
        clearGemini,
        clearV0,
        clearGamma,
        extra,
        removeExtra: removed,
      });
      apply(profile);
      setSaved("Clés enregistrées. Elles sont déjà utilisées.");
    } catch (e) {
      setError(typeof e.message === "string" ? e.message : "Enregistrement impossible");
    }
    setBusy(false);
  };

  const drop = (index) => {
    const row = rows[index];
    if (!row.isNew) setRemoved((list) => [...list, row.name]);
    setRows((list) => list.filter((_, i) => i !== index));
  };

  return (
    <section className="profile">
      <div className="idcard">
        {user?.picture ? <img src={user.picture} alt="" /> : <span>{(user?.name || "?").slice(0, 1).toUpperCase()}</span>}
        <div>
          <h1>{user?.name || "Profil"}</h1>
          <p>{user?.email}</p>
          <em>{user?.provider === "google" ? "Connecté avec Gmail" : "Compte e-mail"}</em>
        </div>
      </div>
      <p className="sub">Les clés sont liées à ce compte. Un champ vide conserve la clé déjà enregistrée.</p>
      <div className="row-actions">
        <button type="button" onClick={onGuide}>Guide des clés</button>
        <button type="button" onClick={onLogout}>Déconnexion</button>
      </div>
      {error && <p className="err">⚠️ {error}</p>}
      {saved && <p className="ok">{saved}</p>}

      <div className="field">
        <label htmlFor="gemini">Clé Gemini {info && <span className={info.gemini.configured && !clearGemini ? "badge on" : "badge"}>{clearGemini ? "Absente" : keyLabel(info.gemini)}</span>}</label>
        <input id="gemini" type="password" autoComplete="off" value={gemini} placeholder="Nouvelle clé Gemini"
          onChange={(e) => { setGemini(e.target.value); setClearGemini(false); }} />
        {info?.gemini.personal && (
          <label className="check"><input type="checkbox" checked={clearGemini} onChange={(e) => setClearGemini(e.target.checked)} /> Effacer la clé actuelle</label>
        )}
      </div>

      <div className="field">
        <label htmlFor="v0key">Clé v0 {info && <span className={info.v0.configured && !clearV0 ? "badge on" : "badge"}>{clearV0 ? "Absente" : keyLabel(info.v0)}</span>}</label>
        <input id="v0key" type="password" autoComplete="off" value={v0} placeholder="Nouvelle clé v0"
          onChange={(e) => { setV0(e.target.value); setClearV0(false); }} />
        {info?.v0.personal && (
          <label className="check"><input type="checkbox" checked={clearV0} onChange={(e) => setClearV0(e.target.checked)} /> Effacer la clé actuelle</label>
        )}
      </div>

      <div className="field">
        <label htmlFor="gammakey">Clé Gamma {info && <span className={info.gamma?.configured && !clearGamma ? "badge on" : "badge"}>{clearGamma ? "Absente" : keyLabel(info.gamma)}</span>}</label>
        <input id="gammakey" type="password" autoComplete="off" value={gamma} placeholder="Nouvelle clé Gamma"
          onChange={(e) => { setGamma(e.target.value); setClearGamma(false); }} />
        <button className="textlink inline" type="button" onClick={() => onGuide?.(3)}>Guide de la clé Gamma</button>
        {info?.gamma?.personal && (
          <label className="check"><input type="checkbox" checked={clearGamma} onChange={(e) => setClearGamma(e.target.checked)} /> Effacer la clé actuelle</label>
        )}
      </div>

      <div className="field">
        <label htmlFor="model">Modèle Gemini</label>
        <input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gemini-3.1-flash-lite" />
      </div>

      <div className="field">
        <label>Autres clés</label>
        {rows.length === 0 && <p className="hint">Aucune clé supplémentaire.</p>}
        {rows.map((row, i) => (
          <div className="rowk" key={`${row.name}-${i}`}>
            <input value={row.name} readOnly={!row.isNew} placeholder="NOM_DE_CLE"
              onChange={(e) => setRows((list) => list.map((item, k) => k === i ? { ...item, name: e.target.value.toUpperCase() } : item))} />
            <input type="password" autoComplete="off" value={row.value} placeholder={row.hint || "Valeur"}
              onChange={(e) => setRows((list) => list.map((item, k) => k === i ? { ...item, value: e.target.value } : item))} />
            <button type="button" onClick={() => drop(i)} aria-label="Retirer">Retirer</button>
          </div>
        ))}
        <button type="button" onClick={() => setRows((list) => [...list, blank()])}>＋ Ajouter une clé</button>
      </div>

      <button className="go save" onClick={save} disabled={busy || !info}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
    </section>
  );
}
