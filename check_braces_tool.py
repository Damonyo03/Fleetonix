
import os

def check_braces(file_path):
    if not os.path.exists(file_path): return
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    stack = []
    for i, char in enumerate(content):
        if char == '{':
            line_no = content.count('\n', 0, i) + 1
            stack.append(line_no)
        elif char == '}':
            if stack:
                opening_line = stack.pop()
                if opening_line == 1042:
                    line_no = content.count('\n', 0, i) + 1
                    print(f"Block 1042 ends at {line_no}")

target_file = r"C:\Users\user\Downloads\Projects\Fleetonix\Fleetonix_Android_App\Fleetonix\app\src\main\java\com\prototype\fleetonix\DriverDashboard.kt"
check_braces(target_file)
