# Backup ja taastamise kasutusjuhend

See juhend kirjeldab, kuidas kasutada tööruumi backupi ja taastamise skripte.

## Asukoht

- Backupid salvestatakse kausta: `~/REACT-PROJECTS/_workspace_backups/Discussion_Boards`
- Backup failinimi on kujul: `discussion-boards-YYYY-MM-DD_HH-MM-SS.tar.gz`

## Backupi loomine

Käivita projektijuurest:

```bash
npm run backup:workspace
```

See käsk:
- loob kogu tööruumist `.tar.gz` backupi
- lisab failinimele ajatembli
- hoiab alles ainult 3 viimast backupi
- kustutab automaatselt vanemad backupid

## Taastamine backupist

Käivita projektijuurest:

```bash
npm run restore:workspace
```

Taastamise voog:
- kuvatakse nummerdatud loend olemasolevatest backupidest
- valid taastatava backupi numbri järgi
- kinnitad tegevuse kirjutades `RESTORE`

## Tähtis hoiatus taastamisel

Taastamine asendab tööruumi failid valitud backupi sisuga.

- Skript jätab alles `.git` kausta
- Kõik muud tööruumi failid asendatakse backupi sisuga

## Otse skriptide käivitamine (alternatiiv)

Soovi korral saad käivitada ka otse:

```bash
bash scripts/backup-workspace.sh
bash scripts/restore-workspace.sh
```
