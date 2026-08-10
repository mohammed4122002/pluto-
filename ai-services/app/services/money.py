"""Amounts in the shape a person writes them.

Postgres numeric comes back as "25.0", and whatever the assistant is handed is
what it says out loud: a live booking quoted "مطلوب عربون 25.0 JOD". No clinic
prices anything that way, and the trailing .0 reads like a system talking. Real
fractional amounts (12.5) keep their decimal.

Every amount that reaches the model goes through this -- service prices,
deposits, package prices, coupon values, cancellation fees and refunds. It was
fixed once for service prices only, and the next live run surfaced the same
".0" from the deposit instead.
"""


def tidy_amount(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return value
    return int(number) if number.is_integer() else number
