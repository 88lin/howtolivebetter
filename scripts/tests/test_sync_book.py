"""Regression cases for upstream format changes and saved-progress identity."""
from copy import deepcopy
import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "sync-book.py"
SPEC = importlib.util.spec_from_file_location("sync_book", SCRIPT)
sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync)

BOOK = """[← 回总目录](../README.md)

# 1. 不要早死

章节介绍。

### 1. 出门系安全带
<!-- 成本标签: 钱=0 时间=少 毅力=否 收益=大 口径=死亡率 -->
- 成本：每天两秒。
- 说人话：系好安全带能减少伤害。
- 收益：降低风险。
- 证据等级：A
- 来源：官方资料 <https://example.org/source>
  第二行资料。
- 备注：前后排都要系。
"""


class BookSyncTests(unittest.TestCase):
    def parse(self, content=BOOK):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            (source / "book").mkdir()
            (source / "book/01-不要早死.md").write_text(content, encoding="utf-8")
            return sync.parse_book(source, "a" * 40)

    def test_full_fields_and_pinned_source_are_preserved(self):
        chapters, tips, digest = self.parse()
        self.assertEqual(chapters["01"]["intro"], "章节介绍。")
        self.assertEqual(tips[0]["id"], "01-01")
        self.assertIn("第二行资料", tips[0]["sources"])
        self.assertIn("/blob/" + "a" * 40 + "/book/", tips[0]["sourceHref"])
        self.assertEqual(len(digest), 64)

    def test_new_entries_do_not_require_a_fixed_total(self):
        second = BOOK[BOOK.index("### 1."):].replace("### 1.", "### 2.")
        _, tips, _ = self.parse(BOOK + "\n" + second)
        sync.check_identity(tips[:1], tips)
        self.assertEqual([tip["id"] for tip in tips], ["01-01", "01-02"])

    def test_missing_duplicate_and_unknown_fields_stop_sync(self):
        for content in (BOOK.replace("- 来源：", "- 出处："),
                        BOOK.replace("- 成本：每天两秒。", "- 成本：每天两秒。\n- 成本：重复。"),
                        BOOK.replace("- 收益：降低风险。\n", "")):
            with self.subTest(content=content), self.assertRaises(sync.SyncError):
                self.parse(content)

    def test_invalid_numbers_and_tags_stop_sync(self):
        for content in (BOOK.replace("### 1.", "### 2."),
                        BOOK.replace("### 1.", "### 100."),
                        BOOK.replace("钱=0", "钱=未知")):
            with self.subTest(content=content), self.assertRaises(sync.SyncError):
                self.parse(content)

    def test_deleted_id_is_not_silently_removed(self):
        _, tips, _ = self.parse()
        with self.assertRaisesRegex(sync.SyncError, "removed"):
            sync.check_identity(tips, [])

    def test_number_swaps_do_not_move_personal_marks(self):
        _, tips, _ = self.parse()
        old = [tips[0], {**tips[0], "id": "01-02", "title": "定期检查烟雾报警器"}]
        swapped = [{**old[0], "title": old[1]["title"]}, {**old[1], "title": old[0]["title"]}]
        with self.assertRaisesRegex(sync.SyncError, "renumbering"):
            sync.check_identity(old, swapped)

    def test_topic_replacement_stops_but_title_expansion_is_allowed(self):
        _, tips, _ = self.parse()
        revised = deepcopy(tips)
        revised[0]["title"] += "，前排后排都系"
        sync.check_identity(tips, revised)
        revised[0].update(title="银行定期存款", summary="选择适合的银行账户")
        with self.assertRaisesRegex(sync.SyncError, "replacement"):
            sync.check_identity(tips, revised)

    def test_upstream_markup_stays_text(self):
        content = '<script>alert(1)</script> [unsafe](javascript:alert(1)) <https://example.org/source>'
        nodes = sync.citations(content)
        self.assertEqual([n["tag"] for n in nodes if isinstance(n, dict)], ["a"])
        self.assertTrue(all(n["props"]["href"].startswith("https://") for n in nodes if isinstance(n, dict)))
        self.assertIn("<script>", "".join(n for n in nodes if isinstance(n, str)))


if __name__ == "__main__":
    unittest.main()
