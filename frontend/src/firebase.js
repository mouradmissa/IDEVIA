import { initializeApp } from "firebase/app";
import { getAuth, getRedirectResult, GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBwfFR-WP4h9HNV3UiFv6ayqpoRVG0HDBE",
  authDomain: "mindmap-ai-30201.firebaseapp.com",
  projectId: "mindmap-ai-30201",
  storageBucket: "mindmap-ai-30201.firebasestorage.app",
  messagingSenderId: "394067924099",
  appId: "1:394067924099:web:b22a779d88c7b02a5eb7b6",
};

const auth = getAuth(initializeApp(firebaseConfig));
auth.languageCode = "fr";

const MESSAGES = {
  "auth/unauthorized-domain": "Ce site n’est pas autorisé dans Firebase Authentication.",
  "auth/popup-blocked": "Le navigateur a bloqué la fenêtre Google. Autorise les pop-ups, puis réessaie.",
  "auth/popup-closed-by-user": "La fenêtre Google a été fermée avant la fin de la connexion.",
  "auth/cancelled-popup-request": "Une autre connexion Google est déjà ouverte.",
  "auth/operation-not-allowed": "La connexion Google n’est pas activée sur le projet Firebase.",
  "auth/network-request-failed": "Le réseau a coupé la connexion à Google. Réessaie.",
};

function provider() {
  const next = new GoogleAuthProvider();
  next.setCustomParameters({ prompt: "select_account" });
  return next;
}

function tokenFrom(result) {
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.idToken) throw new Error("Google n’a pas renvoyé de jeton.");
  return credential.idToken;
}

const REDIRECT_FLAG = "mindmap-google-redirect";

let redirectToken;
export function googleRedirectToken() {
  if (!redirectToken) {
    redirectToken = getRedirectResult(auth)
      .then((result) => {
        const pending = sessionStorage.getItem(REDIRECT_FLAG) === "1";
        sessionStorage.removeItem(REDIRECT_FLAG);
        if (result) return tokenFrom(result);
        if (pending) throw new Error("La connexion Google n’a pas abouti. Autorise les fenêtres pop-up pour ce site, puis réessaie.");
        return null;
      })
      .catch((err) => {
        redirectToken = null;
        sessionStorage.removeItem(REDIRECT_FLAG);
        if (err?.code && MESSAGES[err.code]) throw new Error(MESSAGES[err.code]);
        throw err;
      });
  }
  return redirectToken;
}

export async function googleIdToken() {
  const google = provider();
  try {
    return tokenFrom(await signInWithPopup(auth, google));
  } catch (err) {
    if (err?.code === "auth/popup-blocked") {
      sessionStorage.setItem(REDIRECT_FLAG, "1");
      await signInWithRedirect(auth, google);
      return new Promise(() => {});
    }
    if (err?.code && MESSAGES[err.code]) throw new Error(MESSAGES[err.code]);
    if (err?.message && err.code) throw new Error(err.message);
    throw err;
  }
}
