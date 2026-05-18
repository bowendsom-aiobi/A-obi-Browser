# Aïobi

Un navigateur web simple et privé, basé sur Electron (macOS + Linux).

## Développement

```bash
npm install
npm start
```

## Raccourcis

| Raccourci | Action |
|---|---|
| ⌘/Ctrl + T | Nouvel onglet |
| ⌘/Ctrl + W | Fermer l'onglet |
| ⌘/Ctrl + R | Recharger |
| ⌘/Ctrl + L | Aller à la barre d'adresse |
| Échap | Fermer le menu moteur de recherche |

## Structure

```
src/
  main/      processus principal (fenêtre, onglets, IPC, moteurs de recherche)
  preload/   ponts contextBridge (chrome = UI fiable, tab = contenu non fiable)
  renderer/  interface (barre d'outils, onglets) — la marque Aïobi
```

## Étapes suivantes

- Icône depuis le SVG : `npm run icons`
- Paquets de distribution : `npm run dist:mac` / `npm run dist:linux`
- Signature/notarisation Apple et mises à jour automatiques : voir `electron-builder.yml`
