# Héberger RzParty sur Proxmox avec un nom de domaine

Ce guide installe RzParty dans un conteneur LXC Debian 12 qui démarre tout seul avec le Proxmox,
puis le rend accessible sur **https://rzparty.fr**.

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
- Autres réglages possibles : `CTID`, `CT_STORAGE` (défaut `local-lvm`), `CT_MEMORY` (1024 Mo), `CT_CORES` (2), `CT_DISK` (8 Go).

À la fin, le jeu répond sur `http://192.168.1.50:5555` depuis le réseau local.

> Déjà un conteneur Debian/Ubuntu ? Dedans : `git clone … /opt/rzparty` puis `bash /opt/rzparty/deploy/installer.sh`.

## 2. Mettre le jeu à jour

```bash
pct exec <CTID> -- rzparty-maj        # depuis l'hôte Proxmox
rzparty-maj                           # ou depuis le conteneur
```

La commande récupère la dernière version sur GitHub, recompile et redémarre. Les profils (`data/`) sont conservés.

Réglages : `/etc/rzparty/rzparty.env` (port, adresse publique…), puis `systemctl restart rzparty`.
Journal : `journalctl -u rzparty -f`.

## 3. Le nom de domaine rzparty.fr

1. **DNS** (chez le registraire, par ex. OVH) : un enregistrement `A` pour `rzparty.fr` (et `www`)
   vers l'IP publique de la Freebox. Si cette IP change, utilise un DynHost OVH.
2. **Un proxy HTTPS** devant le jeu. Deux possibilités :

### a) Nginx Proxy Manager (conseillé si tu l'utilises déjà)

Un seul proxy reçoit les ports 80 et 443 de la box et répartit selon le domaine
(Jellyfin, Chatterbox, RzParty…). Nouveau *Proxy Host* :

| Champ | Valeur |
|---|---|
| Domain Names | `rzparty.fr`, `www.rzparty.fr` |
| Scheme / Forward IP / Port | `http` / IP du conteneur / `5555` |
| **Websockets Support** | **activé** (indispensable) |
| SSL | *Request a new SSL Certificate*, *Force SSL*, *HTTP/2* |

### b) Caddy dans le conteneur

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
- Variables : `RZ_TRUST_PROXY=1` (proxy devant), `RZ_ADMIN_FROM=lan` ou `local`, `RZ_PUBLIC_URL`.
