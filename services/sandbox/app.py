import importlib
import signal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from validator import CodeValidationError, validate

app = FastAPI(title="Emil-IA calculation sandbox")
ALLOWED_IMPORTS = {"sympy", "numpy", "scipy", "matplotlib"}

class RunRequest(BaseModel):
    code: str = Field(min_length=1, max_length=12000)
    timeout_seconds: int = Field(default=5, ge=1, le=10)

def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root = name.split('.')[0]
    if root not in ALLOWED_IMPORTS:
        raise ImportError("Importación no permitida")
    return importlib.import_module(name)

@app.post('/run')
async def run(request: RunRequest):
    try:
        validate(request.code)
    except CodeValidationError as exc:
        raise HTTPException(400, str(exc)) from exc
    result = {}
    def timeout(_signum, _frame):
        raise TimeoutError("Tiempo de ejecución excedido")
    try:
        signal.signal(signal.SIGALRM, timeout)
        signal.alarm(request.timeout_seconds)
        scope = {"__builtins__": {"abs": abs, "round": round, "len": len, "range": range, "print": print, "__import__": safe_import}}
        exec(compile(request.code, '<sandbox>', 'exec'), scope, scope)
        result = {key: str(value) for key, value in scope.items() if not key.startswith('__')}
    except TimeoutError as exc:
        raise HTTPException(408, str(exc))
    except Exception as exc:
        raise HTTPException(400, f"Ejecución fallida: {exc}")
    finally:
        signal.alarm(0)
    return {"ok": True, "variables": result}
