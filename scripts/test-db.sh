#!/usr/bin/env bash
# Corre las pruebas SQL contra un Postgres. Se conecta con las variables estándar
# PGHOST, PGPORT, PGUSER y PGPASSWORD (por defecto: localhost:5432, usuario postgres).
#
# Cada archivo NNNN_x.test.sql se ejecuta en una base nueva con las migraciones
# hasta la NNNN inclusive (así cada prueba valida su migración).
# Si existe NNNN_x.seed.sql, se corre ANTES de aplicar la migración NNNN: sirve para
# probar migraciones que transforman datos existentes.
set -euo pipefail
cd "$(dirname "$0")/.."
export PGUSER="${PGUSER:-postgres}"
run() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
fail=0

# Supabase rechaza DELETE/UPDATE sin WHERE en las llamadas de la app (pg-safeupdate), aun
# dentro de funciones. Postgres local no tiene esa extensión: lo chequeamos a mano en las
# migraciones nuevas (la 0016 ya está aplicada y su arreglo es la 0017).
unsafe=$(for m in supabase/migrations/*.sql; do
  [[ "$(basename "$m" | cut -d_ -f1)" < "0017" ]] && continue
  grep -nHiE '^[[:space:]]*delete[[:space:]]+from[[:space:]]+[a-z_."]+[[:space:]]*;' "$m" || true
done)
if [[ -n "$unsafe" ]]; then echo "▶ DELETE sin WHERE (Supabase lo rechaza desde la app):"; echo "$unsafe"; fail=1; fi
for test in supabase/tests/0*.test.sql; do
  base="$(basename "$test" .test.sql)"
  num="${base%%_*}"
  db="mamani_test_$(echo "$base" | tr -c 'a-z0-9_\n' '_')"
  run -d postgres -c "drop database if exists $db" -c "create database $db" >/dev/null
  run -d "$db" -f supabase/tests/_stub_supabase.sql >/dev/null
  seed="supabase/tests/${base}.seed.sql"
  for m in supabase/migrations/*.sql; do
    mnum="$(basename "$m" | cut -d_ -f1)"
    if [[ "$mnum" > "$num" ]]; then break; fi
    if [[ "$mnum" == "$num" && -f "$seed" ]]; then run -d "$db" -f "$seed" >/dev/null; fi
    # -1: todo el archivo en una sola transacción, como el SQL Editor de Supabase (así se
    # detecta, por ejemplo, usar un valor nuevo de un enum en la misma corrida).
    run -1 -d "$db" -f "$m" >/dev/null 2>"/tmp/mig_$$.log" || { echo "▶ $base: falló la migración $(basename "$m")"; cat "/tmp/mig_$$.log"; fail=1; continue 2; }
  done
  # 0002 reutiliza las usuarias que crea 0001.
  if [[ "$test" == *0002* ]]; then run -d "$db" -f supabase/tests/0001_fundamentos.test.sql >/dev/null 2>&1; fi
  echo "▶ $base"
  if out=$(run -t -d "$db" -f "$test" 2>&1); then
    echo "$out" | grep -oE "OK  .*" | sed 's/^/  ✓ /'
  else
    echo "$out" | grep -E "OK  |FALLA|ERROR" | sed 's/^psql:[^ ]* //;s/^/  /'
    fail=1
  fi
done
exit $fail
