import json
import os
import re
import uuid
from typing import Any, Dict, List, Optional

import boto3

ses_client = boto3.client("ses")

VALID_OFFER_INTERESTS = {
    "workflow-diagnostic",
    "pilot-sprint",
    "readiness-review",
    "implementation-support",
    "not-sure",
}

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _get_header(headers: Optional[Dict[str, str]], key: str) -> str:
    if not headers:
        return ""

    for header_name, header_value in headers.items():
        if header_name.lower() == key.lower():
            return header_value
    return ""


def _allowed_origins() -> List[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "")
    return [item.strip() for item in raw.split(",") if item.strip()]


def _cors_origin(event: Dict[str, Any]) -> Optional[str]:
    origin = _get_header(event.get("headers") or {}, "origin")
    allowed = _allowed_origins()

    if origin and origin in allowed:
        return origin

    if origin:
        return None

    if allowed:
        return allowed[0]

    return "*"


def _cors_headers(event: Dict[str, Any]) -> Dict[str, str]:
    headers = {
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With",
        "Access-Control-Allow-Methods": "OPTIONS,POST",
        "Access-Control-Max-Age": "300",
        "Vary": "Origin",
    }
    origin = _cors_origin(event)
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
    return headers


def _response(status_code: int, event: Dict[str, Any], body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            **_cors_headers(event),
        },
        "body": json.dumps(body or {}),
    }


def _http_method(event: Dict[str, Any]) -> str:
    return (
        event.get("httpMethod")
        or (((event.get("requestContext") or {}).get("http") or {}).get("method"))
        or ""
    ).upper()


def _as_string(body: Dict[str, Any], key: str, max_len: int) -> str:
    value = body.get(key, "")
    if value is None:
        return ""
    if not isinstance(value, str):
        return ""
    return value.strip()[:max_len]


def _validate_submission(body: Dict[str, Any]) -> List[str]:
    errors: List[str] = []

    name = _as_string(body, "name", 160)
    email = _as_string(body, "email", 254)
    offer_interest = _as_string(body, "offerInterest", 80)
    problem_summary = _as_string(body, "problemSummary", 5000)
    consent = body.get("consentToContact")

    if len(name) < 2:
        errors.append("name")
    if not EMAIL_PATTERN.match(email):
        errors.append("email")
    if offer_interest not in VALID_OFFER_INTERESTS:
        errors.append("offerInterest")
    if len(problem_summary) < 30:
        errors.append("problemSummary")
    if consent is not True:
        errors.append("consentToContact")

    return errors


def _submission_id() -> str:
    return f"intake-{uuid.uuid4()}"


def _is_honeypot_submission(body: Dict[str, Any]) -> bool:
    return bool(_as_string(body, "websiteUrl", 2048))


def _format_optional(label: str, value: str) -> str:
    return f"{label}: {value}" if value else f"{label}:"


def _email_body(submission_id: str, body: Dict[str, Any]) -> str:
    fields = [
        f"Submission ID: {submission_id}",
        "",
        _format_optional("Name", _as_string(body, "name", 160)),
        _format_optional("Email", _as_string(body, "email", 254)),
        _format_optional("Company", _as_string(body, "company", 180)),
        _format_optional("Role", _as_string(body, "role", 180)),
        _format_optional("Website", _as_string(body, "website", 2048)),
        _format_optional("Offer interest", _as_string(body, "offerInterest", 80)),
        _format_optional("Workflow area", _as_string(body, "workflowArea", 500)),
        "",
        "Problem summary:",
        _as_string(body, "problemSummary", 5000),
        "",
        "Data sources or systems:",
        _as_string(body, "dataSources", 3000),
        "",
        _format_optional("Timeline", _as_string(body, "timeline", 80)),
        _format_optional("Budget range", _as_string(body, "budgetRange", 80)),
        "",
        "Security, privacy, or rollout constraints:",
        _as_string(body, "constraints", 3000),
    ]
    return "\n".join(fields)


def _send_email(submission_id: str, body: Dict[str, Any]) -> None:
    sender = os.getenv("INTAKE_SENDER_EMAIL", "").strip()
    recipient = os.getenv("INTAKE_RECIPIENT_EMAIL", "").strip()

    if not sender or not recipient:
        raise RuntimeError("Intake email sender and recipient must be configured.")

    offer_interest = _as_string(body, "offerInterest", 80) or "unknown"
    reply_to = _as_string(body, "email", 254)

    ses_client.send_email(
        Source=sender,
        Destination={"ToAddresses": [recipient]},
        ReplyToAddresses=[reply_to] if reply_to else [],
        Message={
            "Subject": {
                "Data": f"New consulting intake: {offer_interest}",
                "Charset": "UTF-8",
            },
            "Body": {
                "Text": {
                    "Data": _email_body(submission_id, body),
                    "Charset": "UTF-8",
                }
            },
        },
    )


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    if _http_method(event) == "OPTIONS":
        return _response(204, event)

    try:
        raw_body = event.get("body") or "{}"
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        return _response(400, event, {"code": "invalid_json", "message": "Request body must be valid JSON."})

    if not isinstance(body, dict):
        return _response(400, event, {"code": "invalid_json", "message": "Request body must be a JSON object."})

    submission_id = _submission_id()

    if _is_honeypot_submission(body):
        return _response(200, event, {"submissionId": submission_id, "status": "accepted"})

    validation_errors = _validate_submission(body)
    if validation_errors:
        return _response(
            400,
            event,
            {
                "code": "invalid_submission",
                "message": "Submission did not pass validation.",
                "fields": validation_errors,
            },
        )

    try:
        _send_email(submission_id, body)
    except Exception:
        return _response(
            502,
            event,
            {"code": "email_send_failed", "message": "Unable to send intake notification."},
        )

    return _response(200, event, {"submissionId": submission_id, "status": "accepted"})
