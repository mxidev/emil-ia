import unittest

from validator import validate


class ValidatorTests(unittest.TestCase):
    def test_allows_symbols_imported_from_an_allowed_library(self):
        validate("from sympy import sqrt\nresult = sqrt(4)")

    def test_rejects_symbols_imported_from_a_disallowed_library(self):
        with self.assertRaisesRegex(ValueError, "Importación no permitida"):
            validate("from os import path\nresult = path")


if __name__ == "__main__":
    unittest.main()
