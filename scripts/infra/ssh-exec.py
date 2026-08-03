"""Ejecuta un comando arbitrario por SSH y muestra stdout+stderr COMPLETOS."""
import sys, os
from pathlib import Path

ENV = {}
env_path = Path(__file__).resolve().parents[2] / ".env.local"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        ENV[k.strip()] = v.strip()

HOST = ENV.get("VPS_IP", "187.77.247.54")
USER = ENV.get("VPS_USER", "root")
PASSWORD = ENV.get("VPS_ROOT_PASSWORD", "")

import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=30, look_for_keys=False, allow_agent=False)

cmd = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "echo no command"
stdin, stdout, stderr = client.exec_command(cmd, timeout=180)
out = stdout.read().decode("utf-8", errors="replace")
err = stderr.read().decode("utf-8", errors="replace")
print("===STDOUT===")
print(out)
print("===STDERR===")
print(err)
client.close()
