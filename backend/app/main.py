from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError

from app.core.config import get_settings
from app.routers import (
    ai_settings,
    alerts,
    appointments,
    auth,
    branches,
    cancellation_policies,
    channels,
    conversations,
    coupons,
    doctor_availability,
    holidays,
    escalation_staff,
    imports,
    invoices,
    me,
    notifications,
    packages,
    patients,
    payments,
    queue,
    recalls,
    reception,
    reports,
    search,
    services,
    settings,
    setup,
    slots,
    specialties,
    staff,
    staff_bot,
    staff_bot_settings,
    waitlist,
)

app_settings = get_settings()

app = FastAPI(title="Clinic Backend API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
_PG_ERROR_STATUS = {
    "23503": 400,  # foreign_key_violation
    "23505": 409,  # unique_violation
    "23514": 400,  # check_violation
    "23502": 400,  # not_null_violation
    "PGRST116": 404,  # postgrest: no rows found for .single()
}


@app.exception_handler(APIError)
def handle_postgrest_error(request: Request, exc: APIError):
    status_code = _PG_ERROR_STATUS.get(exc.code, 400)
    return JSONResponse(status_code=status_code, content={"detail": exc.message})

app.include_router(ai_settings.router)
app.include_router(alerts.router)
app.include_router(auth.router)
app.include_router(branches.router)
app.include_router(cancellation_policies.router)
app.include_router(channels.router)
app.include_router(conversations.router)
app.include_router(coupons.router)
app.include_router(doctor_availability.router)
app.include_router(escalation_staff.router)
app.include_router(holidays.router)
app.include_router(imports.router)
app.include_router(invoices.router)
app.include_router(me.router)
app.include_router(notifications.router)
app.include_router(packages.router)
app.include_router(patients.router)
app.include_router(payments.router)
app.include_router(queue.router)
app.include_router(recalls.router)
app.include_router(reception.router)
app.include_router(reports.router)
app.include_router(search.router)
app.include_router(services.router)
app.include_router(settings.router)
app.include_router(setup.router)
app.include_router(slots.router)
app.include_router(specialties.router)
app.include_router(staff.router)
app.include_router(staff_bot.router)
app.include_router(staff_bot_settings.router)
app.include_router(appointments.router)
app.include_router(waitlist.router)


@app.get("/health")
def health():
    return {"status": "ok"}
