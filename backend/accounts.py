import hashlib, json, os, re, secrets, threading, time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

DATA_DIR = os.getenv("DATA_DIR", "data").strip() or "data"
_data_path = Path(DATA_DIR)
DATA = _data_path.resolve() if _data_path.is_absolute() else (Path(__file__).resolve().parent / _data_path).resolve()
DATA.mkdir(parents=True, exist_ok=True)
USERS_PATH = DATA / "users.json"
SESSIONS_PATH = DATA / "sessions.json"
CHATS_PATH = DATA / "chats.json"
HISTORY_PATH = DATA / "history.json"
MAX_HISTORY = 10
MAX_BLOB = 500_000
STAGES = {"data", "ui", "deck"}
TABS = {"map", "us", "feat", "act", "uml", "db", "bk"}
LOCK = threading.RLock()
PBKDF2_ROUNDS = 200_000
SESSION_TTL = 60 * 60 * 24 * 14
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AccountError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message


def _load(path: Path) -> dict:
    with LOCK:
        if not path.exists():
            return {}
        raw = path.read_text(encoding="utf-8").strip()
        if not raw:
            return {}
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return data if isinstance(data, dict) else {}


def _save(path: Path, data: dict):
    with LOCK:
        DATA.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(f".{path.name}.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ROUNDS).hex()
    return f"pbkdf2${PBKDF2_ROUNDS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, rounds, salt, digest = stored.split("$", 3)
        check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(rounds)).hex()
        return secrets.compare_digest(check, digest)
    except (ValueError, TypeError):
        return False


def public_user(user: dict) -> dict:
    email = user.get("email") or ""
    return {
        "id": user["id"],
        "email": email,
        "name": user.get("name") or email.split("@")[0],
        "picture": user.get("picture") or "",
        "provider": "google" if user.get("googleSub") else "email",
        "onboarded": bool(user.get("onboarded")),
    }


def _find_email(users: dict, email: str) -> dict | None:
    for user in users.values():
        if user.get("email") == email:
            return user
    return None


def _new_session(users_sessions: dict, user_id: str) -> str:
    now = time.time()
    expired = [token for token, row in users_sessions.items() if row.get("exp", 0) < now]
    for token in expired:
        users_sessions.pop(token, None)
    token = secrets.token_urlsafe(32)
    users_sessions[token] = {"userId": user_id, "exp": now + SESSION_TTL}
    return token


def _normalize_email(email: str) -> str:
    email = email.strip().lower()
    if not EMAIL_RE.fullmatch(email):
        raise AccountError(400, "Adresse e-mail invalide.")
    return email


def signup(email: str, password: str, name: str) -> tuple[str, dict]:
    email = _normalize_email(email)
    if len(password) < 8:
        raise AccountError(400, "Le mot de passe doit contenir au moins 8 caractères.")
    with LOCK:
        users = _load(USERS_PATH)
        if _find_email(users, email):
            raise AccountError(409, "Un compte existe déjà avec cet e-mail.")
        user = {
            "id": secrets.token_hex(12),
            "email": email,
            "name": name.strip() or email.split("@")[0],
            "picture": "",
            "password": hash_password(password),
            "googleSub": "",
            "gemini": "",
            "v0": "",
            "gamma": "",
            "model": "",
            "extra": {},
            "onboarded": False,
            "created": int(time.time()),
        }
        users[user["id"]] = user
        sessions = _load(SESSIONS_PATH)
        token = _new_session(sessions, user["id"])
        _save(USERS_PATH, users)
        _save(SESSIONS_PATH, sessions)
        return token, user


def login(email: str, password: str) -> tuple[str, dict]:
    email = email.strip().lower()
    with LOCK:
        users = _load(USERS_PATH)
        user = _find_email(users, email)
        if user and not user.get("password"):
            raise AccountError(401, "Ce compte utilise Gmail. Connecte-toi avec Gmail.")
        if not user or not verify_password(password, user.get("password") or ""):
            raise AccountError(401, "E-mail ou mot de passe incorrect.")
        sessions = _load(SESSIONS_PATH)
        token = _new_session(sessions, user["id"])
        _save(SESSIONS_PATH, sessions)
        return token, user


def login_google(profile: dict) -> tuple[str, dict]:
    email = _normalize_email(profile.get("email") or "")
    sub = (profile.get("sub") or "").strip()
    if not sub:
        raise AccountError(401, "Profil Google incomplet.")
    with LOCK:
        users = _load(USERS_PATH)
        user = _find_email(users, email)
        if user is None:
            user = {
                "id": secrets.token_hex(12),
                "email": email,
                "name": (profile.get("name") or email.split("@")[0]).strip(),
                "picture": profile.get("picture") or "",
                "password": "",
                "googleSub": sub,
                "gemini": "",
                "v0": "",
                "gamma": "",
                "model": "",
                "extra": {},
                "onboarded": False,
                "created": int(time.time()),
            }
            users[user["id"]] = user
        else:
            user["googleSub"] = sub
            if profile.get("picture"):
                user["picture"] = profile["picture"]
            if profile.get("name") and not user.get("name"):
                user["name"] = profile["name"]
            users[user["id"]] = user
        sessions = _load(SESSIONS_PATH)
        token = _new_session(sessions, user["id"])
        _save(USERS_PATH, users)
        _save(SESSIONS_PATH, sessions)
        return token, user


def session_user(token: str) -> dict | None:
    if not token:
        return None
    with LOCK:
        sessions = _load(SESSIONS_PATH)
        row = sessions.get(token)
        if not row or row.get("exp", 0) < time.time():
            if row:
                sessions.pop(token, None)
                _save(SESSIONS_PATH, sessions)
            return None
        user = _load(USERS_PATH).get(row.get("userId"))
        return user


def logout(token: str):
    if not token:
        return
    with LOCK:
        sessions = _load(SESSIONS_PATH)
        if token in sessions:
            sessions.pop(token, None)
            _save(SESSIONS_PATH, sessions)


def get_user(user_id: str) -> dict | None:
    with LOCK:
        return _load(USERS_PATH).get(user_id)


def update_user(user_id: str, changes: dict) -> dict | None:
    with LOCK:
        users = _load(USERS_PATH)
        user = users.get(user_id)
        if not user:
            return None
        user.update(changes)
        users[user_id] = user
        _save(USERS_PATH, users)
        return user


def bind_chat(chat_id: str, user_id: str, personal: bool):
    with LOCK:
        chats = _load(CHATS_PATH)
        chats[chat_id] = {"userId": user_id, "personal": personal}
        _save(CHATS_PATH, chats)


def chat_record(chat_id: str) -> dict | None:
    with LOCK:
        row = _load(CHATS_PATH).get(chat_id)
        return row if isinstance(row, dict) else None


def _json_size(value) -> int:
    try:
        return len(json.dumps(value, ensure_ascii=False))
    except (TypeError, ValueError):
        return MAX_BLOB + 1


def _stamp(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _clean_items(items) -> list:
    cleaned = []
    if not isinstance(items, list):
        return cleaned
    for item in items:
        if not isinstance(item, dict):
            continue
        idea = str(item.get("idea") or "").strip()
        data = item.get("data")
        if not idea or len(idea) > 1500 or not isinstance(data, dict):
            continue
        if _json_size(data) > MAX_BLOB:
            continue
        cleaned.append({"idea": idea, "data": data, "at": _stamp(item.get("at"))})
    cleaned.sort(key=lambda row: row["at"], reverse=True)
    return cleaned[:MAX_HISTORY]


def _clean_draft(draft) -> dict:
    if not isinstance(draft, dict):
        draft = {}
    data = draft.get("data") if isinstance(draft.get("data"), dict) else None
    if data is not None and _json_size(data) > MAX_BLOB:
        data = None
    stage = draft.get("stage") if draft.get("stage") in STAGES else "data"
    tab = draft.get("tab") if draft.get("tab") in TABS else "map"
    return {
        "idea": str(draft.get("idea") or "")[:1500],
        "prompt": str(draft.get("prompt") or "")[:6000],
        "stage": stage,
        "tab": tab,
        "data": data,
        "at": _stamp(draft.get("at")),
    }


def get_workspace(user_id: str) -> dict:
    with LOCK:
        row = _load(HISTORY_PATH).get(user_id) or {}
    if not isinstance(row, dict):
        row = {}
    return {"items": _clean_items(row.get("items")), "draft": _clean_draft(row.get("draft"))}


def save_workspace(user_id: str, items, draft) -> dict:
    payload = {"items": _clean_items(items), "draft": _clean_draft(draft)}
    with LOCK:
        rows = _load(HISTORY_PATH)
        rows[user_id] = payload
        _save(HISTORY_PATH, rows)
    return payload
