import os
import requests
from dotenv import load_dotenv

load_dotenv()
resend_key = os.environ.get("RESEND_API_KEY")

email_payload = {
    "from": "onboarding@resend.dev",
    "to": ["pradeeshsivaprakasam@gmail.com"],
    "subject": "TESTING RESEND INTEGRATION",
    "html": "<p>This is a test email to verify Resend works.</p>"
}

try:
    resp = requests.post(
        "https://api.resend.com/emails",
        json=email_payload,
        headers={"Authorization": f"Bearer {resend_key}"},
        timeout=5
    )
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")
    resp.raise_for_status()
    print("Success!")
except Exception as e:
    print(f"Failed: {e}")
