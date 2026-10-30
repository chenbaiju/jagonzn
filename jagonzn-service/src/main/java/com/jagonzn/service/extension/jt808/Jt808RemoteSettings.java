package com.jagonzn.service.extension.jt808;

import java.net.URI;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import tools.jackson.databind.ObjectMapper;

/** 私有范围文件固定远程身份、目标及新事件窗口；不读取个人登录密码或继承旧日志目录。 */
public final class Jt808RemoteSettings {
    private static final Set<String> FIELDS=Set.of("schemaVersion","scopeId","apiOrigin","brokerUri","clientId","tenantId","projectId","deviceId","accountId","credentialVersion","configVersion","managementTokenFile","stateDirectory","outboxDirectory","journalDirectory","receivedNotBefore","receivedNotAfter","controlsEnabled");
    private final Path file,root; private final String digest;
    final URI api,broker; final String clientId,configVersion; final UUID scope,tenant,project,device,account;
    final long credentialVersion; final Path tokenFile,stateDirectory,outboxDirectory,journalDirectory;
    final Instant from,through; final boolean controls;
    /** 加载独立0600配置；仅允许已核对的HTTPS和TLS Broker，同一主机，且状态目录分离。 */
    public Jt808RemoteSettings(Path root,Path file,ObjectMapper json){
        try{
            this.root=root.toRealPath();this.file=file.toRealPath();privateFile(file);byte[] bytes=Files.readAllBytes(file);digest=hash(bytes);
            var v=json.readTree(bytes);if(!v.isObject()||!v.propertyNames().equals(FIELDS)||v.path("schemaVersion").asInt()!=1)throw new IllegalArgumentException();
            scope=UUID.fromString(text(v,"scopeId"));tenant=UUID.fromString(text(v,"tenantId"));project=UUID.fromString(text(v,"projectId"));device=UUID.fromString(text(v,"deviceId"));account=UUID.fromString(text(v,"accountId"));
            api=URI.create(text(v,"apiOrigin"));broker=URI.create(text(v,"brokerUri"));
            if(!"https".equals(api.getScheme())||api.getHost()==null||!(api.getPath().isEmpty()||api.getPath().equals("/"))||api.getRawQuery()!=null||api.getFragment()!=null||api.getUserInfo()!=null
                    ||!"ssl".equals(broker.getScheme())||!api.getHost().equals(broker.getHost())||broker.getPort()<1||!broker.getPath().isEmpty()||broker.getUserInfo()!=null||broker.getQuery()!=null||broker.getFragment()!=null)throw new IllegalArgumentException();
            clientId=text(v,"clientId");if(!clientId.matches("[A-Za-z0-9_-]{1,64}"))throw new IllegalArgumentException();
            String version=text(v,"credentialVersion");configVersion=text(v,"configVersion");if(!version.matches("[1-9][0-9]{0,18}")||!configVersion.matches("[1-9][0-9]{0,18}"))throw new IllegalArgumentException();credentialVersion=Long.parseLong(version);
            tokenFile=Path.of(text(v,"managementTokenFile"));privateFile(tokenFile);
            stateDirectory=directory(text(v,"stateDirectory"));outboxDirectory=directory(text(v,"outboxDirectory"));journalDirectory=directory(text(v,"journalDirectory"));if(Set.of(stateDirectory,outboxDirectory,journalDirectory).size()!=3)throw new IllegalArgumentException();
            from=Instant.parse(text(v,"receivedNotBefore"));through=Instant.parse(text(v,"receivedNotAfter"));if(!from.isBefore(through)||!v.path("controlsEnabled").isBoolean())throw new IllegalArgumentException();controls=v.path("controlsEnabled").asBoolean();
        }catch(Exception invalid){throw new IllegalArgumentException("JT808远程私有范围或目标配置无效");}
    }
    private Path directory(String name)throws Exception{Path p=Path.of(name);if(!p.isAbsolute()||!p.equals(p.toRealPath())||!p.startsWith(root))throw new IllegalArgumentException();Jt808StateStore.requirePrivate(p,true);return p;}
    private void privateFile(Path p)throws Exception{if(!p.isAbsolute()||!p.equals(p.toRealPath())||!p.startsWith(root)||Files.size(p)>16384)throw new IllegalArgumentException();Jt808StateStore.requirePrivate(p,false);}
    /** 每次外发重新核对范围摘要；修改文件不会默默扩大历史或控制权限。 */
    public void requireCurrent(){try{privateFile(file);if(!hash(Files.readAllBytes(file)).equals(digest))throw new IllegalArgumentException();}catch(Exception changed){throw new IllegalStateException("JT808远程范围已改变，停止外发");}}
    /** 管理访问令牌单独从私有文件读取，过期由平台拒绝，不自动登录或替换用户会话。 */
    String token(){try{privateFile(tokenFile);String token=Files.readString(tokenFile).trim();if(!token.matches("[A-Za-z0-9._-]{20,8192}"))throw new IllegalArgumentException();return token;}catch(Exception invalid){throw new IllegalStateException("远程管理访问令牌不可用");}}
    String bindingDigest(){return digest;}
    public Path stateDirectory(){return stateDirectory;}
    /** 新远程会话目录不得沿用旧测试identity或控制原件。 */
    public void bindState(Jt808StateStore store){Jt808RemoteOutbox.bind(store,this);}
    /** 原始日志也固定目录和首次空序号，继承环境变量不能写入旧日志目录。 */
    public void bindJournal(Jt808LogJournal journal){if(!journalDirectory.equals(journal.directory()))throw new IllegalStateException("远程日志目录与明确范围不一致");journal.bindDeliveryScope(scope,digest,0);}
    boolean includes(Instant received){return !received.isBefore(from)&&!received.isAfter(through);}
    static String hash(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(Exception e){throw new IllegalStateException();}}
    private static String text(tools.jackson.databind.JsonNode n,String key){var v=n.path(key);if(!v.isString()||v.asText().isBlank())throw new IllegalArgumentException();return v.asText();}
    @Override public String toString(){return "JT808远程配置[已隐藏]";}
}
