import base64
import hashlib
import hmac
import json
import os
import time
import urllib.parse
import urllib.request
import uuid
from typing import Any, Dict, Iterable, Optional

import boto3

secrets_client = boto3.client("secretsmanager")
_secret_cache: Dict[str, str] = {}


def _base64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _base64url_decode(raw: str) -> bytes:
    padding = "=" * ((4 - (len(raw) % 4)) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _ip_prefix(ip: str) -> str:
    ip = ip.strip()
    if not ip:
        return ""
    if "." in ip:
        parts = ip.split(".")
        return ".".join(parts[:3])
    if ":" in ip:
        parts = ip.split(":")
        return ":".join(parts[:4])
    return ip


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


def _get_header(headers: Optional[Dict[str, str]], key: str) -> str:
    if not headers:
        return ""

    for header_name, header_value in headers.items():
        if header_name.lower() == key.lower():
            return header_value
    return ""


def _allowed_origins() -> set[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "")
    return {item.strip() for item in raw.split(",") if item.strip()}


def _cors_origin(event: Dict[str, Any]) -> str:
    origin = _get_header(event.get("headers") or {}, "origin")
    allowed = _allowed_origins()

    if origin and origin in allowed:
        return origin

    if allowed:
        return next(iter(allowed))

    return "*"


def _response(status_code: int, event: Dict[str, Any], body: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": _cors_origin(event),
            "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
            "Access-Control-Max-Age": "300",
            "Vary": "Origin",
        },
        "body": json.dumps(body),
    }


def _verify_turnstile(token: str, remote_ip: str, action: str, secret: str) -> Dict[str, Any]:
    siteverify_url = os.getenv("TURNSTILE_SITEVERIFY_URL", "https://challenges.cloudflare.com/turnstile/v0/siteverify")

    payload = {
        "secret": secret,
        "response": token,
    }

    if remote_ip:
        payload["remoteip"] = remote_ip

    encoded = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(
        siteverify_url,
        data=encoded,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=10) as response:
        body = response.read().decode("utf-8")
        parsed = json.loads(body)

    if not parsed.get("success"):
        return {
            "ok": False,
            "error": "turnstile_verification_failed",
            "details": parsed.get("error-codes", []),
        }

    returned_action = parsed.get("action")
    if returned_action and returned_action != action:
        return {
            "ok": False,
            "error": "turnstile_action_mismatch",
            "details": [f"expected_action:{action}", f"received_action:{returned_action}"],
        }

    return {"ok": True, "details": []}


def _mint_session_token(
    action: str,
    nonce: str,
    source_ip: str,
    user_agent: str,
    signing_secret: str,
) -> Dict[str, Any]:
    now = int(time.time())
    ttl = int(os.getenv("TOKEN_TTL_SECONDS", "600"))
    expires = now + ttl

    claims = {
        "sub": f"anon-{uuid.uuid4()}",
        "iat": now,
        "exp": expires,
        "action": action,
        "nonce": nonce,
        "jti": str(uuid.uuid4()),
        "ipHash": _hash_value(_ip_prefix(source_ip)) if source_ip else "",
        "uaHash": _hash_value(user_agent) if user_agent else "",
    }

    header = {"alg": "HS256", "typ": "JWT"}

    encoded_header = _base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    encoded_claims = _base64url_encode(json.dumps(claims, separators=(",", ":")).encode("utf-8"))

    signing_input = f"{encoded_header}.{encoded_claims}".encode("utf-8")
    signature = hmac.new(signing_secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    encoded_signature = _base64url_encode(signature)

    return {
        "token": f"{encoded_header}.{encoded_claims}.{encoded_signature}",
        "claims": claims,
    }


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    try:
        raw_body = event.get("body") or "{}"
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return _response(400, event, {"code": "invalid_json", "message": "Request body must be valid JSON."})

    token = str(body.get("turnstileToken", "")).strip()
    action = str(body.get("action", "")).strip().lower()
    nonce = str(body.get("clientNonce", "")).strip()

    if not token:
        return _response(400, event, {"code": "missing_turnstile_token", "message": "turnstileToken is required."})

    if action not in {"resume", "chat", "infer"}:
        return _response(400, event, {"code": "invalid_action", "message": "action must be one of: resume, chat, infer."})

    headers = event.get("headers") or {}
    source_ip = (
        (((event.get("requestContext") or {}).get("identity") or {}).get("sourceIp"))
        or _get_header(headers, "x-forwarded-for").split(",")[0].strip()
    )
    user_agent = _get_header(headers, "user-agent")

    try:
        turnstile_secret = _get_secret(
            os.environ["TURNSTILE_SECRET_ARN"],
            preferred_keys=("turnstile_secret", "secret", "value"),
        )
        signing_secret = _get_secret(
            os.environ["SESSION_SIGNING_SECRET_ARN"],
            preferred_keys=("session_signing_key", "secret", "value"),
        )
    except Exception as exc:
        return _response(500, event, {"code": "secret_load_failed", "message": str(exc)})

    try:
        verification = _verify_turnstile(token, source_ip, action, turnstile_secret)
    except Exception as exc:
        return _response(502, event, {"code": "turnstile_request_failed", "message": str(exc)})

    if not verification.get("ok"):
        return _response(
            403,
            event,
            {
                "code": verification.get("error", "turnstile_denied"),
                "message": "Turnstile verification failed.",
                "details": verification.get("details", []),
            },
        )

    minted = _mint_session_token(action, nonce, source_ip, user_agent, signing_secret)
    return _response(
        200,
        event,
        {
            "sessionToken": minted["token"],
            "expiresAt": minted["claims"]["exp"],
            "allowedActions": [action],
        },
    )
