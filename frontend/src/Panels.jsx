import { useEffect, useRef, useState } from "react";
import { apiBase, createGamma, createV0, downloadGamma, fetchSlide, gammaStatus, improveGamma, prepareSlides, v0Status } from "./api";
import { downloadBlob } from "./export";

const Grid = ({ children }) => <div className="grid">{children}</div>;

const PALETTES = [
  { id: "ocean", name: "Océan", mode: "sombre", colors: ["#071525", "#14324E", "#20D0F0", "#E8F7FF"] },
  { id: "violet", name: "Violet", mode: "sombre", colors: ["#140C28", "#3B1D78", "#A78BFA", "#F6F1FF"] },
  { id: "foret", name: "Forêt", mode: "sombre", colors: ["#0E1C14", "#1C4A32", "#5EE0A0", "#F2FFF7"] },
  { id: "soleil", name: "Soleil", mode: "sombre", colors: ["#241208", "#8A3410", "#FF8A3D", "#FFF3E8"] },
  { id: "rose", name: "Rose", mode: "sombre", colors: ["#240814", "#7A1E45", "#FF6FA5", "#FFF0F6"] },
  { id: "encre", name: "Encre", mode: "sombre", colors: ["#101114", "#24262C", "#F4F4F5", "#FFFFFF"] },
  { id: "neon", name: "Néon", mode: "sombre", colors: ["#07080D", "#141824", "#00F0FF", "#FF2BD6"] },
  { id: "aurore", name: "Aurore", mode: "sombre", colors: ["#100818", "#5B2A86", "#22D3EE", "#F472B6"] },
  { id: "papier", name: "Papier", mode: "clair", colors: ["#F7F5F2", "#FFFFFF", "#C2410C", "#1F2933"] },
  { id: "lagon", name: "Lagon", mode: "clair", colors: ["#F3FBFF", "#FFFFFF", "#0E7490", "#134E4A"] },
  { id: "lilas", name: "Lilas", mode: "clair", colors: ["#F6F3FF", "#FFFFFF", "#6D28D9", "#3B0764"] },
  { id: "sable", name: "Sable", mode: "clair", colors: ["#FBF6EE", "#FFFCF7", "#8A5A2B", "#3F2A1A"] },
];

const DESIGN_STYLES = [
  { id: "glass", name: "Glassmorphism", aspect: "Panneaux translucides, flou, bordure fine, fond coloré", fit: "Tableaux de bord, SaaS, pages d’accueil", care: "Contraste du texte, performance sur mobile", directive: "Cartes translucides avec flou d’arrière-plan, bordure fine semi-transparente et fond en halos colorés. Réduis le flou sur mobile et garde un texte très contrasté." },
  { id: "liquid", name: "Liquid Glass", aspect: "Verre plus épais qui se déforme et réfracte la lumière (style récent d’Apple)", fit: "Interfaces très modernes, applications", care: "Lourd à produire, lisibilité", directive: "Verre épais, reflets spéculaires, bords lumineux et grands rayons. Les textes restent nets, en dehors des zones de flou." },
  { id: "neu", name: "Neumorphism", aspect: "Éléments « moulés » dans le fond, ombres claires et sombres", fit: "Applications simples, contrôles (boutons, curseurs)", care: "Très faible contraste, peu accessible", directive: "Boutons et cartes de la même teinte que le fond, ombre claire en haut à gauche et ombre sombre en bas à droite. Renforce le contraste des libellés." },
  { id: "clay", name: "Claymorphism", aspect: "Formes grosses, gonflées et arrondies, comme de la pâte à modeler 3D", fit: "Applications ludiques, éducation, enfants", care: "Peut paraître peu sérieux", directive: "Très grands rayons, volumes gonflés, ombres colorées douces et intérieur un peu plus clair. Boutons comme des pastilles de pâte à modeler." },
  { id: "brutal", name: "Neo-brutalisme", aspect: "Bordures noires épaisses, ombres dures, couleurs franches", fit: "Marques créatives, startups, portfolios", care: "Style très marqué, pas pour tous les secteurs", directive: "Bordure noire de 3 px, ombre dure décalée, couleurs plates saturées, coins peu arrondis et typographie grasse." },
  { id: "aurora", name: "Aurora / Mesh gradient", aspect: "Dégradés doux et flous, façon aurore boréale", fit: "Landing pages, hero, applications d’IA", care: "Peut devenir chargé", directive: "Fond en dégradé maillé et flou. Cartes plus calmes par-dessus, hero large, sans empiler les dégradés dans chaque bloc." },
  { id: "minimal", name: "Minimalisme", aspect: "Beaucoup de blanc, typographie nette, peu de couleurs", fit: "Sites professionnels, documentation, blogs", care: "Risque de paraître froid", directive: "Beaucoup d’espace, typographie nette, une seule couleur d’accent, presque pas d’ombres ni de décor." },
  { id: "darkpro", name: "Sombre pro", aspect: "Noir et gris, un seul accent, surfaces plates", fit: "Outils pour développeurs, SaaS techniques", care: "Peut manquer de chaleur", directive: "Fond noir et gris, surfaces plates, un seul accent réservé aux actions. Aucun dégradé décoratif." },
  { id: "bento", name: "Bento grid", aspect: "Blocs de tailles différentes, comme une boîte repas", fit: "Pages produit, tableaux de bord", care: "Demande une bonne hiérarchie", directive: "Grille de tuiles de tailles différentes. Un bloc principal domine, les autres restent secondaires et lisibles." },
  { id: "cyber", name: "Néon / Cyberpunk", aspect: "Couleurs fluo sur fond noir, lueurs", fit: "Jeux, musique, technologie", care: "Fatigue visuelle, accessibilité", directive: "Fond presque noir, accents fluo et lueurs. Le fluo est limité aux titres et aux actions, le texte courant reste gris clair." },
  { id: "y2k", name: "Rétro / Y2K", aspect: "Dégradés métalliques, formes années 2000, pixels", fit: "Marques de mode, communautés", care: "Très daté, à doser", directive: "Dégradés argentés, bulles et quelques détails pixel. La navigation reste simple malgré les effets." },
  { id: "material", name: "Material / Flat", aspect: "Aplats de couleur, ombres légères, composants standardisés", fit: "Applications mobiles et web classiques", care: "Peut paraître générique", directive: "Aplats, ombre légère, boutons contenus et champs bordés. Composants familiers, hiérarchie claire." },
  { id: "skeu", name: "Skeuomorphisme", aspect: "Imitation du réel (cuir, métal, relief)", fit: "Applications de niche (musique, instruments)", care: "Lourd et vieillissant", directive: "Quelques surfaces clés évoquent le métal, le cuir ou le bois, avec des boutons en relief. Le reste de l’interface reste simple." },
];

function defaultUi(d) {
  return { name: d.mindmap?.center || "Projet", palette: "ocean", style: "glass" };
}

export function v0Text(idea, d, design) {
  if (!design && d.v0Prompt) return d.v0Prompt;
  const ui = { ...defaultUi(d), ...(design || d.uiDesign || {}) };
  const palette = PALETTES.find((p) => p.id === ui.palette) || PALETTES[0];
  const style = DESIGN_STYLES.find((s) => s.id === ui.style) || DESIGN_STYLES[0];
  const name = String(ui.name || "").trim() || d.mindmap?.center || "Projet";
  const [bg, surface, accent, ink] = palette.colors;
  const branches = (d.mindmap?.branches || []).map((b) => `- ${b.name} : ${(b.children || []).join(", ")}`).join("\n");
  const stories = (d.stories || []).map((s, i) => `US${i + 1}. En tant que ${s.actor}, je veux ${s.want} afin de ${s.so}.`).join("\n");
  return `Crée une application web React, responsive, en français.
Nom du site : ${name}
Produit : ${d.mindmap?.center || name}
Idée : ${idea}

Le nom « ${name} » apparaît dans l’en-tête, le titre de la page et le hero.

Écrans et navigation :
${branches}

User stories à couvrir :
${stories}

Direction artistique :
- Style : ${style.name}. ${style.aspect}
- Réalisation : ${style.directive}
- Attention : ${style.care}
- Palette « ${palette.name} » (thème ${palette.mode}) : fond ${bg}, surfaces ${surface}, accent ${accent}, texte ${ink}.
- Utilise exactement ces couleurs. Le texte reste lisible sur chaque fond.

Génère l'interface complète immédiatement, sans question, sans choix et sans demande de confirmation.`;
}

const previewOrigin = apiBase();

export const V0Prompt = ({ idea, d, onChat, onPrompt, onDesign, launch = 0, launched, onBusy }) => {
  const initialDesign = { ...defaultUi(d), ...(d.uiDesign || {}) };
  const initialPrompt = v0Text(idea, d, initialDesign);
  const [design, setDesign] = useState(initialDesign);
  const [follow, setFollow] = useState(() => !d.v0Prompt || d.v0Prompt === initialPrompt);
  const [text, setText] = useState(() => d.v0Prompt || initialPrompt);
  const [fresh, setFresh] = useState(false);
  const [showPrompt, setShowPrompt] = useState(!d.v0ChatId);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState(d.v0ChatId ? { id: d.v0ChatId, messageId: d.v0MessageId, pending: true, ready: false } : null);
  const onChatRef = useRef(onChat);
  const onPromptRef = useRef(onPrompt);
  const onDesignRef = useRef(onDesign);
  const savedPrompt = useRef(d.v0Prompt);
  const announce = useRef(false);
  const persistDesign = useRef(false);
  onChatRef.current = onChat;
  onPromptRef.current = onPrompt;
  onDesignRef.current = onDesign;
  savedPrompt.current = d.v0Prompt;
  const composed = v0Text(idea, d, design);
  const palette = PALETTES.find((p) => p.id === design.palette) || PALETTES[0];
  const style = DESIGN_STYLES.find((s) => s.id === design.style) || DESIGN_STYLES[0];
  const apply = (partial, withNotice = false) => {
    setFollow(true);
    setShowPrompt(true);
    if (withNotice) announce.current = true;
    persistDesign.current = true;
    setDesign((cur) => ({ ...cur, ...partial }));
  };
  useEffect(() => {
    if (!persistDesign.current) return;
    onDesignRef.current?.(design);
  }, [design]);
  useEffect(() => {
    if (!follow) return undefined;
    setText(composed);
    if (composed !== savedPrompt.current) onPromptRef.current?.(composed);
    if (!announce.current) return undefined;
    announce.current = false;
    setShowPrompt(true);
    setFresh(true);
    const timer = setTimeout(() => setFresh(false), 1400);
    return () => clearTimeout(timer);
  }, [composed, follow]);
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
  const reset = () => {
    announce.current = true;
    persistDesign.current = true;
    setFollow(true);
    setDesign(defaultUi(d));
  };
  return (
    <div>
      <form className="design-form" onSubmit={(e) => e.preventDefault()}>
        <label className="design-label">
          Nom du site
          <input value={design.name} maxLength={80} placeholder="Nom affiché dans l’en-tête"
            onChange={(e) => apply({ name: e.target.value })} />
        </label>
        <div className="swatch-preview" style={{ background: palette.colors[0], color: palette.colors[3], borderColor: palette.colors[2] }}>
          <strong style={{ color: palette.colors[2] }}>{design.name.trim() || "Sans nom"}</strong>
          <span>{style.name} · {palette.name}</span>
        </div>
        <div>
          <h3>Palette de couleurs</h3>
          <div className="palettes" role="listbox" aria-label="Palette de couleurs">
            {PALETTES.map((item) => (
              <button type="button" key={item.id} role="option" aria-selected={design.palette === item.id}
                className={design.palette === item.id ? "palette on" : "palette"}
                onClick={() => apply({ palette: item.id }, true)}>
                <span className="dots" aria-hidden="true">
                  {item.colors.map((color) => <i key={color} style={{ background: color }} />)}
                </span>
                {item.name}
                <em>{item.mode}</em>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3>Style de l’interface</h3>
          <div className="looks" role="listbox" aria-label="Style de l’interface">
            {DESIGN_STYLES.map((item) => (
              <button type="button" key={item.id} role="option" aria-selected={design.style === item.id}
                className={design.style === item.id ? "look on" : "look"}
                title={`${item.fit} — ${item.care}`}
                onClick={() => apply({ style: item.id }, true)}>
                <strong>{item.name}</strong>
                <span>{item.aspect}</span>
              </button>
            ))}
          </div>
          <p className="look-note">
            <b>Bien pour.</b> {style.fit}
            <b>Attention.</b> {style.care}
          </p>
        </div>
      </form>
      <div className="v0actions">
        <button className="go" onClick={send} disabled={busy}>{busy ? "Génération…" : "Générer l’interface"}</button>
        <button onClick={copy}>{copied ? "Copié" : "Copier le prompt"}</button>
        <button onClick={reset}>Réinitialiser</button>
      </div>
      {fresh && <p className="ok">Prompt mis à jour.</p>}
      {error && <p className="err">⚠️ {error}</p>}
      {frame && (
        <div className="v0live">
          <p className="hint">{waiting ? "Création de l’interface…" : "Aperçu du site"}</p>
          <iframe className="v0frame" title="Aperçu du site" src={frame} key={`${frame}:${link.ready ? "ready" : "wait"}`}
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
        </div>
      )}
      <details className="v0details" open={showPrompt} onToggle={(e) => setShowPrompt(e.currentTarget.open)}>
        <summary>Prompt v0 — mis à jour selon tes choix</summary>
        <textarea className="prompt" value={text} rows={8}
          onChange={(e) => { setFollow(false); setText(e.target.value); }}
          onBlur={() => onPrompt?.(text)} aria-label="Prompt v0" />
      </details>
    </div>
  );
};

const LOOK_MARK = "\n---\n\nDirection visuelle\n";

function resolveLook(design) {
  const palette = PALETTES.find((p) => p.id === design?.palette) || PALETTES[0];
  const style = DESIGN_STYLES.find((s) => s.id === design?.style) || DESIGN_STYLES[0];
  const [bg, surface, accent, ink] = palette.colors;
  const block = `- Style : ${style.name}. ${style.aspect}
- Réalisation : ${style.directive}
- Attention : ${style.care}
- Palette « ${palette.name} » (thème ${palette.mode}) : fond ${bg}, surfaces ${surface}, accent ${accent}, texte ${ink}.
- Applique ce style et ces couleurs sur toutes les cartes. Le texte reste lisible.`;
  return { palette, style, block };
}

function freshDeck(d) {
  const from = d.uiDesign || {};
  return { palette: from.palette || "ocean", style: from.style || "glass" };
}

function stripLook(text) {
  const source = String(text || "");
  const at = source.lastIndexOf(LOOK_MARK);
  return (at === -1 ? source : source.slice(0, at)).trim();
}

function withLook(text, design) {
  return `${stripLook(text)}${LOOK_MARK}${resolveLook(design).block}`;
}

function slideBody(idea, d) {
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

export function gammaText(idea, d, design) {
  if (!design && d.gammaPrompt) return d.gammaPrompt;
  const slides = slideBody(idea, d);
  const chosen = design || d.deckDesign;
  return chosen ? withLook(slides, chosen) : slides;
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

export const GammaDeck = ({ idea, d, onPrompt, onDeck, onDesign }) => {
  const initialDesign = { ...freshDeck(d), ...(d.deckDesign || {}) };
  const initialPrompt = gammaText(idea, d, initialDesign);
  const [design, setDesign] = useState(initialDesign);
  const [follow, setFollow] = useState(() => !d.gammaPrompt || d.gammaPrompt === initialPrompt);
  const [text, setText] = useState(() => (d.gammaPrompt ? withLook(d.gammaPrompt, initialDesign) : initialPrompt));
  const [fresh, setFresh] = useState(false);
  const [showPrompt, setShowPrompt] = useState(!d.gammaGenerationId && !d.gammaUrl);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deck, setDeck] = useState(() => savedDeck(d));
  const [slides, setSlides] = useState([]);
  const [slide, setSlide] = useState(0);
  const slidesRef = useRef([]);
  const onDeckRef = useRef(onDeck);
  const onPromptRef = useRef(onPrompt);
  const onDesignRef = useRef(onDesign);
  const savedPrompt = useRef(d.gammaPrompt);
  const textRef = useRef(text);
  const announce = useRef(false);
  const persistDesign = useRef(false);
  const editing = useRef(false);
  onDeckRef.current = onDeck;
  onPromptRef.current = onPrompt;
  onDesignRef.current = onDesign;
  savedPrompt.current = d.gammaPrompt;
  textRef.current = text;
  const composed = gammaText(idea, d, design);
  const look = resolveLook(design);
  const apply = (partial, withNotice = false) => {
    setShowPrompt(true);
    if (withNotice) announce.current = true;
    persistDesign.current = true;
    setDesign((cur) => ({ ...cur, ...partial }));
  };
  useEffect(() => {
    if (!persistDesign.current) return;
    onDesignRef.current?.(design);
  }, [design]);
  useEffect(() => {
    if (editing.current) return undefined;
    const next = follow ? composed : withLook(textRef.current, design);
    setText(next);
    if (next !== savedPrompt.current) onPromptRef.current?.(next);
    if (!announce.current) return undefined;
    announce.current = false;
    setFresh(true);
    const timer = setTimeout(() => setFresh(false), 1400);
    return () => clearTimeout(timer);
  }, [composed, design, follow]);
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
      const next = await improveGamma({ idea, data: d, current: stripLook(text), note });
      const brief = withLook(next.gammaPrompt, design);
      setFollow(false);
      setText(brief);
      onPrompt?.(brief);
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };
  const send = async () => {
    setBusy("create"); setError(""); setNotice("");
    onPrompt?.(text);
    slidesRef.current.forEach((url) => URL.revokeObjectURL(url));
    slidesRef.current = [];
    setSlides([]);
    try {
      const created = await createGamma({ prompt: text, title: d.mindmap?.center || "Projet", look: look.block });
      const next = { ...created, provider: "gamma" };
      if (created.note) setNotice(created.note);
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
  const reset = () => {
    announce.current = true;
    persistDesign.current = true;
    editing.current = false;
    setFollow(true);
    setShowPrompt(true);
    setDesign(freshDeck(d));
  };
  return (
    <div className="deck">
      <p className="hint">Choisis la palette et le style. Le brief se met à jour, puis Gamma 5 compose la dernière version du diaporama.</p>
      <form className="design-form" onSubmit={(e) => e.preventDefault()}>
        <div className="swatch-preview" style={{ background: look.palette.colors[0], color: look.palette.colors[3], borderColor: look.palette.colors[2] }}>
          <strong style={{ color: look.palette.colors[2] }}>{d.mindmap?.center || "Projet"}</strong>
          <span>{look.style.name} · {look.palette.name}</span>
        </div>
        <div>
          <h3>Palette de couleurs</h3>
          <div className="palettes" role="listbox" aria-label="Palette de couleurs">
            {PALETTES.map((item) => (
              <button type="button" key={item.id} role="option" aria-selected={design.palette === item.id}
                className={design.palette === item.id ? "palette on" : "palette"}
                onClick={() => apply({ palette: item.id }, true)}>
                <span className="dots" aria-hidden="true">
                  {item.colors.map((color) => <i key={color} style={{ background: color }} />)}
                </span>
                {item.name}
                <em>{item.mode}</em>
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3>Style du diaporama</h3>
          <div className="looks" role="listbox" aria-label="Style du diaporama">
            {DESIGN_STYLES.map((item) => (
              <button type="button" key={item.id} role="option" aria-selected={design.style === item.id}
                className={design.style === item.id ? "look on" : "look"}
                title={`${item.fit} — ${item.care}`}
                onClick={() => apply({ style: item.id }, true)}>
                <strong>{item.name}</strong>
                <span>{item.aspect}</span>
              </button>
            ))}
          </div>
          <p className="look-note">
            <b>Bien pour.</b> {look.style.fit}
            <b>Attention.</b> {look.style.care}
          </p>
        </div>
      </form>
      <div className="v0actions">
        <button className="go" onClick={send} disabled={Boolean(busy)}>{busy === "create" ? "Envoi…" : "Générer avec Gamma 5"}</button>
        <button onClick={improve} disabled={Boolean(busy)}>{busy === "improve" ? "Amélioration…" : "Améliorer le prompt"}</button>
        <button onClick={copy}>{copied ? "Copié" : "Copier le prompt"}</button>
        <button onClick={reset}>Réinitialiser</button>
      </div>
      {fresh && <p className="ok">Prompt mis à jour.</p>}
      {notice && <p className="hint">{notice}</p>}
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
      <details className="v0details" open={showPrompt} onToggle={(e) => setShowPrompt(e.currentTarget.open)}>
        <summary>Brief Gamma — mis à jour selon tes choix</summary>
        <textarea className="prompt" value={text} rows={12}
          onChange={(e) => { editing.current = true; setFollow(false); setText(e.target.value); }}
          onBlur={() => { editing.current = false; onPrompt?.(text); }} aria-label="Brief de présentation" />
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
