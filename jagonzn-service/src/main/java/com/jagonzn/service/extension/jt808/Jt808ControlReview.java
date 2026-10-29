package com.jagonzn.service.extension.jt808;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.ObjectMapper;

/** 现场确认当前已锁住后，保留未知命令及独立核对记录；不把当前状态回写为历史执行成功。 */
public final class Jt808ControlReview {
    private Jt808ControlReview() { }

    /**
     * @param file 运维显式提供的私有外盘核对单，不从设备报文或第三方请求自动导入
     * @param externalRoot 已核验外设根
     * @param store 当前设备独占状态
     * @param json 应用JSON配置
     * @param now 服务端导入时间
     */
    public static void importReview(Path file,Path externalRoot,Jt808StateStore store,ObjectMapper json,Instant now) {
        try {
            byte[] raw=readPrivate(file,externalRoot);var note=json.readTree(raw);
            if(!note.isObject() || note.size()!=7 || !"OPERATOR".equals(note.path("source").asText())
                    || !"CURRENT_LOCKED".equals(note.path("observation").asText())) throw invalid();
            String id=UUID.fromString(note.path("commandId").asText()).toString();
            String device=UUID.fromString(note.path("deviceId").asText()).toString();
            String prefix="cmd."+id+".";var state=store.snapshot();String identity=state.get("identity");
            if(identity==null || !identity.endsWith("|"+device) || !"UNKNOWN".equals(state.get(prefix+"state"))
                    || !"34048".equals(state.get(prefix+"message")) || !"jt808_unlock".equals(state.get(prefix+"key"))) throw invalid();
            Instant observed=Instant.parse(note.path("observedAt").asText());
            if(observed.isAfter(now) || observed.isBefore(Instant.parse(state.get(prefix+"expires")))) throw invalid();
            String evidenceDigest=digest(readPrivate(Path.of(note.path("evidenceFile").asText()),externalRoot));
            if(!evidenceDigest.equals(note.path("evidenceSha256").asText())) throw invalid();
            String review="OPERATOR_CURRENT_LOCKED|"+observed+"|"+evidenceDigest,importDigest=digest(raw);
            String previous=state.get(prefix+"physicalReview");
            if(previous!=null) {
                if(!previous.equals(review) || !importDigest.equals(state.get(prefix+"physicalReviewImportSha256"))) throw invalid();
                return;
            }
            store.update(map->{map.put(prefix+"physicalReview",review);map.put(prefix+"physicalReviewImportSha256",importDigest);});
        } catch(Exception failure) { throw invalid(); }
    }

    /** 只解除该历史未知操作对新命令的阻塞；原状态、平台结果及旧命令重复发送保护均保留。 */
    static boolean reviewed(Map<String,String> state,String prefix) {
        String value=state.get(prefix+"physicalReview"),hash=state.get(prefix+"physicalReviewImportSha256");
        return value!=null && value.matches("OPERATOR_CURRENT_LOCKED\\|[^|]+\\|[0-9a-f]{64}") && hash!=null && hash.matches("[0-9a-f]{64}");
    }
    private static byte[] readPrivate(Path file,Path root) throws Exception {
        if(!file.isAbsolute() || Files.isSymbolicLink(file) || !file.toRealPath().startsWith(root.toRealPath())
                || Files.getFileStore(root).equals(Files.getFileStore(Path.of("").toAbsolutePath())) || Files.size(file)>16384) throw invalid();
        Jt808StateStore.requirePrivate(file,false);return Files.readAllBytes(file);
    }
    private static String digest(byte[] bytes) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    private static IllegalStateException invalid() { return new IllegalStateException("JT808现场核对原件无效，未知控制保持阻塞"); }
}
