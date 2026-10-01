"""Self-check for the non-trivial logic. Run: python3 test_archiver.py"""
import os
import tempfile
from datetime import datetime, timezone

from archiver import pick_stem, sanitize, unique_path, Store

posted = datetime(2026, 9, 29, 17, 49, tzinfo=timezone.utc)

assert pick_stem("original", original="IMG_2041.PNG", caption="hi", posted_at=posted, seq=3) == "IMG_2041"
assert pick_stem("caption", original="IMG_2041.PNG", caption="summer trip!!", posted_at=posted, seq=3) == "summer trip"
assert pick_stem("caption", original="IMG_2041.PNG", caption="", posted_at=posted, seq=3) == "IMG_2041"
assert pick_stem("sequence", original="x.png", caption="", posted_at=posted, seq=42) == "000042"
assert pick_stem("date", original="x.png", caption="", posted_at=posted, seq=3) != ""
assert sanitize("../etc/passwd") == "etcpasswd"
assert sanitize("a" * 100) == "a" * 60

with tempfile.TemporaryDirectory() as d:
    assert unique_path(d, "img", ".png").endswith("img.png")
    open(os.path.join(d, "img.png"), "w").close()
    assert unique_path(d, "img", ".png").endswith("img-2.png")

    store = Store(os.path.join(d, "index.json"))
    assert store.next_seq() == 1
    store.add({"id": "ab12", "seq": 1, "file": "img.png", "caption": "c",
               "original": "o", "author": "a", "channel": "ch", "channel_id": 1})
    assert store.next_seq() == 2
    reloaded = Store(os.path.join(d, "index.json"))
    assert reloaded.seq == 1 and reloaded.get("ab12")["caption"] == "c"
    assert reloaded.all()[0]["id"] == "ab12"

print("all checks passed")
