import urllib.request
import json

url = "https://firestore.googleapis.com/v1/projects/appfleetonix/databases/(default)/documents/users"
try:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        with open('db_out_users.txt', 'w') as f:
            f.write(f"Users found: {len(data.get('documents', []))}\n")
            for doc in data.get('documents', []):
                fields = doc.get('fields', {})
                email = fields.get('email', {}).get('stringValue', 'MISSING')
                role = fields.get('user_type', {}).get('stringValue', 'MISSING')
                f.write(f"ID: {doc['name'].split('/')[-1]} | Email: {email} | Role: {role}\n")
                f.write("---\n")
except Exception as e:
    print("Error:", e)

