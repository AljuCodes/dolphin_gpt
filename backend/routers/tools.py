from fastapi import APIRouter
from pydantic import BaseModel

from services import shell_exec

router = APIRouter()


class ExecReq(BaseModel):
    command: str


@router.get("/exec/status")
def exec_status():
    """Report whether command execution is enabled and its limits."""
    return {
        "enabled": shell_exec.ENABLED,
        "workdir": shell_exec.WORKDIR,
        "timeout": shell_exec.TIMEOUT,
        "max_output": shell_exec.MAX_OUTPUT,
    }


@router.post("/exec")
async def exec_command(body: ExecReq):
    """Run a single shell command on the host and return its result.

    Failures are reported in the payload (exit_code, stderr) rather than
    raised, so the model can read them and decide what to do next.
    """
    return await shell_exec.run_command(body.command)
