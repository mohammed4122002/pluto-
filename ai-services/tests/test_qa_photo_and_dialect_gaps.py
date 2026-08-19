"""Three gaps found in a QA pass over the photo and reply behaviour, each
confirmed against production data before being fixed.

1. A photo followed by a text message lost the photo entirely, because only
   the single most recent inbound message is ever classified.
2. The analysis card told the model to call list_services while the branch
   rule told it not to yet -- a straight contradiction on this feature's
   most common entry point (a first-time patient opening with a photo).
3. A channel configured for a dialect other than Levantine mostly ignored
   it, because every instruction block after the one-line dialect override
   is itself written in Levantine.
"""

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import (  # noqa: E402
    _PHOTO_CONTEXT_MARKER,
    _build_system_prompt,
    _photo_description_for_turn,
)


# --- shared fakes ------------------------------------------------------------


class _Query:
    def __init__(self, table):
        self._table = table
        self._rows = list(table.rows)
        self._update = None
        self._eqs = {}
        self._order = None
        self._desc = False

    def select(self, *_a, **_k):
        return self

    def eq(self, column, value):
        self._eqs[column] = value
        if self._update is None:
            self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def is_(self, column, value):
        target = None if value == "null" else value
        self._rows = [r for r in self._rows if r.get(column) == target]
        return self

    def order(self, column, desc=False):
        self._order, self._desc = column, desc
        return self

    def limit(self, n):
        self._rows = self._sorted()[:n]
        return self

    def update(self, values):
        self._update = values
        return self

    def insert(self, values):
        self._table.rows.append(dict(values))
        return self

    def _sorted(self):
        if not self._order:
            return self._rows
        return sorted(self._rows, key=lambda r: r[self._order], reverse=self._desc)

    def execute(self):
        if self._update is not None:
            for row in self._table.rows:
                if row.get("id") == self._eqs.get("id"):
                    row.update(self._update)
            return _Result([])
        return _Result(self._sorted())


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, rows=None):
        self.rows = rows or []


class _MessagesDb:
    def __init__(self, messages):
        self.tables = {"messages": _Table(messages), "audit_log": _Table()}

    def table(self, name):
        return _Query(self.tables.setdefault(name, _Table()))


class _FakeGemini:
    api_key = "k"


_FALLBACK = (_FakeGemini(), "gemini-flash-lite-latest")


def _photo_msg(content=""):
    return {
        "id": "m1",
        "conversation_id": "c1",
        "direction": "inbound",
        "content": content,
        "media_url": "https://example.test/p.jpg",
        "media_type": "image",
        "created_at": "2026-01-01T10:00:00Z",
    }


# --- 1. the photo must survive into the next turn ---------------------------


@patch("app.routers.chat.describe_patient_photo", return_value=("analysis", "النوع: بشرة دهنية", None))
def test_an_analysed_photo_is_recorded_on_the_message_for_later_turns(_m):
    db = _MessagesDb([_photo_msg()])
    _photo_description_for_turn(db, "c1", _FALLBACK)
    content = db.tables["messages"].rows[0]["content"]
    assert _PHOTO_CONTEXT_MARKER in content
    assert "النوع: بشرة دهنية" in content


@patch("app.routers.chat.describe_patient_photo", return_value=("receipt", None, None))
def test_a_receipt_is_recorded_too_so_a_follow_up_question_still_knows(_m):
    db = _MessagesDb([_photo_msg()])
    _photo_description_for_turn(db, "c1", _FALLBACK)
    assert "إثبات دفع" in db.tables["messages"].rows[0]["content"]


@patch("app.routers.chat.describe_patient_photo", return_value=("analysis", "النوع: بشرة", None))
def test_the_patients_own_caption_is_never_overwritten(_m):
    db = _MessagesDb([_photo_msg(content="شو رأيك بهاي؟")])
    _photo_description_for_turn(db, "c1", _FALLBACK)
    content = db.tables["messages"].rows[0]["content"]
    assert "شو رأيك بهاي؟" in content
    assert _PHOTO_CONTEXT_MARKER in content


@patch("app.routers.chat.describe_patient_photo", return_value=("analysis", "النوع: بشرة", None))
def test_re_running_the_same_turn_does_not_stack_duplicate_notes(_m):
    db = _MessagesDb([_photo_msg()])
    _photo_description_for_turn(db, "c1", _FALLBACK)
    _photo_description_for_turn(db, "c1", _FALLBACK)
    assert db.tables["messages"].rows[0]["content"].count(_PHOTO_CONTEXT_MARKER) == 1


@patch("app.routers.chat.describe_patient_photo", return_value=(None, None, "vision call failed: 400"))
def test_a_failed_classification_records_nothing(_m):
    # "We don't know" must not be written down as if it were an answer --
    # a later turn would read it as settled.
    db = _MessagesDb([_photo_msg()])
    _photo_description_for_turn(db, "c1", _FALLBACK)
    assert db.tables["messages"].rows[0]["content"] == ""


# --- 2 & 3. system prompt coherence -----------------------------------------


class _PromptDb:
    def __init__(self, branches):
        self._branches = branches

    def table(self, name):
        rows = {
            "clinic_settings": [{"clinic_name": "بلوتو", "about_text": ""}],
            "branches": self._branches,
            "services": [],
            "patients": [],
        }.get(name, [])
        return _Query(_Table(list(rows)))


def _branch(bid, name):
    return {
        "id": bid,
        "name": name,
        "address": None,
        "phone": None,
        "working_hours_note": None,
        "timezone": "Asia/Amman",
        "is_active": True,
    }


_TWO_BRANCHES = [_branch("b1", "عمّان"), _branch("b2", "الزرقاء")]
_NO_SERVICES_YET = "ممنوع تستدعي list_services أو تقترحي أي خدمة بهذا الرد"


def _analysis_prompt(db, *, branch_selected, ch_settings=None):
    return _build_system_prompt(
        db,
        "b1",
        ch_settings or {},
        patient_id=None,
        photo_description="النوع: بشرة دهنية",
        branch_selected_explicitly=branch_selected,
        photo_kind="analysis",
    )


def test_an_unchosen_branch_defers_the_service_card_instead_of_contradicting():
    prompt = _analysis_prompt(_PromptDb(_TWO_BRANCHES), branch_selected=False)
    assert _NO_SERVICES_YET in prompt
    # The analysis itself is still shown -- only the service card waits.
    assert "🔹 *النوع:*" in prompt


def test_a_chosen_branch_still_gets_the_service_card():
    prompt = _analysis_prompt(_PromptDb(_TWO_BRANCHES), branch_selected=True)
    assert _NO_SERVICES_YET not in prompt
    assert "✨ *خدمات مناسبة لك:*" in prompt


def test_a_single_branch_clinic_never_defers_the_service_card():
    # Nothing to choose between, so there's no contradiction to resolve and
    # withholding services would just be a pointless extra question.
    prompt = _analysis_prompt(_PromptDb([_branch("b1", "الفرع الرئيسي")]), branch_selected=False)
    assert _NO_SERVICES_YET not in prompt


def test_a_configured_dialect_is_restated_after_every_other_instruction():
    prompt = _analysis_prompt(_PromptDb(_TWO_BRANCHES), branch_selected=True, ch_settings={"dialect": "مصرية"})
    reminder = "تذكير أخير وأهم من كل يلي فوق بخصوص اللهجة"
    assert reminder in prompt
    # Recency is the whole point: it has to outrank the Levantine-worded
    # blocks, so nothing instructional may follow it.
    assert prompt.index(reminder) > prompt.index("🔹 *النوع:*")
    assert prompt.rstrip().endswith("رُدّي بلهجته هو.")


def test_no_dialect_configured_adds_no_reminder():
    prompt = _analysis_prompt(_PromptDb(_TWO_BRANCHES), branch_selected=True)
    assert "تذكير أخير وأهم من كل يلي فوق بخصوص اللهجة" not in prompt


# --- a new photo must never be answered with an older photo's analysis ------


def _photo_prompt(kind="analysis", description="النوع: طفح جلدي بسيط", unclear=False):
    return _build_system_prompt(
        _PromptDb(_TWO_BRANCHES),
        "b1",
        {},
        patient_id=None,
        photo_description=description if kind else None,
        branch_selected_explicitly=True,
        image_without_medical_description=unclear,
        photo_kind=kind,
    )


def test_the_prompt_says_the_analysis_belongs_to_the_newest_photo():
    # Live: a hand-rash photo was answered with "the same notes as before
    # about your teeth". The vision model had classified it correctly as
    # "طفح جلدي بسيط" -- the reply simply reached for an older analysis
    # sitting in the history notes.
    prompt = _photo_prompt()
    assert "يخص **آخر صورة بعتها المريض للتو" in prompt
    assert "ولا تقولي 'نفس الملاحظات السابقة'" in prompt


def test_older_photo_notes_are_named_so_they_can_be_told_apart():
    # The guard has to point at the exact marker the notes carry, otherwise
    # the model has no way to recognise which lines are historical.
    prompt = _photo_prompt()
    assert _PHOTO_CONTEXT_MARKER.strip("[ —") in prompt


def test_the_newest_photo_guard_covers_every_photo_outcome():
    for kind, unclear in (("analysis", False), ("urgent", False), ("receipt", False), (None, True)):
        prompt = _photo_prompt(kind=kind, unclear=unclear)
        assert "تنبيه حاسم قبل أي شي يخص الصور" in prompt, kind


def test_no_photo_this_turn_adds_no_newest_photo_guard():
    prompt = _photo_prompt(kind=None, unclear=False)
    assert "تنبيه حاسم قبل أي شي يخص الصور" not in prompt


def test_the_receipt_guess_is_never_spoken_to_the_patient():
    # Live: a patient sent a photo of a rash on their hand and was told
    # "this might be a payment receipt" -- which reads as the bot not having
    # looked at the photo at all.
    prompt = _photo_prompt(kind=None, unclear=True)
    assert "ممنوع منعاً باتاً تقولي للمريض إن صورته" in prompt
    assert "إلا إذا submit_payment_receipt رجعت submitted=true" in prompt


def test_a_stored_note_is_worded_as_a_past_photo():
    # It is only ever read back on a later turn (history is loaded before the
    # classification runs), so calling it "previous" is both accurate and
    # what stops it being mistaken for the photo being answered right now.
    assert "سابقة" in _PHOTO_CONTEXT_MARKER
