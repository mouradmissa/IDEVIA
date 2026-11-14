import { useEffect, useRef, useState } from "react";
import { createGamma, createV0, downloadGamma, fetchSlide, gammaStatus, improveGamma, prepareSlides, v0Status } from "./api";
import { downloadBlob } from "./export";

const Grid = ({ children }) => <div className="grid">{children}</div>;

export function v0Text(idea, d) {
  if (d.v0Prompt) return d.v0Prompt;
  const branches = (d.mindmap?.branches || []).map((b) => `- ${b.name} : ${(b.children || []).join(", ")}`).join("\n");
  const stories = (d.stories || []).map((s, i) => `US${i + 1}. En tant que ${s.actor}, je veux ${s.want} afin de ${s.so}.`).join("\n");
  return `Crée une application web React, responsive, en français.
Produit : ${d.mindmap?.center || "Projet"}
Idée : ${idea}

Écrans et navigation :
${branches}

User stories à couvrir :
${stories}

Style : interface claire, cartes, navigation simple, états vides, boutons d'action visibles.
Génère l'interface complète immédiatement, sans question, sans choix et sans demande de confirmation.`;
}

const previewOrigin = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export const V0Prompt = ({ idea, d, onChat, onPrompt, launch = 0, launched, onBusy }) => {
  const generated = v0Text(idea, d);
  const source = v0Text(idea, { ...d, v0Prompt: "" });
  const [text, setText] = useState(generated);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState(d.v0ChatId ? { id: d.v0ChatId, messageId: d.v0MessageId, pending: true, ready: false } : null);
  const onChatRef = useRef(onChat);
  onChatRef.current = onChat;
  useEffect(() => { setText(generated); }, [generated]);
  useEffect(() => {
    setLink(d.v0ChatId ? { id: d.v0ChatId, messageId: d.v0MessageId, pending: true, ready: false } : null);
  }, [d.v0ChatId, d.v0MessageId]);
  useEffect(() => {
    if (!link?.id || !link.messageId || (link.ready && !link.pending)) return undefined;
    let stop = false;
    const watch = async () => {
      for (let i = 0; i < 60 && !stop; i++) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        if (stop) return;
        try {
          const status = await v0Status(link.id, link.messageId);
          if (stop) return;
          setLink(status);
          if (status.messageId && status.messageId !== link.messageId) onChatRef.current?.(status);
          if (!status.pending && status.ready) return;
        } catch (e) {
          if (!stop) setError(e.message);
          return;
        }
      }
    };
    watch();
    return () => { stop = true; };
  }, [link?.id, link?.messageId]);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const send = async () => {
    setBusy(true); onBusy?.(true); setError(""); setLink(null);
    onPrompt?.(text);
    try {
      const created = await createV0(text);
      setLink(created);
      if (created.id) onChat?.(created);
    } catch (e) {
      setError(typeof e.message === "string" ? e.message : "Erreur v0");
    }
    setBusy(false); onBusy?.(false);
  };
  useEffect(() => {
    if (!launch || launched?.current === launch) return;
    launched.current = launch;
    send();
  }, [launch]);
  const frame = link?.id ? `${previewOrigin}/preview/${encodeURIComponent(link.id)}/` : "";
  const waiting = Boolean(frame && (link.pending || link.ready === false));
  return (
    <div>
      <div className="v0actions">
        <button className="go" onClick={send} disabled={busy}>{busy ? "Génération…" : "Générer l’interface"}</button>
        <button onClick={copy}>{copied ? "Copié" : "Copier le prompt"}</button>
        <button onClick={() => { setText(source); onPrompt?.(source); }}>Réinitialiser</button>
      </div>
      {error && <p className="err">⚠️ {error}</p>}
      {frame && (
        <div className="v0live">
          <p className="hint">{waiting ? "Création de l’interface…" : "Aperçu du site"}</p>
          <iframe className="v0frame" title="Aperçu du site" src={frame} key={`${frame}:${link.ready ? "ready" : "wait"}`}
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
        </div>
      )}
      <details className="v0details" open={!frame}>
        <summary>Prompt v0 — modifiable</summary>
        <textarea className="prompt" value={text} rows={8} onChange={(e) => setText(e.target.value)}
          onBlur={() => onPrompt?.(text)} aria-label="Prompt v0" />
      </details>
    </div>
  );
};

export function gammaText(idea, d) {
  if (d.gammaPrompt) return d.gammaPrompt;
  const center = d.mindmap?.center || "Projet";
  const features = (d.features || []).slice(0, 4).map((f) => `- ${f.name}`).join("\n");
  const actors = (d.actors || []).map((a) => a.name).join(", ");
  const stories = (d.stories || []).slice(0, 3).map((s) => `- ${s.actor} veut ${s.want}`).join("\n");
  return `${center}
${idea}

---

Le problème
- Un besoin concret, encore traité à la main
- Peu de visibilité sur l’ensemble
- Une expérience à clarifier

---

La solution
- ${center}, pensé à partir de l’idée
- Un parcours simple, du besoin au résultat
- Une base prête à être développée

---

Pour qui
- ${actors || "Les utilisateurs du produit"}

---

Fonctionnalités
${features || "- Les fonctions essentielles du produit"}

---

Parcours
${stories || "- Un scénario principal, de bout en bout"}

---

Architecture
- Interface, données et règles métier séparées
- Modèle prêt pour les user stories prioritaires

---

Prochaines étapes
- Valider le périmètre avec les acteurs
- Construire l’interface
- Livrer le premier sprint`;
}

function embedFromGamma(url) {
  const match = /gamma\.app\/(?:docs|embed|public)\/([^/?#]+)/.exec(url || "");
  return match ? `https://gamma.app/embed/${match[1]}` : "";
}

function savedDeck(d) {
  const viewUrl = d.gammaUrl || "";
  return {
    provider: "gamma",
    generationId: d.gammaGenerationId || "",
    designId: d.gammaId || "",
    viewUrl,
    embedUrl: d.gammaEmbed || embedFromGamma(viewUrl),
    pending: Boolean(d.gammaGenerationId) && !viewUrl,
    ready: Boolean(viewUrl),
  };
}

export const GammaDeck = ({ idea, d, onPrompt, onDeck }) => {
  const generated = gammaText(idea, d);
  const source = gammaText(idea, { ...d, gammaPrompt: "" });
  const [text, setText] = useState(generated);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [deck, setDeck] = useState(() => savedDeck(d));
  const [slides, setSlides] = useState([]);
  const [slide, setSlide] = useState(0);
  const slidesRef = useRef([]);
  const onDeckRef = useRef(onDeck);
  onDeckRef.current = onDeck;
  useEffect(() => { setText(generated); }, [generated]);
  useEffect(() => () => { slidesRef.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  useEffect(() => {
    const saved = savedDeck(d);
    if (!saved.generationId && !saved.viewUrl) return;
    setDeck((cur) => {
      if (cur?.generationId === saved.generationId) {
        const viewUrl = saved.viewUrl || cur.viewUrl || "";
        const embedUrl = saved.embedUrl || cur.embedUrl || embedFromGamma(viewUrl);
        return { ...cur, ...saved, viewUrl, embedUrl, designId: saved.designId || cur.designId || "", ready: cur.ready || Boolean(viewUrl || embedUrl), pending: cur.ready || viewUrl ? false : cur.pending };
      }
      return saved.generationId || saved.viewUrl ? saved : cur;
    });
  }, [d.gammaGenerationId, d.gammaId, d.gammaUrl, d.gammaEmbed]);
  useEffect(() => {
    if (!deck?.generationId || deck.ready) return undefined;
    let stop = false;
    const watch = async () => {
      for (let i = 0; i < 40 && !stop; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        if (stop) return;
        try {
          const status = await gammaStatus(deck.generationId);
          if (stop) return;
          const next = {
            ...status,
            provider: "gamma",
            designId: status.designId || status.gammaId || "",
            viewUrl: status.viewUrl || status.gammaUrl || "",
            embedUrl: status.embedUrl || embedFromGamma(status.viewUrl || status.gammaUrl),
          };
          setDeck(next);
          if (next.designId || next.viewUrl) onDeckRef.current?.(next);
          if (status.error) { setError(status.error); return; }
          if (!status.pending && status.ready) return;
        } catch (e) {
          if (!stop) setError(e.message);
          return;
        }
      }
    };
    watch();
    return () => { stop = true; };
  }, [deck?.generationId, deck?.ready]);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const improve = async () => {
    setBusy("improve"); setError("");
    try {
      const next = await improveGamma({ idea, data: d, current: text, note });
      setText(next.gammaPrompt);
      onPrompt?.(next.gammaPrompt);
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };
  const send = async () => {
    setBusy("create"); setError("");
    onPrompt?.(text);
    slidesRef.current.forEach((url) => URL.revokeObjectURL(url));
    slidesRef.current = [];
    setSlides([]);
    try {
      const created = await createGamma({ prompt: text, title: d.mindmap?.center || "Projet" });
      const next = { ...created, provider: "gamma" };
      setDeck(next);
      onDeck?.(next);
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };
  const save = async (format) => {
    const designId = deck?.designId || deck?.gammaId;
    if (!designId && !deck?.generationId) return;
    setBusy(format); setError("");
    try {
      const file = await downloadGamma({
        provider: "gamma",
        generationId: deck.generationId,
        gammaId: designId,
        designId,
        format,
        title: d.mindmap?.center || "presentation",
      });
      downloadBlob(file.name, file.blob);
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };
  const showSlides = async () => {
    const designId = deck?.designId || deck?.gammaId;
    if (!designId) return;
    setBusy("slides"); setError("");
    try {
      const info = await prepareSlides("gamma", { generationId: deck.generationId, designId, gammaId: designId });
      const next = [];
      for (let i = 0; i < info.count; i++) next.push(URL.createObjectURL(await fetchSlide("gamma", info.designId || designId, i)));
      slidesRef.current.forEach((url) => URL.revokeObjectURL(url));
      slidesRef.current = next;
      setSlides(next);
      setSlide(0);
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };
  const waiting = Boolean(deck?.generationId && !deck.ready);
  const embed = deck?.embedUrl || embedFromGamma(deck?.viewUrl || deck?.gammaUrl);
  const openUrl = deck?.viewUrl || deck?.gammaUrl || "";
  return (
    <div className="deck">
      <p className="hint">Gemini écrit le brief de ce projet. Gamma en fait le diaporama, affiché ici. L’amélioration repart du même brief.</p>
      <div className="v0actions">
        <button className="go" onClick={send} disabled={Boolean(busy)}>{busy === "create" ? "Envoi…" : "Générer avec Gamma"}</button>
        <button onClick={improve} disabled={Boolean(busy)}>{busy === "improve" ? "Amélioration…" : "Améliorer le prompt"}</button>
        <button onClick={copy}>{copied ? "Copié" : "Copier le prompt"}</button>
        <button onClick={() => { setText(source); onPrompt?.(source); }}>Réinitialiser</button>
      </div>
      <label className="note">Consigne d’amélioration
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : ton plus direct, ajoute un slide sur le premier sprint" />
      </label>
      {error && <p className="err">⚠️ {error}</p>}
      <div className="deck-live">
        {embed ? (
          <iframe className="deck-frame" title="Présentation Gamma" src={embed} key={embed}
            allow="fullscreen; clipboard-write" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        ) : (
          <div className="deck-empty">
            <b>{waiting ? "Gamma compose les cartes…" : "La présentation s’affiche ici"}</b>
            <p>{waiting ? "Le lecteur intégré s’ouvre dès que le diaporama est prêt." : "Génère le diaporama. Il reste dans cette page."}</p>
          </div>
        )}
      </div>
      {deck?.generationId && (
        <div className="deck-status">
          <p className="hint">{waiting ? "Gamma compose les cartes…" : embed ? "Présentation intégrée à l’atelier" : "Présentation prête"}</p>
          <div className="v0actions">
            {openUrl && <a className="ext" href={openUrl} target="_blank" rel="noreferrer">Ouvrir dans Gamma</a>}
            {deck.ready && <button onClick={showSlides} disabled={Boolean(busy)}>{busy === "slides" ? "Préparation…" : "Diapositives dans la page"}</button>}
            {deck.ready && <button onClick={() => save("pptx")} disabled={Boolean(busy)}>{busy === "pptx" ? "Téléchargement…" : "Télécharger PPTX"}</button>}
            {deck.ready && <button onClick={() => save("pdf")} disabled={Boolean(busy)}>{busy === "pdf" ? "Téléchargement…" : "Télécharger PDF"}</button>}
          </div>
        </div>
      )}
      {slides.length > 0 && (
        <div className="slide-stage">
          <img src={slides[slide]} alt={`Diapositive ${slide + 1} sur ${slides.length}`} />
          <div className="slide-nav">
            <button type="button" onClick={() => setSlide((n) => Math.max(0, n - 1))} disabled={slide === 0}>Précédente</button>
            <span>{slide + 1} / {slides.length}</span>
            <button type="button" onClick={() => setSlide((n) => Math.min(slides.length - 1, n + 1))} disabled={slide === slides.length - 1}>Suivante</button>
          </div>
        </div>
      )}
      <details className="v0details">
        <summary>Brief Gamma — modifiable</summary>
        <textarea className="prompt" value={text} rows={12} onChange={(e) => setText(e.target.value)}
          onBlur={() => onPrompt?.(text)} aria-label="Brief de présentation" />
      </details>
    </div>
  );
};

export const Features = ({ d }) => (
  <Grid>{d.features.map((f, i) => (
    <div className="box" key={i}><h4>{f.name}<span className="tag">{f.priority}</span></h4><p>{f.desc}</p></div>
  ))}</Grid>
);
export const Actors = ({ d }) => (
  <Grid>{d.actors.map((a, i) => (
    <div className="box" key={i}><h4>👤 {a.name}</h4><p>{a.role}</p></div>
  ))}</Grid>
);
export const Stories = ({ d }) => (
  <div>{d.stories.map((s, i) => (
    <div className="card" key={i}><b>US{i + 1} · </b>En tant que <b>{s.actor}</b>, je veux {s.want} afin de {s.so}.</div>
  ))}</div>
);
export const Uml = ({ d }) => (
  <Grid>{d.classes.map((c, i) => (
    <div className="box" key={i}>
      <h4 className="center">{c.name}</h4>
      <div className="mono">{(c.attrs || []).map((a, j) => <div key={j}>+ {a}</div>)}</div>
      <div className="mono sep">{(c.methods || []).map((m, j) => <div key={j}>+ {m}</div>)}</div>
      {c.rel?.length > 0 && <p>→ {c.rel.join(", ")}</p>}
    </div>
  ))}</Grid>
);
export const Db = ({ d }) => (
  <Grid>{d.tables.map((t, i) => (
    <div className="box" key={i}><h4>🗄️ {t.name}</h4>
      <div className="mono">{t.cols.map((c, j) => (
        <div key={j}><span className={c.k === "PK" ? "pk" : c.k === "FK" ? "fk" : ""}>{c.k ? c.k + " " : "   "}</span>{c.n} : {c.t}</div>
      ))}</div>
    </div>
  ))}</Grid>
);
export const Backlog = ({ d }) => {
  const by = {};
  d.backlog.forEach((b) => (by[b.sprint] = by[b.sprint] || []).push(b));
  return (
    <div className="cols">{Object.keys(by).sort().map((s) => (
      <div key={s}>
        <h4 className="mut">SPRINT {s} · {by[s].reduce((a, b) => a + (+b.points || 0), 0)} pts</h4>
        {by[s].map((b, i) => <div className="card" key={i}>{b.title}<span className="tag">{b.points} pts</span></div>)}
      </div>
    ))}</div>
  );
};
