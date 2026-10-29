package com.jagonzn.service.integration;

import com.jagonzn.service.extension.jt808.Jt808LogJournal;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import java.util.*;
import tools.jackson.databind.ObjectMapper;

/** 仅生成外置合成日志和显式范围，不读取真机身份或原始目录。 */
final class Jt808LogDeliveryFixtures {
    static final String URL="https://localhost/api/v1/internal/service-events";
    static final Instant NOW=Instant.parse("2026-10-29T06:00:00Z");
    static final String SECRET=Base64.getEncoder().encodeToString("0123456789abcdefghijklmnopqrstuv".getBytes(java.nio.charset.StandardCharsets.UTF_8));
    static AuthenticatedDeviceIdentity identity(){return new AuthenticatedDeviceIdentity(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),1);}
    static Path directory(Path root)throws Exception{return Files.createTempDirectory(root,"journal-",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));}
    static Map<String,Object> configuration(Path directory,UUID source,AuthenticatedDeviceIdentity identity,long after){
        var value=new LinkedHashMap<String,Object>();value.put("schemaVersion",1);value.put("scopeId",UUID.randomUUID().toString());value.put("mode","NEW_ONLY");value.put("journalDirectory",directory.toString());value.put("cloudUrl",URL);value.put("sourceDeploymentId",source.toString());
        value.put("tenantId",identity.tenantId().toString());value.put("projectId",identity.projectId().toString());value.put("deviceId",identity.deviceId().toString());value.put("afterSequence",after);value.put("receivedNotBefore",NOW.minusSeconds(60).toString());value.put("receivedNotAfter",NOW.plusSeconds(60).toString());value.put("logTypes",List.of("UNLOCK_REPORTED","LOCK_REPORTED"));return value;
    }
    static Path write(Path root,Map<String,Object> value,ObjectMapper json)throws Exception{
        Path file=Files.createTempFile(root,"delivery-scope-",".json",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));Files.write(file,json.writeValueAsBytes(value));return file;
    }
    static Jt808LogDeliveryScope scope(Jt808LogJournal journal,UUID source,AuthenticatedDeviceIdentity identity,long after,ObjectMapper json)throws Exception{
        return new Jt808LogDeliveryScope(journal,json,write(journal.externalRoot(),configuration(journal.directory(),source,identity,after),json).toString(),URL,source.toString());
    }
    static void append(Jt808LogJournal journal,AuthenticatedDeviceIdentity identity,String key,String kind,Instant received){journal.append(identity,key,kind,"UP",0x0200,1,received,received,Map.of("door_closed",!kind.equals("UNLOCK_REPORTED")));}
    private Jt808LogDeliveryFixtures(){ }
}
