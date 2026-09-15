import argparse
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock

PATH = pathlib.Path(__file__).with_name("huili_portable.py")
SPEC = importlib.util.spec_from_file_location("huili_portable", PATH)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

IDENTITY = {"verified": True, "identity": "user", "identities": {"user": {
    "status": "ready", "openId": "test-user-a", "userName": "测试用户 A",
}}}
CONFIG = {"api_base": "https://tenant.example/app/app_demo", "device_id": "test-device",
          "device_token": "test-only-device-secret", "api_key": "test-only-gateway-secret",
          "lark_open_id": "test-user-a", "lark_bin": "/test/lark-cli", "agent": "qwenwork"}


def install_args(directory, **overrides):
    values = dict(connection=pathlib.Path(directory) / "invitation.json", config=pathlib.Path(directory) / "connection.json",
                  api_base=CONFIG["api_base"], api_key_file=None, pairing_code="TEST-CODE", agent="qwenwork",
                  lark_bin="/test/lark-cli", lark_profile=None, yes=True, dry_run=False)
    values.update(overrides)
    return argparse.Namespace(**values)


class PortableTests(unittest.TestCase):
    def test_application_urls_reject_credential_transport_and_untrusted_paths(self):
        for value in ["http://tenant.example", "https://user:password@tenant.example", "https://tenant.example?key=x",
                      "https://tenant.example/other/path", "file:///tmp/x"]:
            with self.subTest(value=value), self.assertRaises(M.ConnectionError):
                M.api_base(value)
        self.assertEqual("http://127.0.0.1:8107", M.api_base("http://127.0.0.1:8107/"))

    def test_application_storage_is_isolated(self):
        self.assertNotEqual(M.config_path("https://one.example"), M.config_path("https://two.example"))

    def test_identity_change_prevents_all_business_calls_and_cloud_diagnosis(self):
        switched = {**CONFIG, "lark_open_id": "different-user"}
        with mock.patch.object(M, "lark", return_value=IDENTITY), mock.patch.object(M, "cloud") as cloud:
            with self.assertRaises(M.ConnectionError) as error:
                M.call_tool(switched, "huili_context", {})
            self.assertEqual("identity_changed", error.exception.code)
            self.assertFalse(M.diagnosis(switched)["ok"])
            cloud.assert_not_called()

    def test_diagnosis_never_claims_work_or_leaks_credentials(self):
        with mock.patch.object(M, "lark", side_effect=[IDENTITY, {"ok": True}]), mock.patch.object(M, "cloud", return_value={"meetings": []}) as cloud:
            report = M.diagnosis(CONFIG)
        self.assertTrue(report["ok"])
        self.assertFalse(report["background_running"])
        self.assertEqual("/openapi/v1/series/source", cloud.call_args.args[1])
        self.assertNotIn("secret", json.dumps(report))

    def test_unknown_tools_arguments_and_write_commands_never_execute(self):
        invalid = [("shell", {}), ("huili_claim_actions", {"limit": 6}), ("huili_status", {"run": "rm -rf"}),
                   ("huili_feishu_read", {"operation": "send_message"})]
        with mock.patch.object(M, "lark") as lark, mock.patch.object(M, "cloud") as cloud:
            for name, args in invalid:
                with self.subTest(name=name), self.assertRaises(M.ConnectionError):
                    M.call_tool(CONFIG, name, args)
            lark.assert_not_called()
            cloud.assert_not_called()

    def test_feishu_read_keeps_user_identity_profile_and_argument_boundaries(self):
        result = subprocess.CompletedProcess([], 0, '{"ok":true,"data":{}}', "")
        with mock.patch.object(M.subprocess, "run", return_value=result) as run:
            M.feishu_read({**CONFIG, "lark_profile": "work"}, {"operation": "minutes_search", "query": "$(touch /tmp/no)", "participation": "participant"})
        argv = run.call_args.args[0]
        self.assertEqual(["/test/lark-cli", "--profile", "work"], argv[:3])
        self.assertIn("--participant-ids", argv)
        self.assertIn("$(touch /tmp/no)", argv)
        self.assertEqual("user", argv[argv.index("--as") + 1])
        self.assertNotIn("shell", run.call_args.kwargs)

    def test_meeting_sync_cannot_retire_other_records_or_complete_actions(self):
        meeting = {"externalKey": "sample", "title": "sample", "startedAt": "2026-09-09T12:00:00Z", "status": "ready", "headline": "sample"}
        with mock.patch.object(M, "identity"), mock.patch.object(M, "cloud") as cloud:
            for field in ["supersedesExternalKeys", "calendarSnapshot", "actionsAuthoritative", "actions", "transcript"]:
                with self.subTest(field=field), self.assertRaises(M.ConnectionError):
                    M.call_tool(CONFIG, "huili_sync_meeting", {"meeting": {**meeting, field: []}})
            cloud.assert_not_called()

    def test_redirect_and_gateway_failure_do_not_leak_secrets(self):
        with self.assertRaises(M.ConnectionError):
            M.NoRedirect().redirect_request(None, None, 302, "Found", {}, "https://elsewhere.example")
        error = urllib.error.HTTPError(CONFIG["api_base"], 403, "denied", {}, io.BytesIO(b"test-only-gateway-secret"))
        with mock.patch.object(M.urllib.request, "build_opener") as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaises(M.ConnectionError) as caught:
                M.cloud(CONFIG, "/openapi/v1/series/source", {})
        self.assertEqual("gateway_denied", caught.exception.code)
        self.assertNotIn("secret", str(caught.exception))

    def test_setup_missing_gateway_credential_stops_before_auth_or_pairing(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(M, "lark") as lark, mock.patch.object(M, "cloud") as cloud:
            with self.assertRaises(M.ConnectionError) as error:
                M.setup(install_args(tmp))
            self.assertEqual("gateway_key_required", error.exception.code)
            lark.assert_not_called()
            cloud.assert_not_called()

    def test_setup_saves_pairing_before_diagnosis_and_reinstall_reuses_it(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"HUILI_API_KEY": "test-only-key"}), mock.patch.object(M, "lark", side_effect=lambda config, argv: IDENTITY if argv[1] == "status" else {"ok": True}):
            args = install_args(tmp, lark_profile="work")
            def respond(config, route, body, **kwargs):
                if route.endswith("/pair"):
                    return {"deviceId": "first-device", "deviceToken": "test-only-device"}
                self.assertTrue(args.config.exists())
                return {"meetings": []}
            with mock.patch.object(M, "cloud", side_effect=respond) as cloud:
                result = M.setup(args)
                self.assertTrue(result["ok"])
                self.assertEqual(0o600, args.config.stat().st_mode & 0o777)
                self.assertNotIn("test-only", pathlib.Path(result["mcp_configuration"]).read_text())
                self.assertNotIn(str(PATH), pathlib.Path(result["mcp_configuration"]).read_text())
                cloud.reset_mock()
                args.pairing_code = "EXPIRED!"
                M.setup(args)
                self.assertEqual(1, cloud.call_count)
                self.assertEqual("/openapi/v1/series/source", cloud.call_args.args[1])

    def test_expired_invitation_and_application_mismatch_cannot_overwrite_binding(self):
        with tempfile.TemporaryDirectory() as tmp:
            args = install_args(tmp)
            M.private_json(args.connection, {"expires_at": "2000-01-01T00:00:00Z"})
            with self.assertRaises(M.ConnectionError) as error:
                M.setup(args)
            self.assertEqual("invitation_expired", error.exception.code)
            M.private_json(args.config, CONFIG)
            original = args.config.read_bytes()
            args.api_base = "https://another.example"
            with self.assertRaises(M.ConnectionError):
                M.setup(args)
            self.assertEqual(original, args.config.read_bytes())

    def test_invitation_cannot_send_credentials_to_a_different_application(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(M, "lark") as lark, mock.patch.object(M, "cloud") as cloud:
            args = install_args(tmp, api_base="https://different.example")
            M.private_json(args.connection, {"api_base": CONFIG["api_base"], "api_key": "test-only-invitation"})
            with self.assertRaises(M.ConnectionError) as error:
                M.setup(args)
            self.assertEqual("invitation_application_mismatch", error.exception.code)
            lark.assert_not_called()
            cloud.assert_not_called()

    def test_gateway_rotation_preserves_pairing_and_does_not_ask_again(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(M, "lark", side_effect=lambda config, argv: IDENTITY if argv[1] == "status" else {"ok": True}):
            args = install_args(tmp, yes=False)
            M.private_json(args.config, CONFIG)
            M.private_json(args.connection, {"api_base": CONFIG["api_base"], "api_key": "test-only-rotated", "expires_at": "2099-01-01T00:00:00Z"})
            with mock.patch.object(M, "cloud", return_value={"meetings": []}) as cloud, mock.patch("builtins.input") as prompt:
                result = M.setup(args)
            self.assertTrue(result["ok"])
            stored = M.load_json(args.config)
            self.assertEqual(CONFIG["device_token"], stored["device_token"])
            self.assertEqual("test-only-rotated", stored["api_key"])
            self.assertEqual(1, cloud.call_count)
            self.assertTrue(cloud.call_args.args[1].endswith("/source"))
            prompt.assert_not_called()
            # The old download may expire after a successful connection. It must
            # not invalidate an already bound device with the same gateway key.
            M.private_json(args.connection, {"api_base": CONFIG["api_base"], "api_key": "test-only-rotated", "expires_at": "2000-01-01T00:00:00Z"})
            with mock.patch.object(M, "cloud", return_value={"meetings": []}) as cloud:
                self.assertTrue(M.setup(args)["ok"])
            self.assertEqual(1, cloud.call_count)

    def test_noninteractive_setup_returns_account_confirmation_before_pairing(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"HUILI_API_KEY": "test-only-key"}), mock.patch.object(M, "lark", side_effect=lambda config, argv: IDENTITY if argv[1] == "status" else {"ok": True}), mock.patch.object(M, "cloud") as cloud, mock.patch.object(M.sys.stdin, "isatty", return_value=False):
            args = install_args(tmp, yes=False)
            result = M.setup(args)
            self.assertEqual("account_confirmation_required", result["code"])
            self.assertEqual("测试用户 A", result["account"])
            self.assertFalse(args.config.exists())
            cloud.assert_not_called()

    def test_real_stdio_handshake_discovery_and_errors_without_installed_accounts(self):
        requests = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05"}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "unknown", "arguments": {}}},
        ]
        process = subprocess.run([sys.executable, str(PATH), "mcp"], input="\n".join(json.dumps(r) for r in requests) + "\n", capture_output=True, text=True, timeout=10)
        self.assertEqual(0, process.returncode, process.stderr)
        responses = [json.loads(line) for line in process.stdout.splitlines()]
        self.assertEqual(3, len(responses))
        self.assertEqual("2024-11-05", responses[0]["result"]["protocolVersion"])
        self.assertEqual(6, len(responses[1]["result"]["tools"]))
        self.assertTrue(responses[2]["result"]["isError"])

    def test_invalid_config_keeps_mcp_protocol_usable_for_diagnosis(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = pathlib.Path(tmp) / "broken.json"
            config.write_text("broken", encoding="utf-8")
            request = {"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"name": "huili_status", "arguments": {}}}
            process = subprocess.run([sys.executable, str(PATH), "--config", str(config), "mcp"], input=json.dumps(request) + "\n", capture_output=True, text=True, timeout=10)
            result = json.loads(process.stdout)
            self.assertEqual("2.0", result["jsonrpc"])
            self.assertFalse(json.loads(result["result"]["content"][0]["text"])["ok"])

    def test_unconfigured_diagnosis_does_not_inspect_existing_accounts(self):
        with mock.patch.object(M, "lark") as lark, mock.patch.object(M, "cloud") as cloud:
            self.assertFalse(M.diagnosis({})["ok"])
            lark.assert_not_called()
            cloud.assert_not_called()


if __name__ == "__main__":
    unittest.main()
