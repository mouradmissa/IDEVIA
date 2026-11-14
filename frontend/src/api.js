const BASE = import.meta.env.VITE_API_URL || "";
const TOKEN = "mindmap-ai-token";

export function getToken() {
  return localStorage.getItem(TOKEN) || "";
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN, token);
  else localStorage.removeItem(TOKEN);
}

function errorText(payload, fallback) {
  const detail = payload?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).filter(Boolean).join(" ") || fallback;
  return fallback;
}

async function request(path, options = {}, blob = false) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${path}`, { ...options, headers });
  if (response.status === 401 && token && !path.startsWith("/api/auth/login") && !path.startsWith("/api/auth/google")) {
    setToken("");
    window.dispatchEvent(new Event("mindmap-logout"));
  }
  if (!response.ok) throw new Error(errorText(await response.json().catch(() => ({})), "Erreur serveur"));
  if (blob) return response;
  return response.json();
}

export async function authConfig() {
  return request("/api/auth/config");
}
export async function signup(body) {
  return request("/api/auth/signup", { method: "POST", body: JSON.stringify(body) });
}
export async function login(body) {
  return request("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
}
export async function loginGoogle(credential) {
  return request("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) });
}
export async function me() {
  return request("/api/auth/me");
}
export async function logout() {
  return request("/api/auth/logout", { method: "POST" });
}
export async function skipOnboarding() {
  return request("/api/auth/skip-onboarding", { method: "POST" });
}
export async function generate(idea, prompt) {
  return request("/api/generate", { method: "POST", body: JSON.stringify({ idea, prompt }) });
}
export async function createV0(prompt) {
  return request("/api/v0", { method: "POST", body: JSON.stringify({ prompt }) });
}
export async function improveGamma({ idea, data, current, note }) {
  return request("/api/gamma/prompt", { method: "POST", body: JSON.stringify({ idea, data, current, note }) });
}
export async function createGamma({ prompt, title }) {
  return request("/api/gamma", { method: "POST", body: JSON.stringify({ prompt, title }) });
}
export async function gammaStatus(id) {
  return request(`/api/gamma/${encodeURIComponent(id)}`);
}
export async function prepareSlides(provider, body) {
  return request(`/api/${provider}/slides`, { method: "POST", body: JSON.stringify(body) });
}
export async function fetchSlide(provider, designId, index) {
  const response = await request(`/api/${provider}/slides/${encodeURIComponent(designId)}/${index}`, {}, true);
  return response.blob();
}
export async function downloadGamma({ generationId, gammaId, designId, format, title, provider = "gamma" }) {
  const response = await request(`/api/${provider}/file`, {
    method: "POST",
    body: JSON.stringify({ generationId, gammaId, designId, format, title }),
  }, true);
  const file = await response.blob();
  const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "");
  return { blob: file, name: match?.[1] || `presentation.${format}` };
}
export async function getProfile() {
  return request("/api/profile");
}
export async function saveProfile(body) {
  return request("/api/profile", { method: "PUT", body: JSON.stringify(body) });
}
export async function exportZip({ idea, name, markdown, data, chatId }) {
  const response = await request("/api/export", {
    method: "POST",
    body: JSON.stringify({ idea, name, markdown, data, chatId }),
  }, true);
  const file = await response.blob();
  const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "");
  return { blob: file, name: match?.[1] || "projet.zip" };
}
export async function v0Status(chatId, messageId) {
  return request(`/api/v0/${chatId}/${messageId}`);
}
