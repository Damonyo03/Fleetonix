
import os

file_path = r"C:\Users\user\Downloads\Projects\Fleetonix\Fleetonix_Android_App\Fleetonix\app\src\main\java\com\prototype\fleetonix\DriverDashboard.kt"
with open(file_path, 'rb') as f:
    content = f.read()

print("File size:", len(content))
last_bytes = content[-100:]
hex_str = ' '.join(f'{b:02X}' for b in last_bytes)
print("Last 100 bytes (hex):")
print(hex_str)

# Also print it as text to see characters
print("\nLast 100 bytes as text:")
print(last_bytes.decode('utf-8', errors='ignore'))
