# Idevia

Transforme une idée en projet structuré, en trois étapes sur le même dossier : données, interface, présentation.

**Stack :** React (Vite) · FastAPI · API Gemini (Google)

## Installation

### 1. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows : venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # puis colle ta clé GEMINI_API_KEY
uvicorn main:app --reload --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```
Ouvre http://localhost:5173

## Fonctionnalités
Trois sections, un seul projet :

1. **Idée et données** — mind map, fonctionnalités, acteurs, user stories, UML, base de données, backlog
2. **Interface** — prompt v0 et aperçu du site
3. **Présentation** — brief Gemini, diaporama Gamma, lecteur intégré dans la page, diapositives, téléchargement PPTX et PDF

- Génération structurée (JSON) par LLM
- Mind map SVG interactive : zoom (molette), déplacement (glisser), clic sur une branche pour la replier
- Export Markdown, JSON et archive du projet
- Historique local des projets (localStorage)

`GAMMA_API_KEY` se place dans `backend/.env`, comme les clés Gemini et v0. Une clé personnelle peut aussi être enregistrée dans le profil.

## Déploiement
- Frontend : Vercel / Netlify (`npm run build`, variable `VITE_API_URL` = URL du backend)
- Backend : Render / Railway / Fly.io (`uvicorn main:app --host 0.0.0.0 --port $PORT`)

## Structure
```
backend/   main.py, requirements.txt, .env.example
frontend/  index.html, vite.config.js, src/{App,MindMap,Panels,api,export}.jsx|js
```
