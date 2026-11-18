import base64, io, json, os, re, socket, threading, time, urllib.error, urllib.parse, urllib.request, zipfile
from calendar import timegm
from pathlib import Path
import accounts
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field

load_dotenv()

def allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
    origins = [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]
    return origins or ["http://localhost:5173"]

app = FastAPI(title="Idevia")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_methods=["*"], allow_headers=["*"],
)
ENV_PATH = Path(__file__).resolve().parent / ".env"
ENV_LOCK = threading.Lock()
RESERVED = {"GEMINI_API_KEY", "V0_API_KEY", "GAMMA_API_KEY", "MODEL", "ALLOWED_ORIGINS", "DATA_DIR", "GOOGLE_CLIENT_ID"}
BLOCKED = {
    "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
    "USERPROFILE", "HOME", "PYTHONPATH", "VIRTUAL_ENV", "PROMPT",
}
API_KEY = ""
V0_KEY = ""
GAMMA_KEY = ""
MODEL = "gemini-3.1-flash-lite"
FALLBACKS = []
client = None

def refresh_runtime():
    global API_KEY, V0_KEY, GAMMA_KEY, MODEL, client, FALLBACKS
    API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
    V0_KEY = os.getenv("V0_API_KEY", "").strip()
    GAMMA_KEY = os.getenv("GAMMA_API_KEY", "").strip()
    MODEL = os.getenv("MODEL", "gemini-3.1-flash-lite").strip() or "gemini-3.1-flash-lite"
    FALLBACKS = []
    for _m in (
        "gemini-3.1-flash-lite", MODEL, "gemini-3.5-flash-lite", "gemini-3.6-flash",
        "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.8-flash",
    ):
        if _m and _m not in FALLBACKS:
            FALLBACKS.append(_m)
    client = genai.Client(api_key=API_KEY) if API_KEY else None

refresh_runtime()

ROLE = """Tu es un architecte logiciel et un Product Owner expérimenté.
Tu transformes une idée en projet structuré, dans la langue de l'utilisateur."""
JSON_CONTRACT = """Réponds UNIQUEMENT par un JSON valide, sans texte ni balises markdown, de la forme :
{"mindmap":{"center":"nom court","branches":[{"name":"...","children":["..."]}]},
"features":[{"name":"...","desc":"...","priority":"Must|Should|Could"}],
"actors":[{"name":"...","role":"..."}],
"stories":[{"actor":"...","want":"...","so":"..."}],
"classes":[{"name":"...","attrs":["nom: type"],"methods":["nom()"],"rel":["1..* Autre"]}],
"tables":[{"name":"...","cols":[{"n":"id","t":"INT","k":"PK"}]}],
"backlog":[{"sprint":1,"title":"...","points":3}],
"v0Prompt":"prompt complet à coller dans v0 pour générer l'interface",
"gammaPrompt":"brief de présentation, diapositives séparées par ---"}
Contraintes : mindmap 5-6 branches de 3-4 enfants (max 3 mots) ; 6-8 features ; 3-4 acteurs ;
8-10 user stories ; 4-5 classes ; 5-6 tables (k = PK, FK ou "") ; 10-12 éléments de backlog sur 3 sprints.
v0Prompt : 200 à 350 mots, en français, prêt à coller dans v0. Décris le produit, les écrans,
les composants, la navigation et les user stories à couvrir. Demande une app React responsive,
claire, avec des cartes et des états vides. Termine en exigeant une génération immédiate,
sans question, sans choix et sans demande de confirmation. N'inclus pas de JSON dans v0Prompt.
gammaPrompt : brief en français pour Gamma, 8 diapositives. Chaque diapositive commence par un titre,
puis 3 puces courtes. Sépare les diapositives par une ligne contenant seulement ---.
Couvre problème, solution, utilisateurs, fonctionnalités, parcours, architecture et prochaines étapes.
N'inclus pas de JSON dans gammaPrompt."""
SYSTEM = ROLE + "\n" + JSON_CONTRACT

class Req(BaseModel):
    idea: str = Field(min_length=5, max_length=1500)
    prompt: str | None = Field(default=None, max_length=6000)

class V0Req(BaseModel):
    prompt: str = Field(min_length=20, max_length=12000)

class ZipReq(BaseModel):
    idea: str = Field(min_length=1, max_length=1500)
    name: str = Field(default="projet", max_length=80)
    markdown: str = Field(min_length=1, max_length=200000)
    data: dict
    chatId: str | None = None

class ExtraKey(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    value: str = Field(default="", max_length=2000)

class ProfileUpdate(BaseModel):
    geminiKey: str | None = Field(default=None, max_length=500)
    v0Key: str | None = Field(default=None, max_length=500)
    gammaKey: str | None = Field(default=None, max_length=500)
    model: str | None = Field(default=None, max_length=80)
    clearGemini: bool = False
    clearV0: bool = False
    clearGamma: bool = False
    extra: list[ExtraKey] = []
    removeExtra: list[str] = []
    finishOnboarding: bool = False

class SignupReq(BaseModel):
    name: str = Field(default="", max_length=80)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=200)

class LoginReq(BaseModel):
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=1, max_length=200)

class GoogleReq(BaseModel):
    credential: str = Field(min_length=20, max_length=8000)

class HistoryItemIn(BaseModel):
    idea: str = Field(default="", max_length=1500)
    data: dict = Field(default_factory=dict)
    at: int = 0

class HistoryDraftIn(BaseModel):
    idea: str = Field(default="", max_length=1500)
    prompt: str = Field(default="", max_length=6000)
    stage: str = Field(default="data", max_length=20)
    tab: str = Field(default="map", max_length=20)
    data: dict | None = None
    at: int = 0

class HistorySave(BaseModel):
    items: list[HistoryItemIn] = Field(default_factory=list)
    draft: HistoryDraftIn = Field(default_factory=HistoryDraftIn)

def overloaded(err: errors.APIError) -> bool:
    code = getattr(err, "code", None)
    msg = (getattr(err, "message", None) or str(err)).lower()
    needles = ("high demand", "unavailable", "overloaded", "no longer available", "not found", "not supported")
    return code in (404, 429, 503) or any(n in msg for n in needles)

def parse_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    return json.loads(text[start:end + 1])

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/health")
def api_health():
    return {
        "ok": True, "model": MODEL, "fallbacks": FALLBACKS,
        "provider": "gemini", "key_configured": bool(API_KEY),
        "v0_configured": bool(V0_KEY),
        "gamma_configured": bool(GAMMA_KEY),
        "v0_hosts": PREVIEW_HOSTS,
        "v0_host_error": PREVIEW_HOST_ERROR,
    }

def mask(value: str) -> str:
    value = value.strip()
    if len(value) < 8:
        return ""
    return "••••" + value[-4:]

def read_env() -> dict[str, str]:
    if not ENV_PATH.exists():
        return {}
    found = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            continue
        key, _, value = raw.partition("=")
        found[key.strip()] = value
    return found

def write_env(values: dict[str, str], remove: set[str]):
    lines = ENV_PATH.read_text(encoding="utf-8").splitlines() if ENV_PATH.exists() else []
    seen = set()
    out = []
    for line in lines:
        raw = line.strip()
        if not raw or raw.startswith("#") or "=" not in raw:
            out.append(line)
            continue
        key = raw.partition("=")[0].strip()
        if key in remove:
            continue
        if key in values:
            out.append(f"{key}={values[key]}")
            seen.add(key)
        else:
            out.append(line)
    for key, value in values.items():
        if key not in seen:
            out.append(f"{key}={value}")
    ENV_PATH.write_text("\n".join(out) + "\n", encoding="utf-8")

def check_name(name: str):
    if name in RESERVED or name in BLOCKED or not re.fullmatch(r"[A-Z][A-Z0-9_]{0,39}", name):
        raise HTTPException(400, f"Nom de clé invalide : {name}")

def profile_view(user: dict) -> dict:
    gemini = (user.get("gemini") or "").strip()
    v0 = (user.get("v0") or "").strip()
    gamma = (user.get("gamma") or "").strip()
    extra = [
        {"name": key, "hint": mask(value)}
        for key, value in (user.get("extra") or {}).items()
    ]

    def state(personal: str, fallback: str) -> dict:
        return {
            "configured": bool(personal or fallback),
            "personal": bool(personal),
            "hint": mask(personal) if personal else "",
            "source": "account" if personal else ("server" if fallback else "none"),
        }

    return {
        "gemini": state(gemini, API_KEY),
        "v0": state(v0, V0_KEY),
        "gamma": state(gamma, GAMMA_KEY),
        "model": (user.get("model") or "").strip() or MODEL,
        "extra": extra,
        "user": accounts.public_user(user),
    }

def require_user(request: Request) -> dict:
    header = request.headers.get("authorization") or ""
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    user = accounts.session_user(token)
    if not user:
        raise HTTPException(401, "Connexion requise.")
    request.state.token = token
    return user

def raise_account(err: accounts.AccountError):
    raise HTTPException(err.status, err.message)

def auth_payload(token: str, user: dict) -> dict:
    return {"token": token, "user": accounts.public_user(user)}

def active_gemini(user: dict) -> str:
    return (user.get("gemini") or "").strip() or API_KEY

def active_v0(user: dict) -> str:
    return (user.get("v0") or "").strip() or V0_KEY

def active_gamma(user: dict) -> str:
    return (user.get("gamma") or "").strip() or GAMMA_KEY

def clean_secret(value: str | None, label: str) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if any(ch in value for ch in "\r\n"):
        raise HTTPException(400, f"{label} contient un retour à la ligne.")
    return value

@app.get("/api/auth/config")
def auth_config():
    return {"googleClientId": os.getenv("GOOGLE_CLIENT_ID", "").strip()}

@app.post("/api/auth/signup")
def auth_signup(req: SignupReq):
    try:
        token, user = accounts.signup(req.email, req.password, req.name)
    except accounts.AccountError as err:
        raise_account(err)
    return auth_payload(token, user)

@app.post("/api/auth/login")
def auth_login(req: LoginReq):
    try:
        token, user = accounts.login(req.email, req.password)
    except accounts.AccountError as err:
        raise_account(err)
    return auth_payload(token, user)

def google_identity(credential: str) -> dict:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise HTTPException(400, "Connexion Gmail non configurée. Ajoute GOOGLE_CLIENT_ID dans le serveur.")
    url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + urllib.parse.quote(credential)
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=15) as res:
            data = json.loads(res.read().decode())
    except urllib.error.HTTPError:
        raise HTTPException(401, "Jeton Google refusé.")
    except (urllib.error.URLError, TimeoutError, socket.timeout):
        raise HTTPException(502, "Google n’a pas répondu. Réessaie.")
    if data.get("aud") != client_id:
        raise HTTPException(401, "Jeton Google invalide.")
    if str(data.get("email_verified", "")).lower() != "true":
        raise HTTPException(401, "Le compte Gmail n’est pas vérifié.")
    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(401, "Google n’a pas fourni d’e-mail.")
    return {
        "email": email,
        "name": data.get("name") or email.split("@")[0],
        "picture": data.get("picture") or "",
        "sub": data.get("sub") or "",
    }

@app.post("/api/auth/google")
def auth_google(req: GoogleReq):
    try:
        token, user = accounts.login_google(google_identity(req.credential))
    except accounts.AccountError as err:
        raise_account(err)
    return auth_payload(token, user)

@app.get("/api/auth/me")
def auth_me(user: dict = Depends(require_user)):
    return accounts.public_user(user)

@app.get("/api/history")
def read_history(user: dict = Depends(require_user)):
    return accounts.get_workspace(user["id"])

@app.put("/api/history")
def write_history(req: HistorySave, user: dict = Depends(require_user)):
    items = [item.model_dump() for item in req.items[:10]]
    return accounts.save_workspace(user["id"], items, req.draft.model_dump())

@app.post("/api/auth/logout")
def auth_logout(request: Request, user: dict = Depends(require_user)):
    accounts.logout(request.state.token)
    return {"ok": True}

@app.post("/api/auth/skip-onboarding")
def skip_onboarding(user: dict = Depends(require_user)):
    saved = accounts.update_user(user["id"], {"onboarded": True})
    if not saved:
        raise HTTPException(401, "Compte introuvable.")
    return accounts.public_user(saved)

@app.get("/api/profile")
def get_profile(user: dict = Depends(require_user)):
    return profile_view(user)

@app.put("/api/profile")
def update_profile(req: ProfileUpdate, user: dict = Depends(require_user)):
    gemini = clean_secret(req.geminiKey, "La clé Gemini")
    v0 = clean_secret(req.v0Key, "La clé v0")
    gamma = clean_secret(req.gammaKey, "La clé Gamma")
    model = clean_secret(req.model, "Le modèle")
    changes = {}
    if gemini:
        changes["gemini"] = gemini
    elif req.clearGemini:
        changes["gemini"] = ""
    if v0:
        changes["v0"] = v0
    elif req.clearV0:
        changes["v0"] = ""
    if gamma:
        changes["gamma"] = gamma
    elif req.clearGamma:
        changes["gamma"] = ""
    if model:
        changes["model"] = model
    extra = dict(user.get("extra") or {})
    for name in req.removeExtra:
        name = name.strip()
        check_name(name)
        extra.pop(name, None)
    for item in req.extra:
        name = item.name.strip()
        check_name(name)
        value = clean_secret(item.value, name)
        if not value:
            raise HTTPException(400, f"Indique la valeur de {name}.")
        extra[name] = value
    changes["extra"] = extra
    if req.finishOnboarding:
        changes["onboarded"] = True
    saved = accounts.update_user(user["id"], changes)
    if not saved:
        raise HTTPException(401, "Compte introuvable.")
    if changes.get("v0"):
        threading.Thread(target=ensure_preview_hosts, args=(changes["v0"],), daemon=True).start()
    return profile_view(saved)

def gemini_text(user: dict, contents: str, system: str, json_mode: bool = False) -> tuple[str, str]:
    key = active_gemini(user)
    if not key:
        raise HTTPException(500, "Clé Gemini manquante. Ouvre le guide des clés dans ton profil.")
    preferred = (user.get("model") or "").strip()
    models = []
    for name in (preferred, *FALLBACKS):
        if name and name not in models:
            models.append(name)
    ai = genai.Client(api_key=key)
    last = "Aucun modèle disponible."
    for model in models:
        try:
            msg = ai.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=8000,
                    **({"response_mime_type": "application/json"} if json_mode else {}),
                ),
            )
            text = (msg.text or "").strip()
            if text:
                return text, model
            last = "Réponse vide."
        except errors.APIError as e:
            last = e.message or str(e)
            if overloaded(e):
                continue
            raise HTTPException(502, f"Erreur API : {last}")
    raise HTTPException(502, f"Erreur API : {last}")

@app.post("/api/generate")
def generate(req: Req, user: dict = Depends(require_user)):
    custom = (req.prompt or "").strip()
    system = f"{custom}\n\n{JSON_CONTRACT}" if custom else SYSTEM
    raw, model = gemini_text(user, f"Idée : « {req.idea} »", system, json_mode=True)
    try:
        data = parse_json(raw)
    except json.JSONDecodeError:
        raise HTTPException(502, "Réponse IA invalide, réessaie.")
    data["model"] = model
    for k in ("mindmap", "features", "actors", "stories", "classes", "tables", "backlog"):
        data.setdefault(k, [] if k != "mindmap" else {"center": "Projet", "branches": []})
    data.setdefault("v0Prompt", "")
    data.setdefault("gammaPrompt", "")
    return data

PREVIEW_CACHE = {}
PREVIEW_HOSTS = []
PREVIEW_HOST_ERROR = ""
PREVIEW_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]
LOCAL_PREVIEW_HOSTS = ["127.0.0.1", "localhost"]

def v0_call(method: str, path: str, body: dict | None = None, timeout: int = 30, key: str | None = None):
    token = (V0_KEY if key is None else key).strip()
    if not token:
        raise HTTPException(400, "Clé v0 manquante. Ouvre le guide des clés dans ton profil.")
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"https://api.v0.dev/v2{path}",
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        raise HTTPException(502, f"Erreur v0 ({e.code}) : {detail or e.reason}")
    except (urllib.error.URLError, TimeoutError, socket.timeout):
        raise HTTPException(502, "v0 n’a pas répondu à temps. Réessaie.")

def ensure_preview_hosts(key: str | None = None):
    global PREVIEW_HOSTS, PREVIEW_HOST_ERROR
    token = (V0_KEY if key is None else key).strip()
    if not token:
        return
    try:
        current = v0_call("GET", "/settings/preview-hosts", key=token) or {}
        have = list(current.get("hosts") or [])
        if set(LOCAL_PREVIEW_HOSTS).issubset(have):
            PREVIEW_HOSTS = have
            PREVIEW_HOST_ERROR = ""
            return
        saved = v0_call("PUT", "/settings/preview-hosts", {"hosts": list(dict.fromkeys([*have, *LOCAL_PREVIEW_HOSTS]))}, key=token) or {}
        PREVIEW_HOSTS = list(saved.get("hosts") or [])
        PREVIEW_HOST_ERROR = ""
    except HTTPException as exc:
        detail = str(exc.detail)
        if "already allowed" in detail:
            PREVIEW_HOSTS = list(LOCAL_PREVIEW_HOSTS)
            PREVIEW_HOST_ERROR = ""
            return
        PREVIEW_HOST_ERROR = detail[:300]
        kept = []
        for host in LOCAL_PREVIEW_HOSTS:
            try:
                saved = v0_call("PATCH", "/settings/preview-hosts", {"hosts": [host]}, key=token) or {}
                kept = list(saved.get("hosts") or kept)
                PREVIEW_HOST_ERROR = ""
            except HTTPException as nested:
                PREVIEW_HOST_ERROR = str(nested.detail)[:300]
        PREVIEW_HOSTS = kept

@app.on_event("startup")
def _trust_local_preview():
    ensure_preview_hosts()

def key_for_chat(chat_id: str) -> str:
    row = accounts.chat_record(chat_id) or {}
    owner = accounts.get_user(row.get("userId") or "")
    if owner and row.get("personal") and (owner.get("v0") or "").strip():
        return owner["v0"].strip()
    return V0_KEY

def get_preview(chat_id: str, key: str | None = None):
    now = time.time()
    cached = PREVIEW_CACHE.get(chat_id)
    if cached and cached["exp"] - now > 60:
        return cached["data"]
    try:
        data = v0_call("GET", f"/chats/{chat_id}/preview", key=key)
    except HTTPException:
        return cached["data"] if cached else None
    if not data or not data.get("url") or not data.get("token"):
        PREVIEW_CACHE.pop(chat_id, None)
        return None
    try:
        exp = timegm(time.strptime(data["expiresAt"][:19], "%Y-%m-%dT%H:%M:%S"))
    except (KeyError, ValueError):
        exp = now + 300
    PREVIEW_CACHE[chat_id] = {"data": data, "exp": exp}
    return data

def loading_page(chat_id: str) -> HTMLResponse:
    target = f"/preview/{chat_id}/"
    html = f"""<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="refresh" content="2;url={target}">
<style>body{{margin:0;display:grid;place-items:center;height:100vh;font-family:system-ui;background:#111;color:#eee}}</style>
</head><body>Génération de l’interface…</body></html>"""
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})

def proxy_preview(chat_id: str, path: str, request: Request, body: bytes) -> Response:
    if not re.fullmatch(r"[A-Za-z0-9_-]{4,80}", chat_id):
        raise HTTPException(400, "Identifiant v0 invalide.")
    if path == "loading":
        return loading_page(chat_id)
    preview = get_preview(chat_id, key_for_chat(chat_id))
    if not preview:
        return loading_page(chat_id)
    url = preview["url"].rstrip("/") + "/" + path.lstrip("/")
    if request.url.query:
        url += "?" + str(request.url.query)
    headers = {"x-v0-preview-token": preview["token"], "Accept-Encoding": "identity"}
    for name in ("accept", "content-type"):
        if request.headers.get(name):
            headers[name] = request.headers[name]
    upstream = urllib.request.Request(url, data=body or None, headers=headers, method=request.method)
    try:
        with urllib.request.urlopen(upstream, timeout=60) as res:
            payload = res.read()
            status = res.status
            resp_headers = dict(res.headers.items())
    except urllib.error.HTTPError as e:
        payload = e.read()
        status = e.code
        resp_headers = dict(e.headers.items())
    except (urllib.error.URLError, TimeoutError, socket.timeout):
        PREVIEW_CACHE.pop(chat_id, None)
        return loading_page(chat_id)
    refresh = header_value(resp_headers, "x-v0-preview-refresh") == "1"
    stale = refresh or status in (410, 502, 503) or (status == 404 and not path)
    if stale:
        PREVIEW_CACHE.pop(chat_id, None)
        name = path.rsplit("/", 1)[-1]
        if request.method in ("GET", "HEAD") and (not name or "." not in name):
            return loading_page(chat_id)
    content_type = header_value(resp_headers, "content-type") or ""
    payload = rewrite_preview(payload, content_type, chat_id)
    passed = {}
    for key, value in resp_headers.items():
        low = key.lower()
        if low in ("content-type", "cache-control", "etag"):
            passed[key] = value
    location = header_value(resp_headers, "location")
    if location:
        passed["Location"] = rewrite_location(location, preview["url"], chat_id)
    passed["Cache-Control"] = "no-store"
    passed["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return Response(payload, status, passed)

def header_value(headers: dict, name: str) -> str | None:
    wanted = name.lower()
    for key, value in headers.items():
        if key.lower() == wanted:
            return value
    return None

def rewrite_location(location: str, preview_url: str, chat_id: str) -> str:
    base = preview_url.rstrip("/")
    if location.startswith(base):
        return f"/preview/{chat_id}" + location[len(base):]
    return location

def rewrite_preview(payload: bytes, content_type: str, chat_id: str) -> bytes:
    kind = content_type.lower()
    if "text/html" not in kind and "text/css" not in kind:
        return payload
    text = payload.decode("utf-8", "replace")
    prefix = f"/preview/{chat_id}"
    text = re.sub(
        r'(?P<attr>\b(?:href|src|action)\s*=\s*["\'])/(?!/|preview/)',
        rf"\g<attr>{prefix}/",
        text,
    )
    text = re.sub(r"url\(\s*/(?!/|preview/)", f"url({prefix}/", text)
    return text.encode("utf-8")

@app.middleware("http")
async def route_preview_assets(request: Request, call_next):
    path = request.url.path
    if path == "/health" or path.startswith("/preview/") or path.startswith("/api/") or path.startswith("/docs"):
        return await call_next(request)
    match = re.search(r"/preview/([A-Za-z0-9_-]+)", request.headers.get("referer") or "")
    if match:
        target = f"/preview/{match.group(1)}{path}"
        if request.url.query:
            target += "?" + request.url.query
        return Response(status_code=307, headers={"Location": target, "Cache-Control": "no-store"})
    return await call_next(request)

@app.api_route("/preview/{chat_id}", methods=PREVIEW_METHODS)
@app.api_route("/preview/{chat_id}/{path:path}", methods=PREVIEW_METHODS)
async def preview_proxy(chat_id: str, request: Request, path: str = ""):
    return proxy_preview(chat_id, path, request, await request.body())

def chat_url(chat_id: str | None) -> str | None:
    return f"https://v0.app/chat/{chat_id}" if chat_id else None

V0_SYSTEM = (
    "Tu génères immédiatement une interface React complète, moderne, responsive et en français. "
    "Ne pose aucune question. Ne propose aucun choix. Ne demande aucune confirmation, aucun plan à valider, "
    "aucune autorisation, aucune intégration et aucun compte Vercel. "
    "Décide toi-même et construis tous les écrans dans la même réponse."
)
V0_HANDLED = set()
V0_CONTINUED = {}

def option_label(option) -> str:
    if isinstance(option, str):
        return option.strip()
    if isinstance(option, dict):
        return str(option.get("label") or option.get("text") or "").strip()
    return ""

def blocking_task(message: dict):
    if message.get("finishReason") in (None, ""):
        return None
    parts = message.get("parts") or []
    for part in parts:
        if part.get("type") == "tool-call" and part.get("suggestedPermissions"):
            return "resolve", {"type": "confirmed-permissions", "permissions": part["suggestedPermissions"]}
    for part in parts:
        if part.get("type") != "agent-action":
            continue
        name = part.get("name") or ""
        data = part.get("data") if isinstance(part.get("data"), dict) else {}
        if name == "ask_user_questions":
            answers = []
            for question in data.get("questions") or []:
                qid = str(question.get("id") or "").strip()
                text = str(question.get("question") or question.get("header") or "Question").strip()
                if not qid or not text:
                    continue
                labels = [option_label(item) for item in (question.get("options") or [])]
                labels = [label for label in labels if label and label.lower() not in ("other", "autre", "autres")]
                if not labels:
                    labels = [option_label(item) for item in (question.get("options") or []) if option_label(item)]
                answer = {"questionId": qid, "questionText": text, "selectedLabels": labels[:1]}
                if not answer["selectedLabels"]:
                    answer["customText"] = "Continue avec le choix le plus simple, sans me redemander."
                answers.append(answer)
            if answers:
                return "resolve", {"type": "answered-questions", "answers": answers}
        if name == "exit_plan_mode":
            return "resolve", {
                "type": "plan-exit-response",
                "status": "approved",
                "content": "Approuvé. Génère l'interface complète maintenant, sans autre question ni choix.",
            }
        if name == "get_or_request_integration":
            return "resolve", {
                "type": "confirmed-steps",
                "connectedIntegrationNames": [],
                "connectedMcpPresetNames": [],
                "appliedScripts": [],
                "addedEnvVars": [],
            }
        if name == "configure_vercel_connect":
            return "follow", (
                "Continue sans Vercel, sans intégration et sans connexion externe. "
                "Génère l'interface complète maintenant."
            )
    return None

def latest_message_id(chat_id: str, key: str, current: str) -> str | None:
    try:
        payload = v0_call("GET", f"/chats/{chat_id}/messages", key=key) or {}
    except HTTPException:
        return None
    if isinstance(payload, list):
        items = payload
    else:
        items = payload.get("data") or payload.get("messages") or payload.get("items") or []
    chosen = None
    for item in items:
        if isinstance(item, dict) and item.get("id"):
            chosen = item["id"]
    if chosen and chosen != current:
        return chosen
    return None

def continue_v0(chat_id: str, message: dict, key: str) -> str | None:
    mid = str(message.get("id") or "")
    token = f"{chat_id}:{mid}"
    if not mid or token in V0_HANDLED or V0_CONTINUED.get(chat_id, 0) >= 8:
        return None
    task = blocking_task(message)
    if not task:
        return None
    kind, body = task
    try:
        if kind == "follow":
            payload = v0_call(
                "POST", f"/chats/{chat_id}/messages/async",
                {"message": body, "systemPrompt": V0_SYSTEM}, key=key,
            ) or {}
        else:
            payload = v0_call(
                "POST", f"/chats/{chat_id}/messages/resolve/async",
                {"task": body}, key=key,
            ) or {}
    except HTTPException as exc:
        if "(409)" in str(exc.detail):
            V0_HANDLED.add(token)
            return latest_message_id(chat_id, key, mid)
        return None
    V0_HANDLED.add(token)
    V0_CONTINUED[chat_id] = V0_CONTINUED.get(chat_id, 0) + 1
    return payload.get("messageId") or payload.get("id")

@app.post("/api/v0")
def create_v0(req: V0Req, user: dict = Depends(require_user)):
    key = active_v0(user)
    personal = bool((user.get("v0") or "").strip())
    payload = v0_call("POST", "/chats/async", {
        "message": req.prompt,
        "systemPrompt": V0_SYSTEM,
        "modelConfiguration": {
            "modelId": os.getenv("V0_MODEL", "v0-mini"),
            "imageGenerations": False,
        },
        "privacy": "private",
    }, key=key)
    chat_id = payload.get("chatId") or payload.get("id")
    if chat_id:
        accounts.bind_chat(chat_id, user["id"], personal)
    return {
        "id": chat_id,
        "messageId": payload.get("messageId"),
        "url": payload.get("url") or chat_url(chat_id),
        "ready": False,
        "pending": True,
    }

def zip_slug(name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_-]+", "-", name).strip("-")[:40]
    return slug or "projet"

def safe_code_path(path: str) -> str | None:
    parts = [part for part in path.replace("\\", "/").split("/") if part and part != "."]
    if not parts or any(part == ".." for part in parts):
        return None
    return "code/" + "/".join(parts)

def project_code(chat_id: str | None, key: str | None = None) -> list[tuple[str, bytes]]:
    token = (V0_KEY if key is None else key).strip()
    if not chat_id or not re.fullmatch(r"[A-Za-z0-9_-]{4,80}", chat_id) or not token:
        return []
    try:
        payload = v0_call("GET", f"/chats/{chat_id}/files", timeout=60, key=token) or {}
    except HTTPException:
        return []
    files = []
    for item in payload.get("files") or []:
        target = safe_code_path(str(item.get("path") or ""))
        if not target:
            continue
        content = item.get("content") or ""
        if item.get("encoding") == "base64":
            try:
                raw = base64.b64decode(content)
            except (ValueError, TypeError):
                continue
        else:
            raw = str(content).encode("utf-8")
        files.append((target, raw))
    return files

@app.post("/api/export")
def export_zip(req: ZipReq, user: dict = Depends(require_user)):
    folder = zip_slug(req.name)
    buffer = io.BytesIO()
    key = key_for_chat(req.chatId) if req.chatId else active_v0(user)
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(f"{folder}/README.md", req.markdown)
        archive.writestr(f"{folder}/projet.json", json.dumps(req.data, ensure_ascii=False, indent=2))
        for path, raw in project_code(req.chatId, key):
            archive.writestr(f"{folder}/{path}", raw)
    filename = f"{folder}.zip"
    return Response(
        buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

@app.get("/api/v0/{chat_id}/{message_id}")
def v0_status(chat_id: str, message_id: str, user: dict = Depends(require_user)):
    if not re.fullmatch(r"[A-Za-z0-9_-]{4,80}", chat_id) or not re.fullmatch(r"[A-Za-z0-9_-]{4,80}", message_id):
        raise HTTPException(400, "Identifiant v0 invalide.")
    key = key_for_chat(chat_id) or active_v0(user)
    payload = v0_call("GET", f"/chats/{chat_id}/messages/{message_id}", key=key)
    nxt = continue_v0(chat_id, payload, key)
    active_id = nxt or message_id
    pending = bool(nxt) or payload.get("finishReason") in (None, "")
    preview_ready = get_preview(chat_id, key) is not None
    return {
        "id": chat_id,
        "messageId": active_id,
        "url": chat_url(chat_id),
        "ready": preview_ready,
        "pending": pending or not preview_ready,
    }

GAMMA_JOBS = {}
GAMMA_ID = re.compile(r"[A-Za-z0-9_-]{4,120}")
GAMMA_BRIEF = """Tu rédiges un brief de présentation pour Gamma, dans la langue du projet.
Réponds uniquement par le brief, sans JSON et sans balises markdown.
8 diapositives. Chaque diapositive commence par un titre seul sur sa ligne, puis 3 puces courtes.
Sépare les diapositives par une ligne contenant seulement ---.
Couvre : problème, solution, utilisateurs, fonctionnalités clés, parcours, architecture, données, prochaines étapes.
Reste fidèle au projet fourni. N'invente pas de chiffres."""

class GammaPromptReq(BaseModel):
    idea: str = Field(min_length=5, max_length=1500)
    data: dict
    current: str = Field(default="", max_length=20000)
    note: str = Field(default="", max_length=800)

class GammaCreate(BaseModel):
    prompt: str = Field(min_length=40, max_length=20000)
    title: str = Field(default="Projet", max_length=120)

class GammaFileReq(BaseModel):
    generationId: str | None = Field(default=None, max_length=120)
    gammaId: str | None = Field(default=None, max_length=120)
    designId: str | None = Field(default=None, max_length=120)
    format: str = Field(default="pptx", max_length=8)
    title: str = Field(default="presentation", max_length=80)

def project_digest(idea: str, data: dict) -> str:
    mind = data.get("mindmap") or {}
    center = mind.get("center") or "Projet"
    branches = []
    for branch in (mind.get("branches") or [])[:6]:
        kids = ", ".join((branch.get("children") or [])[:4])
        branches.append(f"{branch.get('name', '')} ({kids})" if kids else str(branch.get("name") or ""))
    features = "; ".join((item.get("name") or "") for item in (data.get("features") or [])[:8])
    actors = "; ".join(f"{item.get('name')} : {item.get('role')}" for item in (data.get("actors") or [])[:4])
    stories = " | ".join(
        f"{item.get('actor')} veut {item.get('want')}" for item in (data.get("stories") or [])[:8]
    )
    return (
        f"Projet : {center}\nIdée : {idea}\nBranches : {'; '.join(branches)}\n"
        f"Fonctionnalités : {features}\nActeurs : {actors}\nUser stories : {stories}"
    )

def plain_brief(text: str) -> str:
    text = re.sub(r"^```(?:markdown|text)?|```$", "", text.strip(), flags=re.M).strip()
    text = re.sub(r"[ \t]*---[ \t]*", "\n---\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > 20000:
        text = text[:20000]
    return text

def gamma_call(method: str, path: str, body: dict | None = None, timeout: int = 45, key: str | None = None):
    token = (GAMMA_KEY if key is None else key).strip()
    if not token:
        raise HTTPException(400, "Clé Gamma manquante. Ajoute-la dans le profil.")
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        f"https://public-api.gamma.app/v1.0{path}",
        data=data,
        headers={
            "X-API-KEY": token,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        try:
            parsed = json.loads(detail)
            detail = parsed.get("message") or parsed.get("error") or detail
            if isinstance(detail, dict):
                detail = detail.get("message") or str(detail)
        except json.JSONDecodeError:
            pass
        raise HTTPException(502, f"Erreur Gamma ({e.code}) : {detail or e.reason}")
    except (urllib.error.URLError, TimeoutError, socket.timeout):
        raise HTTPException(502, "Gamma n’a pas répondu à temps. Réessaie.")

def check_gamma_id(value: str | None, label: str) -> str:
    value = (value or "").strip()
    if not GAMMA_ID.fullmatch(value):
        raise HTTPException(400, f"{label} invalide.")
    return value

def remember_gamma(generation_id: str, user_id: str, payload: dict | None = None):
    job = GAMMA_JOBS.setdefault(generation_id, {"userId": user_id, "exports": {}})
    if job.get("userId") != user_id:
        raise HTTPException(403, "Cette présentation appartient à un autre compte.")
    if payload:
        if payload.get("gammaId"):
            job["gammaId"] = payload["gammaId"]
        if payload.get("gammaUrl"):
            job["gammaUrl"] = payload["gammaUrl"]
        if payload.get("exportUrl"):
            job["exports"]["pptx"] = payload["exportUrl"]
        job["status"] = payload.get("status") or job.get("status") or "pending"
    return job

def gamma_embed(url: str) -> str:
    match = re.search(r"gamma\.app/(?:docs|embed|public)/([^/?#]+)", url or "")
    return f"https://gamma.app/embed/{match.group(1)}" if match else ""

def deck_view(provider: str, generation_id: str, status: str, design_id: str = "", view_url: str = "", error: str = "") -> dict:
    ready = status in ("completed", "success")
    failed = status == "failed"
    embed = gamma_embed(view_url)
    return {
        "provider": provider,
        "generationId": generation_id,
        "status": "completed" if ready else ("failed" if failed else "pending"),
        "pending": not ready and not failed,
        "ready": ready,
        "designId": design_id,
        "viewUrl": view_url,
        "embedUrl": embed,
        "error": error,
        "gammaId": design_id if provider == "gamma" else "",
        "gammaUrl": view_url if provider == "gamma" else "",
    }

def gamma_view(generation_id: str, payload: dict) -> dict:
    error = payload.get("error") or {}
    message = error.get("message") if isinstance(error, dict) else ""
    status = payload.get("status") or "pending"
    return deck_view(
        "gamma", generation_id, status,
        payload.get("gammaId") or "",
        payload.get("gammaUrl") or "",
        message or "",
    )

def wait_export_url(export_id: str, key: str) -> str:
    export_id = check_gamma_id(export_id, "Export")
    for _ in range(30):
        payload = gamma_call("GET", f"/exports/{export_id}", key=key) or {}
        status = payload.get("status") or ""
        url = payload.get("exportUrl") or payload.get("url") or ""
        if status == "completed" and url.startswith("https://"):
            return url
        if status == "failed":
            error = payload.get("error") or {}
            message = error.get("message") if isinstance(error, dict) else "Export Gamma échoué."
            raise HTTPException(502, message or "Export Gamma échoué.")
        time.sleep(2)
    raise HTTPException(504, "L’export Gamma prend trop de temps. Réessaie dans un instant.")

def export_url_for(gamma_id: str, fmt: str, key: str, cached: str = "") -> str:
    if cached.startswith("https://"):
        return cached
    created = gamma_call("POST", f"/gammas/{gamma_id}/export", {"exportAs": fmt}, timeout=45, key=key) or {}
    return wait_export_url(created.get("exportId") or "", key)

def read_remote(url: str) -> bytes:
    if not url.startswith("https://"):
        raise HTTPException(502, "Lien de téléchargement invalide.")
    request = urllib.request.Request(url, method="GET", headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "*/*",
    })
    try:
        with urllib.request.urlopen(request, timeout=90) as res:
            return res.read()
    except urllib.error.HTTPError as e:
        raise HTTPException(502, f"Téléchargement impossible ({e.code}).")
    except (urllib.error.URLError, TimeoutError, socket.timeout):
        raise HTTPException(502, "Le fichier n’a pas pu être téléchargé. Réessaie.")

@app.post("/api/gamma/prompt")
def improve_gamma_prompt(req: GammaPromptReq, user: dict = Depends(require_user)):
    current = plain_brief(req.current)
    note = req.note.strip()
    ask = "Améliore le brief existant." if current else "Rédige le brief initial."
    if note:
        ask += f" Demande précise : {note}."
    contents = project_digest(req.idea, req.data)
    if current:
        contents += f"\n\nBrief actuel :\n{current}"
    text, _model = gemini_text(user, f"{ask}\n\n{contents}", GAMMA_BRIEF)
    brief = plain_brief(text)
    if "---" not in brief:
        raise HTTPException(502, "Le brief n’a pas le format attendu. Réessaie.")
    return {"gammaPrompt": brief}

@app.post("/api/gamma")
def create_gamma(req: GammaCreate, user: dict = Depends(require_user)):
    key = active_gamma(user)
    prompt = plain_brief(req.prompt)
    slides = [part.strip() for part in re.split(r"\n---\n", prompt) if part.strip()]
    body = {
        "inputText": prompt,
        "textMode": "generate",
        "format": "presentation",
        "title": req.title.strip() or "Projet",
        "exportAs": "pptx",
        "cardSplit": "inputTextBreaks" if len(slides) > 1 else "auto",
        "additionalInstructions": "Français. Une idée par carte. Respecte l’ordre des blocs séparés par ---. Style de soutenance, aéré, titres courts.",
        "textOptions": {
            "amount": "medium",
            "tone": "clair et convaincant",
            "audience": "jury et parties prenantes",
            "language": "fr",
        },
        "imageOptions": {
            "source": "aiGenerated",
            "style": "illustration produit moderne, claire, peu de texte",
        },
        "cardOptions": {"dimensions": "16x9"},
        "sharingOptions": {"externalAccess": "view", "workspaceAccess": "view"},
    }
    if len(slides) < 2:
        body["numCards"] = 8
    created = gamma_call("POST", "/generations", body, timeout=45, key=key) or {}
    generation_id = check_gamma_id(created.get("generationId"), "Génération")
    GAMMA_JOBS[generation_id] = {"userId": user["id"], "exports": {}, "status": "pending", "keyPersonal": bool((user.get("gamma") or "").strip())}
    return {"generationId": generation_id, "status": "pending", "pending": True, "ready": False}

@app.get("/api/gamma/{generation_id}")
def gamma_status(generation_id: str, user: dict = Depends(require_user)):
    generation_id = check_gamma_id(generation_id, "Génération")
    job = GAMMA_JOBS.get(generation_id)
    if job and job.get("userId") != user["id"]:
        raise HTTPException(403, "Cette présentation appartient à un autre compte.")
    key = active_gamma(user)
    payload = gamma_call("GET", f"/generations/{generation_id}", key=key) or {}
    remember_gamma(generation_id, user["id"], payload)
    view = gamma_view(generation_id, payload)
    if payload.get("status") == "failed" and not view["error"]:
        view["error"] = "La génération Gamma a échoué."
    return view

@app.post("/api/gamma/file")
def gamma_file(req: GammaFileReq, user: dict = Depends(require_user)):
    fmt = req.format.strip().lower()
    if fmt not in ("pptx", "pdf"):
        raise HTTPException(400, "Format attendu : pptx ou pdf.")
    key = active_gamma(user)
    generation_id = (req.generationId or "").strip()
    job = None
    if generation_id:
        generation_id = check_gamma_id(generation_id, "Génération")
        found = GAMMA_JOBS.get(generation_id)
        if found and found.get("userId") != user["id"]:
            raise HTTPException(403, "Cette présentation appartient à un autre compte.")
        job = found
    gamma_id = (req.gammaId or "").strip() or (job or {}).get("gammaId") or ""
    if not gamma_id:
        raise HTTPException(409, "La présentation n’est pas encore prête.")
    gamma_id = check_gamma_id(gamma_id, "Présentation")
    cached = ((job or {}).get("exports") or {}).get(fmt, "")
    url = export_url_for(gamma_id, fmt, key, cached)
    try:
        raw = read_remote(url)
    except HTTPException:
        if not cached:
            raise
        url = export_url_for(gamma_id, fmt, key, "")
        raw = read_remote(url)
    if job is not None:
        job.setdefault("exports", {})[fmt] = url
        job["gammaId"] = gamma_id
    media = {
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "pdf": "application/pdf",
    }[fmt]
    filename = f"{zip_slug(req.title)}.{fmt}"
    return Response(raw, media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"'})

SLIDES = {}

class SlidesReq(BaseModel):
    generationId: str | None = Field(default=None, max_length=120)
    designId: str | None = Field(default=None, max_length=120)
    gammaId: str | None = Field(default=None, max_length=120)

def owned_job(store: dict, job_id: str, user_id: str) -> dict | None:
    job = store.get(job_id)
    if job and job.get("userId") != user_id:
        raise HTTPException(403, "Cette présentation appartient à un autre compte.")
    return job

def pngs_from_export(raw: bytes) -> list[bytes]:
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return [raw]
    found = []
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise HTTPException(502, "L’export image n’est pas lisible.")
    with archive:
        names = sorted(name for name in archive.namelist() if name.lower().endswith(".png") and not name.endswith("/"))
        for name in names:
            blob = archive.read(name)
            if blob:
                found.append(blob)
    return found

def remember_slides(key: str, user_id: str, images: list[bytes]):
    if not images:
        raise HTTPException(502, "Aucune diapositive n’a été exportée.")
    SLIDES[key] = {"userId": user_id, "images": images}

def slide_response(provider: str, design_id: str, index: int, user: dict):
    key = f"{provider}:{design_id}"
    pack = SLIDES.get(key)
    if not pack or pack.get("userId") != user["id"]:
        raise HTTPException(404, "Diapositives absentes. Affiche-les une première fois.")
    images = pack.get("images") or []
    if index < 0 or index >= len(images):
        raise HTTPException(404, "Diapositive introuvable.")
    return Response(images[index], media_type="image/png")

@app.post("/api/gamma/slides")
def gamma_slides(req: SlidesReq, user: dict = Depends(require_user)):
    key = active_gamma(user)
    generation_id = (req.generationId or "").strip()
    job = owned_job(GAMMA_JOBS, check_gamma_id(generation_id, "Génération"), user["id"]) if generation_id else None
    gamma_id = (req.designId or req.gammaId or "").strip() or (job or {}).get("gammaId") or ""
    gamma_id = check_gamma_id(gamma_id, "Présentation")
    cached = ((job or {}).get("exports") or {}).get("png", "")
    url = export_url_for(gamma_id, "png", key, cached)
    raw = read_remote(url)
    if job is not None:
        job.setdefault("exports", {})["png"] = url
    images = pngs_from_export(raw)
    remember_slides(f"gamma:{gamma_id}", user["id"], images)
    return {"count": len(images), "designId": gamma_id}

@app.get("/api/gamma/slides/{design_id}/{index}")
def gamma_slide(design_id: str, index: int, user: dict = Depends(require_user)):
    return slide_response("gamma", check_gamma_id(design_id, "Présentation"), index, user)
