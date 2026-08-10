"""No name is used outside the scope that defines it.

_execute_tool referenced `payload` -- a parameter of the route function, not
of _execute_tool. Python only raises on the line being reached, the generic
`except Exception` around every tool call turned it into "صار خطأ تقني بسيط",
and it reached production, where it broke saving a patient's contact details
and therefore every first-time booking.

Nothing about that bug needed a running service to catch, so this test is the
guard: pyflakes reads the whole package and reports undefined names, wherever
in the codebase the next one appears.
"""

import subprocess
import sys
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1] / "app"


def test_no_undefined_names():
    pyflakes = pytest.importorskip("pyflakes", reason="pip install -r requirements-dev.txt")
    assert pyflakes  # silence "imported but unused" from pyflakes itself
    result = subprocess.run(
        [sys.executable, "-m", "pyflakes", str(APP)], capture_output=True, text=True
    )
    undefined = [line for line in result.stdout.splitlines() if "undefined name" in line]
    assert not undefined, "\n".join(undefined)
