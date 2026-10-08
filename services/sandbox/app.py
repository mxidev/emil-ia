import ast
import importlib
import signal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Emil-IA calculation sandbox")
ALLOWED_IMPORTS = {"sympy", "numpy", "scipy", "matplotlib"}

class RunRequest(BaseModel):
    code: str = Field(min_length=1, max_length=12000)
    timeout_seconds: int = Field(default=5, ge=1, le=10)

def validate(code: str) -> None:
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise HTTPException(400, f"Sintaxis inválida: {exc}")
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = [alias.name.split('.')[0] for alias in node.names]
            if any(name not in ALLOWED_IMPORTS for name in names):
                raise HTTPException(400, "Importación no permitida")
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)):
            raise HTTPException(400, "No se permiten definiciones dinámicas")
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec", "open", "__import__", "input"}:
            raise HTTPException(400, "Operación no permitida")

def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root = name.split('.')[0]
    if root not in ALLOWED_IMPORTS:
        raise ImportError("Importación no permitida")
    return importlib.import_module(name)

@app.post('/run')
def run(request: RunRequest):
    validate(request.code)
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
