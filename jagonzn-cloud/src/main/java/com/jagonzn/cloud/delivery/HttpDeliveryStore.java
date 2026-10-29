package com.jagonzn.cloud.delivery;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.ObjectMapper;

/** Inbox到出站任务的持久交接及租约；所有事实限定在cloud自己的数据库。 */
@Component
public class HttpDeliveryStore {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final TransactionTemplate transaction;
    public record Attempt(UUID id,UUID eventId,HttpDeliveryTarget target,String body,int number,UUID lease){ }
    public HttpDeliveryStore(JdbcTemplate jdbc,ObjectMapper json,PlatformTransactionManager manager){this.jdbc=jdbc;this.json=json;transaction=new TransactionTemplate(manager);}
    /** 相同来源事件及目标最多生成一份任务；并发和重复接收均不重建正文。 */
    public int materialize(HttpDeliveryTarget target){
        return transaction.execute(status->{
            var arguments=new ArrayList<Object>();arguments.add(target.id());arguments.add(target.sourceDeploymentId());arguments.add(target.tenantId());arguments.add(target.projectId());arguments.addAll(target.eventTypes());
            String placeholders=String.join(",",java.util.Collections.nCopies(target.eventTypes().size(),"?"));
            var events=jdbc.query("SELECT i.event_id,i.event_body::text FROM cloud_service_event_inbox i LEFT JOIN cloud_http_log_delivery d ON d.source_deployment_id=i.source_deployment_id AND d.event_id=i.event_id AND d.target_id=? WHERE i.source_deployment_id=? AND i.tenant_id=? AND i.project_id=? AND i.event_type IN ("+placeholders+") AND d.id IS NULL ORDER BY i.received_at,i.event_id LIMIT 100",
                (row,index)->new String[]{row.getString(1),row.getString(2)},arguments.toArray());
            int count=0;
            for(var event:events){String body;String state="PENDING",failure=null;
                try{body=target.body(json.readTree(event[1]),json);if(body.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>262144)throw new IllegalArgumentException();}
                catch(RuntimeException invalid){body="{}";state="FAILED";failure="MAPPING_OR_SIZE_INVALID";}
                count+=jdbc.update("INSERT INTO cloud_http_log_delivery(id,source_deployment_id,event_id,target_id,target_revision,target_snapshot,request_body,state,failure_code) VALUES (?,?,?,?,?,?::jsonb,?,?,?) ON CONFLICT(source_deployment_id,event_id,target_id) DO NOTHING",
                    UUID.randomUUID(),target.sourceDeploymentId(),UUID.fromString(event[0]),target.id(),target.revision(),json.writeValueAsString(target),body,state,failure);
            }return count;
        });
    }
    /** 每次只领取一份，网络请求在事务外执行；不同实例不会同时领取同一租约。 */
    public Attempt claim(HttpDeliveryTarget current){
        return transaction.execute(status->{
            UUID lease=UUID.randomUUID();
            var rows=jdbc.query("UPDATE cloud_http_log_delivery SET state='SENDING',attempt_count=attempt_count+1,lease_token=?,lease_until=clock_timestamp()+interval '45 seconds',updated_at=clock_timestamp() WHERE id=(SELECT d.id FROM cloud_http_log_delivery d JOIN cloud_service_event_inbox i ON i.source_deployment_id=d.source_deployment_id AND i.event_id=d.event_id WHERE d.target_id=? AND d.source_deployment_id=? AND d.target_snapshot->>'tenantId'=? AND d.target_snapshot->>'projectId'=? AND d.state IN ('PENDING','RETRY_WAIT') AND d.next_attempt_at<=clock_timestamp() ORDER BY i.received_at,d.created_at,d.id FOR UPDATE OF d SKIP LOCKED LIMIT 1) RETURNING id,event_id,target_snapshot::text,request_body,attempt_count",
                (row,index)->new Attempt(row.getObject(1,UUID.class),row.getObject(2,UUID.class),json.readValue(row.getString(3),HttpDeliveryTarget.class),row.getString(4),row.getInt(5),lease),lease,current.id(),current.sourceDeploymentId(),current.tenantId().toString(),current.projectId().toString());
            return rows.isEmpty()?null:rows.getFirst();
        });
    }
    /** 原租约失效的发送不冒充当前成功；响应正文已在调用方脱敏并限制容量。 */
    public boolean complete(Attempt attempt,String state,Integer http,String response,String failure){
        int delay=Math.min(300,1<<Math.min(attempt.number(),8));
        return jdbc.update("UPDATE cloud_http_log_delivery SET state=?,http_status=?,response_body=?,failure_code=?,next_attempt_at=clock_timestamp()+(? * interval '1 second'),lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp() WHERE id=? AND state='SENDING' AND lease_token=?",
            state,http,response,failure,delay,attempt.id(),attempt.lease())==1;
    }
    /** 崩溃后的发送可能已到达对方：无幂等合同则保留UNCERTAIN，禁止盲重发。 */
    public int recover(){
        return jdbc.update("UPDATE cloud_http_log_delivery SET state=CASE WHEN (target_snapshot->>'idempotencySupported')::boolean AND attempt_count<(target_snapshot->>'maxAttempts')::int THEN 'RETRY_WAIT' ELSE 'UNCERTAIN' END,failure_code='LEASE_EXPIRED_RESULT_UNKNOWN',lease_token=NULL,lease_until=NULL,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE state='SENDING' AND lease_until<clock_timestamp()");
    }
}
