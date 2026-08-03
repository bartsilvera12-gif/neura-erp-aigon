"""
Aplica archivos .sql a la VPS de Supabase self-hosted (sin SFTP) usando paramiko.

Patrón documentado en docs/Runbook-Supabase-Esquemas-Neura.pdf sección 4:
  - paramiko (no sshpass/plink) con password del .env.local
  - transferencia por base64 sobre exec (SFTP deshabilitado)
  - aplicación vía `docker exec -i supabase-db psql -U postgres -d postgres`

Uso:
  python scripts/infra/ssh-apply-sql.py <archivo.sql> [<archivo.sql> ...]

Credenciales leídas de .env.local:
  VPS_IP, VPS_USER, VPS_ROOT_PASSWORD
"""
import sys, os, base64, re
from pathlib import Path

# Cargar .env.local mínimo (sin dotenv)
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
DB_CONTAINER = ENV.get("SUPABASE_DB_CONTAINER", "supabase-db")

if not PASSWORD:
    print("ERROR: VPS_ROOT_PASSWORD ausente en .env.local")
    sys.exit(2)

try:
    import paramiko
except ImportError:
    print("ERROR: paramiko no instalado. py -m pip install paramiko")
    sys.exit(2)

def main(files):
    if not files:
        print("Uso: python ssh-apply-sql.py <archivo.sql> [...]")
        sys.exit(2)
    sqls = []
    for f in files:
        p = Path(f).resolve()
        if not p.exists():
            print(f"NO ENCONTRADO: {p}")
            sys.exit(2)
        sqls.append(p)

    print(f"[ssh] conectando a {USER}@{HOST}...")
    client = paramiko.SSHClient()
    # Para esta operación usamos AutoAdd (similar a 'ssh -o StrictHostKeyChecking=accept-new').
    # El runbook recomienda verificar contra ~/.ssh/known_hosts; este script registra la huella
    # localmente y la podés verificar después con: ssh-keygen -l -f ~/.ssh/known_hosts | grep ...
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30, look_for_keys=False, allow_agent=False)
    print(f"[ssh] conectado.")

    # Sanity check
    out, err = run(client, "docker ps --format '{{.Names}}' | grep -E 'supabase-(db|rest)'")
    print(f"[sanity] containers visibles:\n{out.strip()}")
    if "supabase-db" not in out:
        print("ERROR: no veo el container supabase-db corriendo")
        sys.exit(3)

    overall_ok = True
    for sql_path in sqls:
        print(f"\n=== APLICANDO {sql_path.name} ===")
        content = sql_path.read_bytes()
        b64 = base64.b64encode(content).decode("ascii")
        # Pasa el SQL al psql via base64 -> pipe a docker exec -i
        # Usamos heredoc para evitar problemas con el shell quoteando b64.
        cmd = (
            f"set -e; "
            f"B64='{b64}'; "
            f"printf '%s' \"$B64\" | base64 -d "
            f"| docker exec -i {DB_CONTAINER} psql -v ON_ERROR_STOP=1 -U postgres -d postgres"
        )
        out, err = run(client, cmd)
        if err.strip():
            tail_err = err.strip().split("\n")[-5:]
            print("STDERR (últimas líneas):")
            for line in tail_err:
                print("  ", line)
        if out.strip():
            print("STDOUT:")
            for line in out.strip().split("\n")[-30:]:
                print("  ", line)
        # Heurística simple para fallo: ERROR: en stderr o stdout
        if re.search(r"\bERROR:\s", out + err):
            print(f"[fail] {sql_path.name} reportó ERROR")
            overall_ok = False
            break
        else:
            print(f"[ok] {sql_path.name} aplicado sin ERROR")

    client.close()
    return 0 if overall_ok else 1


def run(client, cmd, timeout=120):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return out, err


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
