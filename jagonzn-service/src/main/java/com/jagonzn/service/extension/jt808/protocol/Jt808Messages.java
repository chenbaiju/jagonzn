package com.jagonzn.service.extension.jt808.protocol;

import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/** 厂家6.1至6.10节的固定消息结构；不将状态原因码冒充持久设备事件。 */
public final class Jt808Messages {
    private Jt808Messages() { }

    /** 注册结构仅用于预绑定核对，不能据此签发平台身份。 */
    public record Registration(byte[] manufacturer, byte[] model, byte[] mac, int series,
                               int lockType, byte[] iccid, byte[] deviceId) {
        /** 数组均为本记录独占副本。 */
        public Registration {
            manufacturer=manufacturer.clone(); model=model.clone(); mac=mac.clone();
            iccid=iccid.clone(); deviceId=deviceId.clone();
        }
        @Override public byte[] manufacturer() { return manufacturer.clone(); }
        @Override public byte[] model() { return model.clone(); }
        @Override public byte[] mac() { return mac.clone(); }
        @Override public byte[] iccid() { return iccid.clone(); }
        @Override public byte[] deviceId() { return deviceId.clone(); }
    }

    /** 厂家应答只证明收到了指定流水号的消息。 */
    public record Acknowledgement(int serial, int messageId, int result) { }

    /** 厂家6.22的请求或应答；请求类型0/2，授时应答类型1。 */
    public record TimeSync(int operation,int result) { }

    /** 厂家6.29明确的版本字段；不把未知报文体当作可打印日志。 */
    public record FirmwareVersion(int deviceType,String firmwareDate,int major,int minor) { }

    /** @param body 逗号分隔版本串或厂家记载的十字符版本串 @return 已校验的版本字段 */
    public static FirmwareVersion firmwareVersion(byte[] body) {
        require(body.length>0 && body.length<=64); int end=body.length;
        while(end>0 && body[end-1]==0)end--;
        for(int i=0;i<end;i++)require(body[i]>=0x20 && body[i]<=0x7e);
        String text=new String(body,0,end,java.nio.charset.StandardCharsets.US_ASCII);
        String[] fields;
        if(text.matches("[0-9]{10}")) fields=new String[]{text.substring(0,2),text.substring(2,8),text.substring(8,9),text.substring(9,10)};
        else {
            require(text.matches("[0-9]{1,3},[0-9]{6},[0-9]{1,3},[0-9]{1,3}")); fields=text.split(",");
        }
        int type=Integer.parseInt(fields[0]),major=Integer.parseInt(fields[2]),minor=Integer.parseInt(fields[3]);
        require(type<=255 && major<=255 && minor<=255);
        try { java.time.LocalDate.of(2000+Integer.parseInt(fields[1].substring(0,2)),Integer.parseInt(fields[1].substring(2,4)),Integer.parseInt(fields[1].substring(4,6))); }
        catch(DateTimeException invalidDate) { throw invalid(); }
        return new FirmwareVersion(type,fields[1],major,minor);
    }

    /** @param body 两字节授时交互 @return 明确操作类型与结果，不把请求当作鉴权 */
    public static TimeSync timeSync(byte[] body) {
        require(body.length==2); int operation=Byte.toUnsignedInt(body[0]),result=Byte.toUnsignedInt(body[1]);
        require(operation<=2 && result<=1 && (operation==1 || result==0));
        return new TimeSync(operation,result);
    }

    /** @param now 服务端当前时刻 @return 按厂家6.22原图的北京时间编码，六字节二进制数值，非BCD */
    public static byte[] serverTime(Instant now) {
        var local=now.atOffset(ZoneOffset.ofHours(8)); require(local.getYear()>=2000 && local.getYear()<=2099);
        return new byte[]{(byte)(local.getYear()-2000),(byte)local.getMonthValue(),(byte)local.getDayOfMonth(),
                (byte)local.getHour(),(byte)local.getMinute(),(byte)local.getSecond()};
    }

    /** 位置和状态快照；时间按厂家6.7节固定GMT+8解析。 */
    public record Location(Instant occurredAt, Map<String,Object> properties) {
        public Location { properties=Map.copyOf(properties); }
    }

    /** @param body 注册消息体 @return 完整59字节注册结构；锁类型0保留为未提供，不用于身份或型号推断 */
    public static Registration registration(byte[] body) {
        require(body.length==59);
        // 真机固件会把描述字段填0；只兼容该缺省值，其他未定义类型仍拒绝。
        int type=Byte.toUnsignedInt(body[36]); require(type<=3);
        return new Registration(Arrays.copyOfRange(body,4,9),Arrays.copyOfRange(body,9,29),
                Arrays.copyOfRange(body,29,35),Byte.toUnsignedInt(body[35]),type,
                Arrays.copyOfRange(body,37,47),Arrays.copyOfRange(body,47,59));
    }

    /** @param body 锁通用应答体 @return 原消息流水、ID和结果 */
    public static Acknowledgement acknowledgement(byte[] body) {
        require(body.length==5); var b=ByteBuffer.wrap(body);
        return new Acknowledgement(Short.toUnsignedInt(b.getShort()),Short.toUnsignedInt(b.getShort()),
                Byte.toUnsignedInt(b.get()));
    }

    /** @param serial 被应答流水 @param messageId 被应答ID @param result 厂家结果字节 @return 通用应答体 */
    public static byte[] acknowledgement(int serial,int messageId,int result) {
        return ByteBuffer.allocate(5).putShort((short)serial).putShort((short)messageId).put((byte)result).array();
    }

    /** @param serial 注册流水 @param token 成功时必须为六字节；失败为空 @return 注册响应 */
    public static byte[] registrationReply(int serial,byte[] token) {
        require(token==null || token.length==6);
        return ByteBuffer.allocate(token==null?3:9).putShort((short)serial).put((byte)(token==null?1:0))
                .put(token==null?new byte[0]:token).array();
    }

    /** @param body 位置报告或查询应答体 @param offset 查询应答跳过两字节流水 @return 有效状态快照 */
    public static Location location(byte[] body,int offset) {
        require(offset>=0 && body.length-offset>=28);
        var b=ByteBuffer.wrap(body).order(ByteOrder.BIG_ENDIAN); b.position(offset);
        var values=new LinkedHashMap<String,Object>();
        values.put("alarm_flags",Integer.toUnsignedLong(b.getInt()));
        long flags=Integer.toUnsignedLong(b.getInt()); values.put("status_flags",flags);
        long latitude=Integer.toUnsignedLong(b.getInt()),longitude=Integer.toUnsignedLong(b.getInt());
        require(latitude<=90_000_000 && longitude<=180_000_000);
        boolean located=(flags&2)!=0 && latitude!=0 && longitude!=0;
        values.put("location_valid",located);
        if(located) {
            values.put("latitude",BigDecimal.valueOf((flags&4)==0?latitude:-latitude,6));
            values.put("longitude",BigDecimal.valueOf((flags&8)==0?longitude:-longitude,6));
        }
        values.put("altitude_m",Short.toUnsignedInt(b.getShort()));
        values.put("speed_kmh",BigDecimal.valueOf(Short.toUnsignedInt(b.getShort()),1));
        int heading=Short.toUnsignedInt(b.getShort()); require(heading<=359); values.put("heading",heading);
        Instant occurredAt;
        try {
            occurredAt=LocalDateTime.of(2000+bcd(b.get()),bcd(b.get()),bcd(b.get()),
                    bcd(b.get()),bcd(b.get()),bcd(b.get())).toInstant(ZoneOffset.ofHours(8));
        } catch(DateTimeException error) { throw invalid(); }
        var seen=new java.util.HashSet<Integer>();
        while(b.hasRemaining()) {
            require(b.remaining()>=2); int id=Byte.toUnsignedInt(b.get()),length=Byte.toUnsignedInt(b.get());
            require(id!=0 && seen.add(id) && length<=b.remaining());
            byte[] item=new byte[length]; b.get(item); var itemBytes=ByteBuffer.wrap(item);
            switch(id) {
                case 0x30 -> { require(length==1); values.put("signal_strength",Byte.toUnsignedInt(item[0])); }
                case 0x31,0xe8 -> { require(length==1); values.put(id==0x31?"satellites":"satellites_e8",Byte.toUnsignedInt(item[0])); }
                case 0xe1 -> { require(length==4); values.put("unlock_count",Integer.toUnsignedLong(itemBytes.getInt())); }
                case 0xe2 -> {
                    require(length==2); int status=Short.toUnsignedInt(itemBytes.getShort());
                    values.put("lock_status",status); values.put("door_closed",(status&1)!=0);
                    values.put("report_reason",(status>>>1)&15); values.put("charging",(status&64)!=0);
                    // bit10仅保留厂家“锁梁状态”原始定义；未经型号确认，不能解释为DM08-VA锁舌到位。
                    values.put("battery_cover_closed",(status&256)!=0); values.put("shackle_closed",(status&1024)!=0);
                }
                case 0xe3 -> {
                    require(length==6); int percent=Short.toUnsignedInt(itemBytes.getShort()); require(percent<=100);
                    values.put("battery_percent",percent);
                    values.put("battery_voltage",BigDecimal.valueOf(Short.toUnsignedInt(itemBytes.getShort()),2));
                    values.put("charging_voltage",BigDecimal.valueOf(Short.toUnsignedInt(itemBytes.getShort()),2));
                }
                case 0xe7 -> { require(length==2); values.put("firmware_major",Byte.toUnsignedInt(item[0])); values.put("firmware_minor",Byte.toUnsignedInt(item[1])); }
                // 其余厂家扩展只校验TLV边界；不猜测密码、卡号、人脸或基站信息的业务含义。
                default -> { }
            }
        }
        return new Location(occurredAt,values);
    }

    private static int bcd(byte value) {
        int n=Byte.toUnsignedInt(value); require((n>>>4)<=9 && (n&15)<=9); return (n>>>4)*10+(n&15);
    }
    private static void require(boolean condition) { if(!condition) throw invalid(); }
    private static Jt808ProtocolException invalid() { return new Jt808ProtocolException(Jt808ProtocolException.Reason.LENGTH); }
}
