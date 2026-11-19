
from flask import Flask, render_template, request, jsonify, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from functools import wraps
from database import init_db, get_db
from fraud_detection import assess_risk

import os
import secrets
import time
import base64
import qrcode

from datetime import datetime, date
from pathlib import Path
from io import BytesIO


# =====================================================
# SMARTBANK AI - FLASK APPLICATION
# Educational Banking Simulation Only
# =====================================================

app = Flask(__name__)

app.secret_key = os.environ.get(
    "SMARTBANK_SECRET",
    "change-this-demo-secret-key-before-deployment"
)

app.config.update(
    MAX_CONTENT_LENGTH=5 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "0") == "1",
    PERMANENT_SESSION_LIFETIME=1800
)

UPLOAD_FOLDER = Path(app.root_path) / "uploads"
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png"}

init_db()


# =====================================================
# COMMON HELPERS
# =====================================================

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify(
                ok=False,
                message="Please log in first."
            ), 401

        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("user_id") or not session.get("is_admin"):
            return jsonify(
                ok=False,
                message="Admin access required."
            ), 403

        return fn(*args, **kwargs)

    return wrapper


def alert(db, user_id, message, severity="INFO"):
    db.execute(
        """INSERT INTO security_alerts
        (user_id,message,severity) VALUES(?,?,?)""",
        (user_id, message, severity)
    )


def valid_amount(value, maximum=100000):
    try:
        amount = round(float(value), 2)

        if not 0 < amount <= maximum:
            return None

        return amount

    except (TypeError, ValueError):
        return None


def get_json():
    return request.get_json(silent=True) or {}


def safe_close(db):
    try:
        db.close()
    except Exception:
        pass


# =====================================================
# HOME AND HEALTH
# =====================================================

@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify(
        ok=True,
        service="SmartBank AI educational demo",
        status="running"
    )


# =====================================================
# REGISTER
# =====================================================

@app.post("/api/register")
def register():
    data = get_json()

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not name or not email or len(password) < 8:
        return jsonify(
            ok=False,
            message="Enter name, email and password (at least 8 characters)."
        ), 400

    if len(name) > 100 or len(email) > 150:
        return jsonify(
            ok=False,
            message="Name or email is too long."
        ), 400

    db = get_db()

    try:
        cur = db.execute(
            """INSERT INTO users
            (name,email,password_hash,balance)
            VALUES(?,?,?,?)""",
            (
                name,
                email,
                generate_password_hash(password),
                25000.0
            )
        )

        uid = cur.lastrowid

        db.execute(
            """INSERT INTO notifications(user_id,message)
            VALUES(?,?)""",
            (
                uid,
                "Welcome to SmartBank AI demo. No real bank is connected."
            )
        )

        db.commit()

    except Exception:
        db.rollback()
        safe_close(db)

        return jsonify(
            ok=False,
            message="That email is already registered or registration failed."
        ), 409

    safe_close(db)

    session.clear()

    session.update(
        user_id=uid,
        name=name,
        is_admin=False
    )

    session.permanent = True

    return jsonify(
        ok=True,
        message="Registration successful.",
        name=name
    )


# =====================================================
# LOGIN
# =====================================================

@app.post("/api/login")
def login():
    data = get_json()

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    db = get_db()

    user = db.execute(
        "SELECT * FROM users WHERE email=?",
        (email,)
    ).fetchone()

    if not user or not check_password_hash(
        user["password_hash"], password
    ):
        if user:
            alert(
                db,
                user["id"],
                "Unsuccessful login attempt detected.",
                "MEDIUM"
            )

            db.execute(
                """INSERT INTO login_history
                (user_id,ip_address,status)
                VALUES(?,?,?)""",
                (
                    user["id"],
                    request.remote_addr or "local",
                    "FAILED"
                )
            )

            db.commit()

        safe_close(db)

        return jsonify(
            ok=False,
            message="Invalid email or password."
        ), 401

    db.execute(
        """INSERT INTO login_history
        (user_id,ip_address,status)
        VALUES(?,?,?)""",
        (
            user["id"],
            request.remote_addr or "local",
            "SUCCESS"
        )
    )

    alert(
        db,
        user["id"],
        "Successful demo login recorded."
    )

    db.commit()
    safe_close(db)

    session.clear()

    session.update(
        user_id=user["id"],
        name=user["name"],
        is_admin=bool(user["is_admin"])
    )

    session.permanent = True

    return jsonify(
        ok=True,
        message="Login successful.",
        name=user["name"]
    )


# =====================================================
# LOGOUT AND CURRENT USER
# =====================================================

@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True, message="Logged out.")


@app.get("/api/me")
def me():
    return jsonify(
        ok=True,
        logged_in=bool(session.get("user_id")),
        name=session.get("name")
    )


# =====================================================
# DASHBOARD
# =====================================================

@app.get("/api/dashboard")
@login_required
def dashboard():
    db = get_db()
    uid = session["user_id"]

    user = db.execute(
        """SELECT name,email,balance,account_status
        FROM users WHERE id=?""",
        (uid,)
    ).fetchone()

    if not user:
        safe_close(db)
        session.clear()

        return jsonify(
            ok=False,
            message="User account not found."
        ), 404

    transactions = db.execute(
        """SELECT amount,kind,description,created_at
        FROM transactions
        WHERE user_id=?
        ORDER BY id DESC LIMIT 12""",
        (uid,)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        user=dict(user),
        transactions=[dict(x) for x in transactions]
    )


# =====================================================
# ANALYTICS
# =====================================================

@app.get("/api/analytics")
@login_required
def analytics():
    db = get_db()

    rows = db.execute(
        """SELECT strftime('%Y-%m',created_at) AS month,
        SUM(CASE WHEN kind='DEBIT' THEN amount ELSE 0 END) AS spent
        FROM transactions
        WHERE user_id=?
        GROUP BY month
        ORDER BY month DESC LIMIT 6""",
        (session["user_id"],)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        months=[dict(x) for x in reversed(rows)]
    )


# =====================================================
# DEMO TRANSFER
# =====================================================

@app.post("/api/demo-transfer")
@login_required
def demo_transfer():
    data = get_json()

    amount = valid_amount(data.get("amount"))
    recipient = str(data.get("recipient", "")).strip()[:80]

    if amount is None or not recipient:
        return jsonify(
            ok=False,
            message="Enter a valid amount and recipient."
        ), 400

    risk = assess_risk(amount, recipient)

    db = get_db()
    uid = session["user_id"]

    user = db.execute(
        """SELECT balance,account_status
        FROM users WHERE id=?""",
        (uid,)
    ).fetchone()

    if not user:
        safe_close(db)
        return jsonify(ok=False, message="User not found."), 404

    if user["account_status"] != "ACTIVE":
        safe_close(db)

        return jsonify(
            ok=False,
            message="Demo account is locked. Use recovery first."
        ), 403

    if amount > user["balance"]:
        safe_close(db)

        return jsonify(
            ok=False,
            message="Insufficient demo balance."
        ), 400

    if risk.get("level") == "HIGH":
        alert(
            db,
            uid,
            "A simulated transfer was blocked by the demo risk engine.",
            "HIGH"
        )

        db.commit()
        safe_close(db)

        return jsonify(
            ok=False,
            message="Demo risk check blocked this simulated transfer.",
            risk=risk
        ), 403

    db.execute(
        "UPDATE users SET balance=balance-? WHERE id=?",
        (amount, uid)
    )

    db.execute(
        """INSERT INTO transactions
        (user_id,amount,kind,description)
        VALUES(?,?,?,?)""",
        (
            uid,
            amount,
            "DEBIT",
            f"Simulated transfer to {recipient}"
        )
    )

    db.execute(
        """INSERT INTO notifications(user_id,message)
        VALUES(?,?)""",
        (
            uid,
            f"Simulated transfer of ₹{amount:.2f} recorded."
        )
    )

    db.commit()
    safe_close(db)

    return jsonify(
        ok=True,
        message="Simulated transfer completed.",
        risk=risk
    )


# =====================================================
# ACCOUNT RECOVERY - DEMO OTP
# =====================================================

@app.post("/api/recovery/request-otp")
@login_required
def request_otp():
    code = f"{secrets.randbelow(1000000):06d}"

    session["demo_otp"] = code
    session["otp_expiry"] = int(time.time()) + 180

    return jsonify(
        ok=True,
        message="Local demo OTP. It is not sent by SMS.",
        demo_otp=code
    )


@app.post("/api/recovery/verify-otp")
@login_required
def verify_otp():
    data = get_json()

    if int(time.time()) > session.get("otp_expiry", 0):
        return jsonify(
            ok=False,
            message="Demo OTP expired. Request a new one."
        ), 400

    if str(data.get("otp", "")) != session.get("demo_otp"):
        return jsonify(
            ok=False,
            message="Incorrect demo OTP."
        ), 400

    db = get_db()
    uid = session["user_id"]

    db.execute(
        "UPDATE users SET account_status='ACTIVE' WHERE id=?",
        (uid,)
    )

    db.execute(
        """INSERT INTO notifications(user_id,message)
        VALUES(?,?)""",
        (uid, "Demo account recovery completed.")
    )

    db.commit()
    safe_close(db)

    session.pop("demo_otp", None)
    session.pop("otp_expiry", None)

    return jsonify(
        ok=True,
        message="Demo account unlocked."
    )


# =====================================================
# APPLICATIONS
# =====================================================

@app.route("/api/applications", methods=["GET", "POST"])
@login_required
def applications():
    db = get_db()
    uid = session["user_id"]

    if request.method == "POST":
        data = get_json()

        kind = str(data.get("type", "")).strip()[:60]

        allowed = {
            "ATM Card",
            "PIN Change",
            "Account Recovery",
            "New Account",
            "KYC Update",
            "Address Update",
            "Account Statement"
        }

        if kind not in allowed:
            safe_close(db)

            return jsonify(
                ok=False,
                message="Choose a valid service."
            ), 400

        reference = "SB" + secrets.token_hex(4).upper()

        db.execute(
            """INSERT INTO applications
            (user_id,reference,kind,status)
            VALUES(?,?,?,?)""",
            (uid, reference, kind, "SUBMITTED")
        )

        db.commit()
        safe_close(db)

        return jsonify(
            ok=True,
            message="Demo application submitted.",
            reference=reference
        )

    rows = db.execute(
        """SELECT reference,kind,status,created_at
        FROM applications
        WHERE user_id=?
        ORDER BY id DESC""",
        (uid,)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        applications=[dict(x) for x in rows]
    )


# =====================================================
# NOTIFICATIONS
# =====================================================

@app.get("/api/notifications")
@login_required
def notifications():
    db = get_db()

    rows = db.execute(
        """SELECT message,created_at
        FROM notifications
        WHERE user_id=?
        ORDER BY id DESC LIMIT 20""",
        (session["user_id"],)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        notifications=[dict(x) for x in rows]
    )


# =====================================================
# SECURITY CENTER
# =====================================================

@app.get("/api/security")
@login_required
def security():
    db = get_db()
    uid = session["user_id"]

    logs = db.execute(
        """SELECT ip_address,status,created_at
        FROM login_history
        WHERE user_id=?
        ORDER BY id DESC LIMIT 10""",
        (uid,)
    ).fetchall()

    alerts = db.execute(
        """SELECT message,severity,created_at
        FROM security_alerts
        WHERE user_id=?
        ORDER BY id DESC LIMIT 10""",
        (uid,)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        login_history=[dict(x) for x in logs],
        alerts=[dict(x) for x in alerts]
    )


# =====================================================
# SMARTBANK CHATBOT
# =====================================================

@app.get("/api/chat")
@login_required
def chat():
    q = str(request.args.get("q", "")).lower()[:500]

    answers = [
        (("balance", "money"),
         "Your displayed balance is demo-only. Check the Dashboard card."),

        (("transfer", "send"),
         "Use Simulated Transfer. It records a classroom demo transaction only."),

        (("otp", "recovery", "unlock"),
         "Open Account Recovery, generate the local demo OTP and verify it."),

        (("atm", "card"),
         "Choose ATM Card in Apply for a Service and submit the demo request."),

        (("pin",),
         "PIN Change is a simulated service request. Never enter a real PIN."),

        (("application", "status", "track"),
         "Your submitted requests and their statuses appear under Application Tracking."),

        (("security", "login"),
         "Open Security Centre to view demo login history and alerts."),

        (("budget", "expense"),
         "Use the Smart Budget Planner to calculate your demo savings."),

        (("investment", "sip"),
         "Open Investment Portfolio to add a demo investment."),

        (("credit", "score"),
         "Use Credit Score Simulator for an educational score estimate."),

        (("fraud", "alert"),
         "Open Fraud Alerts to view your demo security alerts."),

        (("support", "help"),
         "Open Customer Support to submit a demo support ticket."),

        (("currency", "convert"),
         "Use Currency Converter. The displayed rates are illustrative, not live.")
    ]

    answer = (
        "Welcome to SmartBank AI. I can help with demo balance, "
        "transfers, OTP recovery, cards, applications, budget, "
        "investments, credit score and security."
    )

    for keys, value in answers:
        if any(key in q for key in keys):
            answer = value
            break

    return jsonify(ok=True, answer=answer)


# =====================================================
# ADMIN SUMMARY
# =====================================================

@app.get("/api/admin/summary")
@admin_required
def admin_summary():
    db = get_db()

    result = {
        "users": db.execute(
            "SELECT COUNT(*) n FROM users"
        ).fetchone()["n"],

        "transactions": db.execute(
            "SELECT COUNT(*) n FROM transactions"
        ).fetchone()["n"],

        "applications": db.execute(
            "SELECT COUNT(*) n FROM applications"
        ).fetchone()["n"],

        "pending": db.execute(
            "SELECT COUNT(*) n FROM applications WHERE status='SUBMITTED'"
        ).fetchone()["n"]
    }

    safe_close(db)

    return jsonify(ok=True, **result)


# =====================================================
# ADMIN APPLICATIONS
# =====================================================

@app.get("/api/admin/applications")
@admin_required
def admin_applications():
    db = get_db()

    rows = db.execute(
        """SELECT a.id,a.reference,a.kind,a.status,a.created_at,
        u.name,u.email
        FROM applications a
        JOIN users u ON u.id=a.user_id
        ORDER BY a.id DESC"""
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        applications=[dict(x) for x in rows]
    )


@app.post("/api/admin/applications/<int:app_id>")
@admin_required
def admin_update_application(app_id):
    data = get_json()
    status = str(data.get("status", ""))

    if status not in {"APPROVED", "REJECTED", "IN_REVIEW"}:
        return jsonify(
            ok=False,
            message="Invalid status."
        ), 400

    db = get_db()

    row = db.execute(
        "SELECT user_id,reference FROM applications WHERE id=?",
        (app_id,)
    ).fetchone()

    if not row:
        safe_close(db)

        return jsonify(
            ok=False,
            message="Application not found."
        ), 404

    db.execute(
        "UPDATE applications SET status=? WHERE id=?",
        (status, app_id)
    )

    db.execute(
        """INSERT INTO notifications(user_id,message)
        VALUES(?,?)""",
        (
            row["user_id"],
            f"Application {row['reference']} status: {status}"
        )
    )

    db.commit()
    safe_close(db)

    return jsonify(
        ok=True,
        message="Application status updated."
    )


# =====================================================
# 1. FACE CAMERA DEMO
# =====================================================

@app.post("/api/face-demo")
@login_required
def face_demo():
    return jsonify(
        ok=True,
        message=(
            "Camera demo completed. "
            "This endpoint does not perform real face recognition."
        )
    )


# =====================================================
# 2. QR CODE GENERATOR
# =====================================================

@app.post("/api/qr/generate")
@login_required
def generate_qr():
    data = get_json()

    amount = valid_amount(data.get("amount"))

    if amount is None:
        return jsonify(
            ok=False,
            message="Enter a valid demo amount."
        ), 400

    reference = "QR" + secrets.token_hex(5).upper()

    payload = (
        f"SMARTBANK-DEMO|{reference}|INR|{amount:.2f}"
    )

    qr = qrcode.QRCode(
        box_size=6,
        border=3
    )

    qr.add_data(payload)
    qr.make(fit=True)

    image = qr.make_image(
        fill_color="black",
        back_color="white"
    )

    buffer = BytesIO()
    image.save(buffer, format="PNG")

    image_data = base64.b64encode(
        buffer.getvalue()
    ).decode("utf-8")

    image_url = "data:image/png;base64," + image_data

    db = get_db()

    db.execute(
        """INSERT INTO qr_payments
        (user_id,amount,reference,status)
        VALUES(?,?,?,?)""",
        (
            session["user_id"],
            amount,
            reference,
            "PENDING"
        )
    )

    db.commit()
    safe_close(db)

    return jsonify(
        ok=True,
        reference=reference,
        qr_image=image_url,
        qr_code=image_url,
        message="Demo QR generated. Scanning it does not transfer money."
    )


# =====================================================
# 3. INVESTMENT PORTFOLIO
# =====================================================

@app.route("/api/investments", methods=["GET", "POST"])
@login_required
def investments():
    db = get_db()
    uid = session["user_id"]

    if request.method == "POST":
        data = get_json()

        kind = str(
            data.get("type") or
            data.get("investment_type") or ""
        ).upper()

        amount = valid_amount(
            data.get("amount"),
            1000000
        )

        allowed = {
            "SIP",
            "FD",
            "RD",
            "MUTUAL_FUND"
        }

        if kind not in allowed or amount is None:
            safe_close(db)

            return jsonify(
                ok=False,
                message="Invalid investment details."
            ), 400

        db.execute(
            """INSERT INTO investments
            (user_id,investment_type,amount)
            VALUES(?,?,?)""",
            (uid, kind, amount)
        )

        db.commit()
        safe_close(db)

        return jsonify(
            ok=True,
            message="Demo investment added."
        )

    rows = db.execute(
        """SELECT id,investment_type,amount,created_at
        FROM investments
        WHERE user_id=?
        ORDER BY id DESC""",
        (uid,)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        investments=[dict(x) for x in rows]
    )


# =====================================================
# 4. CREDIT SCORE SIMULATOR
# =====================================================

@app.post("/api/credit-score")
@login_required
def credit_score():
    db = get_db()
    uid = session["user_id"]

    count = db.execute(
        "SELECT COUNT(*) n FROM transactions WHERE user_id=?",
        (uid,)
    ).fetchone()["n"]

    user = db.execute(
        "SELECT account_status FROM users WHERE id=?",
        (uid,)
    ).fetchone()

    score = min(900, 650 + min(count * 5, 200))

    if user and user["account_status"] != "ACTIVE":
        score -= 50

    score = max(300, score)

    db.execute(
        """INSERT INTO credit_scores(user_id,score)
        VALUES(?,?)""",
        (uid, score)
    )

    db.commit()
    safe_close(db)

    return jsonify(
        ok=True,
        score=score,
        credit_score=score,
        message="Educational credit score estimate. Not an official credit score."
    )


# =====================================================
# 5. RECURRING PAYMENTS
# =====================================================

@app.route("/api/recurring", methods=["GET", "POST"])
@login_required
def recurring():
    db = get_db()
    uid = session["user_id"]

    if request.method == "POST":
        data = get_json()

        name = str(
            data.get("name") or
            data.get("payment_name") or ""
        ).strip()[:80]

        amount = valid_amount(data.get("amount"))

        frequency = str(
            data.get("frequency", "")
        ).upper()

        if (
            not name or
            amount is None or
            frequency not in {"WEEKLY", "MONTHLY"}
        ):
            safe_close(db)

            return jsonify(
                ok=False,
                message="Invalid recurring payment details."
            ), 400

        db.execute(
            """INSERT INTO recurring_payments
            (user_id,payment_name,amount,frequency)
            VALUES(?,?,?,?)""",
            (uid, name, amount, frequency)
        )

        db.commit()
        safe_close(db)

        return jsonify(
            ok=True,
            message="Demo recurring payment saved."
        )

    rows = db.execute(
        """SELECT id,payment_name,amount,frequency,status,created_at
        FROM recurring_payments
        WHERE user_id=?
        ORDER BY id DESC""",
        (uid,)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        payments=[dict(x) for x in rows]
    )


# =====================================================
# 6. SMART BUDGET PLANNER
# =====================================================

@app.route("/api/budget", methods=["GET", "POST"])
@login_required
def budget():
    db = get_db()
    uid = session["user_id"]

    if request.method == "POST":
        data = get_json()

        income = valid_amount(
            data.get("income"),
            100000000
        )

        try:
            expense_value = data.get(
                "expense",
                data.get("expenses", -1)
            )

            expense = round(float(expense_value), 2)

            if not 0 <= expense <= 100000000:
                raise ValueError()

        except (TypeError, ValueError):
            safe_close(db)

            return jsonify(
                ok=False,
                message="Enter valid expenses."
            ), 400

        if income is None:
            safe_close(db)

            return jsonify(
                ok=False,
                message="Enter valid income."
            ), 400

        db.execute(
            """INSERT INTO budgets
            (user_id,monthly_income,monthly_expense)
            VALUES(?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET
            monthly_income=excluded.monthly_income,
            monthly_expense=excluded.monthly_expense,
            updated_at=CURRENT_TIMESTAMP""",
            (uid, income, expense)
        )

        db.commit()

    row = db.execute(
        """SELECT monthly_income,monthly_expense
        FROM budgets WHERE user_id=?""",
        (uid,)
    ).fetchone()

    safe_close(db)

    if not row:
        return jsonify(
            ok=True,
            income=0,
            expense=0,
            expenses=0,
            savings=0,
            remaining=0
        )

    income = row["monthly_income"]
    expense = row["monthly_expense"]
    savings = income - expense

    return jsonify(
        ok=True,
        income=income,
        expense=expense,
        expenses=expense,
        savings=savings,
        remaining=savings,
        message="Demo budget calculated."
    )


# =====================================================
# 7. FRAUD ALERTS
# =====================================================

@app.get("/api/fraud-alerts")
@login_required
def fraud_alerts():
    db = get_db()

    rows = db.execute(
        """SELECT message,severity,created_at
        FROM security_alerts
        WHERE user_id=?
        ORDER BY id DESC LIMIT 30""",
        (session["user_id"],)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        alerts=[dict(x) for x in rows]
    )


# =====================================================
# 8. CUSTOMER SUPPORT
# =====================================================

@app.route("/api/support", methods=["GET", "POST"])
@login_required
def support():
    db = get_db()
    uid = session["user_id"]

    if request.method == "POST":
        data = get_json()

        subject = str(
            data.get("subject", "")
        ).strip()[:100]

        message = str(
            data.get("message", "")
        ).strip()[:1000]

        if not subject or not message:
            safe_close(db)

            return jsonify(
                ok=False,
                message="Enter subject and message."
            ), 400

        db.execute(
            """INSERT INTO support_tickets
            (user_id,subject,message)
            VALUES(?,?,?)""",
            (uid, subject, message)
        )

        db.commit()
        safe_close(db)

        return jsonify(
            ok=True,
            message="Support ticket created."
        )

    rows = db.execute(
        """SELECT id,subject,message,status,created_at
        FROM support_tickets
        WHERE user_id=?
        ORDER BY id DESC""",
        (uid,)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        tickets=[dict(x) for x in rows]
    )


# =====================================================
# 9. VIRTUAL CARD - DEMO ONLY
# =====================================================

@app.route("/api/virtual-card", methods=["GET", "POST"])
@login_required
def virtual_card():
    db = get_db()
    uid = session["user_id"]

    if request.method == "POST":
        user = db.execute(
            "SELECT name FROM users WHERE id=?",
            (uid,)
        ).fetchone()

        if not user:
            safe_close(db)

            return jsonify(
                ok=False,
                message="User not found."
            ), 404

        fake_number = "9999" + "".join(
            str(secrets.randbelow(10))
            for _ in range(12)
        )

        expiry = "12/30"
        masked = "**** **** **** " + fake_number[-4:]

        db.execute(
            """INSERT INTO virtual_cards
            (user_id,card_number,card_holder,expiry)
            VALUES(?,?,?,?)""",
            (
                uid,
                fake_number,
                user["name"],
                expiry
            )
        )

        db.commit()
        safe_close(db)

        return jsonify(
            ok=True,
            message="Demo virtual card generated. Not valid for payments.",
            card_number=masked,
            masked_number=masked,
            card_holder=user["name"],
            holder=user["name"],
            expiry=expiry
        )

    rows = db.execute(
        """SELECT id,card_holder,expiry,status,
        '**** **** **** ' || substr(card_number,-4) AS masked_number
        FROM virtual_cards
        WHERE user_id=?
        ORDER BY id DESC""",
        (uid,)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        cards=[dict(x) for x in rows]
    )


# =====================================================
# 10. SCHEDULED TRANSFERS
# =====================================================

@app.route("/api/scheduled-transfers", methods=["GET", "POST"])
@login_required
def scheduled_transfers():
    db = get_db()
    uid = session["user_id"]

    if request.method == "POST":
        data = get_json()

        recipient = str(
            data.get("recipient", "")
        ).strip()[:80]

        amount = valid_amount(data.get("amount"))

        date_value = str(
            data.get("date") or
            data.get("scheduled_date") or ""
        )

        try:
            selected_date = datetime.strptime(
                date_value,
                "%Y-%m-%d"
            ).date()

            if selected_date < date.today():
                raise ValueError()

        except ValueError:
            safe_close(db)

            return jsonify(
                ok=False,
                message="Choose today or a future date."
            ), 400

        if not recipient or amount is None:
            safe_close(db)

            return jsonify(
                ok=False,
                message="Invalid transfer details."
            ), 400

        db.execute(
            """INSERT INTO scheduled_transfers
            (user_id,recipient,amount,scheduled_date)
            VALUES(?,?,?,?)""",
            (
                uid,
                recipient,
                amount,
                date_value
            )
        )

        db.commit()
        safe_close(db)

        return jsonify(
            ok=True,
            message="Demo transfer scheduled. It will not execute automatically."
        )

    rows = db.execute(
        """SELECT id,recipient,amount,scheduled_date,status
        FROM scheduled_transfers
        WHERE user_id=?
        ORDER BY id DESC""",
        (uid,)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        transfers=[dict(x) for x in rows]
    )


# =====================================================
# 11. FINANCIAL HEALTH
# =====================================================

@app.get("/api/financial-health")
@login_required
def financial_health():
    db = get_db()
    uid = session["user_id"]

    budget_row = db.execute(
        """SELECT monthly_income,monthly_expense
        FROM budgets WHERE user_id=?""",
        (uid,)
    ).fetchone()

    user = db.execute(
        "SELECT balance FROM users WHERE id=?",
        (uid,)
    ).fetchone()

    safe_close(db)

    if not budget_row or budget_row["monthly_income"] <= 0:
        return jsonify(
            ok=True,
            score=0,
            health_score=0,
            message="Add your monthly budget to calculate financial health.",
            recommendation="Enter your monthly income and expenses."
        )

    income = budget_row["monthly_income"]
    expense = budget_row["monthly_expense"]

    savings_ratio = max(
        0,
        (income - expense) / income
    )

    score = min(
        100,
        round(
            savings_ratio * 100 +
            (10 if user and user["balance"] > 0 else 0)
        )
    )

    recommendation = (
        "Good savings progress."
        if expense < income
        else "Review your expenses and try to save more."
    )

    return jsonify(
        ok=True,
        score=score,
        health_score=score,
        savings=round(income - expense, 2),
        recommendation=recommendation,
        message="Educational financial health estimate."
    )


# =====================================================
# 12. MULTIPLE FINANCIAL ACCOUNTS
# =====================================================

@app.route("/api/accounts", methods=["GET", "POST"])
@login_required
def accounts():
    db = get_db()
    uid = session["user_id"]

    if request.method == "POST":
        data = get_json()

        name = str(
            data.get("name") or
            data.get("account_name") or ""
        ).strip()[:60]

        kind = str(
            data.get("type") or
            data.get("account_type") or ""
        ).upper()

        if not name or kind not in {
            "SAVINGS",
            "CURRENT",
            "FIXED_DEPOSIT"
        }:
            safe_close(db)

            return jsonify(
                ok=False,
                message="Invalid account details."
            ), 400

        db.execute(
            """INSERT INTO financial_accounts
            (user_id,account_name,account_type,balance)
            VALUES(?,?,?,0)""",
            (uid, name, kind)
        )

        db.commit()
        safe_close(db)

        return jsonify(
            ok=True,
            message="Demo account created."
        )

    rows = db.execute(
        """SELECT id,account_name,account_type,balance,created_at
        FROM financial_accounts
        WHERE user_id=?
        ORDER BY id DESC""",
        (uid,)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        accounts=[dict(x) for x in rows]
    )


# =====================================================
# 13. CURRENCY CONVERTER
# Fixed illustrative rates - not live exchange rates
# =====================================================

@app.post("/api/currency")
@login_required
def currency_convert():
    data = get_json()

    amount = valid_amount(
        data.get("amount"),
        10000000
    )

    currency = str(
        data.get("currency", "")
    ).upper()

    rates = {
        "INR": 1.0,
        "USD": 83.0,
        "EUR": 90.0,
        "GBP": 105.0,
        "AED": 22.6
    }

    if amount is None or currency not in rates:
        return jsonify(
            ok=False,
            message="Invalid currency or amount."
        ), 400

    converted = round(
        amount / rates[currency],
        2
    )

    db = get_db()

    db.execute(
        """INSERT INTO currency_history
        (user_id,from_currency,to_currency,amount,converted_amount)
        VALUES(?,?,?,?,?)""",
        (
            session["user_id"],
            "INR",
            currency,
            amount,
            converted
        )
    )

    db.commit()
    safe_close(db)

    return jsonify(
        ok=True,
        from_currency="INR",
        to_currency=currency,
        original_amount=amount,
        converted_amount=converted,
        result=converted,
        message="Illustrative conversion only. Rates are not live."
    )


# =====================================================
# 14. DIGITAL DOCUMENT VAULT
# =====================================================

@app.route("/api/documents", methods=["GET", "POST"])
@login_required
def documents():
    uid = session["user_id"]

    if request.method == "POST":

        # Accept both frontend field names:
        # "file" and "document"
        file = (
            request.files.get("file") or
            request.files.get("document")
        )

        if not file or not file.filename:
            return jsonify(
                ok=False,
                message="Choose a document."
            ), 400

        original_name = secure_filename(file.filename)

        if not original_name or "." not in original_name:
            return jsonify(
                ok=False,
                message="Invalid filename."
            ), 400

        extension = original_name.rsplit(
            ".", 1
        )[1].lower()

        if extension not in ALLOWED_EXTENSIONS:
            return jsonify(
                ok=False,
                message="Only PDF, JPG and PNG files are allowed."
            ), 400

        stored_name = (
            secrets.token_hex(16) + "." + extension
        )

        user_folder = UPLOAD_FOLDER / str(uid)
        user_folder.mkdir(parents=True, exist_ok=True)

        file_path = user_folder / stored_name

        file.save(file_path)

        db = get_db()

        try:
            db.execute(
                """INSERT INTO documents
                (user_id,filename,stored_filename)
                VALUES(?,?,?)""",
                (
                    uid,
                    original_name,
                    stored_name
                )
            )

            db.commit()

        except Exception:
            db.rollback()

            if file_path.exists():
                file_path.unlink()

            safe_close(db)

            return jsonify(
                ok=False,
                message="Document could not be saved. Check database columns."
            ), 500

        safe_close(db)

        return jsonify(
            ok=True,
            message="Document uploaded to the demo vault."
        )

    db = get_db()

    rows = db.execute(
        """SELECT id,filename,created_at
        FROM documents
        WHERE user_id=?
        ORDER BY id DESC""",
        (uid,)
    ).fetchall()

    safe_close(db)

    return jsonify(
        ok=True,
        documents=[dict(x) for x in rows]
    )


@app.get("/api/documents/<int:doc_id>/download")
@login_required
def download_document(doc_id):
    db = get_db()

    row = db.execute(
        """SELECT filename,stored_filename
        FROM documents
        WHERE id=? AND user_id=?""",
        (
            doc_id,
            session["user_id"]
        )
    ).fetchone()

    safe_close(db)

    if not row:
        return jsonify(
            ok=False,
            message="Document not found."
        ), 404

    user_folder = (
        UPLOAD_FOLDER / str(session["user_id"])
    )

    return send_from_directory(
        user_folder,
        row["stored_filename"],
        as_attachment=True,
        download_name=row["filename"]
    )


# =====================================================
# 15. ADVANCED ADMIN ANALYTICS
# =====================================================

@app.get("/api/admin/analytics")
@admin_required
def advanced_admin_analytics():
    db = get_db()

    result = {
        "users": db.execute(
            "SELECT COUNT(*) n FROM users"
        ).fetchone()["n"],

        "transactions": db.execute(
            "SELECT COUNT(*) n FROM transactions"
        ).fetchone()["n"],

        "applications": db.execute(
            "SELECT COUNT(*) n FROM applications"
        ).fetchone()["n"],

        "pending": db.execute(
            """SELECT COUNT(*) n FROM applications
            WHERE status='SUBMITTED'"""
        ).fetchone()["n"],

        "total_amount": db.execute(
            "SELECT COALESCE(SUM(amount),0) n FROM transactions"
        ).fetchone()["n"],

        "investments": db.execute(
            "SELECT COUNT(*) n FROM investments"
        ).fetchone()["n"],

        "support_tickets": db.execute(
            "SELECT COUNT(*) n FROM support_tickets"
        ).fetchone()["n"],

        "scheduled_transfers": db.execute(
            "SELECT COUNT(*) n FROM scheduled_transfers"
        ).fetchone()["n"],

        "documents": db.execute(
            "SELECT COUNT(*) n FROM documents"
        ).fetchone()["n"],

        "virtual_cards": db.execute(
            "SELECT COUNT(*) n FROM virtual_cards"
        ).fetchone()["n"],

        "qr_requests": db.execute(
            "SELECT COUNT(*) n FROM qr_payments"
        ).fetchone()["n"]
    }

    safe_close(db)

    return jsonify(
        ok=True,
        **result
    )


# =====================================================
# FLASK ERROR HANDLERS
# =====================================================

@app.errorhandler(413)
def file_too_large(error):
    return jsonify(
        ok=False,
        message="File is too large. Maximum upload size is 5 MB."
    ), 413


@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return jsonify(
            ok=False,
            message="API endpoint not found."
        ), 404

    return error


# =====================================================
# START APPLICATION
# =====================================================

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False
    )
