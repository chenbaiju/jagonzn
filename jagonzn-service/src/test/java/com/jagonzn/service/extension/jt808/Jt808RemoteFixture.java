package com.jagonzn.service.extension.jt808;

import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.*;
import java.util.*;
import java.util.function.BiConsumer;
import tools.jackson.databind.*;

final class Jt808RemoteFixture implements AutoCloseable {
    static final Instant NOW=Instant.parse("2026-10-29T12:00:00Z");
    final ObjectMapper json=new ObjectMapper();final Path root,file,stateDirectory,outboxDirectory,token;
    final UUID tenant=UUID.randomUUID(),project=UUID.randomUUID(),device=UUID.randomUUID(),account=UUID.randomUUID(),type=UUID.randomUUID();
    final Jt808DeviceBinding binding=new Jt808DeviceBinding(Jt808TestLock.TERMINAL,Jt808TestLock.MAC,"project","lock","synthetic-secret","1.0.0",NOW.plusSeconds(60),Map.of("door_closed","door_closed","battery_percent","battery_percent"));
    final Jt808RemoteSettings settings;final Jt808StateStore store;final Jt808RemoteOutbox outbox;final FakeMqtt mqtt=new FakeMqtt();final Map<String,JsonNode> reads=new HashMap<>();final Jt808RemoteManagement management;final Jt808RemoteGateway gateway;
    Jt808RemoteFixture(Path root,boolean controls)throws Exception{
        this.root=root;stateDirectory=directory(root,"session");outboxDirectory=directory(root,"outbox");token=write(root.resolve("token.txt"),"synthetic-management-token-value");
        var v=json.createObjectNode().put("schemaVersion",1).put("scopeId",UUID.randomUUID().toString()).put("apiOrigin","https://localhost:28994").put("brokerUri","ssl://localhost:28993").put("clientId","synthetic-lock").put("tenantId",tenant.toString()).put("projectId",project.toString()).put("deviceId",device.toString()).put("accountId",account.toString()).put("credentialVersion","9").put("configVersion","3").put("managementTokenFile",token.toString()).put("stateDirectory",stateDirectory.toString()).put("outboxDirectory",outboxDirectory.toString()).put("journalDirectory",directory(root,"journal").toString()).put("receivedNotBefore",NOW.minusSeconds(60).toString()).put("receivedNotAfter",NOW.plusSeconds(60).toString()).put("controlsEnabled",controls);
        file=write(root.resolve("remote.json"),v.toString());settings=new Jt808RemoteSettings(root,file,json);store=new Jt808StateStore(outboxDirectory,root);outbox=new Jt808RemoteOutbox(store,settings,binding,json);
        reads.put("/api/v1/auth/me",json.createObjectNode().put("accountId",account.toString()).put("tenantId",tenant.toString()).put("currentProjectId",project.toString()).put("projectRole","OWNER"));
        reads.put("/api/v1/projects",json.createArrayNode().add(json.createObjectNode().put("id",project.toString()).put("projectKey","project").put("myRole","OWNER").put("status","ACTIVE")));
        String prefix="/api/v1/projects/"+project+"/devices/"+device;
        reads.put(prefix,json.createObjectNode().put("id",device.toString()).put("deviceTypeId",type.toString()).put("deviceKey","lock").putNull("gatewayId"));
        reads.put("/api/v1/projects/"+project+"/device-types/"+type,json.createObjectNode().put("projectId",project.toString()).put("deviceKind","DIRECT"));
        reads.put(prefix+"/access-config",json.createObjectNode().put("protocol","MQTT").put("enabled",true).put("credentialVersion","9").put("configVersion","3"));
        reads.put(prefix+"/thing-model-binding",json.createObjectNode().put("deviceId",device.toString()).set("version",json.createObjectNode().put("versionNumber","1.0.0")));
        management=new Jt808RemoteManagement(settings,binding,path->{var result=reads.get(path);if(result==null)throw new IllegalStateException("unconfigured GET");return result;});
        gateway=new Jt808RemoteGateway(settings,binding,management,mqtt,outbox,json,Clock.fixed(NOW,ZoneOffset.UTC));
    }
    JsonNode property(UUID id){return json.createObjectNode().put("messageId",id.toString()).put("modelVersion","1.0.0").put("occurredAt",NOW.toString()).set("payload",json.createObjectNode().put("door_closed",false));}
    String prefix(){return "/api/v1/projects/"+project+"/devices/"+device;}
    static Path directory(Path root,String name)throws Exception{return Files.createTempDirectory(root,name,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));}
    static Path write(Path p,String text)throws Exception{Files.writeString(p,text);Files.setPosixFilePermissions(p,PosixFilePermissions.fromString("rw-------"));return p;}
    static final class FakeMqtt implements Jt808RemoteMqtt {
        boolean connected;BiConsumer<String,byte[]> callback;final List<Map.Entry<String,byte[]>> sent=new ArrayList<>();
        public void connect(){connected=true;}public boolean connected(){return connected;}public void receiver(BiConsumer<String,byte[]> cb){callback=cb;}public void disconnect(){connected=false;}
        public void publish(String topic,byte[] payload){if(!connected)throw new IllegalStateException();sent.add(Map.entry(topic,payload.clone()));}
    }
    @Override public void close(){gateway.close();store.close();}
}
