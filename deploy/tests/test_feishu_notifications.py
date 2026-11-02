"""离线执行部署通知代码，验证卡片和异常处理，不向机器人发消息。"""

import contextlib
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

import yaml


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/deploy-api.yml"
STEPS = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))["jobs"]["deploy-api"]["steps"]
NOTICES = {step["name"]: step for step in STEPS if step["name"].startswith("Notify deploy ")}


class FeishuNotificationsTest(unittest.TestCase):
    def execute_notice(self, step, response=None, error=None, webhook="https://example.invalid/robot"):
        # 执行实际工作流中的Python代码，网络请求始终由模拟对象接管。
        script = step["run"]
        self.assertTrue(script.startswith("python3 - <<'PY'\n"))
        self.assertTrue(script.rstrip().endswith("\nPY"))
        code = "\n".join(script.splitlines()[1:-1])
        env = {
            "WEBHOOK": webhook,
            "TITLE": step["env"]["TITLE"],
            "COLOR": step["env"]["COLOR"],
            "SHA": "abcdef1234567890",
            "ACTOR": "发布人员",
            "RUN_URL": "https://github.com/example/project/actions/runs/123",
        }
        if response is None:
            response = b'{"code":0,"msg":"success"}'
        stdout = io.StringIO()
        with patch.dict(os.environ, env, clear=True), patch("urllib.request.urlopen") as request:
            request.return_value = io.BytesIO(response)
            request.side_effect = error
            with contextlib.redirect_stdout(stdout):
                try:
                    exec(compile(code, "<workflow-notification>", "exec"), {})
                    status = 0
                except SystemExit as result:
                    status = result.code
            call = request.call_args
        if webhook:
            self.assertNotIn(env["WEBHOOK"], stdout.getvalue())
        return status, stdout.getvalue(), call

    def test_all_three_titles_colors_and_contents(self):
        expected = {
            "Notify deploy start": ("任务精灵：开始部署", "blue"),
            "Notify deploy success": ("任务精灵：部署成功", "green"),
            "Notify deploy failure": ("任务精灵：部署失败", "red"),
        }
        self.assertEqual(set(NOTICES), set(expected))
        for name, (title, color) in expected.items():
            with self.subTest(name=name):
                status, output, call = self.execute_notice(NOTICES[name])
                self.assertEqual(status, 0)
                self.assertIn("成功接收", output)
                request = call.args[0]
                self.assertEqual(request.method, "POST")
                self.assertEqual(call.kwargs["timeout"], 20)
                payload = json.loads(request.data.decode("utf-8"))
                self.assertEqual(payload["msg_type"], "interactive")
                card = payload["card"]
                self.assertEqual(card["schema"], "2.0")
                self.assertEqual(card["header"]["title"]["content"], title)
                self.assertEqual(card["header"]["template"], color)
                content, button = card["body"]["elements"]
                self.assertIn("abcdef1", content["content"])
                self.assertIn("发布人员", content["content"])
                self.assertIn("actions/runs/123", content["content"])
                self.assertEqual(button["behaviors"][0]["default_url"], "https://github.com/example/project/actions/runs/123")

    def test_conditions_and_secret_reference(self):
        self.assertNotIn("if", NOTICES["Notify deploy start"])
        self.assertEqual(NOTICES["Notify deploy success"]["if"], "success()")
        self.assertEqual(NOTICES["Notify deploy failure"]["if"], "failure()")
        for step in NOTICES.values():
            self.assertIs(step["continue-on-error"], True)
            self.assertEqual(step["env"]["WEBHOOK"], "${{ secrets.FEISHU_ROBOT_WEBHOOK }}")
        self.assertNotIn("WECHAT_ROBOT_WEBHOOK", WORKFLOW.read_text(encoding="utf-8"))

    def test_missing_webhook_does_not_request_network(self):
        status, output, call = self.execute_notice(NOTICES["Notify deploy start"], webhook="")
        self.assertEqual(status, 1)
        self.assertIn("未配置 FEISHU_ROBOT_WEBHOOK", output)
        self.assertIsNone(call)

    def test_robot_rejection_and_invalid_response_are_failures(self):
        for response in [b'{"code":19024}', b'{}', b'[]', b'{"code":false}', b'{"code":"0"}', b'not-json']:
            for step in NOTICES.values():
                with self.subTest(response=response, name=step["name"]):
                    status, output, _ = self.execute_notice(step, response=response)
                    self.assertEqual(status, 1)
                    self.assertIn("::warning::", output)
                    self.assertNotIn("成功接收", output)

    def test_network_http_and_timeout_failures(self):
        errors = [URLError("模拟网络失败"), TimeoutError(), HTTPError("https://example.invalid/robot", 503, "模拟服务异常", {}, None)]
        for error in errors:
            for step in NOTICES.values():
                with self.subTest(error=type(error).__name__, name=step["name"]):
                    status, output, _ = self.execute_notice(step, error=error)
                    self.assertEqual(status, 1)
                    self.assertIn("发送失败", output)
                    self.assertNotIn("成功接收", output)

    def test_legacy_success_response(self):
        status, _, _ = self.execute_notice(NOTICES["Notify deploy success"], response=b'{"StatusCode":0}')
        self.assertEqual(status, 0)

    def test_deployment_does_not_delete_all_stopped_containers(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertNotIn("docker rm -f $(docker ps -aq", text)


if __name__ == "__main__":
    unittest.main()
