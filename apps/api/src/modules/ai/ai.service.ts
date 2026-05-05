import { Injectable } from "@nestjs/common";
import { assertString, normalizeSubTasks, SUB_TASK_MAX_COUNT } from "../../common/utils/domain-utils";

@Injectable()
export class AiService {
  splitSubTasksByAi(payload: Record<string, unknown>) {
    const title = String(payload.title || "").trim();
    const remark = String(payload.remark || "").trim();
    assertString(title || remark, "任务标题或备注", { required: true, minLen: 1, maxLen: 300 });
    const maxCount = Math.min(Number(payload.maxCount) || SUB_TASK_MAX_COUNT, SUB_TASK_MAX_COUNT);

    const segments = `${title}\n${remark}`
      .split(/[\n。；;！!？?,，]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, maxCount);

    const raw = segments.length
      ? segments.map((item) => ({ title: item }))
      : [
          { title: title || "拆分步骤1" },
          { title: remark ? `处理：${remark.slice(0, 20)}` : "拆分步骤2" },
        ];

    const subTasks = normalizeSubTasks(raw, true, false).slice(0, maxCount);
    return {
      subTasks,
      provider: "rule-based-fallback",
    };
  }
}
