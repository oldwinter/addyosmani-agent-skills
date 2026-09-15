import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
README = (ROOT / "README.md").read_text(encoding="utf-8")


class QuickStartInstallTests(unittest.TestCase):
    def test_quick_start_uses_fork_and_full_depth(self):
        quick = README.split("## Quick Start", 1)[1].split("<details>", 1)[0]
        self.assertIn("npx skills add oldwinter/addyosmani-agent-skills --full-depth", quick)
        self.assertNotIn("npx skills add addyosmani/agent-skills", quick)

    def test_every_quick_start_npx_has_full_depth(self):
        quick = README.split("## Quick Start", 1)[1].split("<details>", 1)[0]
        commands = re.findall(r"^npx skills add .+$", quick, flags=re.M)
        self.assertGreaterEqual(len(commands), 2)
        for cmd in commands:
            self.assertIn("oldwinter/addyosmani-agent-skills", cmd)
            self.assertIn("--full-depth", cmd)

    def test_codex_details_use_fork_plugin_name(self):
        codex = README.split("<summary><b>Codex</b></summary>", 1)[1].split("</details>", 1)[0]
        self.assertIn("codex plugin marketplace add oldwinter/addyosmani-agent-skills", codex)
        self.assertIn("codex plugin add agent-skills@addy-agent-skills", codex)
        self.assertNotIn("codex plugin marketplace add addyosmani/agent-skills", codex)
        self.assertNotIn("agent-skills@agent-skills", codex)


if __name__ == "__main__":
    unittest.main()
