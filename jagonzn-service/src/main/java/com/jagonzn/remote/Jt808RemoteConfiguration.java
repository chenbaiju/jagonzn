package com.jagonzn.remote;

import com.jagonzn.service.extension.jt808.*;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.time.*;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableScheduling;
import tools.jackson.databind.ObjectMapper;

/** 远程模式只显式装配厂家协议及外置队列；启用内核或旧发送器的继承配置会在监听前失败。 */
@Configuration(proxyBeanMethods=false)
@EnableScheduling
public class Jt808RemoteConfiguration {
    static final class RemoteModeGuard { }
    @Bean RemoteModeGuard remoteModeGuard(Environment env){
        validateMode(env);return new RemoteModeGuard();
    }
    /** 启动入口在任何Bean创建前核对互斥配置，Bean级校验同时覆盖直接上下文测试。 */
    public static void validateMode(Environment env){
        if(!env.getProperty("jagonzn.jt808.remote.enabled",Boolean.class,false)||env.getProperty("things-link.runtime.embedded",Boolean.class,true)
                ||env.getProperty("jagonzn.jt808.enabled",Boolean.class,false)||env.getProperty("jagonzn.jt808.logs.delivery-enabled",Boolean.class,false)
                ||env.getProperty("jagonzn.cloud.private-delivery.enabled",Boolean.class,false)||env.getProperty("things-link.ingress.handoff.enabled",Boolean.class,false))throw new IllegalStateException("JT808远程模式未显式开启或与内核/旧发送器配置冲突");
    }
    @Bean ObjectMapper remoteJson(){return new ObjectMapper().rebuild().enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION).enable(tools.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();}
    @Bean Jt808RemoteSettings remoteSettings(Environment env,ObjectMapper json,RemoteModeGuard remoteModeGuard){return new Jt808RemoteSettings(Path.of(env.getRequiredProperty("jagonzn.jt808.external-root")),Path.of(env.getRequiredProperty("jagonzn.jt808.remote.scope-file")),json);}
    @Bean(destroyMethod="close") Jt808PrivateConfiguration remotePrivate(Environment env,RemoteModeGuard remoteModeGuard){return new Jt808PrivateConfiguration(Path.of(env.getRequiredProperty("jagonzn.jt808.external-root")),Path.of(env.getRequiredProperty("jagonzn.jt808.crypto-file")),Path.of(env.getRequiredProperty("jagonzn.jt808.binding-file")));}
    @Bean(destroyMethod="close") Jt808StateStore remoteState(Jt808RemoteSettings settings,Environment env){var store=new Jt808StateStore(settingsState(settings),root(env));try{bind(store,settings);return store;}catch(RuntimeException failure){store.close();throw failure;}}
    @Bean(destroyMethod="close") Jt808RemoteResources remoteResources(Jt808RemoteSettings settings,Jt808PrivateConfiguration config,ObjectMapper json,Environment env){return new Jt808RemoteResources(settings,config.binding(),json,root(env));}
    @Bean(destroyMethod="close") Jt808LogJournal remoteLogs(Environment env,Jt808RemoteSettings settings,ObjectMapper json){var journal=new Jt808LogJournal(Path.of(env.getRequiredProperty("jagonzn.jt808.logs.directory")),root(env),json);try{settings.bindJournal(journal);return journal;}catch(RuntimeException failure){journal.close();throw failure;}}
    @Bean Jt808RemoteGateway remoteGateway(Jt808RemoteSettings settings,Jt808PrivateConfiguration config,Jt808RemoteResources resources,ObjectMapper json){return new Jt808RemoteGateway(settings,config.binding(),new Jt808RemoteManagement(settings,config.binding(),json),resources.mqtt(),resources.outbox(),json,Clock.systemUTC());}
    @Bean(destroyMethod="close") Jt808TcpServer remoteServer(Environment env,Jt808RemoteSettings settings,Jt808PrivateConfiguration config,Jt808StateStore remoteState,Jt808RemoteGateway gateway,Jt808LogJournal remoteLogs,ObjectMapper json){
        var server=new Jt808TcpServer(config.binding(),config.cipher(),remoteState,gateway,json,new InetSocketAddress(env.getProperty("jagonzn.jt808.bind-address","127.0.0.1"),env.getProperty("jagonzn.jt808.port",Integer.class,16809)),Duration.ofSeconds(120),Duration.ofSeconds(1),Clock.systemUTC(),remoteLogs,false,"initial",true);gateway.attach(server);return server;
    }
    private static Path root(Environment env){return Path.of(env.getRequiredProperty("jagonzn.jt808.external-root"));}
    private static Path settingsState(Jt808RemoteSettings s){return s.stateDirectory();}
    private static void bind(Jt808StateStore store,Jt808RemoteSettings settings){settings.bindState(store);}
}
