import importlib.util
import sys
import types
import uuid
from pathlib import Path
from unittest.mock import MagicMock

REPO_ROOT = Path(__file__).resolve().parents[3]
TURNSTILE_PATH = REPO_ROOT / "infra" / "lambdas" / "turnstile_broker" / "index.py"
SESSION_AUTHORIZER_PATH = REPO_ROOT / "infra" / "lambdas" / "session_authorizer" / "index.py"
INTAKE_HANDLER_PATH = REPO_ROOT / "infra" / "lambdas" / "intake_handler" / "index.py"


def load_module(module_path: Path, prefix: str):
    module_name = f"{prefix}_{uuid.uuid4().hex}"

    fake_boto3 = types.ModuleType("boto3")
    fake_boto3.client = lambda *_args, **_kwargs: MagicMock()

    old_boto3 = sys.modules.get("boto3")
    sys.modules["boto3"] = fake_boto3

    try:
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Could not load module spec for {module_path}")

        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        if old_boto3 is None:
            sys.modules.pop("boto3", None)
        else:
            sys.modules["boto3"] = old_boto3


def load_turnstile_module():
    return load_module(TURNSTILE_PATH, "turnstile_broker_test")


def load_session_authorizer_module():
    return load_module(SESSION_AUTHORIZER_PATH, "session_authorizer_test")


def load_intake_handler_module():
    return load_module(INTAKE_HANDLER_PATH, "intake_handler_test")
