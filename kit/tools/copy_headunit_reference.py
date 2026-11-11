#!/usr/bin/env python3
"""Copy development references using read-only SSH commands; no SFTP required."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
MAIN = "/usr/lib/oap-mainapp"
CATALOG = "/etc/oap/someip/someip-interfaces.json"


def remote_path(value):
    if not value.startswith("/") or value.startswith("//") or any(
        ord(c) < 32 for c in value
    ) or ".." in value.split("/"):
        raise argparse.ArgumentTypeError("use an absolute head-unit path without '..' or control characters")
    return value.rstrip("/") or "/"


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("host", help="user@head-unit-address or an existing SSH host alias")
    parser.add_argument("-i", "--identity", type=Path, help="SSH private key (never copied)")
    parser.add_argument("-p", "--port", type=int, help="SSH port (otherwise use SSH configuration)")
    parser.add_argument("-o", "--output", type=Path, help="local parent folder for dated captures (default: repository reference/)")
    parser.add_argument("--include-packages", action="store_true", help="also copy stock preinstalled .tgz packages (can be large)")
    parser.add_argument("--schema-dir", action="append", default=[], type=remote_path, help="additional known signal-definition directory; repeatable")
    parser.add_argument("--log", action="append", default=[], type=remote_path, help="specific /var/opt/public/oap/oap_<uid>/data/<app>.log; repeatable")
    parser.add_argument("--dry-run", action="store_true", help="show SSH commands without connecting or writing files")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.:@%\[\]-]*", args.host):
        parser.error("invalid SSH destination")
    if args.port is not None and not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    if args.identity:
        args.identity = args.identity.expanduser().resolve()
        if not args.identity.is_file():
            parser.error("identity key is not a file")
    for path in args.log:
        if not re.fullmatch(r"/var/opt/public/oap/oap_[0-9]+/data/[^/]+\.log", path):
            parser.error("--log must name an individual OAP app log under its data directory")
    for path in args.schema_dir:
        if path in ("/", "/etc", "/usr", "/var", "/var/opt", "/var/opt/public"):
            parser.error("--schema-dir must name a specific signal-definition directory")
    return args


def ssh_command(args):
    command = ["ssh", "-T", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15",
               "-o", "ServerAliveCountMax=3"]
    if args.port is not None:
        command += ["-p", str(args.port)]
    if args.identity:
        command += ["-i", str(args.identity), "-o", "IdentitiesOnly=yes"]
    # Preserve normal SSH host-key verification and ~/.ssh/config behaviour.
    return command + [args.host]


def discovery_command(args):
    # Only shell tests, printf and find execute on the vehicle. No uploaded script,
    # temporary files, diagnostics, service commands or installation commands.
    script = r'''export LC_ALL=C
file() {
    if [ -f "$1" ] && [ -r "$1" ]; then
        printf '%s\000' "$1"
    else
        printf 'Missing/unreadable file: %s\n' "$1" >&2
    fi
}
tree() {
    if [ -d "$1" ] && [ ! -L "$1" ]; then
        find "$1" -type f -print0 || exit 1
    else
        printf 'Missing directory (or symlink skipped): %s\n' "$1" >&2
    fi
}
'''
    for path in [CATALOG, "/etc/os-release", "/etc/os-release-id-dlt", "/run/etc/variant.env",
                 MAIN + "/config/base.json", MAIN + "/package.json"] + args.log:
        script += "file " + shlex.quote(path) + "\n"
    for path in ["/etc/oap/someip", MAIN + "/someipInterfaces", MAIN + "/rhmiData",
                 MAIN + "/rhmiDataStartWidget"] + args.schema_dir:
        script += "tree " + shlex.quote(path) + "\n"
    script += '''for app in /var/opt/public/oap/oap_*; do
    [ -d "$app/source" ] || continue
    tree "$app/someipInterfaces"
    tree "$app/rhmiData"
    tree "$app/rhmiDataStartWidget"
    for name in package.json manifest.json permissions.json config/base.json; do
        file "$app/source/$name"
    done
done
'''
    if args.include_packages:
        script += '''for package in /usr/lib/oap-mainapp/preinstalled_apps/*.tgz; do
    file "$package"
done
'''
    return script


def parse_listing(data):
    paths = set()
    for item in data.split(b"\0"):
        if item:
            path = item.decode("utf-8")
            try:
                remote_path(path)
            except argparse.ArgumentTypeError as error:
                raise ValueError("Invalid remote file listing: " + str(error)) from error
            paths.add(path)
    return sorted(paths)


def archive_command():
    # Read filenames from SSH stdin, not the shell command line (ARG_MAX).
    # -T works with the head unit's tar; no remote list/archive file is created.
    return "LC_ALL=C tar -c -h -f - -C / -T -"


def archive_input(paths):
    names = [path[1:] for path in paths]
    # Newlines/control characters were rejected by parse_listing. Reject names
    # that tar implementations could interpret as options or unescape/trim.
    for name in names:
        if not name or name.startswith("-") or "\\" in name or name != name.strip():
            raise ValueError("Filename cannot be safely sent through tar's file list: " + repr(name))
    return ("\n".join(names) + "\n").encode("utf-8")


def unpack(archive, destination, paths):
    expected = {p[1:] for p in paths}
    copied = set()
    records = []
    with tarfile.open(archive, "r|") as tar:
        for member in tar:
            name = member.name
            if (name not in expected or name in copied or not member.isfile()
                    or PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts):
                raise ValueError("unexpected or non-regular archive entry: " + repr(name))
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            with tar.extractfile(member) as source, target.open("xb") as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)
                    digest.update(chunk)
            copied.add(name)
            records.append({"source": "/" + name, "bytes": member.size, "sha256": digest.hexdigest()})
    if copied != expected:
        raise ValueError("archive is incomplete")
    return records


def collect(args):
    ssh = ssh_command(args)
    discovery = discovery_command(args)
    if args.dry_run:
        print(shlex.join(ssh + [discovery]))
        parent = args.output.expanduser().resolve() if args.output else ROOT / "reference"
        print(f"Then: SSH {archive_command()} with filenames streamed on stdin; extract locally under {parent}/headunit-<UTC time>-<unique suffix>/")
        return 0
    # Files are private locally; do not carry the vehicle's owners/modes to the Mac.
    os.umask(0o077)
    print("Reading the head unit's reference-file list…", flush=True)
    listing = subprocess.run(ssh + [discovery], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    warnings = listing.stderr.decode("utf-8", errors="replace")
    if listing.returncode:
        raise RuntimeError("SSH discovery failed: " + warnings.strip())
    paths = parse_listing(listing.stdout)
    if not paths:
        raise RuntimeError("No reference files found. " + warnings.strip())
    file_list = archive_input(paths)
    optional_notices = sum(line.startswith("Missing") for line in warnings.splitlines())
    if optional_notices:
        print(f"Skipped {optional_notices} missing/unreadable paths or directory symlinks; details will be saved in the manifest.", flush=True)
    reference = args.output.expanduser().resolve() if args.output else ROOT / "reference"
    reference.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    stage = Path(tempfile.mkdtemp(prefix=".headunit-partial-", dir=reference))
    archive = stage / "download.tar"
    try:
        print(f"Copying {len(paths)} files (read-only)…", flush=True)
        with archive.open("xb") as output:
            result = subprocess.run(ssh + [archive_command()], input=file_list,
                                    stdout=output, stderr=subprocess.PIPE)
        transfer_warnings = result.stderr.decode("utf-8", errors="replace")
        warnings += transfer_warnings
        if result.returncode:
            raise RuntimeError("SSH transfer failed: " + transfer_warnings.strip())
        payload = stage / "files"
        payload.mkdir()
        records = unpack(archive, payload, paths)
        archive.unlink()
        catalog_status = "missing"
        if CATALOG in paths:
            try:
                json.loads((payload / CATALOG[1:]).read_text())
                catalog_status = "valid JSON"
            except (ValueError, UnicodeError):
                catalog_status = "invalid JSON"
        report = {"captured_at_utc": timestamp, "host": args.host,
                  "catalogue": catalog_status, "warnings": warnings, "files": records}
        (payload / "capture-manifest.json").write_text(json.dumps(report, indent=2) + "\n")
        destination = reference / ("headunit-" + timestamp + "-" + stage.name.rsplit("-", 1)[-1])
        payload.rename(destination)
        print(f"Saved {len(records)} files to {destination}")
        print(f"Catalogue: {catalog_status}. Missing paths and checksums: capture-manifest.json")
        if catalog_status != "valid JSON":
            print("Collection is partial: the required catalogue is missing or invalid.", file=sys.stderr)
            return 2
        return 0
    finally:
        shutil.rmtree(stage)


def main():
    try:
        return collect(arguments())
    except (OSError, ValueError, tarfile.TarError, RuntimeError) as error:
        print(f"Copy failed: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Copy cancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
