"""API Gateway Lambda authorizer that validates JWT session tokens.

Tokens are HS256-signed JWTs minted by the turnstile broker Lambda.
The signing key is read from Secrets Manager on cold start.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Dict, Iterable

import boto3

secrets_client = boto3.client("secretsmanager")
_secret_cache: Dict[str, str] = {}

ACTION_ROUTE_MAP: Dict[str, list[str]] = {
    "resume": ["/v1/resume/*"],
    "chat": ["/v1/chat/*"],
    "infer": ["/v1/infer/*"],
    "intake": ["/v1/intake/*"],
}


def _base64url_decode(raw: str) -> bytes:
    padding = "=" * ((4 - (len(raw) % 4)) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def _parse_secret_value(secret_payload: str, preferred_keys: Iterable[str]) -> str:
    payload = secret_payload.strip()
    if not payload:
        raise ValueError("Secret payload is empty")

    if payload.startswith("{"):
        parsed = json.loads(payload)
        for key in preferred_keys:
            value = parsed.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        raise ValueError("Secret JSON did not contain an expected key")

    return payload


def _get_secret(secret_arn: str, preferred_keys: Iterable[str]) -> str:
    if secret_arn in _secret_cache:
        return _secret_cache[secret_arn]

    response = secrets_client.get_secret_value(SecretId=secret_arn)
    secret_string = response.get("SecretString")

    if secret_string is None:
        secret_binary = response.get("SecretBinary")
        if secret_binary is None:
            raise ValueError(f"No secret value found for {secret_arn}")
        secret_string = base64.b64decode(secret_binary).decode("utf-8")

    value = _parse_secret_value(secret_string, preferred_keys)
    _secret_cache[secret_arn] = value
    return value


def _verify_jwt(token: str, signing_secret: str) -> Dict[str, Any]:
    """Decode and verify an HS256 JWT. Returns claims dict or raises."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed JWT")

    encoded_header, encoded_claims, encoded_signature = parts

    header = json.loads(_base64url_decode(encoded_header))
    if header.get("alg") != "HS256":
        raise ValueError(f"Unsupported algorithm: {header.get('alg')}")

    signing_input = f"{encoded_header}.{encoded_claims}".encode("utf-8")
    expected_sig = hmac.new(
        signing_secret.encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    actual_sig = _base64url_decode(encoded_signature)

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise ValueError("Invalid signature")

    claims = json.loads(_base64url_decode(encoded_claims))

    exp = claims.get("exp")
    if exp is not None and time.time() > exp:
        raise ValueError("Token expired")

    return claims


def _build_policy(
    principal_id: str,
    effect: str,
    method_arn: str,
    claims: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    arn_parts = method_arn.split(":")
    api_gw_part = arn_parts[5]
    api_id, stage = api_gw_part.split("/")[:2]
    base_arn = ":".join(arn_parts[:5])

    action = claims.get("action", "") if claims else ""
    allowed_routes = ACTION_ROUTE_MAP.get(action, [])

    if effect == "Allow" and allowed_routes:
        resources = [
            f"{base_arn}:{api_id}/{stage}/{method}{route}"
            for route in allowed_routes
            for method in ("GET", "POST")
        ]
    else:
        resource_arn = f"{base_arn}:{api_id}/{stage}/*"
        resources = [resource_arn]

    policy: Dict[str, Any] = {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": effect,
                    "Resource": resources,
                }
            ],
        },
    }

    if claims:
        policy["context"] = {
            "sub": str(claims.get("sub", "")),
            "action": str(claims.get("action", "")),
            "jti": str(claims.get("jti", "")),
        }

    return policy


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    token_raw = event.get("authorizationToken", "")
    method_arn = event.get("methodArn", "")

    if not token_raw or not method_arn:
        raise Exception("Unauthorized")

    if token_raw.lower().startswith("bearer "):
        token_raw = token_raw[7:]

    try:
        signing_secret = _get_secret(
            os.environ["SESSION_SIGNING_SECRET_ARN"],
            preferred_keys=("session_signing_key", "secret", "value"),
        )
    except Exception:
        raise Exception("Unauthorized")

    try:
        claims = _verify_jwt(token_raw, signing_secret)
    except ValueError:
        raise Exception("Unauthorized")

    principal = claims.get("sub", "anonymous")
    return _build_policy(principal, "Allow", method_arn, claims)
