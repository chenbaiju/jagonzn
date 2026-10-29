package com.jagonzn.cloud.delivery;

import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import org.springframework.stereotype.Component;

/** 固定管理员目标的有界HTTP传输，禁止重定向；HTTPS使用系统受信证书链。 */
@Component
public class JsonHttpTransport {
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER).version(HttpClient.Version.HTTP_1_1)
            .proxy(new ProxySelector(){
                @Override public List<Proxy> select(URI uri){return List.of(Proxy.NO_PROXY);}
                @Override public void connectFailed(URI uri,SocketAddress address,java.io.IOException failure){ }
            }).build();
    public record Response(int status,String body){ }
    /** 任务层拥有重试；超时不能伪造对方未收到，响应订阅全过程限制64KiB。 */
    public Response send(HttpDeliveryTarget target,String eventId,String body) throws java.io.IOException {
        var request=HttpRequest.newBuilder(target.url()).timeout(Duration.ofSeconds(target.timeoutSeconds()))
                .header("Content-Type","application/json; charset=utf-8")
                .header("X-Jagonzn-Event-Id",eventId)
                .header("Idempotency-Key",target.sourceDeploymentId()+":"+eventId+":"+target.id());
        target.headers().forEach(request::header);
        target.secretHeaderEnvironment().forEach((header,environment)->{
            String secret=System.getenv(environment);
            if(secret==null||secret.isBlank()||secret.contains("\r")||secret.contains("\n"))throw new IllegalStateException("投递认证环境变量缺失或无效");
            request.header(header,secret);
        });
        request.method(target.method(),HttpRequest.BodyPublishers.ofString(body,StandardCharsets.UTF_8));
        try{
            var response=client.send(request.build(),info->new LimitedBody());
            return new Response(response.statusCode(),new String(response.body(),StandardCharsets.UTF_8));
        }catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new java.io.IOException("投递中断，结果未知");}
    }
    /** 关闭专属HTTP客户端，不保留应用停止后的连接池线程。 */
    @jakarta.annotation.PreDestroy public void close(){client.close();}
    /** 超长响应立即取消，不把整个响应先读入内存后再检查容量。 */
    private static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result=new CompletableFuture<>();
        private final java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream();
        private Flow.Subscription subscription;
        @Override public CompletionStage<byte[]> getBody(){return result;}
        @Override public void onSubscribe(Flow.Subscription value){subscription=value;value.request(1);}
        @Override public void onNext(List<ByteBuffer> chunks){
            for(ByteBuffer chunk:chunks){
                if(bytes.size()+chunk.remaining()>65536){subscription.cancel();result.completeExceptionally(new java.io.IOException("第三方响应超过有界容量"));return;}
                byte[] part=new byte[chunk.remaining()];chunk.get(part);bytes.writeBytes(part);
            }subscription.request(1);
        }
        @Override public void onError(Throwable error){result.completeExceptionally(error);}
        @Override public void onComplete(){result.complete(bytes.toByteArray());}
    }
}
