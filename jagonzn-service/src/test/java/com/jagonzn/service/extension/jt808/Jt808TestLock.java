package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.*;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;

/** 合成国密设备对端；上下行按文档各自构帧，避免用服务器下行编码伪造上行。 */
final class Jt808TestLock {
    static final String TERMINAL="0000000000000001";
    static final byte[] MAC={0,17,34,51,68,85};
    static final byte[] KEY=java.util.HexFormat.of().parseHex("0123456789abcdeffedcba9876543210");
    static byte[] uplink(int message,int serial,byte[] body) {
        try(var cipher=new Jt808Sm4Cipher(KEY,new byte[16])) {
            byte[] encrypted=cipher.encryptZeroPadded(body);
            var raw=ByteBuffer.allocate(14+encrypted.length+1).putShort((short)message).putShort((short)body.length)
                    .putLong(1).putShort((short)serial).put(encrypted);
            int crc=0; for(int i=0;i<14+body.length;i++) crc^=raw.array()[i]&255;
            raw.put((byte)crc); return wrap(raw.array());
        }
    }
    static Jt808Frame downlink(byte[] wire) {
        byte[] raw=unwrap(wire); var b=ByteBuffer.wrap(raw); int id=Short.toUnsignedInt(b.getShort()),props=Short.toUnsignedInt(b.getShort());
        assertEquals(0x400,props&0xfc00); assertEquals(1,b.getLong()); int serial=Short.toUnsignedInt(b.getShort());
        try(var cipher=new Jt808Sm4Cipher(KEY,new byte[16])) {
            byte[] plain=cipher.decryptZeroPadded(Arrays.copyOfRange(raw,14,raw.length-1),props&1023);
            int crc=0; for(int i=0;i<14;i++) crc^=raw[i]&255; for(byte v:plain) crc^=v&255;
            assertEquals(crc,raw[raw.length-1]&255); return new Jt808Frame(id,TERMINAL,serial,Optional.empty(),plain);
        }
    }
    static byte[] registration() { byte[] body=new byte[59]; System.arraycopy(MAC,0,body,29,6); body[35]=(byte)255; body[36]=2; return body; }
    static byte[] location() {
        return ByteBuffer.allocate(28+4+8+4).putInt(0).putInt(2).putInt(31_230_400).putInt(121_473_700)
                .putShort((short)5).putShort((short)0).putShort((short)90)
                .put(new byte[]{0x26,0x10,0x28,0x20,0,0})
                .put(new byte[]{(byte)0xe2,2,0,1,(byte)0xe3,6,0,80,1,(byte)144,0,0,(byte)0xe7,2,1,2}).array();
    }
    static byte[] query(int serial) { return ByteBuffer.allocate(2+location().length).putShort((short)serial).put(location()).array(); }
    static byte[] read(InputStream input) throws Exception {
        var out=new ByteArrayOutputStream(); int value;
        while((value=input.read())!=-1 && value!=0x7e) { }
        if(value<0) throw new java.io.EOFException(); out.write(value);
        while((value=input.read())!=-1) { out.write(value); if(value==0x7e) return out.toByteArray(); }
        throw new java.io.EOFException();
    }
    private static byte[] wrap(byte[] raw) {
        var out=new ByteArrayOutputStream(); out.write(0x7e);
        for(byte value:raw) { if(value==0x7e || value==0x7d) { out.write(0x7d); out.write(value==0x7e?2:1); } else out.write(value); }
        out.write(0x7e); return out.toByteArray();
    }
    private static byte[] unwrap(byte[] wire) {
        var out=new ByteArrayOutputStream(); assertEquals(0x7e,wire[0]); assertEquals(0x7e,wire[wire.length-1]);
        for(int i=1;i<wire.length-1;i++) { int value=wire[i]&255; if(value==0x7d) value=wire[++i]==1?0x7d:0x7e; out.write(value); }
        return out.toByteArray();
    }
}
