"""Sign a release APK with the existing local key; never print credentials.

Usage: python tools/sign-apk.py unsigned.apk output.apk --verify-against previous.apk
The key directory defaults to the sibling nbe-android-keys project.
"""
import argparse
import os
from pathlib import Path
import re
import subprocess


def certificate(apk):
    output = subprocess.check_output(
        ['apksigner', 'verify', '--print-certs', str(apk)], text=True
    )
    match = re.search(r'certificate SHA-256 digest: ([0-9a-f]+)', output)
    if not match:
        raise RuntimeError('APK certificate not found')
    return match.group(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--key-dir', type=Path,
                        default=Path(__file__).resolve().parents[2] / 'nbe-android-keys')
    parser.add_argument('--verify-against', type=Path)
    args = parser.parse_args()
    info = {}
    for line in (args.key_dir / 'keystore.txt').read_text().splitlines():
        match = re.match(r'^(keystore|alias|password)\s*[:=]\s*(.*)$', line)
        if match:
            info[match.group(1)] = match.group(2).strip()
    keystore = Path(info['keystore'])
    if not keystore.is_absolute():
        keystore = args.key_dir / keystore
    args.output.parent.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, 'NBE_SIGN_PASSWORD': info['password']}
    subprocess.run([
        'apksigner', 'sign', '--ks', str(keystore), '--ks-key-alias', info['alias'],
        '--ks-pass', 'env:NBE_SIGN_PASSWORD', '--key-pass', 'env:NBE_SIGN_PASSWORD',
        '--out', str(args.output), str(args.source),
    ], env=env, check=True)
    digest = certificate(args.output)
    if args.verify_against and digest != certificate(args.verify_against):
        args.output.unlink()
        raise RuntimeError('Signing certificate differs from the previous APK')
    print(f'Signed and verified: {args.output.resolve()} ({args.output.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
