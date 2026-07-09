import os
import unittest
from unittest.mock import patch

from test_helpers import load_session_authorizer_module


class SessionAuthorizerTests(unittest.TestCase):
    def setUp(self):
        self.module = load_session_authorizer_module()
        self.base_method_arn = "arn:aws:execute-api:us-east-1:123456789012:api123/prod"
        self.generate_post_arn = f"{self.base_method_arn}/POST/v1/infer/generate"
        self.warmup_post_arn = f"{self.base_method_arn}/POST/v1/infer/warmup"
        self.intake_post_arn = f"{self.base_method_arn}/POST/v1/intake/submit"

    def _event(self, method_arn: str) -> dict[str, str]:
        return {
            "authorizationToken": "Bearer signed-token",
            "methodArn": method_arn,
        }

    def test_infer_token_policy_allows_generate_route(self):
        with patch.dict(
            os.environ,
            {"SESSION_SIGNING_SECRET_ARN": "arn:session"},
            clear=False,
        ), patch.object(self.module, "_get_secret", return_value="signing-secret"), patch.object(
            self.module,
            "_verify_jwt",
            return_value={"sub": "anon-123", "action": "infer", "jti": "jti-123"},
        ):
            policy = self.module.handler(self._event(self.generate_post_arn), None)

        resources = policy["policyDocument"]["Statement"][0]["Resource"]
        self.assertIn(f"{self.base_method_arn}/GET/v1/infer/*", resources)
        self.assertIn(f"{self.base_method_arn}/POST/v1/infer/*", resources)
        self.assertEqual(policy["context"]["action"], "infer")

    def test_infer_token_policy_allows_warmup_route(self):
        with patch.dict(
            os.environ,
            {"SESSION_SIGNING_SECRET_ARN": "arn:session"},
            clear=False,
        ), patch.object(self.module, "_get_secret", return_value="signing-secret"), patch.object(
            self.module,
            "_verify_jwt",
            return_value={"sub": "anon-456", "action": "infer", "jti": "jti-456"},
        ):
            policy = self.module.handler(self._event(self.warmup_post_arn), None)

        resources = policy["policyDocument"]["Statement"][0]["Resource"]
        self.assertIn(f"{self.base_method_arn}/GET/v1/infer/*", resources)
        self.assertIn(f"{self.base_method_arn}/POST/v1/infer/*", resources)

    def test_non_infer_token_policy_excludes_generate_and_warmup(self):
        with patch.dict(
            os.environ,
            {"SESSION_SIGNING_SECRET_ARN": "arn:session"},
            clear=False,
        ), patch.object(self.module, "_get_secret", return_value="signing-secret"), patch.object(
            self.module,
            "_verify_jwt",
            return_value={"sub": "anon-789", "action": "resume", "jti": "jti-789"},
        ):
            policy = self.module.handler(self._event(self.generate_post_arn), None)

        resources = policy["policyDocument"]["Statement"][0]["Resource"]
        self.assertNotIn(f"{self.base_method_arn}/GET/v1/infer/*", resources)
        self.assertNotIn(f"{self.base_method_arn}/POST/v1/infer/*", resources)
        self.assertIn(f"{self.base_method_arn}/POST/v1/resume/*", resources)

    def test_intake_token_policy_allows_intake_route(self):
        with patch.dict(
            os.environ,
            {"SESSION_SIGNING_SECRET_ARN": "arn:session"},
            clear=False,
        ), patch.object(self.module, "_get_secret", return_value="signing-secret"), patch.object(
            self.module,
            "_verify_jwt",
            return_value={"sub": "anon-intake", "action": "intake", "jti": "jti-intake"},
        ):
            policy = self.module.handler(self._event(self.intake_post_arn), None)

        resources = policy["policyDocument"]["Statement"][0]["Resource"]
        self.assertIn(f"{self.base_method_arn}/POST/v1/intake/*", resources)
        self.assertIn(f"{self.base_method_arn}/GET/v1/intake/*", resources)
        self.assertEqual(policy["context"]["action"], "intake")


if __name__ == "__main__":
    unittest.main()
