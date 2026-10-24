import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "prepare_dataset.py"
SPEC = importlib.util.spec_from_file_location("prepare_dataset", SCRIPT)
prepare_dataset = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare_dataset)


class PrepareDatasetTests(unittest.TestCase):
    def test_normalizes_numeric_cwe(self):
        self.assertEqual(prepare_dataset.normalize_cwe(89), "CWE-89")
        self.assertEqual(prepare_dataset.normalize_cwe("CWE_79"), "CWE-79")

    def test_parses_common_boolean_labels(self):
        self.assertTrue(prepare_dataset.parse_bool("1", "1"))
        self.assertFalse(prepare_dataset.parse_bool("0", "1"))
        self.assertTrue(prepare_dataset.parse_bool("vulnerable", "1"))
        self.assertFalse(prepare_dataset.parse_bool("safe", "1"))

    def test_parses_and_deduplicates_line_numbers(self):
        self.assertEqual(prepare_dataset.parse_lines("[4, 2, 4, 0, -1]"), [2, 4])


if __name__ == "__main__":
    unittest.main()
