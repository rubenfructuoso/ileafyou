#!/usr/bin/env python3
"""Lädt i leaf you per FTPS auf ileafyou.rekreativ.ch (hosttech).

Hochgeladen werden alle Dateien, die Git verfolgt (git ls-files), ausser den
Dateien in EXCLUDED. Läuft im GitHub-Workflow, Passwort aus der
Umgebungsvariable FTP_PASSWORD (Secret).
"""
import ftplib
import os
import subprocess
from pathlib import Path, PurePosixPath


FTP_HOST = "181.hosttech.eu"
FTP_USER = "rekreativ"
REMOTE_DIRECTORY = "/ileafyou.rekreativ.ch"

PROJECT_DIRECTORY = Path(__file__).resolve().parent.parent
EXCLUDED = {".gitignore", "README.md", "CLAUDE.md"}


def tracked_files():
    result = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=PROJECT_DIRECTORY,
        capture_output=True,
        text=True,
        check=True,
    )
    return sorted(
        filename
        for filename in result.stdout.split("\0")
        if filename and filename not in EXCLUDED and not filename.startswith(".github/")
    )


def ensure_directory(ftp, path, known_directories):
    if path in known_directories:
        return
    ftp.cwd("/")
    for part in [p for p in path.split("/") if p]:
        try:
            ftp.cwd(part)
        except ftplib.error_perm:
            print(f"Lege Ordner {part} an …")
            ftp.mkd(part)
            ftp.cwd(part)
    known_directories.add(path)


def main():
    password = os.environ.get("FTP_PASSWORD")
    if not password:
        raise SystemExit("FTP_PASSWORD fehlt (GitHub → Settings → Secrets → Actions).")

    files = tracked_files()
    print(f"Verbinde mit {FTP_HOST} (FTPS) …", flush=True)
    with ftplib.FTP_TLS(FTP_HOST, timeout=30) as ftp:
        try:
            ftp.login(FTP_USER, password)
        except ftplib.error_perm as error:
            raise SystemExit(
                f"Login als «{FTP_USER}» abgelehnt ({error}). Secret FTP_PASSWORD prüfen."
            ) from error
        ftp.prot_p()

        known_directories = set()
        for filename in files:
            local_path = PROJECT_DIRECTORY / filename
            remote_path = PurePosixPath(REMOTE_DIRECTORY) / filename
            ensure_directory(ftp, str(remote_path.parent), known_directories)

            print(f"Übertrage {filename} …", flush=True)
            with local_path.open("rb") as file:
                ftp.storbinary(f"STOR {remote_path}", file)

            ftp.voidcmd("TYPE I")
            remote_size = ftp.size(str(remote_path))
            local_size = local_path.stat().st_size
            if remote_size != local_size:
                raise SystemExit(
                    f"Grösse stimmt nicht: {filename} lokal {local_size}, "
                    f"Server {remote_size} Bytes."
                )

    print(f"Deployment erfolgreich ({len(files)} Dateien).")


if __name__ == "__main__":
    main()
