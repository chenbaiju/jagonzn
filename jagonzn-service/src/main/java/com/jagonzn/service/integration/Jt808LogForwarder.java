package com.jagonzn.service.integration;

import com.jagonzn.service.extension.jt808.Jt808LogJournal;
import com.things.link.support.notification.delivery.WebhookSignatures;
import java.net.URI;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.LoggerFactory;

/** 协议扩展自己的日志交付适配；复用已验签cloud入口，不要求开启平台属性以外的上行入口。 */
@Component
@ConditionalOnProperty(name="jagonzn.jt808.logs.delivery-enabled",havingValue="true")
public final class Jt808LogForwarder {
    private final Jt808LogJournal journal;
    private final ObjectMapper json;
    private final URI target;
    private final UUID source;
    private final String keyId;
    private final byte[] secret;
    private final Jt808LogDeliveryScope scope;
    private final PrivateCloudEventForwarder.Transport transport;
    private final java.util.concurrent.atomic.AtomicBoolean busy=new java.util.concurrent.atomic.AtomicBoolean();
    private final java.util.concurrent.ExecutorService dispatcher=java.util.concurrent.Executors.newSingleThreadExecutor(r->{var thread=new Thread(r,"jagonzn-jt808-log-delivery");thread.setDaemon(true);return thread;});
    @org.springframework.beans.factory.annotation.Autowired
    public Jt808LogForwarder(Jt808LogJournal journal,ObjectMapper json,
            @Value("${jagonzn.cloud.private-delivery.url:}") String url,
            @Value("${jagonzn.cloud.private-delivery.source-deployment-id:}") String source,
            @Value("${jagonzn.cloud.private-delivery.key-id:}") String keyId,
            @Value("${jagonzn.cloud.private-delivery.secret-base64:}") String secret,Jt808LogDeliveryScope scope){
        this(journal,json,url,source,keyId,secret,scope,new PrivateCloudEventForwarder.HttpsTransport());
    }
    Jt808LogForwarder(Jt808LogJournal journal,ObjectMapper json,String url,String source,String keyId,String secret,Jt808LogDeliveryScope scope,PrivateCloudEventForwarder.Transport transport){
        this.journal=journal;this.json=json;this.target=URI.create(url);this.source=UUID.fromString(source);this.keyId=keyId;this.secret=Base64.getDecoder().decode(secret);this.transport=transport;
        if(!"https".equals(target.getScheme())||target.getHost()==null||target.getUserInfo()!=null||target.getQuery()!=null||target.getFragment()!=null||!"/api/v1/internal/service-events".equals(target.getPath())||!keyId.matches("[A-Za-z0-9_-]{1,32}")||this.secret.length!=32)throw new IllegalArgumentException("JT808日志cloud交付配置无效");
        this.scope=java.util.Objects.requireNonNull(scope);scope.requireBinding(journal,target,this.source);
    }
    /** 周期性补交原件；cloud失败只留存待交付，不阻塞设备线程或更换业务事件ID。 */
    @Scheduled(fixedDelayString="${jagonzn.jt808.logs.poll-millis:5000}")
    public void trigger(){
        if(!busy.compareAndSet(false,true))return;
        try{dispatcher.execute(()->{try{flush();}catch(RuntimeException failure){LoggerFactory.getLogger(getClass()).warn("日志后台交付失败，保留原件");}finally{busy.set(false);}});}
        catch(java.util.concurrent.RejectedExecutionException closing){busy.set(false);}
    }
    /** 同步推进一轮，仅在专属执行器运行，慢cloud不会占用平台原调度线程。 */
    public void flush(){
        scope.requireCurrent();
        for(var entry:journal.pending(scope::includes)){
            if(Thread.currentThread().isInterrupted())return;
            scope.requireCurrent();
            try{
                var event=json.readTree(entry.json());UUID id=UUID.fromString(event.path("eventId").asText());
                byte[] body=json.writeValueAsBytes(java.util.Map.of("deliveryId",id.toString(),"event",event));
                String nonce=UUID.randomUUID().toString();long timestamp=Instant.now().getEpochSecond();
                String signature=WebhookSignatures.sign(secret,timestamp,nonce,id,body);
                LoggerFactory.getLogger(getClass()).info("锁具日志发送到cloud eventId={} json={}",id,entry.json());
                int response=transport.post(target,source,keyId,timestamp,nonce,id,signature,body);
                if(response==200){journal.accepted(entry);LoggerFactory.getLogger(getClass()).info("cloud已持久接收锁具日志 eventId={} HTTP=200",id);}
                else LoggerFactory.getLogger(getClass()).warn("cloud日志接收未确认 eventId={} HTTP={}",id,response);
            }catch(RuntimeException failed){LoggerFactory.getLogger(getClass()).warn("cloud日志交付结果未知，保留原件");}
        }
    }
    /** 密钥仅存活于私有配置及内存，关闭时清零。 */
    @jakarta.annotation.PreDestroy public void close(){dispatcher.shutdownNow();try{dispatcher.awaitTermination(5,java.util.concurrent.TimeUnit.SECONDS);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();}java.util.Arrays.fill(secret,(byte)0);}
}
