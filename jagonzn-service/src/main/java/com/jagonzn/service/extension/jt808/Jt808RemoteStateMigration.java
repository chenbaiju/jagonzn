package com.jagonzn.service.extension.jt808;

import com.things.link.shared.message.OriginalPayloadDigest;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import tools.jackson.databind.ObjectMapper;

/** 离线迁移厂家鉴权码和流水水位；独占旧状态、固定原件摘要，不复制平台身份或历史命令。 */
public final class Jt808RemoteStateMigration {
    private Jt808RemoteStateMigration() { }

    /**
     * @param args 依次为命令标识、外盘根、远程范围、SM4配置、旧绑定、新绑定、旧状态目录及旧状态文件SHA256
     * 此命令不启动Spring或任何网络监听；旧服务持有租约、存在未核对控制或待确认回复时明确拒绝。
     */
    public static void run(String[] args) {
        if((args.length!=8 && args.length!=9) || !"--prepare-remote-jt808-state".equals(args[0])
                || args.length==9 && !"--allow-control-scope".equals(args[8]))throw invalid();
        Path root=Path.of(args[1]);var settings=new Jt808RemoteSettings(root,Path.of(args[2]),new ObjectMapper());
        try(var oldConfig=new Jt808PrivateConfiguration(root,Path.of(args[3]),Path.of(args[4]));
            var newConfig=new Jt808PrivateConfiguration(root,Path.of(args[3]),Path.of(args[5]))) {
            prepare(root,Path.of(args[6]),args[7],settings,oldConfig.binding(),newConfig.binding(),args.length==9);
        }
        System.out.println("厂家鉴权迁移准备完成；旧原件保留，未连接网络或下发设备命令。");
    }

    /**
     * @param root 已核验外盘根 @param sourceDirectory 已停止服务的原状态目录
     * @param expectedSourceSha256 操作者事先核对的adapter-state.properties原件摘要
     * @param settings 控制关闭、独立新范围 @param previous 原预绑定 @param next 目标平台预绑定
     */
    static void prepare(Path root,Path sourceDirectory,String expectedSourceSha256,Jt808RemoteSettings settings,
                        Jt808DeviceBinding previous,Jt808DeviceBinding next) {
        prepare(root,sourceDirectory,expectedSourceSha256,settings,previous,next,false);
    }
    /** 离线迁移到控制范围需显式命令参数；迁移过程本身不联网、不下发。 */
    static void prepare(Path root,Path sourceDirectory,String expectedSourceSha256,Jt808RemoteSettings settings,
                        Jt808DeviceBinding previous,Jt808DeviceBinding next,boolean allowControlScope) {
        try {
            settings.requireCurrent();
            if(settings.controls && !allowControlScope || expectedSourceSha256==null || !expectedSourceSha256.matches("[0-9a-f]{64}")
                    || !previous.terminalId().equals(next.terminalId()) || !Arrays.equals(previous.mac(),next.mac()))throw invalid();
            Path source=sourceDirectory.toRealPath(),target=settings.stateDirectory();
            if(!sourceDirectory.isAbsolute() || !source.equals(sourceDirectory) || source.equals(target)
                    || source.startsWith(target) || target.startsWith(source) || source.equals(settings.outboxDirectory)
                    || source.equals(settings.journalDirectory))throw invalid();
            Path original=source.resolve("adapter-state.properties");
            Jt808StateStore.requirePrivate(original,false);Jt808StateStore.requirePrivate(source.resolve("adapter.lock"),false);
            try(var old=new Jt808StateStore(source,root)) {
                // 先独占再核对字节，拒绝拷贝仍运行的服务或摘要已变化的快照。
                if(!Jt808RemoteSettings.hash(Files.readAllBytes(original)).equals(expectedSourceSha256))throw invalid();
                var values=old.snapshot();String token=values.get("token");
                if(!binding(previous).equals(values.get("binding")) || token==null || !token.matches("[0-9a-fA-F]{12}"))throw invalid();
                int serial=Integer.parseInt(values.getOrDefault("serial","0"));if(serial<0 || serial>=65535)throw invalid();
                requireSettled(values);
                try(var destination=new Jt808StateStore(target,root)) {
                    if(!destination.snapshot().isEmpty())throw invalid();
                    settings.requireCurrent();
                    destination.update(m->{m.put("remote.scope",settings.bindingDigest());m.put("binding",binding(next));
                        m.put("token",token);m.put("serial",Integer.toString(serial));m.put("migration.sourceSha256",expectedSourceSha256);});
                }
            }
        } catch(Exception failure) { throw invalid(); }
    }
    private static void requireSettled(Map<String,String> values) {
        for(var entry:values.entrySet()) {
            String key=entry.getKey();
            if(key.startsWith("reply.") && !key.endsWith(".done") && !values.containsKey(key+".done"))throw invalid();
            if(!key.startsWith("cmd.") || !key.endsWith(".state"))continue;
            String state=entry.getValue(),prefix=key.substring(0,key.length()-5);
            if(Set.of("SUCCEEDED","FAILED").contains(state))continue;
            // 只读查询的未知结果不触发物理动作；控制未知必须已有独立现场核对原件。
            if("UNKNOWN".equals(state) && ("33281".equals(values.get(prefix+"message"))
                    || "34048".equals(values.get(prefix+"message")) && Jt808ControlReview.reviewed(values,prefix)))continue;
            throw invalid();
        }
    }
    private static String binding(Jt808DeviceBinding value) {
        return OriginalPayloadDigest.of((value.terminalId()+"|"+value.projectKey()+"|"+value.deviceKey()).getBytes(StandardCharsets.UTF_8));
    }
    private static IllegalStateException invalid() { return new IllegalStateException("厂家鉴权迁移拒绝：须核对停止租约、原件摘要、同一硬件、空目标范围及历史未结记录；原件不得覆盖"); }
}
