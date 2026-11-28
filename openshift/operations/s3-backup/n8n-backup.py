#!/usr/bin/env python3
"""Briefly stop only n8n, archive its SQLite state and key, then upload to S3."""
import json
import os
from pathlib import Path
import shutil
import signal
import ssl
import subprocess
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

NAMESPACE = 'nola-consulting-services-tenant--runtime-int'
SERVICEACCOUNT = Path('/var/run/secrets/kubernetes.io/serviceaccount')
API = 'https://kubernetes.default.svc'
DEPLOYMENT = f'/apis/apps/v1/namespaces/{NAMESPACE}/deployments/forecast-n8n'
SCALE = DEPLOYMENT + '/scale'
PODS = f'/api/v1/namespaces/{NAMESPACE}/pods?' + urlencode({'labelSelector': 'app=forecast-n8n'})
WORK = Path('/work')


class Maintenance:
    def __init__(self):
        self.token = (SERVICEACCOUNT / 'token').read_text().strip()
        self.context = ssl.create_default_context(cafile=str(SERVICEACCOUNT / 'ca.crt'))
        self.original_replicas = None
        self.stop_attempted = False

    def request(self, path, body=None):
        headers = {'Authorization': 'Bearer ' + self.token}
        method = 'GET'
        data = None
        if body is not None:
            method = 'PATCH'
            headers['Content-Type'] = 'application/merge-patch+json'
            data = json.dumps(body).encode()
        request = Request(API + path, data=data, headers=headers, method=method)
        with urlopen(request, context=self.context, timeout=15) as response:
            return json.load(response)

    def source_pods(self):
        return self.request(PODS)['items']

    def ensure_stopped(self):
        if self.request(SCALE)['spec']['replicas'] != 0 or self.source_pods():
            raise RuntimeError('n8n fue reactivado; se rechaza copiar SQLite en uso.')

    def stop(self):
        deployment = self.request(DEPLOYMENT)
        metadata = deployment['metadata']
        argo_managed = (
            'argocd.argoproj.io/tracking-id' in metadata.get('annotations', {})
            or 'argocd.argoproj.io/instance' in metadata.get('labels', {})
            or 'app.kubernetes.io/instance' in metadata.get('labels', {})
        )
        if argo_managed and os.environ.get('N8N_BACKUP_ARGO_REPLICA_IGNORE_CONFIRMED') != 'true':
            raise RuntimeError('Argo gestiona n8n: confirmar ignoreDifferences de replicas antes del mantenimiento.')
        scale = self.request(SCALE)
        self.original_replicas = scale['spec']['replicas']
        if self.original_replicas != 1:
            raise RuntimeError('Este backup requiere una sola réplica original de n8n.')
        self.stop_attempted = True
        self.request(SCALE, {'metadata': {'resourceVersion': scale['metadata']['resourceVersion']},
                             'spec': {'replicas': 0}})
        deadline = time.monotonic() + 240
        while self.source_pods():
            if time.monotonic() >= deadline:
                raise RuntimeError('Timeout esperando la terminación de los pods de n8n.')
            time.sleep(2)
        self.ensure_stopped()
        time.sleep(2)
        self.ensure_stopped()

    def restore(self):
        if not self.stop_attempted:
            return
        # Never overwrite an unrelated concurrent operator's scale change.
        last_error = None
        for attempt in range(3):
            try:
                scale = self.request(SCALE)
                replicas = scale['spec']['replicas']
                if replicas == self.original_replicas:
                    self.stop_attempted = False
                    return
                if replicas != 0:
                    raise RuntimeError('Escala modificada por otro operador; revisar n8n manualmente.')
                self.request(SCALE, {'metadata': {'resourceVersion': scale['metadata']['resourceVersion']},
                                     'spec': {'replicas': self.original_replicas}})
                self.stop_attempted = False
                print('Réplica original de n8n restablecida; comprobar readiness tras finalizar el Job.', flush=True)
                return
            except Exception as error:
                last_error = error
                if attempt < 2:
                    time.sleep(2)
        raise RuntimeError('No se pudo restablecer n8n: requiere intervención inmediata.') from last_error


def interrupted(_signal, _frame):
    raise SystemExit('Backup interrumpido; intentando restablecer n8n.')


def main():
    os.umask(0o077)
    pod = os.environ['POD_NAME']
    if not pod or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in pod):
        raise RuntimeError('Nombre de pod inválido.')
    maintenance = Maintenance()
    archive = WORK / 'n8n.tar.gz'
    key_dir = WORK / 'n8n-encryption-key'
    key_dir.mkdir(mode=0o700)
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        encryption_key = Path('/n8n-key/N8N_ENCRYPTION_KEY').read_bytes()
        if not encryption_key.strip():
            raise RuntimeError('La clave de cifrado está vacía; no se iniciará mantenimiento.')
        maintenance.stop()
        (key_dir / 'N8N_ENCRYPTION_KEY').write_bytes(encryption_key)
        subprocess.run(['tar', '-czf', str(archive), '-C', '/', 'n8n-state',
                        '-C', str(WORK), 'n8n-encryption-key'], check=True, timeout=900)
        maintenance.ensure_stopped()
        # Restart before uploading to keep downtime as short as possible.
        maintenance.restore()
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        subprocess.run(['bash', '/opt/backup/upload.sh', str(archive),
                        f'n8n/{timestamp}-{pod}.tar.gz'], check=True, timeout=1000)
    finally:
        try:
            maintenance.restore()
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(key_dir, ignore_errors=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Falló el backup de n8n: {type(error).__name__}: {error}', file=sys.stderr)
        sys.exit(1)
