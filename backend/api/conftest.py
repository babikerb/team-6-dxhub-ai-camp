"""Shared pytest setup.

Force mock LLM mode + disabled SES before any handler/generator import so
collection order / a developer's local .env can't leave generators in live
Bedrock mode or make email unit tests hit real SES.
"""

import os
import sys

import pytest

# Force (don't setdefault) so a shell-exported EMAILS_DISABLED=false from local
# SES debugging cannot break the offline suite.
os.environ["CHATBOT_LLM_MODE"] = "mock"
os.environ["EMAILS_DISABLED"] = "true"
os.environ.setdefault(
    "REVIEW_DOCS_BUCKET",
    "dxhub-camp-2026-sdsu-software-request-and-institutional-c7fe61",
)

_CHATBOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "chatbot"))
if _CHATBOT not in sys.path:
    sys.path.insert(0, _CHATBOT)

_LLM_MODULES = ("security_report_generator", "ati_report_generator", "parse")


def _pin_mock_mode():
    for name in _LLM_MODULES:
        mod = sys.modules.get(name)
        if mod is not None and hasattr(mod, "MODE"):
            mod.MODE = "mock"
    # Keep module-level EMAILS_DISABLED flags in sync if emailer already imported.
    emailer = sys.modules.get("handlers.emailer") or sys.modules.get("api.handlers.emailer")
    if emailer is not None and hasattr(emailer, "EMAILS_DISABLED"):
        emailer.EMAILS_DISABLED = True


def pytest_configure():
    _pin_mock_mode()


@pytest.fixture(autouse=True)
def _isolate_offline_defaults():
    """Reset after tests that monkeypatch MODE='bedrock' for gather_documents."""
    os.environ["CHATBOT_LLM_MODE"] = "mock"
    os.environ["EMAILS_DISABLED"] = "true"
    _pin_mock_mode()
    yield
    _pin_mock_mode()
