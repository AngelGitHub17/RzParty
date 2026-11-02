# Mini-jeux RzParty

Chaque mini-jeu vit dans son propre dossier `src/<id>/` et ne connaît que des joueurs et un classement.
Le contrat complet est dans [`src/contract.ts`](src/contract.ts).

| Fichier | Rôle | Exécuté sur |
| --- | --- | --- |
| `definition.ts` | Nom, catégorie, nombre de joueurs, durée maximale, règles | partout |
| `types.ts` | État public, données privées et actions échangés | partout |
| `server.ts` | Logique autoritaire (`create`) et bot (`bot`) | serveur |
| `view.ts` + `style.css` | Affichage `tv` (écran commun), `pad` (manette) et `solo` (écran individuel) | navigateur |

## Ajouter un mini-jeu

1. Copier un dossier existant (`calcul/` est le plus simple) et le renommer.
2. Ajouter le module serveur à `MINI_GAMES` dans `src/server.ts`.
3. Ajouter la vue à `MINI_GAME_VIEWS` dans `src/client.ts`.
4. Lancer `npm test` : chaque mini-jeu enregistré est automatiquement joué par des bots dans les
   trois difficultés, et doit se terminer avec un classement complet.

## Règles à respecter

- Le serveur a toujours raison : toute action reçue (`input`) est vérifiée et ignorée si elle est invalide.
- Utiliser `ctx.random()` plutôt que `Math.random()` : la manche reste reproductible dans les tests.
- Utiliser `ctx.schedule()` plutôt que `setTimeout` : les minuteurs sont annulés à la fin de la manche.
- Un bot joue avec `ctx.send()`, exactement comme un humain, sans tricher sur l'état privé des autres.
- Le moteur s'occupe du reste : règles, compte à rebours, remplaçants des absents, récompenses.
