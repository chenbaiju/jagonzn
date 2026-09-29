"""V5b-1 disposable fixed-candidate daily-quota boundary probe.

Run only with a temporary isolated NONCOMMERCIAL app override setting daily
uplink/downlink/point limits to 2 and uplink bytes to 252. Four equal-size
HTTPS reports and three logical commands exercise the shared UTC-day counter.
No production data, tenant, entitlement or clock is modified by this probe.
"""

import argparse
import importlib.util
import json
import secrets
import sys
import time
from pathlib import Path


HERE = Path(__file__).resolve().parent
LIMITS = {"UPLINK_MESSAGE": 2, "DOWNLINK_MESSAGE": 2,
          "UPLINK_BYTES": 252, "TIME_SERIES_POINT": 2}
STAGES = ("NORMAL", "HARD_LIMIT", "DEGRADED")


def base_module():
    path = HERE / "smoke-noncommercial-daily-v5b1.py"
    if not path.is_file():
        raise RuntimeError("V5b-1 基线探针缺失")
    spec = importlib.util.spec_from_file_location("v5b1_base", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def observed_quota(base, api, project, day, expected, stage):
    """Assert the API's authoritative tenant pool without claiming admission semantics."""
    response = api.call("GET", f"/api/v1/projects/{project}/quota")
    base.require(response.get("policyCode") == "NONCOMMERCIAL_TECHNICAL"
                 and response.get("windowStart") == day + "T00:00:00Z",
                 "配额策略或 UTC 日窗口错误")
    rows = {row["metric"]: row for row in response["tenantSharedPool"]["dailyMetrics"]
            if row.get("metric") in LIMITS}
    project_rows = {row["metric"]: row for row in response["project"]["dailyMetrics"]
                    if row.get("metric") in LIMITS}
    base.require(set(rows) == set(LIMITS) and set(project_rows) == set(LIMITS),
                 "配额投影缺失日指标")
    for metric, limit in LIMITS.items():
        row, part = rows[metric], project_rows[metric]
        base.require(row["limit"] == limit and part["limit"] == limit,
                     "临时技术限额未进入配额投影")
        base.require(row["used"] == expected[metric] and part["used"] == expected[metric],
                     "配额投影未匹配当日项目和租户事实")
        base.require(row["remaining"] == max(0, limit - expected[metric]),
                     "配额剩余额度不符")
        if metric in stage:
            base.require(row["status"] == stage[metric]
                         and part["status"] == stage[metric],
                         "日用量状态与已用/上限不符")
    return {metric: rows[metric]["status"] for metric in LIMITS}


def reconcile(base, pg, tenant, project, other_project, day):
    counted = base.wait_counters(pg, tenant, (project, other_project), (day,), seconds=150)
    own = counted[(project, day)]
    other = counted[(other_project, day)]
    base.require(all(value == 0 for value in other.values()),
                 "未用的同租户第二项目出现日用量")
    return own


def send_command(base, api, project, device, ordinal):
    route = f"/api/v1/projects/{project}/devices/{device['id']}/commands"
    response = api.call("POST", route,
                        {"commandKey": "v5b1_ping", "input": {"boundary": ordinal}},
                        202, {"Idempotency-Key": "v5b1-boundary-" + secrets.token_hex(12)})
    command_id = base.checked_uuid(response["id"])
    base.require(response.get("status") == "ACCEPTED", "逻辑下行命令未受理")
    return command_id


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", required=True)
    parser.add_argument("--candidate-jar", required=True)
    parser.add_argument("--candidate-sha256", required=True)
    args = parser.parse_args()
    base = base_module()
    deploy = Path(args.deploy_dir).expanduser().resolve()
    jar = Path(args.candidate_jar).expanduser().resolve()
    _, pg, limits = base.preflight(deploy, jar, args.candidate_sha256)
    base.require(limits == LIMITS, "须先把隔离 app 四项日限额临时设为 2/2/252/2")

    # Reuse the real registration and role/device setup from the baseline
    # probe. Its registration endpoint has a global 3-per-5-minute window.
    api = base.Api()
    for attempt in range(3):
        try:
            projects, devices = base.setup(api, pg, secrets.token_hex(5))
            break
        except base.ProbeError as error:
            if "POST /api/v1/auth/register 状态 429" not in str(error) or attempt == 2:
                raise
            print("V5b-1 boundary: 注册原有限流短窗已满，等待五分钟后重试", flush=True)
            time.sleep(305)

    project, other_project = projects[0][0], projects[1][0]
    tenant = base.owner(pg, project)
    device = devices[(1, "HTTP")]
    switched = api.call("POST", "/api/v1/auth/switch-project", {"projectId": project})
    api.token = switched["accessToken"]
    day = base.utc_now().date().isoformat()
    initial = reconcile(base, pg, tenant, project, other_project, day)
    base.require(all(value == 0 for value in initial.values()), "一次性租户初始日用量非零")
    observed_quota(base, api, project, day, initial,
                   {metric: "NORMAL" for metric in LIMITS})

    report_ids = []
    degraded_report = None
    for ordinal in range(1, 5):
        base.require(base.utc_now().date().isoformat() == day,
                     "跨越真实 UTC 午夜，不能按单日边界验收")
        # Fixed six-digit fraction and same-width numeric value hold every
        # device HTTP body at 126 bytes, making 252 an exact byte boundary.
        occurred = base.utc_now().replace(microsecond=123456)
        report = base.payload(base.uuid7(), occurred,
                              {"temperature": float(20 + ordinal)})
        raw = json.dumps(report, separators=(",", ":")).encode()
        base.require(len(raw) == 126, "固定报文字节长不符")
        returned = base.http_report(projects[0][1], device, report)
        base.require(returned == 126, "设备上行原始字节长变化")
        # The fourth report reaches ingestion with the previous 3/2 counter
        # already reconciled; therefore only its expensive historical point
        # is expected to stop, while inbox and message log remain durable.
        expected_points = 0 if ordinal == 4 else 1
        base.wait_message(pg, project, report["messageId"], expected_points, 126)
        report_ids.append(report["messageId"])
        actual = reconcile(base, pg, tenant, project, other_project, day)
        expected = {"UPLINK_MESSAGE": ordinal, "DOWNLINK_MESSAGE": 0,
                    "UPLINK_BYTES": 126 * ordinal,
                    "TIME_SERIES_POINT": min(ordinal, 3)}
        base.require(actual == expected, "上行边界源事实与异步计数不符")
        stage = STAGES[ordinal - 1] if ordinal <= 3 else "DEGRADED"
        status = observed_quota(base, api, project, day, expected,
                                {"UPLINK_MESSAGE": stage,
                                 "UPLINK_BYTES": stage,
                                 "TIME_SERIES_POINT": stage})
        base.require(status["DOWNLINK_MESSAGE"] == "NORMAL", "无下行时状态应正常")
        if ordinal == 4:
            degraded_report = report

    base.require(degraded_report is not None, "降级报文未建立")
    base.require(base.http_report(projects[0][1], device, degraded_report) == 126,
                 "降级报文精确重放失败")
    base.wait_message(pg, project, degraded_report["messageId"], 0, 126)
    retained = reconcile(base, pg, tenant, project, other_project, day)
    base.require(retained == {"UPLINK_MESSAGE": 4, "DOWNLINK_MESSAGE": 0,
                              "UPLINK_BYTES": 504, "TIME_SERIES_POINT": 3},
                 "降级报文重放改变幂等事实或用量")

    command_ids = []
    for ordinal in range(1, 4):
        base.require(base.utc_now().date().isoformat() == day,
                     "跨越真实 UTC 午夜，不能按单日边界验收")
        command_ids.append(send_command(base, api, project, device, ordinal))
        actual = reconcile(base, pg, tenant, project, other_project, day)
        expected = {"UPLINK_MESSAGE": 4, "DOWNLINK_MESSAGE": ordinal,
                    "UPLINK_BYTES": 504, "TIME_SERIES_POINT": 3}
        base.require(actual == expected, "逻辑下行边界源事实与计数不符")
        observed_quota(base, api, project, day, expected,
                       {"DOWNLINK_MESSAGE": STAGES[ordinal - 1]})

    # Three accepted command facts are the billable units even if dispatch
    # later attempts or claims them repeatedly. Re-read after a short delay.
    time.sleep(3)
    final = reconcile(base, pg, tenant, project, other_project, day)
    base.require(final == expected and len(set(command_ids)) == 3,
                 "下行重试改变逻辑命令计量")
    _, _, after = base.preflight(deploy, jar, args.candidate_sha256, LIMITS)
    base.require(after == LIMITS, "边界验收期间运行限额改变")
    print(json.dumps({"result": "PASS", "candidateSha256": args.candidate_sha256,
                      "tenant": tenant, "project": project, "utcDay": day,
                      "limits": LIMITS, "todayUsed": final,
                      "reportCount": len(report_ids), "logicalCommandCount": len(command_ids),
                      "degradedReportRetainedInboxAndLog": True,
                      "degradedReportHistoricalPoints": 0,
                      "degradedReportReplayStable": True,
                      "unverified": ["real UTC midnight crossing",
                                     "all ingress protocols under DEGRADED",
                                     "synchronous refusal for logical downlink commands"]},
                     sort_keys=True))


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        base_error = str(error)
        # The base probe's explicit errors contain no credential or body;
        # unexpected external exception text is deliberately suppressed.
        if error.__class__.__name__ != "ProbeError":
            base_error = "探针运行失败，需核对隔离环境与响应结构"
        print("V5b-1 boundary FAIL: " + base_error, file=sys.stderr)
        sys.exit(1)
