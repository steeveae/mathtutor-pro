# MathTutor Pro

🌐 **Application en ligne : https://mathtutor-pro.vercel.app**

Application mobile-first (PWA) pour répétiteur de mathématiques : planification
et suivi de sessions en direct, devoirs avec photo, facturation bimensuelle.

**Stack** : Next.js (App Router) · Tailwind CSS · Lucide React · Supabase (Auth,
PostgreSQL, Storage) · déploiement Vercel.

---

## Démarrage rapide

### 1. Cloner et installer

```bash
git clone https://github.com/steeveae/mathtutor-pro.git mathtutor-pro
cd mathtutor-pro
npm install
```

> Si vous partiez de zéro, l'équivalent serait :
> `npx create-next-app@latest mathtutor-pro --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*"`
> puis `npm install @supabase/supabase-js lucide-react`

### 2. Configurer Supabase

1. Créez un projet gratuit sur [supabase.com](https://supabase.com).
2. Dashboard → **SQL Editor** → collez le contenu de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Cela crée les tables `profiles`, `sessions`, `homeworks`, les politiques RLS,
   le bucket Storage `homeworks` et le trigger de création de profil.
3. Dashboard → **Settings → API** : copiez l'URL du projet et la clé `anon`.

```bash
cp .env.local.example .env.local
# puis renseignez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### 3. Lancer en local

```bash
npm run dev
# → http://localhost:3000
```

### 4. Déployer sur Vercel

```bash
npm i -g vercel
vercel
# Ajoutez les deux variables d'environnement Supabase dans le dashboard Vercel
```

---

## Rôles

| Rôle | Capacités (MVP) |
|------|-----------------|
| **Tuteur** | Planifie/démarre/termine les sessions, pousse des slides en direct, corrige les devoirs, consulte la facturation 14 jours |
| **Élève** | Voit sa prochaine session, suit le cours en direct, envoie la photo de son devoir |

## Avancement

- [x] **Étape 1** — Configuration projet + schéma SQL Supabase (RLS, Storage, Realtime)
- [x] **Étape 2** — Authentification et redirection par rôle (tuteur / élève / parent)
- [x] **Étape 3** — Dashboard Tuteur (sessions, devoirs, documents, élèves, facturation)
- [x] **Étape 4** — Interface Élève mobile-first (cours en direct, devoirs, révisions)
- [x] **Bonus** — Formules KaTeX, mode sombre, facture PDF, cours collectifs,
      cours audio en direct (WebRTC), notifications push (voir `supabase/migration-0*.sql`
      et `supabase/functions/push`, variable Vercel `NEXT_PUBLIC_VAPID_PUBLIC_KEY`)
