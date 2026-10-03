#!/usr/bin/env bash
set -e

cd -- "$(dirname -- "$0")"

echo "Running database migrations..."
alembic upgrade head

echo "Migrations completed!"
