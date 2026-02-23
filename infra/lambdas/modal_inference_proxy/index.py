import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, Optional

import boto3

secrets_client = boto3.client("secretsmanager")
_secret_cache: Dict[str, str] = {}


def _base64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - (len(value) % 4)) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _ip_prefix(ip: str) -> str:
    ip = ip.strip()
    if not ip:
        return ""
    if "." in ip:
        return ".".join(ip.split(".")[:3])
    if ":" in ip:
        return ":".join(ip.split(":")[:4])
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
    if not secret_arn:
        return ""

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


def _parse_bearer_token(event: Dict[str, Any]) -> str:
    auth_header = _get_header(event.get("headers") or {}, "authorization")
    if not auth_header.lower().startswith("bearer "):
        return ""
    return auth_header[7:].strip()


def _verify_session_token(token: str, signing_secret: str, event: Dict[str, Any]) -> Dict[str, Any]:
    if token.count(".") != 2:
        raise ValueError("Malformed token")

    encoded_header, encoded_claims, encoded_signature = token.split(".")
    signing_input = f"{encoded_header}.{encoded_claims}".encode("utf-8")

    expected_signature = hmac.new(signing_secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    actual_signature = _base64url_decode(encoded_signature)

    if not hmac.compare_digest(expected_signature, actual_signature):
        raise ValueError("Invalid token signature")

    claims = json.loads(_base64url_decode(encoded_claims).decode("utf-8"))

    now = int(time.time())
    if int(claims.get("exp", 0)) <= now:
        raise ValueError("Session token is expired")

    required_action = os.getenv("REQUIRED_ACTION", "infer").strip().lower()
    if claims.get("action") != required_action:
        raise ValueError("Session token action is not allowed for this endpoint")

    headers = event.get("headers") or {}
    source_ip = (
        (((event.get("requestContext") or {}).get("identity") or {}).get("sourceIp"))
        or _get_header(headers, "x-forwarded-for").split(",")[0].strip()
    )
    user_agent = _get_header(headers, "user-agent")

    claim_ip_hash = claims.get("ipHash", "")
    claim_ua_hash = claims.get("uaHash", "")

    if claim_ip_hash and claim_ip_hash != _hash_value(_ip_prefix(source_ip)):
        raise ValueError("Session token IP binding mismatch")

    if claim_ua_hash and claim_ua_hash != _hash_value(user_agent):
        raise ValueError("Session token user-agent binding mismatch")

    return claims


def _parse_modal_auth_payload(raw_secret: str) -> Dict[str, str]:
    if not raw_secret:
        return {}

    payload = raw_secret.strip()
    if not payload:
        return {}

    if payload.startswith("{"):
        data = json.loads(payload)
        return {
            "modal_key": (data.get("modal_key") or data.get("Modal-Key") or data.get("key") or "").strip(),
            "modal_secret": (data.get("modal_secret") or data.get("Modal-Secret") or data.get("secret") or "").strip(),
        }

    # Fallback raw format: key:secret
    if ":" in payload:
        key, secret = payload.split(":", 1)
        return {"modal_key": key.strip(), "modal_secret": secret.strip()}

    return {}


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    token = _parse_bearer_token(event)
    if not token:
        return _response(401, event, {"code": "missing_auth", "message": "Bearer session token is required."})

    try:
        signing_secret = _get_secret(
            os.environ["SESSION_SIGNING_SECRET_ARN"],
            preferred_keys=("session_signing_key", "secret", "value"),
        )
        _verify_session_token(token, signing_secret, event)
    except Exception as exc:
        return _response(403, event, {"code": "invalid_session", "message": str(exc)})

    try:
        request_payload = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, event, {"code": "invalid_json", "message": "Request body must be valid JSON."})

    modal_endpoint_url = os.getenv("MODAL_ENDPOINT_URL", "").strip()
    if not modal_endpoint_url:
        return _response(500, event, {"code": "modal_endpoint_missing", "message": "MODAL_ENDPOINT_URL is not configured."})

    modal_auth_raw = ""
    modal_auth_secret_arn = os.getenv("MODAL_PROXY_AUTH_SECRET_ARN", "").strip()
    if modal_auth_secret_arn:
        try:
            response = secrets_client.get_secret_value(SecretId=modal_auth_secret_arn)
            modal_auth_raw = response.get("SecretString", "")
            if not modal_auth_raw and response.get("SecretBinary"):
                modal_auth_raw = base64.b64decode(response["SecretBinary"]).decode("utf-8")
        except Exception as exc:
            return _response(500, event, {"code": "modal_auth_secret_load_failed", "message": str(exc)})

    modal_auth = _parse_modal_auth_payload(modal_auth_raw)

    request_headers = {
        "Content-Type": "application/json",
    }

    if modal_auth.get("modal_key") and modal_auth.get("modal_secret"):
        request_headers["Modal-Key"] = modal_auth["modal_key"]
        request_headers["Modal-Secret"] = modal_auth["modal_secret"]

    timeout_seconds = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "30"))

    request_body = json.dumps(request_payload).encode("utf-8")
    request = urllib.request.Request(
        modal_endpoint_url,
        data=request_body,
        headers=request_headers,
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw_response = response.read().decode("utf-8")
            status_code = response.getcode()
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8") if exc.fp is not None else ""
        return _response(
            502,
            event,
            {
                "code": "modal_http_error",
                "message": f"Modal returned HTTP {exc.code}",
                "details": error_body,
            },
        )
    except Exception as exc:
        return _response(502, event, {"code": "modal_request_failed", "message": str(exc)})

    try:
        parsed = json.loads(raw_response) if raw_response else {}
    except json.JSONDecodeError:
        parsed = {"raw": raw_response}

    return _response(status_code, event, {"result": parsed})
