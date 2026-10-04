import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("check_media", Path(__file__).with_name("check-media.py"))
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)


class MediaChecks(unittest.TestCase):
    def test_metadata_and_binary_mib_limit(self):
        metadata = {"streams": [{"codec_type": "video", "width": 1920, "height": 1080,
                                 "codec_name": "h264", "avg_frame_rate": "24/1", "nb_read_frames": "480"}]}
        expected = {"width": 1920, "height": 1080, "codec_name": "h264", "fps": 24, "frames": 480, "max_mib": 25}
        checks = media.checks_for(metadata, 25_180_717, expected)
        self.assertTrue(all(row["passed"] for row in checks))
        self.assertFalse(all(row["passed"] for row in media.checks_for(metadata, 26_214_401, expected)))
        self.assertTrue(all(row["passed"] for row in media.checks_for(metadata, 26_214_400, expected)))

    def test_unknown_frames_or_invalid_rate_do_not_pass(self):
        metadata = {"streams": [{"codec_type": "video", "avg_frame_rate": "0/0", "nb_frames": "N/A"}]}
        checks = media.checks_for(metadata, 1, {"fps": 24, "frames": 480})
        self.assertEqual(sum(not row["passed"] for row in checks), 2)
        self.assertFalse(media.checks_for({"streams": []}, 1, {})[0]["passed"])

    def test_fast_start_atom_order_and_extended_length(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.mp4"
            path.write_bytes(struct.pack(">I4s", 8, b"ftyp") + struct.pack(">I4sQ", 1, b"moov", 16)
                             + struct.pack(">I4s", 0, b"mdat") + b"data")
            rows = media.mp4_atoms(path)
            self.assertEqual([row["type"] for row in rows], ["ftyp", "moov", "mdat"])
            metadata = {"streams": [{"codec_type": "video"}]}
            self.assertTrue(media.checks_for(metadata, path.stat().st_size, {}, rows)[-1]["passed"])
            reversed_rows = [{"type": "mdat", "offset": 8}, {"type": "moov", "offset": 20}]
            self.assertFalse(media.checks_for(metadata, 30, {}, reversed_rows)[-1]["passed"])

    def test_truncated_and_overrunning_atoms_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.mp4"
            for data in (b"short", struct.pack(">I4s", 999, b"mdat"), struct.pack(">I4s", 1, b"moov")):
                path.write_bytes(data)
                with self.assertRaises(ValueError):
                    media.mp4_atoms(path)


if __name__ == "__main__":
    unittest.main()
