package com.jagonzn.service.extension.jt808;

import java.nio.file.Path;
import tools.jackson.databind.ObjectMapper;

/** 远程外置队列和MQTT客户端的确定性资源释放，不自动启动任何连接或删除原件。 */
public final class Jt808RemoteResources implements AutoCloseable {
    private final Jt808StateStore store;private final Jt808RemoteMqtt mqtt;private final Jt808RemoteOutbox outbox;
    public Jt808RemoteResources(Jt808RemoteSettings settings,Jt808DeviceBinding binding,ObjectMapper json,Path root){
        store=new Jt808StateStore(settings.outboxDirectory,root);Jt808RemoteMqtt opened=null;
        try{outbox=new Jt808RemoteOutbox(store,settings,binding,json);opened=new Jt808RemoteMqtt.Tls(settings,binding);mqtt=opened;}catch(RuntimeException failure){if(opened!=null)opened.close();store.close();throw failure;}
    }
    public Jt808RemoteOutbox outbox(){return outbox;}
    public Jt808RemoteMqtt mqtt(){return mqtt;}
    @Override public void close(){mqtt.close();store.close();}
}
