# Guide — Ajouter ou modifier un document dans COUSSI IA

## Comment ça marche
La base de connaissance est constituée de fichiers texte (.md) stockés dans le dossier `docs/`.
Chaque fichier = un sujet. Quand vous modifiez ou ajoutez un fichier sur GitHub, le chatbot est mis à jour automatiquement en moins d'une minute. 

---

## Modifier un document existant

1. Allez sur [github.com/aelysbijouterie/chatbot](https://github.com/aelysbijouterie/chatbot)
2. Naviguez dans le dossier `docs/` puis dans la sous-catégorie
3. Cliquez sur le fichier à modifier
4. Cliquez sur l'icône **crayon** ✏️ (en haut à droite du fichier)
5. Faites vos modifications
6. En bas de page : cliquez **"Commit changes"** → **"Commit changes"** (bouton vert)

✅ Le chatbot est mis à jour automatiquement.

---

## Ajouter un nouveau document

1. Allez sur [github.com/aelysbijouterie/chatbot](https://github.com/aelysbijouterie/chatbot)
2. Naviguez dans le dossier `docs/` puis dans la bonne catégorie (ou créez-en une)
3. Cliquez **"Add file"** → **"Create new file"**
4. Nommez le fichier : `nom-du-sujet.md` (minuscules, tirets, pas d'espaces)
5. La première ligne DOIT commencer par `# ` suivi du titre (ex : `# Contacts — Interlocuteurs`)
6. Rédigez le contenu en dessous (voir format ci-dessous)
7. Cliquez **"Commit changes"** → **"Commit changes"**

---

## Format d'un document

```
# Titre du document

## Sous-titre

Description ou procédure ici.

- Point 1
- Point 2
- Point 3

**Mot important** : explication.
```

Règles simples :
- `#` = titre principal (une seule fois, en haut)
- `##` = sous-titre de section
- `-` = liste à puces
- `**texte**` = texte en gras

---

## Organisation des dossiers

```
docs/
├── commandes/        → procédures de commande (or, argent, acier, griffé...)
├── sav/              → SAV, garanties, litiges, aide décisionnelle
├── defectueux/       → procédures défectueux
├── vente/            → techniques de vente, objectifs
├── references/       → ODEIS, références, règlements
└── contacts/         → à créer — annuaire des interlocuteurs
```

Pour créer un nouveau dossier : nommez le fichier `contacts/interlocuteurs.md` — GitHub crée le dossier automatiquement.

---

## Après une modification

Netlify redéploie automatiquement en 1 à 2 minutes. Vous pouvez vérifier l'état du déploiement sur [app.netlify.com](https://app.netlify.com).
