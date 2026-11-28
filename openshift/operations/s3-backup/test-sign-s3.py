#!/usr/bin/env python3
"""Independent offline signing check: python3 test-sign-s3.py (requires botocore)."""
import datetime
import hashlib
import importlib.util
import os
from pathlib import Path
import unittest

from botocore.auth import S3SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.credentials import Credentials

spec = importlib.util.spec_from_file_location('sign_s3', Path(__file__).with_name('sign-s3.py'))
signer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signer)


class SignatureCompatibility(unittest.TestCase):
    def test_matches_aws_sdk_for_put_head_and_checksum(self):
        # Public AWS documentation example credentials, never a live account.
        access = 'AKIAIOSFODNN7EXAMPLE'
        secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        os.environ.update(AWS_ACCESS_KEY_ID=access, AWS_SECRET_ACCESS_KEY=secret, BUCKET_REGION='us-east-1')
        now = datetime.datetime(2013, 5, 24, tzinfo=datetime.timezone.utc)
        for method, data, suffix in [('PUT', b'archive\x00\xffcontent', '.dump'), ('HEAD', b'', '.dump'), ('PUT', b'checksum\n', '.dump.sha256')]:
            with self.subTest(method=method, suffix=suffix):
                digest = hashlib.sha256(data).hexdigest()
                url = 'https://s3.us-east-1.amazonaws.com/example-bucket/financial/backup' + suffix
                extras = [] if method == 'HEAD' else ['x-amz-server-side-encryption:AES256']
                if method == 'PUT' and suffix == '.dump':
                    extras.append('x-amz-meta-sha256:' + digest)
                config = signer.configuration(method, url, digest, extras, now=now)
                headers = dict(line[len('header = "'):-1].split(': ', 1) for line in config.splitlines())
                actual = headers.pop('Authorization')
                request = AWSRequest(method=method, url=url, data=data, headers=headers)
                request.context['timestamp'] = '20130524T000000Z'
                sdk = S3SigV4Auth(Credentials(access, secret), 's3', 'us-east-1')
                canonical = sdk.canonical_request(request)
                signature = sdk.signature(sdk.string_to_sign(request, canonical), request)
                sdk._inject_signature_to_request(request, signature)
                self.assertEqual(actual, request.headers['Authorization'])


if __name__ == '__main__':
    unittest.main()
