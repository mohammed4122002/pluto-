"""Amounts the assistant reads out loud.

Fixed once for service prices, and the very next live booking said "مطلوب
عربون 25.0 JOD" -- the deposit came from a different code path and still
carried Postgres numeric's trailing .0. So this covers every amount that
reaches the model, not just the one that was reported.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.money import tidy_amount  # noqa: E402


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("25.0", 25),  # exactly what payments.amount returns for a 25 JOD deposit
        (25.0, 25),
        ("200.00", 200),
        (0, 0),
        ("12.5", 12.5),  # a real half dinar keeps its decimal
        (12.50, 12.5),
        (None, None),
    ],
)
def test_whole_amounts_lose_the_trailing_zero(raw, expected):
    assert tidy_amount(raw) == expected
    assert repr(tidy_amount(raw)) == repr(expected)


def test_leaves_something_that_is_not_a_number_alone():
    # Better to hand the model an odd string than to blank out an amount.
    assert tidy_amount("عند الاستقبال") == "عند الاستقبال"


def test_every_amount_the_model_sees_goes_through_it():
    """A guard against the next amount added to a tool result being raw.

    The deposit bug was exactly this: a new field returned straight from the
    row while the tidy helper sat one function away.
    """
    source = (Path(__file__).resolve().parents[1] / "app" / "routers" / "chat.py").read_text(encoding="utf-8")
    for field in ("deposit_amount", "fee_charged", "refunded", "discount_value", "price"):
        lines = [ln.strip() for ln in source.splitlines() if f'"{field}"' in ln]
        assert lines, f"{field} no longer appears in chat.py -- update this test"
        for line in lines:
            assert "tidy_amount" in line, f"{field} reaches the model unformatted: {line}"
