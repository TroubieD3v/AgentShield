"""Outbound connection allowlist. AgentShield only talks to hosts the operator explicitly allowed."""

from __future__ import annotations

import fnmatch
import ipaddress
import os
from urllib.parse import urlparse

DEFAULT_HOSTS = ["localhost", "127.0.0.1", "::1", "host.docker.internal"]
ALWAYS_DENIED_HOSTS = {"metadata.google.internal", "metadata.goog"}
ALWAYS_DENIED_NETS = [ipaddress.ip_network("169.254.0.0/16"), ipaddress.ip_network("fe80::/10")]


class HostNotAllowed(Exception):
    pass


class AllowList:
    def __init__(self, hosts: list[str] | None = None):
        self.hosts = [h.strip().lower() for h in (hosts if hosts is not None else DEFAULT_HOSTS) if h.strip()]

    def check(self, url: str) -> str:
        """Return the normalized host or raise HostNotAllowed."""
        p = urlparse(url)
        if p.scheme not in {"http", "https"}:
            raise HostNotAllowed(f"scheme '{p.scheme}' is not allowed (http/https only)")
        host = (p.hostname or "").lower()
        if not host:
            raise HostNotAllowed("URL has no host")
        if host in ALWAYS_DENIED_HOSTS:
            raise HostNotAllowed(f"host '{host}' is always denied (cloud metadata)")
        try:
            ip = ipaddress.ip_address(host)
            if any(ip in net for net in ALWAYS_DENIED_NETS):
                raise HostNotAllowed(f"address '{host}' is link-local / metadata and always denied")
        except ValueError:
            pass
        if not any(fnmatch.fnmatch(host, pat) for pat in self.hosts):
            raise HostNotAllowed(
                f"host '{host}' is not in the allowlist ({', '.join(self.hosts) or 'empty'}). "
                "Set AGENTSHIELD_ALLOWED_HOSTS to add it."
            )
        return host


def default_allowlist() -> AllowList:
    env = os.environ.get("AGENTSHIELD_ALLOWED_HOSTS")
    return AllowList([h for h in env.split(",")] if env else None)
