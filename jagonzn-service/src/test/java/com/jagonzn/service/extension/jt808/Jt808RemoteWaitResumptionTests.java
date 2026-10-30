package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.*;
import com.things.link.shared.id.Uuid7;
import java.net.*;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import static com.jagonzn.service.extension.jt808.Jt808RemoteFixture.*;

class Jt808RemoteWaitResumptionTests {
    @TempDir Path external;
    @Test void managementVerifiedRetryAcrossRealTcpConnectionProducesOneUnlockAndOneFinalResult()throws Exception {
        var now=new AtomicReference<>(NOW);var clock=new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return now.get();}};
        try(var f=new Jt808RemoteFixture(external,true);var state=new Jt808StateStore(f.stateDirectory,external);
            var cipher=new Jt808Sm4Cipher(Jt808TestLock.KEY,new byte[16]);
            var gateway=new Jt808RemoteGateway(f.settings,f.binding,f.management,f.mqtt,f.outbox,f.json,clock);
            var server=new Jt808TcpServer(f.binding,cipher,state,gateway,f.json,new InetSocketAddress("127.0.0.1",0),Duration.ofSeconds(30),Duration.ofMillis(250),clock,null,false,"initial",true)) {
            gateway.attach(server);server.start();
            try(var socket=new Socket("127.0.0.1",server.boundPort())) {
                socket.setSoTimeout(3000);var input=socket.getInputStream();var output=socket.getOutputStream();
                output.write(Jt808TestLock.uplink(0x0100,1,Jt808TestLock.registration()));var registration=Jt808TestLock.downlink(Jt808TestLock.read(input));
                byte[] token=Arrays.copyOfRange(registration.body(),3,9);output.write(Jt808TestLock.uplink(0x0102,2,token));assertEquals(0x8001,Jt808TestLock.downlink(Jt808TestLock.read(input)).messageId());
                now.set(NOW.plusSeconds(1));output.write(report(15,true,10,now.get()));Jt808TestLock.read(input);
                var id=Uuid7.generate();String prefix="cmd."+id+".";String path=f.prefix()+"/commands/"+id;
                var actual=f.json.createObjectNode().put("id",id.toString()).put("deviceId",f.device.toString()).put("connectionDeviceId",f.device.toString()).put("commandKey","jt808_unlock").put("status","DISPATCHED").put("attemptCount",1).set("input",f.json.createObjectNode());
                actual.set("attempts",f.json.createArrayNode().add(f.json.createObjectNode().put("attemptNo",1).put("status","PUBLISHED").put("deadlineAt",NOW.plusSeconds(20).toString())));f.reads.put(path,actual);
                var body=f.json.createObjectNode().put("targetDeviceKey","lock").put("commandKey","jt808_unlock").put("attempt",1).set("input",f.json.createObjectNode());String topic="tc/v1/project/lock/down/command/"+id;
                now.set(NOW.plusSeconds(2));gateway.dispatch(topic,f.json.writeValueAsBytes(body));var sent=Jt808TestLock.downlink(Jt808TestLock.read(input));assertEquals(0x8500,sent.messageId());assertArrayEquals(new byte[]{1,0},sent.body());
                now.set(NOW.plusSeconds(21));actual.put("attemptCount",2);actual.set("attempts",f.json.createArrayNode().add(f.json.createObjectNode().put("attemptNo",2).put("status","PUBLISHED").put("deadlineAt",NOW.plusSeconds(45).toString())));body.put("attempt",2);
                gateway.dispatch(topic,f.json.writeValueAsBytes(body));gateway.dispatch(topic,f.json.writeValueAsBytes(body));
                assertEquals(NOW.plusSeconds(45).toString(),state.snapshot().get(prefix+"expires"));socket.setSoTimeout(300);assertThrows(SocketTimeoutException.class,()->Jt808TestLock.read(input));socket.setSoTimeout(3000);
                now.set(NOW.plusSeconds(35));output.write(report(1,false,11,NOW.plusSeconds(34)));assertEquals(0x8001,Jt808TestLock.downlink(Jt808TestLock.read(input)).messageId());assertEquals("CONFIRMED_PENDING",state.snapshot().get(prefix+"state"));
                var result=f.mqtt.sent.stream().filter(e->e.getKey().endsWith("/up/command/"+id+"/reply")).findFirst().orElseThrow();var resultBody=f.json.readTree(result.getValue());actual.put("status","SUCCEEDED");actual.set("output",resultBody.path("output"));
                for(int n=0;n<30 && !"SUCCEEDED".equals(state.snapshot().get(prefix+"state"));n++)Thread.sleep(50);
                assertEquals("SUCCEEDED",state.snapshot().get(prefix+"state"));assertEquals(2,resultBody.path("output").path("command_attempt").asInt());
                now.set(NOW.plusSeconds(40));output.write(report(2,true,12,NOW.plusSeconds(39)));assertEquals(0x8001,Jt808TestLock.downlink(Jt808TestLock.read(input)).messageId());
                assertEquals(1,state.snapshot().keySet().stream().filter(k->k.matches("cmd\\.[0-9a-f-]{36}\\.serial")).count());
                assertEquals(1,f.mqtt.sent.stream().filter(e->e.getKey().contains("/up/command/")).map(e->f.json.readTree(e.getValue()).path("messageId").asText()).distinct().count());
            }
        }
    }
    private static byte[] report(int reason,boolean closed,int serial,Instant occurred) {
        byte[] body=Jt808TestLock.location();body[30]=0;body[31]=(byte)((reason<<1)|(closed?1:0));var t=occurred.atOffset(ZoneOffset.ofHours(8));
        int[] fields={t.getYear()%100,t.getMonthValue(),t.getDayOfMonth(),t.getHour(),t.getMinute(),t.getSecond()};
        for(int i=0;i<fields.length;i++)body[22+i]=(byte)((fields[i]/10<<4)|(fields[i]%10));
        return Jt808TestLock.uplink(0x0200,serial,body);
    }
}
