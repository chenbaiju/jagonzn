package com.jagonzn.service.integration;

import com.jagonzn.service.extension.jt808.Jt808LogJournal;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 独立私有范围文件限定发送事实；目录环境变量改变不能自动扩大成历史补交。 */
@Component
@ConditionalOnProperty(name="jagonzn.jt808.logs.delivery-enabled",havingValue="true")
public final class Jt808LogDeliveryScope {
    private static final Set<String> FIELDS=Set.of("schemaVersion","scopeId","mode","journalDirectory","cloudUrl",
            "sourceDeploymentId","tenantId","projectId","deviceId","afterSequence","receivedNotBefore","receivedNotAfter","logTypes");
    private final Jt808LogJournal journal;
    private final ObjectMapper json;
    private final Path file;
    private final String digest;
    private final UUID scopeId,source,tenant,project,device;
    private final URI target;
    private final long afterSequence;
    private final Instant from,through;
    private final Set<String> logTypes;

    public Jt808LogDeliveryScope(Jt808LogJournal journal,ObjectMapper json,
            @Value("${jagonzn.jt808.logs.delivery-scope-file:}") String file,
            @Value("${jagonzn.cloud.private-delivery.url:}") String url,
            @Value("${jagonzn.cloud.private-delivery.source-deployment-id:}") String source){
        this.journal=journal;this.json=json;
        try{
            Path path=Path.of(file);if(!path.isAbsolute())throw new IllegalArgumentException();
            this.file=path.toRealPath();
            if(Files.isSymbolicLink(path)||!this.file.startsWith(journal.externalRoot()))throw new IllegalArgumentException();
            byte[] bytes=readPrivate();digest=hash(bytes);JsonNode value=json.readTree(bytes);
            if(!value.isObject()||!value.propertyNames().equals(FIELDS)||!value.path("schemaVersion").isIntegralNumber()
                    ||value.path("schemaVersion").decimalValue().intValueExact()!=1||!"NEW_ONLY".equals(text(value,"mode")))throw new IllegalArgumentException();
            scopeId=uuid(value,"scopeId");this.source=uuid(value,"sourceDeploymentId");tenant=uuid(value,"tenantId");project=uuid(value,"projectId");device=uuid(value,"deviceId");
            Path pinned=Path.of(text(value,"journalDirectory"));
            if(!pinned.isAbsolute()||!pinned.equals(pinned.toRealPath())||!pinned.equals(journal.directory()))throw new IllegalArgumentException();
            target=URI.create(text(value,"cloudUrl"));
            if(!"https".equals(target.getScheme())||target.getHost()==null||target.getUserInfo()!=null||target.getQuery()!=null||target.getFragment()!=null
                    ||!"/api/v1/internal/service-events".equals(target.getPath())||!target.equals(URI.create(url))||!this.source.equals(UUID.fromString(source)))throw new IllegalArgumentException();
            var sequence=value.path("afterSequence");if(!sequence.isIntegralNumber())throw new IllegalArgumentException();
            afterSequence=sequence.decimalValue().longValueExact();if(afterSequence<0||afterSequence==Long.MAX_VALUE)throw new IllegalArgumentException();
            from=Instant.parse(text(value,"receivedNotBefore"));through=Instant.parse(text(value,"receivedNotAfter"));if(!from.isBefore(through))throw new IllegalArgumentException();
            var types=value.path("logTypes");if(!types.isArray()||types.isEmpty()||types.size()>32)throw new IllegalArgumentException();
            var names=new java.util.HashSet<String>();
            for(JsonNode type:types){if(!type.isString()||!type.asText().matches("[A-Z][A-Z0-9_]{0,63}")||!names.add(type.asText()))throw new IllegalArgumentException();}
            logTypes=Set.copyOf(names);
            journal.bindDeliveryScope(scopeId,digest,afterSequence);
        }catch(Exception invalid){throw new IllegalStateException("JT808发送范围缺失、目录/目标不匹配或首次序号无效，禁止启动自动交付");}
    }

    /** 发送器必须使用本范围绑定的同一个日志实例、来源和目标，不能借已确认对象绕过配置比对。 */
    public void requireBinding(Jt808LogJournal journal,URI target,UUID source){
        if(this.journal!=journal||!this.target.equals(target)||!this.source.equals(source))throw new IllegalStateException("JT808发送器与已确认范围不匹配");
        requireCurrent();
    }
    /** 文件修改、删除或权限改变后不继续使用内存旧配置发送；确认原件保留以便核对。 */
    public void requireCurrent(){
        try{if(!hash(readPrivate()).equals(digest))throw new IllegalArgumentException();journal.requireDeliveryScope(scopeId,digest);}
        catch(Exception changed){throw new IllegalStateException("JT808发送范围已改变，停止发送并保留原件");}
    }
    /** 只选择范围内的新事实；不为历史、其他身份、其他类型或时间窗口外的日志写签收标记。 */
    public boolean includes(Jt808LogJournal.Entry entry){
        JsonNode event=json.readTree(entry.json());var sequence=event.path("sourceSequence");
        if(!sequence.isIntegralNumber())throw new IllegalStateException("JT808日志序号无效，停止本批发送");
        long number=sequence.decimalValue().longValueExact();if(number<1)throw new IllegalStateException("JT808日志序号无效，停止本批发送");
        return number>afterSequence&&"jagonzn.lock.log".equals(text(event,"eventType"))
                &&tenant.equals(uuid(event,"tenantId"))&&project.equals(uuid(event,"projectId"))&&device.equals(uuid(event,"deviceId"))
                &&logTypes.contains(text(event.path("payload"),"logType"))&&within(Instant.parse(text(event,"receivedAt")));
    }
    private boolean within(Instant received){return !received.isBefore(from)&&!received.isAfter(through);}
    private byte[] readPrivate() throws java.io.IOException {
        if(Files.isSymbolicLink(file)||!Files.isRegularFile(file)||!file.toRealPath().equals(file)||Files.size(file)>16384
                ||!Files.getPosixFilePermissions(file).equals(PosixFilePermissions.fromString("rw-------"))
                ||!Files.getOwner(file).getName().equals(System.getProperty("user.name")))throw new IllegalArgumentException();
        return Files.readAllBytes(file);
    }
    private static String text(JsonNode value,String name){var field=value.path(name);if(!field.isString()||field.asText().isBlank())throw new IllegalArgumentException();return field.asText();}
    private static UUID uuid(JsonNode value,String name){String raw=text(value,name);UUID result=UUID.fromString(raw);if(!result.toString().equals(raw))throw new IllegalArgumentException();return result;}
    private static String hash(byte[] bytes) throws java.security.NoSuchAlgorithmException {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
}
