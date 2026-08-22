"""Fail when the rendered staging Compose stack publishes private services."""

from __future__ import annotations

import json
import sys


def main() -> int:
    config = json.load(sys.stdin)
    services = config.get("services", {})
    failures: list[str] = []

    for service_name in ("postgres", "redis", "api", "worker", "migrate"):
        published = services.get(service_name, {}).get("ports") or []
        if published:
            failures.append(f"{service_name} unexpectedly publishes ports: {published}")

    nginx_ports = services.get("nginx", {}).get("ports") or []
    if not nginx_ports:
        failures.append("nginx must remain the staging ingress")

    if failures:
        for failure in failures:
            print(f"ERROR: {failure}", file=sys.stderr)
        return 1

    print("staging compose exposure check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
