#!/usr/bin/env bash
#
# Regenerates the real-age interop fixtures in test/fixtures/ from scratch.
#
# Maintainer tool only: this script is NOT part of `npm test`, the CI gate, or
# the build. The generated fixtures are committed so that test/interop.test.ts
# can run without the age CLI.
#
# Usage (age + python3 come from the devbox shell):
#   devbox run -- bash scripts/make-fixtures.sh
#
# What it does:
#   1. Writes deterministic plaintext originals to test/fixtures/plain/.
#   2. Encrypts each one with the real `age` CLI (`age -p`, scrypt default work
#      factor). age reads passphrases from a terminal, so a small Python pty
#      driver feeds the prompts non-interactively.
#   3. Writes test/fixtures/<name>.age.
#
# Passphrases (kept in sync with test/interop.test.ts):
#   DEFAULT_PASSPHRASE = "correct horse battery staple"
#   SPACES_PASSPHRASE  = " pässword with spaces "   (leading/trailing space + non-ASCII)
#
# Age passphrase encryption is randomised (random salt/nonce), so re-running
# this script produces new ciphertext for the same plaintext and passphrase.
# The plaintext bytes, and therefore the test assertions, are reproducible.
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plain_dir="$repo_root/test/fixtures/plain"
fixtures_dir="$repo_root/test/fixtures"

DEFAULT_PASSPHRASE='correct horse battery staple'
SPACES_PASSPHRASE=' pässword with spaces '

for cmd in age python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: '$cmd' not found. Run this script inside the devbox shell:" >&2
    echo "  devbox run -- bash scripts/make-fixtures.sh" >&2
    exit 1
  fi
done

mkdir -p "$plain_dir" "$fixtures_dir"

# ---------------------------------------------------------------------------
# 1. Deterministic plaintext originals
# ---------------------------------------------------------------------------
printf 'hello world\n' > "$plain_dir/hello.txt"

cat > "$plain_dir/page.html" <<'HTML'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>age interop fixture</title>
  </head>
  <body>
    <h1>Hello from an age-encrypted page</h1>
    <p>This document was encrypted with the age CLI and decrypted in tests.</p>
  </body>
</html>
HTML

cat > "$plain_dir/doc.pdf" <<'PDF'
%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
trailer
<< /Root 1 0 R /Size 4 >>
%%EOF
PDF

printf 'passphrase with leading and trailing spaces, plus a non-ASCII character: pässword\n' \
  > "$plain_dir/with-spaces.txt"

# Binary fixtures: deterministic byte sequences generated with a fixed LCG.
python3 - "$plain_dir" <<'PY'
import pathlib, sys

out = pathlib.Path(sys.argv[1])

# 1 KiB deterministic blob.
out.joinpath("blob.bin").write_bytes(bytes((i * 37 + 11) % 256 for i in range(1024)))

# ~200 KiB (>3 age 64 KiB chunks) deterministic bytes.
x = 0x12345678
buf = bytearray()
for _ in range(200 * 1024):
    x = (1103515245 * x + 12345) & 0xFFFFFFFF
    buf.append((x >> 16) & 0xFF)
out.joinpath("multichunk.bin").write_bytes(bytes(buf))

# Zero-byte plaintext.
out.joinpath("empty.bin").write_bytes(b"")
PY

# ---------------------------------------------------------------------------
# 2. Encrypt with the real age CLI, driving its tty prompts through a pty
# ---------------------------------------------------------------------------
pty_driver="$(mktemp)"
trap 'rm -f "$pty_driver"' EXIT

cat > "$pty_driver" <<'PY'
import os, pty, select, subprocess, sys

def encrypt(src, dst, passphrase):
    master, slave = pty.openpty()
    proc = subprocess.Popen(
        ["age", "-p", "-o", dst, src],
        stdin=slave,
        stdout=slave,
        stderr=slave,
        close_fds=True,
    )
    os.close(slave)
    transcript = b""
    answered = 0
    while True:
        ready, _, _ = select.select([master], [], [], 60)
        if not ready:
            proc.kill()
            raise SystemExit("timed out waiting for age passphrase prompt")
        try:
            chunk = os.read(master, 1024)
        except OSError:
            break
        if not chunk:
            break
        transcript += chunk
        # age asks twice: "Enter passphrase ..." and "Confirm passphrase:"
        prompts = transcript.lower().count(b"passphrase")
        if prompts > answered:
            os.write(master, passphrase.encode() + b"\n")
            answered = prompts
    code = proc.wait()
    os.close(master)
    if code != 0:
        raise SystemExit(f"age failed for {src} with exit code {code}")

encrypt(sys.argv[1], sys.argv[2], sys.argv[3])
PY

encrypt() {
  local source="$1" output="$2" passphrase="$3"
  python3 "$pty_driver" "$plain_dir/$source" "$fixtures_dir/$output" "$passphrase"
  echo "wrote test/fixtures/$output"
}

encrypt hello.txt       hello.txt.age       "$DEFAULT_PASSPHRASE"
encrypt page.html       page.html.age       "$DEFAULT_PASSPHRASE"
encrypt doc.pdf         doc.pdf.age         "$DEFAULT_PASSPHRASE"
encrypt blob.bin        blob.bin.age        "$DEFAULT_PASSPHRASE"
encrypt multichunk.bin  multichunk.bin.age  "$DEFAULT_PASSPHRASE"
encrypt empty.bin       empty.age           "$DEFAULT_PASSPHRASE"
encrypt with-spaces.txt with-spaces.age     "$SPACES_PASSPHRASE"

echo "done: fixtures regenerated with $(age --version)"
