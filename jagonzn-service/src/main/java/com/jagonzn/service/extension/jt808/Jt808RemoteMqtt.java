package com.jagonzn.service.extension.jt808;

import java.util.function.BiConsumer;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;

/** 只使用设备自身Topic的TLS连接；清洁会话避免休眠时积压旧控制，业务持久性由外盘队列承担。 */
public interface Jt808RemoteMqtt extends AutoCloseable {
    void connect();boolean connected();void publish(String topic,byte[] body);void receiver(BiConsumer<String,byte[]> callback);void disconnect();
    default void onDisconnect(Runnable callback) { }
    @Override default void close(){disconnect();}
    final class Tls implements Jt808RemoteMqtt {
        private final Jt808RemoteSettings settings;
        private final Jt808DeviceBinding binding;
        private final java.util.function.Supplier<MqttClient> clients;
        private volatile MqttClient client;
        private volatile boolean ready;
        private volatile BiConsumer<String,byte[]> receiver=(t,b)->{};
        private volatile Runnable lost=()->{};

        public Tls(Jt808RemoteSettings settings,Jt808DeviceBinding binding){
            this(settings,binding,()->{
                try{return new MqttClient(settings.broker.toString(),settings.clientId,new MemoryPersistence());}
                catch(MqttException failed){throw new IllegalStateException("远程MQTT客户端创建失败");}
            });
        }
        Tls(Jt808RemoteSettings settings,Jt808DeviceBinding binding,java.util.function.Supplier<MqttClient> clients){
            this.settings=settings;this.binding=binding;this.clients=clients;
        }
        /** 连接和SUBACK必须同时成功；超时连接强制关闭，后继使用全新实例，不能把迟到连接当作就绪。 */
        public synchronized void connect(){
            if(connected())return;
            disconnect();settings.requireCurrent();
            MqttClient current=clients.get();client=current;
            long started=System.nanoTime();String stage="CONNECT";
            try{
                current.setTimeToWait(8000);
                current.setCallback(new MqttCallback(){
                    public void connectionLost(Throwable cause){if(client==current){ready=false;lost.run();}}
                    public void deliveryComplete(IMqttDeliveryToken token){}
                    public void messageArrived(String topic,MqttMessage message){
                        if(client!=current||!ready||message.isRetained()||message.getQos()!=1||message.getPayload().length>65536)return;
                        receiver.accept(topic,message.getPayload().clone());
                    }
                });
                var options=new MqttConnectOptions();
                options.setUserName(binding.projectKey()+"/"+binding.deviceKey());options.setPassword(binding.secret().toCharArray());
                options.setCleanSession(true);options.setAutomaticReconnect(false);options.setConnectionTimeout(5);
                options.setKeepAliveInterval(15);options.setHttpsHostnameVerificationEnabled(true);
                current.connect(options);stage="SUBSCRIBE";
                current.subscribe("tc/v1/"+binding.projectKey()+"/"+binding.deviceKey()+"/down/#",1);
                current.setTimeToWait(3000);ready=true;
                org.slf4j.LoggerFactory.getLogger(getClass()).info("JT808远程MQTT就绪 elapsedMillis={}",elapsed(started));
            }catch(MqttException failed){
                // 只记录阶段、数值原因及耗时；失败时取消底层连接，不输出秘密或原始异常载荷。
                org.slf4j.LoggerFactory.getLogger(getClass()).warn("JT808远程MQTT失败 stage={} reasonCode={} elapsedMillis={}",stage,failed.getReasonCode(),elapsed(started));
                discard(current);throw new IllegalStateException("远程MQTT认证或订阅失败");
            }
        }
        private static long elapsed(long started){return java.util.concurrent.TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started);}
        public boolean connected(){MqttClient current=client;return ready&&current!=null&&current.isConnected();}
        public void publish(String topic,byte[] body){
            MqttClient current=client;
            try{settings.requireCurrent();if(!connected()||current!=client)throw new IllegalStateException();current.publish(topic,body,1,false);}
            catch(MqttException failure){throw new IllegalStateException("远程MQTT发送未确认，保留原件");}
        }
        public void receiver(BiConsumer<String,byte[]> callback){receiver=callback;}
        public void onDisconnect(Runnable callback){lost=callback;}
        /** 包括仍在CONNECTING的失败连接；先撤销实例所有权，再强制取消并关闭，迟到回调不能影响新会话。 */
        private void discard(MqttClient current){
            if(client==current){ready=false;client=null;}
            try{current.disconnectForcibly(0,0,false);}catch(MqttException ignored){}
            try{current.close(true);}catch(MqttException ignored){}
        }
        public synchronized void disconnect(){MqttClient current=client;if(current!=null)discard(current);else ready=false;}
        @Override public synchronized void close(){disconnect();}
    }
}
