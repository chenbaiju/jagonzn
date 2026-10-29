package com.jagonzn.cloud.work;

import com.jagonzn.cloud.delivery.HttpDeliveryAudit;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

/** 接口1只接收作业参数并保存JSON日志；不关联设备命令、不自动执行计划。 */
@RestController
@ConditionalOnProperty(name="jagonzn.cloud.work-tasks.enabled",havingValue="true")
public final class WorkUnlockTaskController {
    private final WorkUnlockTaskJournal journal;
    private final ObjectMapper json;
    private final HttpDeliveryAudit audit;
    public record Result(int code,String msg){ }
    public WorkUnlockTaskController(WorkUnlockTaskJournal journal,ObjectMapper json,HttpDeliveryAudit audit){
        this.journal=journal;this.json=json;this.audit=audit;
    }
    /** 无需身份、令牌、用户或租户上下文，校验POST作业JSON并确认外置日志持久化后返回code/msg。 */
    @PostMapping(value={"/azy/task/receiveSafetyProSystemTask","/api/v1/partner/work-unlock-tasks"},consumes="application/json",produces="application/json")
    public ResponseEntity<Result> receive(HttpServletRequest request){
        byte[] body;
        try{
            body=request.getInputStream().readNBytes(65537);if(body.length==0||body.length>65536)return failure(400);
            WorkUnlockTaskRequest.parse(json.readTree(body));
        }catch(Exception invalid){audit.record("作业任务接收失败_参数无效","request","{}");return failure(400);}
        java.util.UUID receipt;
        try{receipt=journal.append(body);}catch(RuntimeException unavailable){audit.record("作业任务接收失败_日志未持久确认","request","{}");return failure(503);}
        // 控制台沿用手机号脱敏；完整原始JSON保存在专属0600日志文件，不因异步Logback丢失原件。
        audit.record("接收成功_作业任务JSON已持久保存",receipt.toString(),new String(body,StandardCharsets.UTF_8));
        return ResponseEntity.ok(new Result(200,"成功"));
    }
    private ResponseEntity<Result> failure(int status){return ResponseEntity.status(status).body(new Result(500,"失败"));}
}
