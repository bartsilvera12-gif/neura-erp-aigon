"""Ejecuta el contenido de un archivo local como comando bash en la VPS via SSH.
Útil para evitar problemas de quoting de PowerShell.

Uso:  py ssh-run-file.py /path/to/script.sh
"""
import sys, io
from pathlib import Path

# Forzar UTF-8 en stdout (PowerShell cp1252 explota con emojis/símbolos)
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

ENV = {}
env_path = Path(__file__).resolve().parents[2] / ".env.local"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, _, v = line.partition("=")
        ENV[k.strip()] = v.strip()

HOST = ENV.get("VPS_IP", "187.77.247.54")
USER = ENV.get("VPS_USER", "root")
PASSWORD = ENV.get("VPS_ROOT_PASSWORD", "")

import paramiko, base64
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30, look_for_keys=False, allow_agent=False)

script = Path(sys.argv[1]).read_text(encoding="utf-8")
b64 = base64.b64encode(script.encode("utf-8")).decode("ascii")
# Decodifica el script y lo ejecuta con bash via stdin
cmd = f"echo {b64} | base64 -d | bash"
stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")
print("===STDOUT===")
print(out)
print("===STDERR===")
print(err)
client.close()
