import http.server
import socketserver
import os
import sys
import urllib.request
import urllib.error

PORT = int(os.environ.get("PORT", 8088))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PORTAL_API_URL = "http://127.0.0.1:8080"

class AdminHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

def run_admin_server():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), AdminHandler) as httpd:
        print("="*60)
        print(f"  [nunu ADMIN CONSOLE] 관리자 전용 서버 구동 완료!")
        print(f"  관리자 접속 주소: http://localhost:{PORT}")
        print(f"  연동 대상 사용자 포털: {PORTAL_API_URL}")
        print("="*60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n관리자 서버를 종료합니다.")
            sys.exit(0)

if __name__ == "__main__":
    run_admin_server()
