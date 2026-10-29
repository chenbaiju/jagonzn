package com.jagonzn.cloud.delivery;

import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import tools.jackson.databind.ObjectMapper;

/** 第三方故障只影响自身持久任务，不在设备上报或Inbox受理线程同步调用第三方。 */
@Component
public class HttpDeliveryWorker {
    private final HttpDeliveryConfiguration config;
    private final HttpDeliveryStore store;
    private final JsonHttpTransport transport;
    private final ObjectMapper json;
    private final HttpDeliveryAudit audit;
    private final java.util.concurrent.atomic.AtomicBoolean busy=new java.util.concurrent.atomic.AtomicBoolean();
    private final java.util.concurrent.ExecutorService dispatcher=java.util.concurrent.Executors.newSingleThreadExecutor(r->{var thread=new Thread(r,"jagonzn-http-log-delivery");thread.setDaemon(true);return thread;});
    public HttpDeliveryWorker(HttpDeliveryConfiguration config,HttpDeliveryStore store,JsonHttpTransport transport,ObjectMapper json,HttpDeliveryAudit audit){this.config=config;this.store=store;this.transport=transport;this.json=json;this.audit=audit;}
    /** 无目标时不创建失败任务；已配置目标逐个物化并使用独立任务状态。 */
    @Scheduled(fixedDelayString="${jagonzn.cloud.http-delivery.poll-millis:1000}")
    public void trigger(){
        if(config.targets().isEmpty()||!busy.compareAndSet(false,true))return;
        try{dispatcher.execute(()->{try{tick();}catch(RuntimeException failure){audit.record("后台投递失败","worker","{}");}finally{busy.set(false);}});}
        catch(java.util.concurrent.RejectedExecutionException closing){busy.set(false);}
    }
    /** 慢网络只占用专属发送执行器，不阻塞cloud默认维护调度；测试可同步调用一轮。 */
    public void tick(){
        if(config.targets().isEmpty())return;
        store.recover();
        // 每个目标独立推进，慢目标不会阻止其他接收方开始处理。
        try(var tasks=java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()){
            var futures=new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for(var target:config.targets())futures.add(tasks.submit(()->{
                try{store.materialize(target);for(int n=0;n<10&&!Thread.currentThread().isInterrupted();n++){var attempt=store.claim(target);if(attempt==null)break;deliver(attempt);}}
                catch(RuntimeException failure){audit.record("目标处理失败",target.id(),"{\"error\":\"DELIVERY_WORKER_FAILED\"}");}
            }));
            for(var future:futures)try{future.get();}catch(InterruptedException interrupted){Thread.currentThread().interrupt();return;}catch(java.util.concurrent.ExecutionException failed){audit.record("投递任务失败","worker","{}");}
        }
    }
    /** 真正响应满足合同且投递状态提交成功后，才打印发送成功。 */
    public void deliver(HttpDeliveryStore.Attempt attempt){
        String id=attempt.id().toString();var target=attempt.target();
        audit.record("发送请求 "+target.method(),id,attempt.body());
        JsonHttpTransport.Response response;
        try{response=transport.send(target,attempt.eventId().toString(),attempt.body());}
        catch(java.io.IOException unknown){store.complete(attempt,retryState(attempt),null,null,"IO_RESULT_UNKNOWN");audit.record("发送结果未知",id,"{}");return;}
        catch(RuntimeException invalid){store.complete(attempt,"FAILED",null,null,"LOCAL_CONFIGURATION_INVALID");audit.record("发送配置失败",id,"{}");return;}
        String safe=audit.safe(response.body());audit.record("接收响应 HTTP_"+response.status(),id,response.body());
        // HTTP响应已收到后，数据库提交失败不能被重新归类成发送配置错误；保留租约供恢复核对。
        if(target.success(response.status(),response.body(),json)){
            if(store.complete(attempt,"DELIVERED",response.status(),safe,null))audit.record("发送成功_第三方已按合同接收",id,attempt.body());
            return;
        }
        String state;
        if(response.status()==202)state="UNCERTAIN";
        else if(response.status()==429||response.status()>=500)state=retryState(attempt);
        else state="FAILED";
        store.complete(attempt,state,response.status(),safe,"HTTP_OR_BUSINESS_REJECTED");
    }

    /** 停止本实例发送线程，未完成租约仍由持久状态机恢复。 */
    @jakarta.annotation.PreDestroy public void close(){dispatcher.shutdownNow();}
    private String retryState(HttpDeliveryStore.Attempt attempt){
        if(!attempt.target().idempotencySupported())return "UNCERTAIN";
        return attempt.number()<attempt.target().maxAttempts()?"RETRY_WAIT":"FAILED";
    }
}
