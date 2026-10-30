package com.jagonzn.service.extension.jt808;

import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import tools.jackson.databind.*;

/** 仅调用现有管理GET，确认当前主体、设备版本和命令事实；任何读取失败均拒绝物理控制。 */
public final class Jt808RemoteManagement {
    @FunctionalInterface public interface Reader { JsonNode get(String path); }
    private final Jt808RemoteSettings settings;private final Jt808DeviceBinding binding;private final Reader reader;
    public Jt808RemoteManagement(Jt808RemoteSettings settings,Jt808DeviceBinding binding,ObjectMapper json){this(settings,binding,httpReader(settings,json));}
    Jt808RemoteManagement(Jt808RemoteSettings settings,Jt808DeviceBinding binding,Reader reader){this.settings=settings;this.binding=binding;this.reader=reader;}
    private static Reader httpReader(Jt808RemoteSettings s,ObjectMapper json){
        var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
        return path->{try{
            s.requireCurrent();var request=HttpRequest.newBuilder(URI.create(s.api.toString().replaceAll("/$","")+path)).timeout(Duration.ofSeconds(3)).header("Authorization","Bearer "+s.token()).GET().build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofInputStream());
            try(var stream=response.body()){
                byte[] bytes=stream.readNBytes(1048577);
                if(response.statusCode()!=200){
                    // 仅输出状态和请求路径，不记录Bearer令牌或远端响应正文。
                    org.slf4j.LoggerFactory.getLogger(Jt808RemoteManagement.class).warn("JT808远程管理读取失败 status={} path={}",response.statusCode(),path);
                    throw new IllegalStateException();
                }
                if(bytes.length>1048576)throw new IllegalStateException();return json.readTree(bytes);
            }
        }catch(Exception failure){if(failure instanceof InterruptedException)Thread.currentThread().interrupt();throw new IllegalStateException("远程管理读取失败，未准许控制");}};
    }
    String prefix(){return "/api/v1/projects/"+settings.project+"/devices/"+settings.device;}
    /** 真实租户/当前项目来自已认证me，项目必须为当前租户OWNER，凭据和配置版本逐次核对。 */
    public void verify(){
        settings.requireCurrent();var reads=independentReads();var me=reads.get("/api/v1/auth/me");
        require(me.path("accountId").asText().equals(settings.account.toString())&&me.path("tenantId").asText().equals(settings.tenant.toString())&&me.path("currentProjectId").asText().equals(settings.project.toString())&&me.path("projectRole").asText().equals("OWNER"));
        var projects=reads.get("/api/v1/projects");require(projects.isArray());JsonNode project=null;
        for(var candidate:projects)if(candidate.path("id").asText().equals(settings.project.toString())){require(project==null);project=candidate;}require(project!=null);
        require(project.path("id").asText().equals(settings.project.toString())&&project.path("projectKey").asText().equals(binding.projectKey())&&project.path("myRole").asText().equals("OWNER")&&project.path("status").asText().equals("ACTIVE"));
        var device=reads.get(prefix());require(device.path("id").asText().equals(settings.device.toString())&&device.path("deviceKey").asText().equals(binding.deviceKey())&&(device.path("gatewayId").isNull()||device.path("gatewayId").isMissingNode()));
        var type=reader.get("/api/v1/projects/"+settings.project+"/device-types/"+device.path("deviceTypeId").asText());require(type.path("projectId").asText().equals(settings.project.toString())&&type.path("deviceKind").asText().equals("DIRECT"));
        var config=reads.get(prefix()+"/access-config");require(config.path("protocol").asText().equals("MQTT")&&config.path("enabled").asBoolean()&&config.path("credentialVersion").asText().equals(Long.toString(settings.credentialVersion))&&config.path("configVersion").asText().equals(settings.configVersion));
        var model=reads.get(prefix()+"/thing-model-binding");require(model.path("deviceId").asText().equals(settings.device.toString())&&model.path("version").path("versionNumber").asText().equals(binding.modelVersion()));
    }
    /** 独立GET并发读取，类型读取仍依赖真实设备返回；不缓存或省略权限、身份和版本校验。 */
    private Map<String,JsonNode> independentReads(){
        try(var executor=java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()){
            var pending=new LinkedHashMap<String,java.util.concurrent.Future<JsonNode>>();
            for(String path:List.of("/api/v1/auth/me","/api/v1/projects",prefix(),prefix()+"/access-config",prefix()+"/thing-model-binding"))pending.put(path,executor.submit(()->reader.get(path)));
            var result=new HashMap<String,JsonNode>();
            for(var entry:pending.entrySet())result.put(entry.getKey(),entry.getValue().get());
            return result;
        }catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new IllegalStateException("远程管理核验被中断");}
        catch(java.util.concurrent.ExecutionException failed){throw new IllegalStateException("远程管理读取失败，未准许控制");}
    }
    /** 取回原命令；查询权限由平台控制，不能从MQTT正文推断实际状态或有效期。 */
    public JsonNode command(UUID id){verify();return reader.get(prefix()+"/commands/"+id);}
    static void require(boolean condition){if(!condition)throw new IllegalStateException("远程身份、版本或命令事实不匹配");}
}
