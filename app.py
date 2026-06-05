from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import json
import threading
import time
import webbrowser
from datetime import datetime

PORT = 8765

SAVE_DIR = Path.home() / "Documents" / "PathReviewTest"
SAVE_DIR.mkdir(parents=True, exist_ok=True)

startup_file = SAVE_DIR / "test_save.json"
startup_file.write_text(
    json.dumps(
        {
            "status": "app_started",
            "timestamp": datetime.now().isoformat(),
            "save_dir": str(SAVE_DIR),
        },
        indent=2,
    ),
    encoding="utf-8",
)

HTML = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Path Review Install Test</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      line-height: 1.5;
    }
    button {
      font-size: 18px;
      padding: 10px 16px;
      cursor: pointer;
    }
    pre {
      background: #f4f4f4;
      padding: 12px;
      border-radius: 6px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <h1>Path Review Install Test</h1>

  <p>If you can see this page, the local browser app started successfully.</p>

  <p>Click the button below to test saving a review file.</p>

  <button onclick="saveTest()">Save test review</button>

  <h2>Status</h2>
  <pre id="status">Waiting...</pre>

  <script>
    async function saveTest() {
      try {
        const response = await fetch("/save", { method: "POST" });
        const text = await response.text();
        document.getElementById("status").textContent = text;
      } catch (err) {
        document.getElementById("status").textContent = "Save failed: " + err;
      }
    }
  </script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML.encode("utf-8"))
            return

        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"ok")
            return

        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path == "/save":
            review_file = SAVE_DIR / "review_test.json"
            data = {
                "status": "review_saved",
                "timestamp": datetime.now().isoformat(),
                "message": "If this file exists, the test app can save review data.",
                "save_path": str(review_file),
            }
            review_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(
                f"Success. Saved test file to:\n{review_file}".encode("utf-8")
            )
            return

        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        return


def open_browser():
    time.sleep(1)
    webbrowser.open(f"http://127.0.0.1:{PORT}")


if __name__ == "__main__":
    threading.Thread(target=open_browser, daemon=True).start()
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Running test app at http://127.0.0.1:{PORT}")
    print(f"Saving files to {SAVE_DIR}")
    server.serve_forever()