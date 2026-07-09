import json
import os
import unittest
from unittest.mock import patch

from test_helpers import load_intake_handler_module


class IntakeHandlerTests(unittest.TestCase):
    def setUp(self):
        self.module = load_intake_handler_module()
        self.base_event = {
            "headers": {
                "origin": "https://juliusm.com",
            },
            "requestContext": {
                "identity": {
                    "sourceIp": "203.0.113.42",
                }
            },
        }

    def _valid_payload(self):
        return {
            "name": "Ada Lovelace",
            "email": "ada@example.com",
            "company": "Analytical Engines LLC",
            "role": "Operations Lead",
            "website": "https://example.com",
            "offerInterest": "workflow-diagnostic",
            "workflowArea": "Internal knowledge search",
            "problemSummary": "We need to understand whether RAG can improve repeated support research work.",
            "dataSources": "Support docs, tickets, and internal wiki pages.",
            "timeline": "this-quarter",
            "budgetRange": "10k-25k",
            "constraints": "Internal-only documents and human review required.",
            "consentToContact": True,
        }

    def _event_with_body(self, payload):
        event = dict(self.base_event)
        event["body"] = json.dumps(payload)
        return event

    def _email_env(self):
        return {
            "ALLOWED_ORIGINS": "https://juliusm.com",
            "INTAKE_SENDER_EMAIL": "sender@example.com",
            "INTAKE_RECIPIENT_EMAIL": "recipient@example.com",
        }

    def test_valid_submission_sends_email(self):
        with patch.dict(os.environ, self._email_env(), clear=False), patch.object(
            self.module.ses_client,
            "send_email",
        ) as send_email:
            response = self.module.handler(self._event_with_body(self._valid_payload()), None)

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(body["status"], "accepted")
        self.assertTrue(body["submissionId"].startswith("intake-"))
        send_email.assert_called_once()
        call_kwargs = send_email.call_args.kwargs
        self.assertEqual(call_kwargs["Source"], "sender@example.com")
        self.assertEqual(call_kwargs["Destination"]["ToAddresses"], ["recipient@example.com"])
        self.assertEqual(call_kwargs["ReplyToAddresses"], ["ada@example.com"])

    def test_missing_required_fields_returns_400(self):
        with patch.dict(os.environ, self._email_env(), clear=False):
            response = self.module.handler(
                self._event_with_body({"offerInterest": "workflow-diagnostic"}),
                None,
            )

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 400)
        self.assertEqual(body["code"], "invalid_submission")
        self.assertIn("name", body["fields"])
        self.assertIn("problemSummary", body["fields"])

    def test_invalid_email_returns_400(self):
        payload = self._valid_payload()
        payload["email"] = "not-an-email"

        with patch.dict(os.environ, self._email_env(), clear=False):
            response = self.module.handler(self._event_with_body(payload), None)

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 400)
        self.assertIn("email", body["fields"])

    def test_missing_consent_returns_400(self):
        payload = self._valid_payload()
        payload["consentToContact"] = False

        with patch.dict(os.environ, self._email_env(), clear=False):
            response = self.module.handler(self._event_with_body(payload), None)

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 400)
        self.assertIn("consentToContact", body["fields"])

    def test_honeypot_submission_is_accepted_without_email(self):
        payload = self._valid_payload()
        payload["websiteUrl"] = "https://spam.example"

        with patch.dict(os.environ, {}, clear=True), patch.object(
            self.module.ses_client,
            "send_email",
        ) as send_email:
            response = self.module.handler(self._event_with_body(payload), None)

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(body["status"], "accepted")
        send_email.assert_not_called()

    def test_preflight_options_returns_cors_headers_without_body_validation(self):
        event = dict(self.base_event)
        event["httpMethod"] = "OPTIONS"

        with patch.dict(os.environ, {"ALLOWED_ORIGINS": "https://juliusm.com"}, clear=False):
            response = self.module.handler(event, None)

        self.assertEqual(response["statusCode"], 204)
        self.assertEqual(response["headers"]["Access-Control-Allow-Origin"], "https://juliusm.com")
        self.assertIn("POST", response["headers"]["Access-Control-Allow-Methods"])

    def test_ses_failure_returns_502(self):
        with patch.dict(os.environ, self._email_env(), clear=False), patch.object(
            self.module.ses_client,
            "send_email",
            side_effect=Exception("ses unavailable"),
        ):
            response = self.module.handler(self._event_with_body(self._valid_payload()), None)

        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 502)
        self.assertEqual(body["code"], "email_send_failed")


if __name__ == "__main__":
    unittest.main()
