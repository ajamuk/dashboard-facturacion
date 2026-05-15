import json
import os
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from dashboard_data import load_dashboard_payload


BASE_DIR = Path(__file__).resolve().parent


def load_env():
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


load_env()

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-change-me")

DB_PATH = BASE_DIR / os.environ.get("DATABASE_PATH", "instance/dashboard.db")
ASSET_VERSION = os.environ.get(
    "ASSET_VERSION",
    str(
        int(
            max(
                (BASE_DIR / "static" / "app.js").stat().st_mtime,
                (BASE_DIR / "static" / "styles.css").stat().st_mtime,
            )
        )
    ),
)


def db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'viewer',
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS data_cache (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                refreshed_at TEXT NOT NULL
            )
            """
        )
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if count == 0:
            username = os.environ.get("ADMIN_USER", "admin")
            password = os.environ.get("ADMIN_PASSWORD", "admin")
            conn.execute(
                "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                (
                    username,
                    generate_password_hash(password),
                    "admin",
                    datetime.now(timezone.utc).isoformat(),
                ),
            )


init_db()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    with db() as conn:
        return conn.execute(
            "SELECT id, username, role FROM users WHERE id = ?", (user_id,)
        ).fetchone()


def read_cache():
    with db() as conn:
        row = conn.execute("SELECT payload, refreshed_at FROM data_cache WHERE id = 1").fetchone()
    if not row:
        return None
    payload = json.loads(row["payload"])
    payload["refreshed_at"] = row["refreshed_at"]
    return payload


def write_cache(payload):
    refreshed_at = datetime.now(timezone.utc).isoformat()
    with db() as conn:
        conn.execute(
            """
            INSERT INTO data_cache (id, payload, refreshed_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, refreshed_at = excluded.refreshed_at
            """,
            (json.dumps(payload, ensure_ascii=False), refreshed_at),
        )
    payload["refreshed_at"] = refreshed_at
    return payload


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        with db() as conn:
            user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            session["role"] = user["role"]
            return redirect(url_for("dashboard"))
        error = "Usuario o contraseña incorrectos"
    return render_template("login.html", error=error)


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def dashboard():
    return render_template(
        "dashboard.html",
        user=current_user(),
        asset_version=ASSET_VERSION,
    )


@app.route("/api/dashboard")
@login_required
def api_dashboard():
    payload = read_cache()
    if payload is None:
        try:
            payload = write_cache(load_dashboard_payload())
        except Exception as exc:
            return jsonify({"error": str(exc), "needs_refresh": True}), 500
    return jsonify(payload)


@app.route("/api/refresh", methods=["POST"])
@login_required
def api_refresh():
    payload = write_cache(load_dashboard_payload())
    return jsonify(payload)


@app.route("/api/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5050, debug=True)
