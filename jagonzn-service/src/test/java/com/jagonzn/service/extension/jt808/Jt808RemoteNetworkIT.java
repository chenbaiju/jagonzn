package com.jagonzn.service.extension.jt808;

import com.sun.net.httpserver.*;
import com.things.link.shared.id.Uuid7;
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.security.KeyStore;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.*;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import static com.jagonzn.service.extension.jt808.Jt808RemoteFixture.*;

/** 专用隔离EMQX/TLS与HTTPS合同对端；不访问公网账号，不冒充真实ThingsLink运行时或实物锁验收。 */
class Jt808RemoteNetworkIT {
    @TempDir Path external;
    static final class TestClock extends Clock {
        final AtomicReference<Instant> now=new AtomicReference<>(NOW);public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return this;}public Instant instant(){return now.get();}
    }
    @Test void isolatedBrokerRejectsWrongSecretAndForeignDeviceSubscription()throws Exception{
        assertNotNull(System.getenv("JAGONZN_REMOTE_NETWORK_TEST_TLS"));
        try(var f=new Jt808RemoteFixture(external,false)){
            var wrong=new Jt808DeviceBinding(Jt808TestLock.TERMINAL,Jt808TestLock.MAC,"project","lock","wrong-secret","1.0.0",null,Map.of("door_closed","door_closed"));
            try(var client=new Jt808RemoteMqtt.Tls(f.settings,wrong)){assertThrows(IllegalStateException.class,client::connect);assertFalse(client.connected());}
            var peer=new MqttClient("ssl://localhost:28993","contract-acl-check",new MemoryPersistence());var options=new MqttConnectOptions();options.setUserName("project/lock");options.setPassword("synthetic-secret".toCharArray());options.setConnectionTimeout(3);options.setCleanSession(true);options.setHttpsHostnameVerificationEnabled(true);
            try{peer.connect(options);assertThrows(MqttException.class,()->peer.subscribe("tc/v1/project/foreign/down/#",1));}finally{if(peer.isConnected())peer.disconnect();peer.close();}
        }
    }
    @Test void realTlsMqttAndHttpsCarrySyntheticSm4CycleWithoutDuplicatePhysicalDispatch()throws Exception{
        Path config=Path.of(Objects.requireNonNull(System.getenv("JAGONZN_REMOTE_NETWORK_TEST_TLS"),"需显式指定本轮隔离TLS原件"));
        var tls=SSLContext.getInstance("TLS");var keys=KeyStore.getInstance("PKCS12");try(var in=Files.newInputStream(config.resolve("server.p12"))){keys.load(in,"test-only-password".toCharArray());}var km=KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());km.init(keys,"test-only-password".toCharArray());tls.init(km.getKeyManagers(),null,null);
        var http=HttpsServer.create(new InetSocketAddress("127.0.0.1",28994),0);http.setHttpsConfigurator(new HttpsConfigurator(tls));var executor=Executors.newVirtualThreadPerTaskExecutor();http.setExecutor(executor);
        try(var f=new Jt808RemoteFixture(external,true);var protocolState=new Jt808StateStore(f.stateDirectory,external);var cipher=new com.jagonzn.service.extension.jt808.protocol.Jt808Sm4Cipher(Jt808TestLock.KEY,new byte[16])){
            f.settings.bindState(protocolState);var reads=new ConcurrentHashMap<>(f.reads);var exchanges=new CopyOnWriteArrayList<String>();
            http.createContext("/",exchange->{try{assertEquals("GET",exchange.getRequestMethod());assertEquals("Bearer synthetic-management-token-value",exchange.getRequestHeaders().getFirst("Authorization"));var data=reads.get(exchange.getRequestURI().getPath());byte[] body=f.json.writeValueAsBytes(data);exchange.sendResponseHeaders(data==null?404:200,body.length);exchange.getResponseBody().write(body);exchanges.add(exchange.getRequestURI().getPath());}finally{exchange.close();}});http.start();
            var peer=new MqttClient("ssl://localhost:28993","contract-test-observer",new MemoryPersistence());var options=new MqttConnectOptions();options.setUserName("contract-test");options.setPassword("synthetic-test-password".toCharArray());options.setConnectionTimeout(3);options.setCleanSession(true);options.setHttpsHostnameVerificationEnabled(true);
            var received=new CopyOnWriteArrayList<Map.Entry<String,String>>();UUID commandId=Uuid7.generate();var current=f.json.createObjectNode().put("id",commandId.toString()).put("deviceId",f.device.toString()).put("connectionDeviceId",f.device.toString()).put("commandKey","jt808_unlock").put("status","DISPATCHED").put("attemptCount",1).set("input",f.json.createObjectNode());current.set("attempts",f.json.createArrayNode().add(f.json.createObjectNode().put("attemptNo",1).put("status","PUBLISHED").put("deadlineAt",NOW.plusSeconds(20).toString())));reads.put(f.prefix()+"/commands/"+commandId,current);
            peer.setCallback(new MqttCallback(){public void connectionLost(Throwable ignored){}public void deliveryComplete(IMqttDeliveryToken token){}public void messageArrived(String topic,MqttMessage message)throws Exception{
                String text=new String(message.getPayload(),java.nio.charset.StandardCharsets.UTF_8);received.add(Map.entry(topic,text));var body=f.json.readTree(text);
                if(topic.contains("/up/command/")){var complete=current.deepCopy();complete.put("status","SUCCEEDED");complete.set("output",body.path("output"));reads.put(f.prefix()+"/commands/"+commandId,complete);}
                else if(topic.endsWith("/property/report")||topic.contains("/up/event/")){
                    String kind=topic.contains("/up/event/")?"EVENT":"PROPERTY";var receipt=f.json.createObjectNode().put("messageId",body.path("messageId").asText()).put("modelVersion","1.0.0").put("kind",kind).put("status","PERSISTED");executor.submit(()->{try{peer.publish("tc/v1/project/lock/down/uplink/receipt",f.json.writeValueAsBytes(receipt),1,false);}catch(Exception failed){throw new IllegalStateException(failed);}});
                }
            }});peer.connect(options);peer.subscribe("tc/v1/project/lock/up/#",1);
            var mqtt=new Jt808RemoteMqtt.Tls(f.settings,f.binding);var clock=new TestClock();var gateway=new Jt808RemoteGateway(f.settings,f.binding,new Jt808RemoteManagement(f.settings,f.binding,f.json),mqtt,f.outbox,f.json,clock);
            try(gateway;var server=new Jt808TcpServer(f.binding,cipher,protocolState,gateway,f.json,new InetSocketAddress("127.0.0.1",0),Duration.ofSeconds(30),Duration.ofMillis(250),clock,null,false,"initial",true)){
                gateway.attach(server);server.start();try(var socket=new Socket("127.0.0.1",server.boundPort())){
                    socket.setSoTimeout(10000);var output=socket.getOutputStream();var input=socket.getInputStream();output.write(Jt808TestLock.uplink(0x0100,1,Jt808TestLock.registration()));var registration=Jt808TestLock.downlink(Jt808TestLock.read(input));assertEquals(0x8100,registration.messageId());assertEquals(0,registration.body()[2]);byte[] token=Arrays.copyOfRange(registration.body(),3,9);
                    output.write(Jt808TestLock.uplink(0x0102,2,token));assertEquals(0x8001,Jt808TestLock.downlink(Jt808TestLock.read(input)).messageId());
                    clock.now.set(NOW.plusSeconds(1));output.write(report(15,true,10,clock.instant()));Jt808TestLock.read(input);gateway.tick();
                    var command=f.json.createObjectNode().put("targetDeviceKey","lock").put("commandKey","jt808_unlock").put("attempt",1).set("input",f.json.createObjectNode());peer.publish("tc/v1/project/lock/down/command/"+commandId,f.json.writeValueAsBytes(command),1,false);Thread.sleep(150);clock.now.set(NOW.plusSeconds(2));gateway.tick();
                    var unlock=Jt808TestLock.downlink(Jt808TestLock.read(input));assertEquals(0x8500,unlock.messageId());assertArrayEquals(new byte[]{1,0},unlock.body());peer.publish("tc/v1/project/lock/down/command/"+commandId,f.json.writeValueAsBytes(command),1,false);Thread.sleep(100);gateway.tick();
                    clock.now.set(NOW.plusSeconds(3));output.write(report(1,false,11,clock.instant()));assertEquals(0x8001,Jt808TestLock.downlink(Jt808TestLock.read(input)).messageId());clock.now.set(NOW.plusSeconds(4));
                    for(int n=0;n<40&&!"SUCCEEDED".equals(protocolState.snapshot().get("cmd."+commandId+".state"));n++){gateway.tick();Thread.sleep(100);}
                    assertEquals("SUCCEEDED",protocolState.snapshot().get("cmd."+commandId+".state"));clock.now.set(NOW.plusSeconds(5));output.write(report(2,true,12,clock.instant()));assertEquals(0x8001,Jt808TestLock.downlink(Jt808TestLock.read(input)).messageId());
                    for(int n=0;n<50;n++){gateway.tick();Thread.sleep(50);long done=f.store.snapshot().keySet().stream().filter(k->k.startsWith("uplink.")&&k.endsWith(".done")).count();if(done==5)break;}
                    assertEquals(5,f.store.snapshot().keySet().stream().filter(k->k.startsWith("uplink.")&&k.endsWith(".done")).count());assertEquals(1,protocolState.snapshot().keySet().stream().filter(k->k.matches("cmd\\.[0-9a-f-]{36}\\.serial")).count());
                    assertTrue(received.stream().anyMatch(e->e.getKey().endsWith("/up/event/lock_opened")));assertTrue(received.stream().anyMatch(e->e.getKey().endsWith("/up/event/lock_closed")));assertTrue(exchanges.stream().allMatch(p->p.startsWith("/api/v1/")));
                    output.write(Jt808TestLock.uplink(0x0001,13,com.jagonzn.service.extension.jt808.protocol.Jt808Messages.acknowledgement(1,0x8418,0)));Thread.sleep(200);assertFalse(mqtt.connected());
                }
            }finally{if(peer.isConnected())peer.disconnect();peer.close();}
        }finally{http.stop(0);executor.shutdownNow();}
    }
    static byte[] report(int reason,boolean closed,int serial,Instant occurred){byte[] body=Jt808TestLock.location();body[30]=0;body[31]=(byte)((reason<<1)|(closed?1:0));var t=occurred.atOffset(ZoneOffset.ofHours(8));int[] parts={t.getYear()%100,t.getMonthValue(),t.getDayOfMonth(),t.getHour(),t.getMinute(),t.getSecond()};for(int i=0;i<6;i++)body[22+i]=(byte)((parts[i]/10<<4)|(parts[i]%10));return Jt808TestLock.uplink(0x0200,serial,body);}
}
