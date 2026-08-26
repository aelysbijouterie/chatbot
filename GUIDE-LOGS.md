# Guide — Activer le log des questions (Google Sheets)

Ce guide permet d'enregistrer automatiquement dans un Google Sheet :
- Toutes les questions posées à COUSSI IA
- Les questions hors base
- Les feedbacks 👍/👎 des équipes

---

## Étape 1 — Créer le Google Sheet

1. Allez sur [sheets.google.com](https://sheets.google.com)
2. Créez un nouveau classeur nommé **"COUSSI IA — Logs"**
3. Dans la ligne 1, créez ces 6 colonnes (en-têtes) :
   ```
   A: Date | B: Question | C: Type | D: Réponse | E: Magasin | F: Fiche
   ```
   (la colonne F "Fiche" contient le titre de la procédure consultée quand il y en a une — elle alimente le tableau "procédures les plus consultées" de l'onglet Statistiques de l'admin)

---

## Étape 2 — Créer le script

1. Dans le Google Sheet : menu **Extensions → Apps Script**
2. Supprimez le code existant et collez ceci :

```javascript
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const data = JSON.parse(e.postData.contents);
    sheet.appendRow([
      data.date || new Date().toLocaleString('fr-FR'),
      data.question || '',
      data.type || '',
      data.reponse || '',
      data.magasin || '',
      data.fiche || ''
    ]);
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. Cliquez sur **Enregistrer** (icône disquette)

---

## Étape 3 — Déployer le script

1. Cliquez sur **Déployer → Nouveau déploiement**
2. Cliquez sur l'icône engrenage ⚙️ à côté de "Type" → sélectionnez **"Application Web"**
3. Renseignez :
   - Description : `COUSSI IA Log`
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
4. Cliquez **Déployer**
5. Autorisez les permissions demandées
6. **Copiez l'URL** affichée (du type `https://script.google.com/macros/s/XXXX/exec`)

---

## Étape 4 — Ajouter l'URL dans Vercel

1. Allez sur [vercel.com](https://vercel.com) → votre projet
2. **Settings → Environment Variables**
3. Ajoutez une variable :
   - Key : `GOOGLE_SHEET_WEBHOOK`
   - Value : l'URL copiée à l'étape précédente
4. **Redéployez** (onglet Deployments → ... → Redeploy sur le dernier déploiement)

---

## Ce que vous verrez dans le Sheet

| Date | Question | Type | Réponse | Magasin | Fiche |
|---|---|---|---|---|---|
| 02/06/2025 14:23 | Procédure SAV bague or | reponse | ## SAV... | Aélys Pau Est (200) | SAV — Aide décisionnelle |
| 02/06/2025 14:31 | Congés payés | hors_base | — | Aélys Pau Est (200) | — |
| 02/06/2025 15:10 | Procédure défectueux | feedback_positif | — | Aélys Dax (312) | Défectueux — Procédure |

**Types de logs :**
- `reponse` — question répondue depuis la base
- `hors_base` — question sans réponse → à documenter
- `feedback_positif` — équipe a cliqué 👍
- `feedback_negatif` — équipe a cliqué 👎 → réponse à corriger

---

## Étape 5 — Brancher l'onglet Statistiques de l'admin (optionnel)

L'onglet **Statistiques** de `/admin.html` relit ce même Google Sheet pour calculer ses chiffres (questions les plus posées, taux hors-base, procédures les plus consultées, etc.). Pour ça, il lui faut un lien CSV public en lecture seule vers le Sheet — pas d'API, pas de clé, gratuit.

1. Dans le Google Sheet, menu **Fichier → Partager → Publier sur le Web**
2. Dans le premier menu déroulant, sélectionnez la feuille exacte qui reçoit les logs (pas "Classeur entier")
3. Dans le second menu déroulant, sélectionnez **Valeurs séparées par des virgules (.csv)**
4. Cliquez **Publier**, confirmez
5. **Copiez le lien** affiché (du type `https://docs.google.com/spreadsheets/d/e/.../pub?output=csv`)
6. Dans Vercel → **Settings → Environment Variables**, ajoutez :
   - Key : `STATS_SHEET_CSV_URL`
   - Value : le lien copié
7. **Redéployez**

⚠️ Ce lien est un lien de lecture public : toute personne qui le possède peut voir le contenu du Sheet (les questions posées, pas de mot de passe ni de données bancaires). Ne le partagez pas en dehors de Vercel.
