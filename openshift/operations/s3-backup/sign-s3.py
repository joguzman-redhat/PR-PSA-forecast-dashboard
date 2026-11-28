#!/usr/bin/env python3
"""Emit private curl configuration for a single S3 SigV4 request.

Credentials come only from the environment; stdout must be a pipe to curl,
never a log. No dependency on the version-specific curl SigV4 implementation.
"""
import datetime
import hashlib
import hmac
import os
import re
import sys
import urllib.parse


def configuration(method, url, payload_hash, extra_headers, now=None):
    parsed = urllib.parse.urlsplit(url)
    if method not in ('PUT', 'HEAD') or parsed.scheme != 'https' or parsed.query or parsed.fragment:
        raise ValueError('Solicitud S3 no admitida')
    if not re.fullmatch(r'[a-f0-9]{64}', payload_hash):
        raise ValueError('Hash S3 no válido')
    stamp = (now or datetime.datetime.now(datetime.timezone.utc)).strftime('%Y%m%dT%H%M%SZ')
    region = os.environ['BUCKET_REGION']
    access = os.environ['AWS_ACCESS_KEY_ID']
    secret = os.environ['AWS_SECRET_ACCESS_KEY']
    if not re.fullmatch(r'[A-Za-z0-9]+', access):
        raise ValueError('Identificador S3 no válido')
    headers = {'host': parsed.netloc, 'x-amz-content-sha256': payload_hash, 'x-amz-date': stamp}
    for item in extra_headers:
        name, value = item.split(':', 1)
        if name not in ('x-amz-meta-sha256', 'x-amz-server-side-encryption') or not re.fullmatch(r'[A-Za-z0-9]+', value):
            raise ValueError('Cabecera S3 no admitida')
        headers[name] = value
    names = ';'.join(sorted(headers))
    canonical_headers = ''.join(f'{name}:{headers[name]}\n' for name in sorted(headers))
    uri = urllib.parse.quote(urllib.parse.unquote(parsed.path), safe='/-_.~')
    canonical = f'{method}\n{uri}\n\n{canonical_headers}\n{names}\n{payload_hash}'
    scope = f'{stamp[:8]}/{region}/s3/aws4_request'
    to_sign = f'AWS4-HMAC-SHA256\n{stamp}\n{scope}\n{hashlib.sha256(canonical.encode()).hexdigest()}'
    key = ('AWS4' + secret).encode()
    for part in (stamp[:8], region, 's3', 'aws4_request'):
        key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    signature = hmac.new(key, to_sign.encode(), hashlib.sha256).hexdigest()
    authorization = f'AWS4-HMAC-SHA256 Credential={access}/{scope}, SignedHeaders={names}, Signature={signature}'
    return ''.join(f'header = "{name}: {value}"\n' for name, value in headers.items()) + f'header = "Authorization: {authorization}"\n'


if __name__ == '__main__':
    try:
        sys.stdout.write(configuration(*sys.argv[1:4], sys.argv[4:]))
    except (KeyError, ValueError, TypeError):
        raise SystemExit('No se pudo preparar la firma S3; revisar configuración sin imprimir credenciales.')
