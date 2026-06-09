# Gabon Occaz – Guide de déploiement Cloudflare Pages

## Prérequis
- Node.js 18+ installé
- Un compte Cloudflare (gratuit)
- Un projet Supabase (gratuit)

---

## Étape 1 — Initialiser le projet en local

```bash
# Installer les dépendances
npm install

# Copier le fichier d'environnement
cp .env.local.example .env.local
```

Éditez `.env.local` avec vos clés Supabase :
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
```

## Étape 2 — Créer les tables Supabase

1. Ouvrez votre dashboard Supabase → **SQL Editor**
2. Copiez-collez le contenu de `supabase/schema.sql`
3. Cliquez **Run**

## Étape 3 — Déployer sur Cloudflare Pages

### Option A : Via le dashboard Cloudflare (recommandé)

1. Poussez ce dossier sur un dépôt GitHub
2. Allez sur **Cloudflare Pages** → *Create a project* → *Connect to Git*
3. Sélectionnez votre dépôt
4. Paramètres de build :
   - **Framework preset** : `Next.js`
   - **Build command** : `npx @cloudflare/next-on-pages`
   - **Build output directory** : `.vercel/output/static`
5. Dans **Environment Variables**, ajoutez :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Cliquez **Save and Deploy**

### Option B : Via CLI Wrangler

```bash
# Connexion à Cloudflare
npx wrangler login

# Build + déploiement en une commande
npm run deploy
```

---

## Lancer en local (développement)

```bash
npm run dev
# → http://localhost:3000
```

## Notes importantes

- La page d'accueil fonctionne sans Supabase (données fictives intégrées)
- Le formulaire d'alertes nécessite Supabase pour persister les données
- Aucun paiement n'est traité – zéro risque légal COBAC
