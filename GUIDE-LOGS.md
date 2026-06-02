# Guide — Activer le log des questions (Google Sheets)

Ce guide permet d'enregistrer automatiquement dans un Google Sheet :
- Toutes les questions posées à COUSSI IA
- Les questions hors base
- Les feedbacks 👍/👎 des équipes

---

## Étape 1 — Créer le Google Sheet

1. Allez sur [sheets.google.com](https://sheets.google.com)
2. Créez un nouveau classeur nommé **"COUSSI IA — Logs"**
3. Dans la ligne 1, créez ces 5 colonnes (en-têtes) :
   ```
   A: Date | B: Question | C: Type | D: Réponse | E: Magasin
   ```

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
      data.magasin || ''
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

## Étape 4 — Ajouter l'URL dans Netlify

1. Allez sur [app.netlify.com](https://app.netlify.com) → votre site
2. **Site configuration → Environment variables**
3. Ajoutez une variable :
   - Key : `GOOGLE_SHEET_WEBHOOK`
   - Value : l'URL copiée à l'étape précédente
4. **Redéployez** le site (Deploy → Trigger deploy)

---

## Ce que vous verrez dans le Sheet

| Date | Question | Type | Réponse | Magasin |
|---|---|---|---|---|
| 02/06/2025 14:23 | Procédure SAV bague or | reponse | ## SAV... | — |
| 02/06/2025 14:31 | Congés payés | hors_base | — | — |
| 02/06/2025 15:10 | Procédure défectueux | feedback_positif | — | — |

**Types de logs :**
- `reponse` — question répondue depuis la base
- `hors_base` — question sans réponse → à documenter
- `feedback_positif` — équipe a cliqué 👍
- `feedback_negatif` — équipe a cliqué 👎 → réponse à corriger
