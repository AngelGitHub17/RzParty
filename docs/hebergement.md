# Héberger RzParty sur Proxmox avec un nom de domaine

Ce guide installe RzParty dans un conteneur LXC Debian 12 qui démarre tout seul avec le Proxmox,
puis le rend accessible sur **https://rzparty.fr** :

- `https://rzparty.fr/` : page de présentation (modes, mini-jeux, téléchargement, journal des versions) ;
- `https://rzparty.fr/accueil` : le jeu ;
- `https://rzparty.fr/telecharger` : le jeu en .zip pour l'installer chez soi (créé à partir de la version en ligne) ;
- `https://rzparty.fr/api/version` : interrogé par les serveurs installés chez les joueurs pour signaler les nouvelles versions.

## 1. Créer le conteneur (une seule commande)

Le dépôt GitHub est privé : crée d'abord un **jeton d'accès en lecture seule**.
Sur GitHub : *Settings → Developer settings → Fine-grained tokens → Generate new token*,
dépôt *RzParty* uniquement, permission *Contents : Read-only*.

Dans le shell de l'hôte Proxmox (en root) :

```bash
export RZ_GIT_TOKEN=github_pat_xxxxx
curl -fsSL -H "Authorization: Bearer $RZ_GIT_TOKEN" \
  https://raw.githubusercontent.com/AngelGitHub17/RzParty/main/deploy/proxmox/creer-lxc.sh -o creer-lxc.sh
RZ_PUBLIC_URL=https://rzparty.fr CT_IP=192.168.1.50/24 CT_GW=192.168.1.254 bash creer-lxc.sh
```

- `CT_IP` / `CT_GW` : une IP fixe est conseillée (sinon `dhcp`). Adapte-les à ton réseau.
- Autres réglages possibles : `CTID`, `CT_STORAGE` (par défaut `local-lvm`, sinon le premier stockage qui accepte les conteneurs), `CT_MEMORY` (1024 Mo), `CT_CORES` (2), `CT_DISK` (8 Go).

À la fin, le jeu répond sur `http://192.168.1.50:5555` depuis le réseau local.

> Déjà un conteneur Debian/Ubuntu ? Dedans : `git clone … /opt/rzparty` puis `bash /opt/rzparty/deploy/installer.sh`.

## 2. Mettre le jeu à jour

**Automatiquement** : toutes les heures, le conteneur regarde s'il y a du nouveau sur GitHub et
l'installe tout seul, sauf si une partie est en cours (il réessaie l'heure suivante). Les mises à jour
de sécurité de Debian et de Node.js s'installent aussi seules. Pour suivre : `journalctl -u rzparty-auto-maj`.
Pour couper : `RZ_AUTO_UPDATE=0` dans `/etc/rzparty/rzparty.env`.

Conteneur créé avant la version 0.3.1 ? Active-le une fois :
`pct exec <CTID> -- rzparty-maj` puis `pct exec <CTID> -- bash /opt/rzparty/deploy/units.sh`.

**Depuis la page `/hote`** (sur le réseau local, connecté avec le compte de l'hôte) : la rubrique
« Mise à jour » liste les nouveautés envoyées sur GitHub ; le bouton « Installer la mise à jour »
les récupère, recompile et redémarre le serveur tout seul.

**Ou en ligne de commande** :

```bash
pct exec <CTID> -- rzparty-maj        # depuis l'hôte Proxmox
rzparty-maj                           # ou depuis le conteneur
```

La commande récupère la dernière version sur GitHub, recompile et redémarre. Les profils (`data/`) sont conservés.

Réglages : `/etc/rzparty/rzparty.env` (port, adresse publique…), puis `systemctl restart rzparty`.
Journal : `journalctl -u rzparty -f`.

## 3. Le nom de domaine rzparty.fr

1. **DNS chez OVH** (*Web Cloud → Noms de domaine → rzparty.fr → Zone DNS*) :
   - modifie les enregistrements `A` de `rzparty.fr` et `www.rzparty.fr` : cible = IP publique de la Freebox ;
   - **supprime** les enregistrements `AAAA` qui pointent vers l'hébergement mutualisé
     (sinon les appareils en IPv6, souvent les téléphones en 4G, arrivent encore chez OVH) ;
   - dans *Hébergements → Multisite*, retire `rzparty.fr` / `www.rzparty.fr` s'ils y sont attachés
     (OVH remettrait sinon ses propres enregistrements) ;
   - la propagation prend de quelques minutes à quelques heures ; vérifie avec `nslookup rzparty.fr`.
   Garder le site sur le mutualisé ? Utilise un sous-domaine (`jeu.rzparty.fr` → Freebox) et
   `RZ_PUBLIC_URL=https://jeu.rzparty.fr`.
2. **Un proxy HTTPS** devant le jeu :

### a) NGINX (ton NGINX existant)

Le fichier prêt à l'emploi est [`deploy/nginx/rzparty.conf`](../deploy/nginx/rzparty.conf) :

```bash
cp deploy/nginx/rzparty.conf /etc/nginx/sites-available/rzparty.conf   # sur la machine NGINX
nano /etc/nginx/sites-available/rzparty.conf                           # IP du conteneur à la place de 192.168.1.50
ln -s /etc/nginx/sites-available/rzparty.conf /etc/nginx/sites-enabled/
certbot --nginx -d rzparty.fr -d www.rzparty.fr                         # certificat Let's Encrypt
nginx -t && systemctl reload nginx
```

Les deux points indispensables : les en-têtes `Upgrade` / `Connection` (WebSockets) et
`X-Forwarded-For` (pour que la page `/hote` reste fermée à Internet). Ils sont déjà dans le fichier.

> Pas encore de certificat ? Commente le bloc `server { listen 443 … }`, recharge NGINX,
> lance `certbot --nginx …`, puis remets le bloc.

### b) Nginx Proxy Manager

Un seul proxy reçoit les ports 80 et 443 de la box et répartit selon le domaine
(Jellyfin, Chatterbox, RzParty…). Nouveau *Proxy Host* :

| Champ | Valeur |
|---|---|
| Domain Names | `rzparty.fr`, `www.rzparty.fr` |
| Scheme / Forward IP / Port | `http` / IP du conteneur / `5555` |
| **Websockets Support** | **activé** (indispensable) |
| SSL | *Request a new SSL Certificate*, *Force SSL*, *HTTP/2* |

### c) Caddy dans le conteneur

Si les ports 80/443 de la box peuvent aller directement au conteneur RzParty :

```bash
pct exec <CTID> -- env RZ_CADDY_DOMAIN=rzparty.fr bash /opt/rzparty/deploy/installer.sh
```

Caddy obtient et renouvelle le certificat tout seul.

3. **Freebox** : *Paramètres de la Freebox → Gestion des ports* : TCP 80 et 443 vers le proxy.
   Un port ne peut aller qu'à une seule machine : si 80 ou 443 servent déjà directement
   à un autre service, fais passer ce service par le même proxy.

## Sécurité

- La page **/hote** (profils) n'est accessible que depuis le réseau local, jamais depuis Internet,
  et demande l'identifiant de l'hôte. Depuis chez toi, ouvre-la par l'IP : `http://192.168.1.50:5555/hote`.
- Variables (`/etc/rzparty/rzparty.env`) : `RZ_SITE=1` (page de présentation et téléchargement),
  `RZ_TRUST_PROXY=1` (proxy devant), `RZ_ADMIN_FROM=lan` ou `local`, `RZ_PUBLIC_URL=https://rzparty.fr`.

## Conteneur déjà installé avant la page de présentation ?

Ajoute `RZ_SITE=1` dans `/etc/rzparty/rzparty.env`, puis `rzparty-maj --force`.
