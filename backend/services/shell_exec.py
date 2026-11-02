"""Run shell commands requested by the local model.

This powers "agent mode": the model emits a command, the user approves it
(unless auto-run is on), and it is executed here. Everything stays on the
user's own machine. Guardrails: per-command timeout, output size cap, and
a configurable working directory.
"""

import asyncio
import os
import signal
import time

# Where commands run from. Defaults to the user's home directory.
WORKDIR = os.path.expanduser(os.getenv("SHELL_EXEC_WORKDIR", "~"))
# Hard timeout per command (seconds).
TIMEOUT = float(os.getenv("SHELL_EXEC_TIMEOUT", "60"))
# Max characters of combined output returned to the model.
MAX_OUTPUT = int(os.getenv("SHELL_EXEC_MAX_OUTPUT", "20000"))
# Master switch. Set SHELL_EXEC_ENABLED=0 to disable execution entirely.
ENABLED = os.getenv("SHELL_EXEC_ENABLED", "1") == "1"


def _truncate(text: str) -> tuple[str, bool]:
    if len(text) <= MAX_OUTPUT:
        return text, False
    head = MAX_OUTPUT - 200
    return text[:head] + f"\n... [truncated, {len(text) - head} more chars]", True


async def run_command(command: str) -> dict:
    """Execute a single shell command and return its result.

    Returns a dict with: stdout, stderr, exit_code, timed_out, truncated,
    duration_ms. Never raises for command failures — the failure is reported
    in the result so the model can react to it.
    """
    if not ENABLED:
        return {
            "stdout": "",
            "stderr": "Command execution is disabled on the server "
            "(SHELL_EXEC_ENABLED=0).",
            "exit_code": -1,
            "timed_out": False,
            "truncated": False,
            "duration_ms": 0,
        }

    command = (command or "").strip()
    if not command:
        return {
            "stdout": "",
            "stderr": "Empty command.",
            "exit_code": -1,
            "timed_out": False,
            "truncated": False,
            "duration_ms": 0,
        }

    started = time.monotonic()
    proc = await asyncio.create_subprocess_shell(
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=WORKDIR if os.path.isdir(WORKDIR) else None,
        # New session so we can kill the whole process group on timeout.
        start_new_session=True,
    )

    timed_out = False
    try:
        out_b, err_b = await asyncio.wait_for(proc.communicate(), timeout=TIMEOUT)
    except asyncio.TimeoutError:
        timed_out = True
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            try:
                proc.kill()
            except ProcessLookupError:
                pass
        try:
            out_b, err_b = await proc.communicate()
        except Exception:
            out_b, err_b = b"", b""

    duration_ms = int((time.monotonic() - started) * 1000)

    stdout = (out_b or b"").decode("utf-8", errors="replace")
    stderr = (err_b or b"").decode("utf-8", errors="replace")
    stdout, t1 = _truncate(stdout)
    stderr, t2 = _truncate(stderr)

    if timed_out:
        stderr = (stderr + f"\n[command timed out after {TIMEOUT:.0f}s]").strip()

    return {
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": proc.returncode if proc.returncode is not None else -1,
        "timed_out": timed_out,
        "truncated": t1 or t2,
        "duration_ms": duration_ms,
    }
