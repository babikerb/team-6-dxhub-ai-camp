"""Unit tests for temporary flag stub — no AWS required."""

from handlers.store import _stub_compute_flags


def test_ati_uses_explicit_scope_argument():
    flags = _stub_compute_flags(
        {"estimated_users": "100+", "shares_data_with_campus_system": False},
        scope_of_usage="Classroom",
    )
    assert flags["ati_flag"] is True
    assert "Classroom" in flags["ati_flag_reason"]


def test_string_no_does_not_trigger_integration_flag():
    flags = _stub_compute_flags(
        {"estimated_users": "1-30", "shares_data_with_campus_system": "no"},
        scope_of_usage="Individual",
    )
    assert flags["integration_flag"] is False


def test_level_1_sets_high_security():
    flags = _stub_compute_flags(
        {
            "estimated_users": "1-30",
            "shares_data_with_campus_system": False,
            "level_1_categories": ["HIPAA"],
            "level_2_categories": [],
        },
        scope_of_usage="Department",
    )
    assert flags["security_flag"] is True
    assert flags["risk_level"] == "High"
