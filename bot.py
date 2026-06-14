import cloudscraper
import sys
import json
from firebase_admin import credentials, db, initialize_app

# Firebase Setup
# Aapka serviceAccountKey.json file GitHub repo mein hona chahiye
cred = credentials.Certificate("serviceAccountKey.json")
initialize_app(cred, {'databaseURL': 'YOUR_DATABASE_URL_HERE'})

def run_bot(mobileNumber):
    scraper = cloudscraper.create_scraper()
    url = "https://web.quickrozgar.com/api/get-code"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://web.quickrozgar.com/landing?code=18225893',
        'Content-Type': 'application/json'
    }
    
    payload = {"phone": str(mobileNumber)}
    
    try:
        # Request bina browser ke bhej rahe hain
        response = scraper.post(url, json=payload, headers=headers)
        print(f"Response Status: {response.status_code}")
        print(f"Response Data: {response.text}")
        
        # Yahan result ko Firebase mein update kar sakte hain
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    mobile = sys.argv[1] if len(sys.argv) > 1 else "9876543210"
    run_bot(mobile)
