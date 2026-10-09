import ast


ALLOWED_IMPORTS = {"sympy", "numpy", "scipy", "matplotlib"}
BLOCKED_CALLS = {"eval", "exec", "open", "__import__", "input"}


class CodeValidationError(ValueError):
    pass


def validate(code: str) -> None:
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise CodeValidationError(f"Sintaxis inválida: {exc}") from exc

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots = [alias.name.split(".")[0] for alias in node.names]
            if any(root not in ALLOWED_IMPORTS for root in roots):
                raise CodeValidationError("Importación no permitida")
        elif isinstance(node, ast.ImportFrom):
            root = (node.module or "").split(".")[0]
            if root not in ALLOWED_IMPORTS:
                raise CodeValidationError("Importación no permitida")

        if isinstance(
            node,
            (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda),
        ):
            raise CodeValidationError("No se permiten definiciones dinámicas")

        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in BLOCKED_CALLS
        ):
            raise CodeValidationError("Operación no permitida")
