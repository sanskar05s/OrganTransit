import os

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai

# =====================================
# LOAD ENVIRONMENT VARIABLES
# =====================================
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError(
        "GEMINI_API_KEY is not set. Add it to the .env file."
    )

# =====================================
# FLASK SETUP
# =====================================
app = Flask(__name__)
CORS(app)

# =====================================
# GEMINI API SETUP
# =====================================
genai.configure(api_key=GEMINI_API_KEY)

model = genai.GenerativeModel("gemini-2.5-flash")


# =====================================
# HOME ROUTE
# =====================================
@app.route("/")
def home():
    return jsonify({
        "status": "Server running"
    })


# =====================================
# HEALTH ROUTE
# =====================================
@app.route("/health")
def health():
    return jsonify({
        "status": "healthy"
    })


# =====================================
# TEST AI ROUTE
# =====================================
@app.route("/test-ai")
def test_ai():

    try:
        response = model.generate_content("Say hello")

        return jsonify({
            "status": "ok",
            "reply": response.text
        })

    except Exception as e:

        print("TEST AI ERROR:", e)

        return jsonify({
            "status": "error",
            "reply": str(e)
        }), 500


# =====================================
# CHAT ROUTE
# =====================================
@app.route("/chat", methods=["POST"])
def chat():

    try:
        data = request.json

        sensors = data.get("sensors", "No sensor data")
        message = data.get("message", "")

        prompt = f"""
You are a medical AI assistant monitoring organ transport.

Sensor Data:
{sensors}

Doctor Question:
{message}

Answer clinically and briefly.
"""

        response = model.generate_content(prompt)

        return jsonify({
            "status": "ok",
            "reply": response.text
        })

    except Exception as e:

        print("CHAT ERROR:", e)

        return jsonify({
            "status": "error",
            "reply": str(e)
        }), 500


# =====================================
# STATUS ROUTE
# =====================================
@app.route("/status", methods=["POST"])
def status():

    try:
        data = request.json

        sensors = data.get("sensors", "No sensor data")

        prompt = f"""
You are a medical AI monitoring organ transport.

Sensor Data:
{sensors}

Write one short clinical summary.

Then on a NEW line write ONLY:
Safe
or
Caution
or
Critical
"""

        response = model.generate_content(prompt)

        return jsonify({
            "status": "ok",
            "reply": response.text
        })

    except Exception as e:

        print("STATUS ERROR:", e)

        return jsonify({
            "status": "error",
            "reply": str(e)
        }), 500


# =====================================
# EXPLAIN ALERT ROUTE
# =====================================
@app.route("/explain-alert", methods=["POST"])
def explain_alert():

    try:
        data = request.json

        alert = data.get("alert", "")
        sensors = data.get("sensors", "")

        prompt = f"""
You are a medical AI monitoring organ transport.

Alert:
{alert}

Sensor Data:
{sensors}

Explain:
1. What this alert means medically.
2. What action doctor should take immediately.

Keep answer very short.
"""

        response = model.generate_content(prompt)

        return jsonify({
            "status": "ok",
            "reply": response.text
        })

    except Exception as e:

        print("ALERT ERROR:", e)

        return jsonify({
            "status": "error",
            "reply": str(e)
        }), 500


# =====================================
# RUN SERVER
# =====================================
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)