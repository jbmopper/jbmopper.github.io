import io
import json
import os
import unittest
import urllib.error
from unittest.mock import MagicMock, patch

from test_helpers import load_modal_module, load_turnstile_module


class ModalInferenceProxyTests(unittest.TestCase):
    def setUp(self):
        self.modal_module = load_modal_module()
        self.turnstile_module = load_turnstile_module()

        minted = self.turnstile_module._mint_session_token(
            action="infer",
            nonce="n-1",
            source_ip="203.0.113.9",
            user_agent="unit-test-agent",
            signing_secret="signing-secret",
        )
        self.valid_token = minted["token"]

        minted_wrong_action = self.turnstile_module._mint_session_token(
            action="chat",
            nonce="n-2",
            source_ip="203.0.113.9",
            user_agent="unit-test-agent",
            signing_secret="signing-secret",
        )
        self.chat_token = minted_wrong_action["token"]

        self.base_headers = {
            "origin": "https://juliusm.com",
            "user-agent": "unit-test-agent",
        }

        self.base_request_context = {
            "identity": {
                "sourceIp": "203.0.113.9",
            }
        }

    def _event(self, token=None, body=None):
        headers = dict(self.base_headers)
        if token:
            headers["Authorization"] = f"Bearer {token}"

        return {
            "headers": headers,
            "requestContext": self.base_request_context,
            "body": json.dumps(body if body is not None else {"prompt": "hello"}),
        }

    def test_missing_auth_returns_401(self):
        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
            },
            clear=False,
        ):
            response = self.modal_module.handler(self._event(token=None), None)

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 401)
        self.assertEqual(body["code"], "missing_auth")

    def test_action_mismatch_returns_403(self):
        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
                "SESSION_SIGNING_SECRET_ARN": "arn:session",
                "MODAL_ENDPOINT_URL": "https://example.modal.run",
                "REQUIRED_ACTION": "infer",
            },
            clear=False,
        ), patch.object(self.modal_module, "_get_secret", return_value="signing-secret"):
            response = self.modal_module.handler(self._event(token=self.chat_token), None)

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 403)
        self.assertEqual(body["code"], "invalid_session")
        self.assertIn("action", body["message"].lower())

    def test_signing_secret_load_failure_returns_403(self):
        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
                "SESSION_SIGNING_SECRET_ARN": "arn:session",
                "MODAL_ENDPOINT_URL": "https://example.modal.run",
            },
            clear=False,
        ), patch.object(self.modal_module, "_get_secret", side_effect=Exception("secret unavailable")):
            response = self.modal_module.handler(self._event(token=self.valid_token), None)

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 403)
        self.assertEqual(body["code"], "invalid_session")
        self.assertIn("secret unavailable", body["message"])

    def test_modal_http_error_maps_to_502(self):
        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
                "SESSION_SIGNING_SECRET_ARN": "arn:session",
                "MODAL_ENDPOINT_URL": "https://example.modal.run",
                "REQUEST_TIMEOUT_SECONDS": "5",
            },
            clear=False,
        ), patch.object(self.modal_module, "_get_secret", return_value="signing-secret"), patch(
            "urllib.request.urlopen",
            side_effect=urllib.error.HTTPError(
                url="https://example.modal.run",
                code=429,
                msg="Too Many Requests",
                hdrs=None,
                fp=io.BytesIO(b'{"error":"rate limited"}'),
            ),
        ):
            response = self.modal_module.handler(self._event(token=self.valid_token), None)

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 502)
        self.assertEqual(body["code"], "modal_http_error")
        self.assertIn("rate limited", body["details"])

    def test_modal_auth_secret_failure_returns_500(self):
        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
                "SESSION_SIGNING_SECRET_ARN": "arn:session",
                "MODAL_PROXY_AUTH_SECRET_ARN": "arn:modal",
                "MODAL_ENDPOINT_URL": "https://example.modal.run",
            },
            clear=False,
        ), patch.object(self.modal_module, "_get_secret", return_value="signing-secret"), patch.object(
            self.modal_module.secrets_client,
            "get_secret_value",
            side_effect=Exception("secrets denied"),
        ):
            response = self.modal_module.handler(self._event(token=self.valid_token), None)

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 500)
        self.assertEqual(body["code"], "modal_auth_secret_load_failed")

    def test_success_calls_modal_and_returns_result(self):
        with patch.dict(
            os.environ,
            {
                "ALLOWED_ORIGINS": "https://juliusm.com",
                "SESSION_SIGNING_SECRET_ARN": "arn:session",
                "MODAL_ENDPOINT_URL": "https://example.modal.run",
                "REQUEST_TIMEOUT_SECONDS": "5",
            },
            clear=False,
        ), patch.object(self.modal_module, "_get_secret", return_value="signing-secret"):
            mock_response = MagicMock()
            mock_response.read.return_value = b'{"output":"ok"}'
            mock_response.getcode.return_value = 200

            mock_context = MagicMock()
            mock_context.__enter__.return_value = mock_response
            mock_context.__exit__.return_value = False

            with patch("urllib.request.urlopen", return_value=mock_context) as urlopen_mock:
                response = self.modal_module.handler(
                    self._event(token=self.valid_token, body={"prompt": "hello"}),
                    None,
                )

            self.assertEqual(urlopen_mock.call_count, 1)

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(body["result"]["output"], "ok")


if __name__ == "__main__":
    unittest.main()
