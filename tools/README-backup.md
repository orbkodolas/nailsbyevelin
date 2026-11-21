# Adatbázis-mentés

- **Mikor:** naponta 02:30 UTC (GitHub Actions, `.github/workflows/backup.yml`), kézzel: `gh workflow run backup.yml -R orbkodolas/nailsbyevelin`.
- **Hol:** a futás Artifactjában, `nbe-db-backup-<dátum>` néven, titkosítva (`.enc`), 30 napig őrzi a GitHub.
- **Visszafejtés:** `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:<jelmondat.txt> -in nbe-db-backup-<dátum>.json.enc -out mentes.json`
- **Visszaírás (próba):** `node --env-file=backend/.env tools/restore-db.mjs mentes.json --table=nbe_restore_test`
- **Visszaírás (éles, felülírja az egyező sorokat):** `node --env-file=backend/.env tools/restore-db.mjs mentes.json --table=nbe_records --yes`
- **Jelmondat:** GitHub secret `NBE_BACKUP_PASSPHRASE`; helyi másolat: `/data/data/com.termux/files/home/OrbProject/nbe-android-keys/backup-passphrase.txt` (repón kívül). Jelmondat nélkül a mentés nem fejthető vissza.
- **Kézi mentés helyben:** `node --env-file=backend/.env tools/backup-db.mjs /tmp/mentes.json` — a titkosítatlan fájlt utána töröld.
