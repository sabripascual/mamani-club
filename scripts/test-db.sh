#!/usr/bin/env bash
# Corre las pruebas SQL contra un Postgres. Se conecta con las variables estándar
# PGHOST, PGPORT, PGUSER y PGPASSWORD (por defecto: localhost:5432, usuario postgres).
# Cada archivo de test se ejecuta en una base nueva con todas las migraciones aplicadas.
set -euo pipefail
cd "$(dirname "$0")/.."
export PGUSER="${PGUSER:-postgres}"
run() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
fail=0
for test in supabase/tests/0*.test.sql; do
  db="mamani_test_$(basename "$test" .test.sql | tr -c 'a-z0-9_\n' '_')"
  run -d postgres -c "drop database if exists $db" -c "create database $db" >/dev/null
  run -d "$db" -f supabase/tests/_stub_supabase.sql >/dev/null
  for m in supabase/migrations/*.sql; do run -d "$db" -f "$m" >/dev/null; done
  # 0002 reutiliza las usuarias que crea 0001.
  if [[ "$test" == *0002* ]]; then run -d "$db" -f supabase/tests/0001_fundamentos.test.sql >/dev/null 2>&1; fi
  echo "▶ $(basename "$test")"
  if out=$(run -t -d "$db" -f "$test" 2>&1); then
    echo "$out" | grep -oE "OK  .*" | sed 's/^/  ✓ /'
  else
    echo "$out" | grep -E "OK  |FALLA|ERROR" | sed 's/^psql:[^ ]* //;s/^/  /'
    fail=1
  fi
done
exit $fail
