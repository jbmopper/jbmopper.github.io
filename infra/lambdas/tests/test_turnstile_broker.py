import base64
import json
import os
import unittest
from unittest.mock import patch

from test_helpers import load_turnstile_module


def _decode_claims(token: str):
    _header, claims, _sig = token.split(".")
    padding = "=" * ((4 - (len(claims) % 4)) % 4)
    decoded = base64.urlsafe_b64decode(claims + padding).decode("utf-8")
    return json.loads(decoded)


class TurnstileBrokerTests(unittest.TestCase):
    def setUp(self):
        self.module = load_turnstile_module()
        self.base_event = {
            "headers": {
                "origin": "https://juliusm.com",
                "user-agent": "unit-test-agent",
            },
            "requestContext": {
                "identity": {
                    "sourceIp": "203.0.113.77",
                }
            },
        }

    def _event_with_body(self, payload):
        event = dict(self.base_event)
        event["body"] = json.dumps(payload)
        return event

    def test_missing_turnstile_token_returns_400(self):
        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
                "TURNSTILE_SECRET_ARN": "arn:turnstile",
                "SESSION_SIGNING_SECRET_ARN": "arn:session",
            },
            clear=False,
        ):
            response = self.module.handler(
                self._event_with_body({"action": "chat", "clientNonce": "nonce"}),
                None,
            )

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 400)
        self.assertEqual(body["code"], "missing_turnstile_token")

    def test_invalid_action_returns_400(self):
        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
            },
            clear=False,
        ):
            response = self.module.handler(
                self._event_with_body(
                    {
                        "turnstileToken": "token",
                        "action": "unknown",
                        "clientNonce": "nonce",
                    }
                ),
                None,
            )

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 400)
        self.assertEqual(body["code"], "invalid_action")

    def test_secret_load_failure_returns_500(self):
        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
                "TURNSTILE_SECRET_ARN": "arn:turnstile",
                "SESSION_SIGNING_SECRET_ARN": "arn:session",
            },
            clear=False,
        ), patch.object(self.module, "_get_secret", side_effect=Exception("secret missing")):
            response = self.module.handler(
                self._event_with_body(
                    {
                        "turnstileToken": "token",
                        "action": "chat",
                        "clientNonce": "nonce",
                    }
                ),
                None,
            )

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 500)
        self.assertEqual(body["code"], "secret_load_failed")

    def test_turnstile_denial_returns_403(self):
        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
                "TURNSTILE_SECRET_ARN": "arn:turnstile",
                "SESSION_SIGNING_SECRET_ARN": "arn:session",
            },
            clear=False,
        ), patch.object(self.module, "_get_secret", return_value="secret"), patch.object(
            self.module,
            "_verify_turnstile",
            return_value={
                "ok": False,
                "error": "turnstile_verification_failed",
                "details": ["timeout-or-duplicate"],
            },
        ):
            response = self.module.handler(
                self._event_with_body(
                    {
                        "turnstileToken": "token",
                        "action": "resume",
                        "clientNonce": "nonce",
                    }
                ),
                None,
            )

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 403)
        self.assertEqual(body["code"], "turnstile_verification_failed")
        self.assertIn("timeout-or-duplicate", body["details"])

    def test_success_mints_session_token_with_expected_claims(self):
        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
                "TURNSTILE_SECRET_ARN": "arn:turnstile",
                "SESSION_SIGNING_SECRET_ARN": "arn:session",
                "TOKEN_TTL_SECONDS": "600",
            },
            clear=False,
        ), patch.object(self.module, "_get_secret", side_effect=["turn-secret", "signing-secret"]), patch.object(
            self.module,
            "_verify_turnstile",
            return_value={"ok": True, "details": []},
        ):
            response = self.module.handler(
                self._event_with_body(
                    {
                        "turnstileToken": "token",
                        "action": "infer",
                        "clientNonce": "nonce-123",
                    }
                ),
                None,
            )

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(body["allowedActions"], ["infer"])

        token = body["sessionToken"]
        self.assertEqual(len(token.split(".")), 3)

        claims = _decode_claims(token)
        self.assertEqual(claims["action"], "infer")
        self.assertEqual(claims["nonce"], "nonce-123")
        self.assertGreater(claims["exp"], claims["iat"])
        self.assertEqual(body["expiresAt"], claims["exp"])

    def test_preflight_options_returns_cors_headers_without_body_validation(self):
        event = dict(self.base_event)
        event["httpMethod"] = "OPTIONS"

        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com,https://www.juliusm.com",
            },
            clear=False,
        ):
            response = self.module.handler(event, None)

        self.assertEqual(response["statusCode"], 204)
        self.assertEqual(response["headers"]["Access-Control-Allow-Origin"], "https://juliusm.com")
        self.assertIn("POST", response["headers"]["Access-Control-Allow-Methods"])

    def test_cors_fallback_origin_preserves_allowed_origin_order(self):
        event = dict(self.base_event)
        event["headers"] = {"user-agent": "unit-test-agent"}

        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://first.example,https://second.example",
            },
            clear=False,
        ):
            origin = self.module._cors_origin(event)

        self.assertEqual(origin, "https://first.example")

    def test_disallowed_origin_does_not_emit_allow_origin_header(self):
        event = dict(self.base_event)
        event["headers"] = {
            "origin": "https://evil.example",
            "user-agent": "unit-test-agent",
        }

        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
            },
            clear=False,
        ):
            response = self.module.handler(
                {
                    **event,
                    "body": json.dumps({"action": "chat", "clientNonce": "nonce"}),
                },
                None,
            )

        self.assertEqual(response["statusCode"], 400)
        self.assertNotIn("Access-Control-Allow-Origin", response["headers"])


if __name__ == "__main__":
    unittest.main()
