# PDF de nuit — Edge et Chrome

Extension indépendante d’Insta Images. Lecteur PDF local basé sur [PDF.js de Mozilla](https://mozilla.github.io/pdf.js/), version 6.5.438 (licences dans `vendor/`). Tous les scripts et ressources sont inclus ; aucun CDN n’est utilisé.

## Installation

1. Ouvrir `edge://extensions` (ou `chrome://extensions`).
2. Activer **Mode développeur**.
3. Cloner ce dépôt ou extraire son ZIP GitHub. Cliquer sur **Charger l’extension décompressée** et sélectionner la racine du dépôt contenant ce README et `manifest.json`. Aucune compilation ni installation npm n’est nécessaire pour utiliser l’extension.
4. Épingler **PDF de nuit** dans la barre d’outils.

## Utilisation

- Cliquer sur l’extension pour ouvrir le lecteur dans un nouvel onglet.
- Choisir **Ouvrir un PDF** ou glisser un fichier dans la fenêtre. Aucun accès global aux fichiers locaux n’est nécessaire.
- Le bouton **Masquer le panneau** replie les commandes du haut pour agrandir la zone de lecture. **Afficher le panneau** les rétablit ; le bouton reste accessible lorsque le panneau est fermé.
- Depuis un PDF sur Internet, cliquer sur l’extension : l’adresse de l’onglet est reprise. Cliquer sur **Ouvrir le lien** et autoriser l’accès au site demandé. Un onglet qui ne contient pas un PDF peut fournir une erreur : utiliser alors le lien direct du fichier.
- Choisir le thème sombre, sépia ou clair et ajuster la luminosité. Ces deux préférences sont enregistrées localement, sans enregistrer les PDF ni leurs mots de passe.
- Zoomer et dézoomer avec les boutons **+ / −**, le menu de **25 % à 500 %**, ou **Ctrl + molette** au-dessus du PDF. Raccourcis : **Ctrl + +**, **Ctrl + −** et **Ctrl + 0** pour revenir à 100 % (remplacer Ctrl par ⌘ sur Mac). Les modes **Largeur de page** et **Page entière** restent disponibles.
- Navigation par page, sélection et copie de texte, recherche avec **Ctrl+F** puis **Entrée**. Un scan sans couche texte ne permet pas la recherche ; aucun OCR n’est inclus.
- Les PDF protégés par mot de passe demandent le mot de passe à l’ouverture.

## Limites et confidentialité

Le lecteur intégré d’Edge/Chrome n’est pas modifié : les documents se lisent dans l’onglet de cette extension. Aucun envoi du PDF vers un serveur tiers. L’ouverture d’un lien contacte son serveur d’origine et peut utiliser la session connectée ; l’accès au domaine est demandé seulement à cette occasion. Les fichiers locaux fonctionnent hors ligne.

Le mode sombre inverse également les photos et graphiques. Le mode sépia ou clair permet de consulter leurs couleurs plus fidèlement. Le PDF original n’est pas modifié et aucune exportation d’un PDF recoloré n’est proposée. Les scripts intégrés aux PDF ne sont pas exécutés. Certaines annotations, pièces jointes ou fonctions avancées du lecteur natif ne sont pas proposées.

Les liens protégés, redirections vers un autre domaine, pages de connexion, URL `blob:` et lecteurs intégrés à une autre page peuvent empêcher l’ouverture par URL. Télécharger le PDF puis l’ouvrir comme fichier local dans ce cas.

## Développement et vérifications

Avec Node.js 22 ou plus récent :

```sh
npm ci
npx playwright install chromium
npm run check
npm test
```

Le test ouvre un vrai navigateur sans interface, charge un PDF de test généré localement et vérifie le rendu, les pages, la recherche, le zoom, les thèmes, la luminosité, les préférences et les erreurs. Le serveur et le PDF de test restent locaux. Ce test du lecteur ne remplace pas une vérification des permissions de l’extension installée.

Pour utiliser Edge déjà installé sous PowerShell : `$env:PDF_BROWSER_CHANNEL = 'msedge'; npm test`.

Les ressources de `vendor/` proviennent du paquet npm `pdfjs-dist@6.5.438` : `build/pdf.mjs`, `build/pdf.worker.mjs`, `web/pdf_viewer.mjs`, `web/pdf_viewer.css`, `web/images/`, `cmaps/`, `standard_fonts/`, `wasm/` et `iccs/`. Les notices et licences d’origine sont conservées. Ces ressources sont versionnées pour permettre l’utilisation hors ligne sans dépendances de production.
