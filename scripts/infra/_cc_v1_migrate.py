"""Contact Center V1 — runner de dry-run / apply de las migraciones.

Por qué Python y no .sh: las migraciones son archivos LOCALES (y aún sin commitear),
y el Postgres está en un contenedor en la VPS con el puerto firewalleado. Este runner
lee los .sql locales (FUENTE ÚNICA DE VERDAD: el dry-run valida exactamente el mismo
SQL que luego aplica) y los stremea por stdin al `psql` del contenedor vía SSH.

Garantías:
  - ON_ERROR_STOP=1 siempre.
  - dry-run: BEGIN ... ROLLBACK  -> NO persiste nada.
  - apply : cada migración en su propia transacción (core; luego functions).
  - NO imprime secretos (solo la salida de psql).
  - NO asume `public` ni toca otros schemas: el loop del core ya está acotado a `neura`.
  - apply está BLOQUEADO salvo que se pase --yes-apply-to-prod (anti-accidente).

Uso:
  py scripts/infra/_cc_v1_migrate.py --mode dryrun
  py scripts/infra/_cc_v1_migrate.py --mode apply --yes-apply-to-prod
"""
import sys, io, base64, argparse
from pathlib import Path

# UTF-8 en stdout (PowerShell cp1252 explota con símbolos)
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[2]
CORE = ROOT / "supabase" / "migrations" / "20260626120000_contact_center_v1_core.sql"
FUNCS = ROOT / "supabase" / "migrations" / "20260626121000_contact_center_v1_functions.sql"


def load_env():
    env = {}
    env_path = ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


def build_sql(mode: str) -> str:
    if not CORE.exists() or not FUNCS.exists():
        print(f"ERROR: no encuentro las migraciones:\n  {CORE}\n  {FUNCS}")
        sys.exit(2)
    core = CORE.read_text(encoding="utf-8")
    funcs = FUNCS.read_text(encoding="utf-8")
    if mode == "dryrun":
        return (
            "\\set ON_ERROR_STOP on\n"
            "\\echo '== DRY-RUN Contact Center V1 (BEGIN ... ROLLBACK; no persiste) =='\n"
            "BEGIN;\n"
            "\\echo '-- aplicando core (en tx que se revierte) --'\n" + core + "\n"
            "\\echo '-- aplicando functions (en tx que se revierte) --'\n" + funcs + "\n"
            "ROLLBACK;\n"
            "\\echo '== DRY-RUN OK: transacción revertida, nada persistido =='\n"
        )
    # apply: cada migración en su propia transacción
    return (
        "\\set ON_ERROR_STOP on\n"
        "\\echo '== APPLY Contact Center V1 =='\n"
        "BEGIN;\n" + core + "\nCOMMIT;\n"
        "\\echo '== core aplicado y commiteado =='\n"
        "BEGIN;\n" + funcs + "\nCOMMIT;\n"
        "\\echo '== functions aplicadas y commiteadas =='\n"
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", required=True, choices=["dryrun", "apply"])
    ap.add_argument("--yes-apply-to-prod", action="store_true",
                    help="Requerido para --mode apply. Sin esta bandera, apply no hace nada.")
    args = ap.parse_args()

    if args.mode == "apply" and not args.yes_apply_to_prod:
        print("APPLY BLOQUEADO. Este script no aplica nada sin confirmación explícita.")
        print("Si realmente querés aplicar a producción, re-ejecutá con:")
        print("  py scripts/infra/_cc_v1_migrate.py --mode apply --yes-apply-to-prod")
        sys.exit(3)

    env = load_env()
    host = env.get("VPS_IP", "187.77.247.54")
    user = env.get("VPS_USER", "root")
    password = env.get("VPS_ROOT_PASSWORD", "")
    container = env.get("SUPABASE_DB_CONTAINER", "supabase-db")

    sql = build_sql(args.mode)
    b64 = base64.b64encode(sql.encode("utf-8")).decode("ascii")
    # pipefail -> el exit code refleja a psql (no a base64)
    remote = (
        "set -o pipefail; echo {b64} | base64 -d | "
        "docker exec -i {c} psql -U postgres -d postgres "
        "-v ON_ERROR_STOP=1 -X -P pager=off"
    ).format(b64=b64, c=container)

    print(f"== Contact Center V1 :: modo={args.mode} :: host={host} :: contenedor={container} ==")
    print(f"== core={CORE.name}  functions={FUNCS.name} ==")

    import paramiko
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=30,
                   look_for_keys=False, allow_agent=False)
    stdin, stdout, stderr = client.exec_command(remote, timeout=300)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    rc = stdout.channel.recv_exit_status()
    client.close()

    print("===STDOUT===")
    print(out)
    print("===STDERR===")
    print(err)
    print("===RESULTADO===")
    if rc == 0:
        print(f"OK (exit {rc}) — modo {args.mode} completado sin errores.")
    else:
        print(f"FALLÓ (exit {rc}) — revisá STDERR. En dry-run no se persistió nada; "
              f"en apply, la migración que falló quedó revertida por ON_ERROR_STOP.")
    sys.exit(rc)


if __name__ == "__main__":
    main()
