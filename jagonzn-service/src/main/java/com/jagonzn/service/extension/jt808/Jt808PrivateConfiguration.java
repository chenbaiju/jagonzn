package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.Jt808Sm4Cipher;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Properties;

/** 外盘私有配置读取器：不带厂家默认密钥，不从注册报文或用户登录密码推导平台凭据。 */
public final class Jt808PrivateConfiguration implements AutoCloseable {
    private final Jt808DeviceBinding binding;
    private final Jt808Sm4Cipher cipher;

    /** @param externalRoot 已核验外盘资料根 @param cryptoFile 十六字节密钥/IV的十六进制配置 @param bindingFile 管理员核对的预绑定配置 */
    public Jt808PrivateConfiguration(Path externalRoot,Path cryptoFile,Path bindingFile) {
        byte[] key=null,iv=null;
        try {
            Properties crypto=read(externalRoot,cryptoFile),device=read(externalRoot,bindingFile);
            if(!crypto.stringPropertyNames().equals(java.util.Set.of("sm4.key.hex","sm4.iv.hex"))) throw invalid();
            key=hex(crypto.getProperty("sm4.key.hex"),16); iv=hex(crypto.getProperty("sm4.iv.hex"),16);
            var mappings=new LinkedHashMap<String,String>();
            var known=java.util.Set.of("terminal.id","bluetooth.mac.hex","platform.project-key","platform.device-key","platform.secret","model.version","enrollment.until");
            for(String name:device.stringPropertyNames()) {
                if(name.startsWith("property.")) mappings.put(name.substring(9),device.getProperty(name));
                else if(!known.contains(name)) throw invalid();
            }
            String until=device.getProperty("enrollment.until");
            binding=new Jt808DeviceBinding(device.getProperty("terminal.id"),hex(device.getProperty("bluetooth.mac.hex"),6),
                    device.getProperty("platform.project-key"),device.getProperty("platform.device-key"),device.getProperty("platform.secret"),
                    device.getProperty("model.version"),until==null?null:Instant.parse(until),mappings);
            cipher=new Jt808Sm4Cipher(key,iv);
        } catch(Exception failure) { throw invalid(); }
        finally { if(key!=null) Arrays.fill(key,(byte)0); if(iv!=null) Arrays.fill(iv,(byte)0); }
    }
    private static Properties read(Path externalRoot,Path file) throws java.io.IOException {
        Path root=externalRoot.toRealPath();
        if(!file.toRealPath().startsWith(root) || Files.size(file)>65_536) throw invalid();
        Jt808StateStore.requirePrivate(file,false); Jt808StateStore.requirePrivate(file.getParent(),true);
        var properties=new Properties(); try(var reader=Files.newBufferedReader(file,StandardCharsets.UTF_8)) { properties.load(reader); }
        return properties;
    }
    private static byte[] hex(String value,int bytes) {
        if(value==null || !value.matches("[0-9a-fA-F]{"+bytes*2+"}")) throw invalid(); return HexFormat.of().parseHex(value);
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("JT808外盘私有配置无效，未启用扩展"); }
    public Jt808DeviceBinding binding() { return binding; }
    public Jt808Sm4Cipher cipher() { return cipher; }
    @Override public void close() { cipher.close(); }
    @Override public String toString() { return "JT808私有配置[已隐藏]"; }
}
