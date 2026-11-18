import { useEffect, useRef, useState } from "react";
import { exportZip, generate, getHistory, getProfile, getToken, logout as logoutApi, me, saveHistory, setToken } from "./api";
import Auth from "./Auth";
import Logo from "./Logo";
import Onboarding from "./Onboarding";
import Profile from "./Profile";
import TechScene from "./Scene";
import { toMarkdown, download, downloadBlob } from "./export";
import MindMap from "./MindMap";
import { Features, Actors, Stories, Uml, Db, Backlog, V0Prompt, GammaDeck } from "./Panels";

const STAGES = [
  ["data", "01", "Idée et données", "Mind map, acteurs, stories, UML, base et backlog"],
  ["ui", "02", "Interface", "Prompt v0 et aperçu du site"],
  ["deck", "03", "Présentation", "Brief Gemini, diaporama Gamma, lecteur intégré"],
];
const TABS = [
  ["map", "◈", "Mind map"], ["us", "✎", "User stories"],
  ["feat", "⬡", "Fonctionnalités"], ["act", "◎", "Acteurs"],
  ["uml", "▣", "UML"], ["db", "▤", "Base de données"], ["bk", "☰", "Backlog"],
];
const EXAMPLES = [
  "Application de livraison de repas",
  "Plateforme de réservation de salles de sport",
  "Réseau social pour amateurs de randonnée",
  "Site e-commerce d’artisanat tunisien",
];
const STEPS = ["Analyse de l’idée…", "Construction de la mind map…", "Rédaction des user stories…",
  "Brief de présentation…", "Modélisation UML et base de données…"];
const KEY = "mindmap-ai-history";
const DRAFT = "mindmap-ai-draft";

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function mergeHistory(localItems, remoteItems) {
  const map = new Map();
  for (const item of [...(remoteItems || []), ...(localItems || [])]) {
    if (!item || typeof item.idea !== "string" || !item.idea.trim() || !item.data) continue;
    const prev = map.get(item.idea);
    if (!prev || (item.at || 0) >= (prev.at || 0)) map.set(item.idea, item);
  }
  return [...map.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 10);
}

const DEFAULT_PROMPT = `Tu es un architecte logiciel et un Product Owner expérimenté.
Tu transformes une idée en projet structuré, dans la langue de l'utilisateur.
Sois précis, concret, et garde des noms courts.`;

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [guide, setGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [idea, setIdea] = useState("");
  const [prompt, setPrompt] = useState(() => localStorage.getItem("mindmap-ai-prompt") || DEFAULT_PROMPT);
  const [promptOpen, setPromptOpen] = useState(false);
  const [data, setData] = useState(null);
  const [stage, setStage] = useState("data");
  const [tab, setTab] = useState("map");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [profile, setProfile] = useState(false);
  const [keysReady, setKeysReady] = useState(true);
  const [launch, setLaunch] = useState(0);
  const [v0Busy, setV0Busy] = useState(false);
  const [zipping, setZipping] = useState(false);
  const launched = useRef(0);
  const draftAt = useRef(0);
  const dirty = useRef(false);
  const [workspaceReady, setWorkspaceReady] = useState("");
  const mark = () => { dirty.current = true; };
  const histKey = user ? `${KEY}:${user.id}` : "";
  const draftKey = user ? `${DRAFT}:${user.id}` : "";

  useEffect(() => {
    if (!getToken()) { setBooting(false); return; }
    me().then(setUser).catch(() => { setToken(""); setUser(null); }).finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    const out = () => { setUser(null); setData(null); setProfile(false); setGuide(false); };
    window.addEventListener("mindmap-logout", out);
    return () => window.removeEventListener("mindmap-logout", out);
  }, []);
  useEffect(() => {
    if (!histKey) {
      setHistory([]);
      setWorkspaceReady("");
      return;
    }
    let localItems = readJson(histKey, []);
    if ((!Array.isArray(localItems) || localItems.length === 0) && localStorage.getItem(KEY)) {
      localItems = readJson(KEY, []);
    }
    const localDraft = readJson(draftKey, null);
    draftAt.current = localDraft?.at || 0;
    dirty.current = false;
    setHistory(Array.isArray(localItems) ? localItems.slice(0, 10) : []);
    if (localDraft && typeof localDraft === "object") {
      if (typeof localDraft.idea === "string") setIdea(localDraft.idea);
      if (typeof localDraft.prompt === "string" && localDraft.prompt) setPrompt(localDraft.prompt);
      setData(localDraft.data || null);
      if (localDraft.stage) setStage(localDraft.stage);
      if (localDraft.tab) setTab(localDraft.tab);
    }
    const startedAt = draftAt.current;
    let alive = true;
    setWorkspaceReady("");
    getHistory().then((remote) => {
      if (!alive) return;
      const remoteItems = Array.isArray(remote?.items) ? remote.items : [];
      setHistory((current) => mergeHistory(current, remoteItems));
      const remoteDraft = remote?.draft;
      const remoteAt = remoteDraft?.at || 0;
      if (remoteDraft && remoteAt > startedAt && draftAt.current === startedAt && !dirty.current) {
        draftAt.current = remoteAt;
        setIdea(remoteDraft.idea || "");
        if (remoteDraft.prompt) setPrompt(remoteDraft.prompt);
        setData(remoteDraft.data || null);
        setStage(remoteDraft.stage || "data");
        setTab(remoteDraft.tab || "map");
        localStorage.setItem(draftKey, JSON.stringify({ ...remoteDraft, at: remoteAt }));
      }
    }).catch(() => {}).finally(() => {
      if (alive) setWorkspaceReady(histKey);
    });
    return () => { alive = false; };
  }, [histKey, draftKey]);
  useEffect(() => {
    if (!histKey || !draftKey) return;
    if (!dirty.current && workspaceReady !== histKey) return;
    const at = dirty.current ? Date.now() : (draftAt.current || Date.now());
    if (dirty.current) draftAt.current = at;
    dirty.current = false;
    const items = history.filter((item) => item?.idea && item?.data).slice(0, 10);
    const draft = { idea, prompt, stage, tab, data, at };
    localStorage.setItem(histKey, JSON.stringify(items));
    localStorage.setItem(draftKey, JSON.stringify(draft));
    localStorage.setItem("mindmap-ai-prompt", prompt);
    if (workspaceReady !== histKey) return;
    const timer = setTimeout(() => {
      saveHistory({ items, draft }).catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [history, idea, prompt, stage, tab, data, histKey, draftKey, workspaceReady]);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    localStorage.setItem("theme", theme === "light" ? "light" : "dark");
  }, [theme]);
  useEffect(() => {
    if (!user) return;
    getProfile().then((p) => {
      setKeysReady(Boolean(p.gemini?.configured && p.v0?.configured && p.gamma?.configured));
    }).catch(() => setKeysReady(false));
  }, [user, profile, guide]);
  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4000);
    return () => clearInterval(t);
  }, [loading]);

  const run = async () => {
    mark();
    setLoading(true); setError("");
    try {
      const d = await generate(idea, prompt.trim());
      setData(d); setStage("data"); setTab("map");
      setHistory((h) => [{ idea, data: d, at: Date.now() }, ...h.filter((x) => x.idea !== idea)].slice(0, 10));
    } catch (e) { setError(e.message); }
    setLoading(false);
  };
  const open = (h) => { mark(); setProfile(false); setIdea(h.idea); setData(h.data); setStage("data"); setTab("map"); };
  const saveZip = async () => {
    setZipping(true); setError("");
    try {
      const file = await exportZip({
        idea,
        name: data.mindmap?.center || "projet",
        markdown: toMarkdown(idea, data),
        data,
        chatId: data.v0ChatId || null,
      });
      downloadBlob(file.name, file.blob);
    } catch (e) { setError(e.message); }
    setZipping(false);
  };
  const remove = (i) => { mark(); setHistory((h) => h.filter((_, k) => k !== i)); };
  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  const logout = async () => {
    if (getToken()) {
      try {
        await saveHistory({
          items: history.filter((item) => item?.idea && item?.data).slice(0, 10),
          draft: { idea, prompt, stage, tab, data, at: Date.now() },
        });
      } catch { /* conservé en local, renvoyé à la prochaine connexion */ }
    }
    try { await logoutApi(); } catch { /* session déjà close */ }
    setToken("");
    setUser(null);
    setData(null);
    setIdea("");
    setProfile(false);
    setGuide(false);
  };
  const rememberPrompt = (value) => {
    mark();
    setData((cur) => cur ? { ...cur, v0Prompt: value } : cur);
    setHistory((h) => h.map((item) => item.idea === idea ? { ...item, at: Date.now(), data: { ...item.data, v0Prompt: value } } : item));
  };

  if (booting) {
    return <div className="gate boot"><TechScene /><p>Connexion à l’atelier…</p></div>;
  }
  if (!user) return <Auth onAuth={setUser} />;

  const counts = data && { feat: data.features.length, act: data.actors.length, us: data.stories.length,
    uml: data.classes.length, db: data.tables.length, bk: data.backlog.length };
  const stats = data && [["Fonctionnalités", counts.feat], ["Acteurs", counts.act], ["User stories", counts.us],
    ["Classes", counts.uml], ["Tables", counts.db], ["Tâches", counts.bk],
    ["Points", data.backlog.reduce((a, b) => a + (+b.points || 0), 0)]];
  const patchProject = (partial) => {
    mark();
    setData((cur) => cur ? { ...cur, ...partial } : cur);
    setHistory((h) => h.map((item) => item.idea === idea ? { ...item, at: Date.now(), data: { ...item.data, ...partial } } : item));
  };
  const view = data && { map: <MindMap map={data.mindmap} />, feat: <Features d={data} />, act: <Actors d={data} />,
    us: <Stories d={data} />, uml: <Uml d={data} />, db: <Db d={data} />, bk: <Backlog d={data} /> }[tab];
  const initial = (user.name || user.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="app">
      {(guide || !user.onboarded) && (
        <Onboarding
          replay={Boolean(user.onboarded)}
          initialStep={guideStep}
          onDone={(next, saved) => {
            setUser(next);
            setGuide(false);
            setGuideStep(0);
            if (saved) {
              setKeysReady(Boolean(saved.gemini?.configured && saved.v0?.configured && saved.gamma?.configured));
            }
          }}
          onSkip={(next) => { if (next) setUser(next); setGuide(false); setGuideStep(0); }}
        />
      )}
      <aside className="side">
        <Logo />
        <button className="who" onClick={() => setProfile(true)}>
          {user.picture ? <img src={user.picture} alt="" /> : <span>{initial}</span>}
          <em>
            <strong>{user.name}</strong>
            {user.email}
          </em>
        </button>
        <button className="new" onClick={() => { mark(); setProfile(false); setData(null); setIdea(""); setStage("data"); }}>＋ Nouveau projet</button>
        <div className="hist">
          <h5>Historique</h5>
          {history.length === 0 && <p className="empty">Aucun projet pour le moment.</p>}
          {history.map((h, i) => (
            <div className={"item" + (data === h.data ? " cur" : "")} key={h.at || i}>
              <button className="link" onClick={() => open(h)} title={h.idea}>{h.idea}</button>
              <button className="x" onClick={() => remove(i)} aria-label="Supprimer">×</button>
            </div>
          ))}
        </div>
        <div className="foot">
          <button className={"profilebtn" + (profile ? " on" : "")} onClick={() => setProfile((open) => !open)}>
            Profil{!keysReady && <em>clé</em>}
          </button>
          <button className="theme" onClick={toggleTheme}>
            {theme === "light" ? "◐ Thème nuit" : "◑ Thème clair"}
          </button>
          <button className="theme" onClick={logout}>Déconnexion</button>
        </div>
      </aside>

      <main className="main">
        {profile && (
          <Profile
            user={user}
            onLogout={logout}
            onGuide={(step = 0) => { setProfile(false); setGuideStep(step); setGuide(true); }}
            onSaved={(p) => {
              setKeysReady(Boolean(p.gemini?.configured && p.v0?.configured && p.gamma?.configured));
              if (p.user) setUser(p.user);
            }}
          />
        )}
        {!profile && data && (
          <nav className="stages" aria-label="Étapes du projet">
            {STAGES.map(([id, num, title, text]) => (
              <button key={id} type="button" className={stage === id ? "stage on" : "stage"} onClick={() => { mark(); setStage(id); }}>
                <b>{num}</b>
                <strong>{title}</strong>
                <span>{text}</span>
              </button>
            ))}
          </nav>
        )}
        {!profile && (!data || stage === "data") && <section className={"hero" + (data ? " compact" : "")}>
          {!data && <div className="hero-stage"><TechScene compact /></div>}
          <p className="kicker">{data ? "01 · IDÉE ET DONNÉES" : "POSTE DE CONCEPTION"}</p>
          <h1>{data ? (data.mindmap?.center || "Projet") : "Trois étapes, un seul projet"}</h1>
          <p className="sub">{data
            ? "Les données restent la source des deux étapes suivantes : l’interface, puis la présentation."
            : "Décris l’idée. L’atelier produit les données, l’interface, puis un diaporama Gamma à partir du même projet."}</p>
          <div className="compose">
            <textarea value={idea} onChange={(e) => { mark(); setIdea(e.target.value); }} rows={2}
              placeholder="Décris ton idée… ex. : une application de livraison de repas"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && idea.trim().length > 4 && !loading) run(); }} />
            <button className="go" onClick={run} disabled={loading || idea.trim().length < 5}>
              {loading ? "…" : data ? "Régénérer" : "Générer"}
            </button>
          </div>
          <div className="prompt-tools">
            <button type="button" className={promptOpen ? "chip on" : "chip"} onClick={() => setPromptOpen((open) => !open)}>
              {promptOpen ? "Masquer le prompt" : "Modifier le prompt"}
            </button>
            {promptOpen && prompt !== DEFAULT_PROMPT && (
              <button type="button" className="chip" onClick={() => { mark(); setPrompt(DEFAULT_PROMPT); }}>Réinitialiser</button>
            )}
          </div>
          {promptOpen && (
            <textarea className="prompt editor" value={prompt} rows={5} onChange={(e) => { mark(); setPrompt(e.target.value); }}
              aria-label="Prompt de génération" />
          )}
          {!data && <div className="chips">
            {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => { mark(); setIdea(e); }}>{e}</button>)}
          </div>}
          {error && <p className="err">⚠️ {error}</p>}
        </section>}

        {!profile && loading && (
          <div className="loader">
            <div className="orbit"><i /></div>
            <b>{STEPS[step]}</b>
            <div className="bar"><i style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
          </div>
        )}

        {!profile && data && !loading && stage === "data" && (
          <>
            <div className="stats">{stats.map(([l, v]) => <div className="holo" key={l}><b>{v}</b><span>{l}</span></div>)}</div>
            <div className="bar2">
              <nav className="tabs">
                {TABS.map(([id, ic, l]) => (
                  <button key={id} className={tab === id ? "on" : ""} onClick={() => { mark(); setTab(id); }}>
                    {ic} {l}{counts[id] != null && <em>{counts[id]}</em>}
                  </button>
                ))}
              </nav>
              <div className="exp">
                <button onClick={saveZip} disabled={zipping}>{zipping ? "Préparation…" : "⬇ Projet .zip"}</button>
                <button onClick={() => download("projet.md", toMarkdown(idea, data), "text/markdown")}>⬇ Markdown</button>
                <button onClick={() => download("projet.json", JSON.stringify(data, null, 2), "application/json")}>⬇ JSON</button>
              </div>
            </div>
            <div className="panel">{view}</div>
          </>
        )}

        {!profile && data && !loading && stage === "ui" && (
          <section className="panel">
            <p className="kicker">02 · INTERFACE</p>
            <h2 className="stage-title">Visualiser {data.mindmap?.center || "le projet"}</h2>
            <V0Prompt key={idea} idea={idea} d={data} launch={launch} launched={launched} onBusy={setV0Busy} onPrompt={rememberPrompt} onDesign={(uiDesign) => patchProject({ uiDesign })} onChat={(chat) => {
              patchProject({ v0ChatId: chat.id, v0MessageId: chat.messageId });
            }} />
            {v0Busy && <p className="hint">Génération de l’interface en cours…</p>}
          </section>
        )}

        {!profile && data && !loading && stage === "deck" && (
          <section className="panel">
            <p className="kicker">03 · PRÉSENTATION</p>
            <h2 className="stage-title">Présenter {data.mindmap?.center || "le projet"}</h2>
            <GammaDeck key={idea} idea={idea} d={data} onPrompt={(value) => patchProject({ gammaPrompt: value })} onDesign={(deckDesign) => patchProject({ deckDesign })} onDeck={(deck) => {
              patchProject({
                ...(deck.generationId ? { gammaGenerationId: deck.generationId } : {}),
                ...((deck.designId || deck.gammaId) ? { gammaId: deck.designId || deck.gammaId } : {}),
                ...((deck.viewUrl || deck.gammaUrl) ? { gammaUrl: deck.viewUrl || deck.gammaUrl } : {}),
                ...(deck.embedUrl ? { gammaEmbed: deck.embedUrl } : {}),
              });
            }} />
          </section>
        )}
      </main>
    </div>
  );
}
