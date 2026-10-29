package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.*;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.time.Instant;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class Jt808MessagesTests {
    @Test void firmwareVersionAcceptsDocumentedCommaAndFixedFormatsButRejectsUnknownPayloads() {
        var expected=new Jt808Messages.FirmwareVersion(2,"231224",1,2);
        assertEquals(expected,Jt808Messages.firmwareVersion("0223122412".getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
        assertEquals(expected,Jt808Messages.firmwareVersion("02,231224,1,2".getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
        for(String bad:new String[]{"02,231332,1,2","secret","02,231224,256,2","02,231224,1,2\n"})
            assertThrows(Jt808ProtocolException.class,()->Jt808Messages.firmwareVersion(bad.getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
    }
    @Test void timeSyncUsesSixBinaryBeijingFieldsAndRejectsMalformedOperations() {
        assertArrayEquals(new byte[]{26,10,29,9,12,34},Jt808Messages.serverTime(Instant.parse("2026-10-29T01:12:34Z")));
        assertEquals(new Jt808Messages.TimeSync(0,0),Jt808Messages.timeSync(new byte[]{0,0}));
        assertEquals(new Jt808Messages.TimeSync(2,0),Jt808Messages.timeSync(new byte[]{2,0}));
        for(byte[] invalid:new byte[][]{{0},{3,0},{0,1},{1,2}}) assertThrows(Jt808ProtocolException.class,()->Jt808Messages.timeSync(invalid));
        assertThrows(Jt808ProtocolException.class,()->Jt808Messages.serverTime(Instant.parse("2100-01-01T00:00:00Z")));
    }
    @Test void registrationKeepsUnspecifiedFirmwareMetadataWithoutInferringLockType() {
        byte[] body=Jt808TestLock.registration(); body[35]=0; body[36]=0;
        var parsed=Jt808Messages.registration(body);
        assertEquals(0,parsed.series()); assertEquals(0,parsed.lockType());
        assertArrayEquals(new byte[5],parsed.manufacturer()); assertArrayEquals(new byte[20],parsed.model());
        assertArrayEquals(Jt808TestLock.MAC,parsed.mac());
    }
    @Test void registrationUsesVendor59ByteLayoutAndDefensiveCopies() {
        byte[] body=Jt808TestLock.registration(); var parsed=Jt808Messages.registration(body);
        assertArrayEquals(Jt808TestLock.MAC,parsed.mac()); assertEquals(2,parsed.lockType()); assertEquals(255,parsed.series());
        body[29]=9; parsed.mac()[0]=8; assertEquals(0,parsed.mac()[0]);
        assertThrows(Jt808ProtocolException.class,()->Jt808Messages.registration(new byte[58]));
        body[36]=9; assertThrows(Jt808ProtocolException.class,()->Jt808Messages.registration(body));
    }
    @Test void acknowledgementAndRegistrationReplyHaveExactLengths() {
        assertEquals(new Jt808Messages.Acknowledgement(65535,0x8500,0),Jt808Messages.acknowledgement(Jt808Messages.acknowledgement(65535,0x8500,0)));
        assertEquals(3,Jt808Messages.registrationReply(1,null).length);
        assertEquals(9,Jt808Messages.registrationReply(1,new byte[6]).length);
        assertThrows(Jt808ProtocolException.class,()->Jt808Messages.acknowledgement(new byte[6]));
    }
    @Test void parsesVendorGmt8TimeAndVaDoorBatteryFirmwareSnapshot() {
        var report=Jt808Messages.location(Jt808TestLock.location(),0);
        assertEquals(Instant.parse("2026-10-28T12:00:00Z"),report.occurredAt());
        assertEquals(true,report.properties().get("door_closed")); assertEquals(80,report.properties().get("battery_percent"));
        assertEquals(new BigDecimal("4.00"),report.properties().get("battery_voltage"));
        assertEquals(new BigDecimal("31.230400"),report.properties().get("latitude")); assertEquals(2,report.properties().get("firmware_minor"));
        assertThrows(UnsupportedOperationException.class,()->report.properties().put("x",1));
    }
    @Test void southWestSignsAndZeroInvalidCoordinateAreExplicit() {
        byte[] body=Jt808TestLock.location(); ByteBuffer.wrap(body).putInt(4,14);
        assertEquals(new BigDecimal("-31.230400"),Jt808Messages.location(body,0).properties().get("latitude"));
        ByteBuffer.wrap(body).putInt(8,0); var invalid=Jt808Messages.location(body,0).properties();
        assertEquals(false,invalid.get("location_valid")); assertFalse(invalid.containsKey("latitude")); assertFalse(invalid.containsKey("longitude"));
    }
    @Test void querySkipsOnlyItsOriginalResponseSerial() {
        assertEquals(Jt808Messages.location(Jt808TestLock.location(),0),Jt808Messages.location(Jt808TestLock.query(65535),2));
    }
    @Test void rejectsInvalidBcdCalendarHeadingAndCoordinateWithoutNormalization() {
        for(int kind=0;kind<4;kind++) {
            byte[] body=Jt808TestLock.location();
            switch(kind) { case 0->body[23]=0x1a; case 1->body[24]=0x32; case 2->ByteBuffer.wrap(body).putShort(20,(short)360); case 3->ByteBuffer.wrap(body).putInt(8,90_000_001); }
            assertThrows(Jt808ProtocolException.class,()->Jt808Messages.location(body,0));
        }
    }
    @Test void rejectsDuplicateTruncatedAndWrongKnownTlvLength() {
        byte[] base=Jt808TestLock.location();
        byte[] duplicate=Arrays.copyOf(base,base.length+4); System.arraycopy(new byte[]{(byte)0xe2,2,0,0},0,duplicate,base.length,4);
        assertThrows(Jt808ProtocolException.class,()->Jt808Messages.location(duplicate,0));
        assertThrows(Jt808ProtocolException.class,()->Jt808Messages.location(Arrays.copyOf(base,base.length-1),0));
        base[29]=1; assertThrows(Jt808ProtocolException.class,()->Jt808Messages.location(base,0));
    }
    @Test void unknownExtensionsAreSkippedButNotExposedAsCredentialsOrEvents() {
        byte[] base=Arrays.copyOf(Jt808TestLock.location(),32); base[28]=(byte)0xea; base[29]=2;
        var result=Jt808Messages.location(base,0).properties(); assertFalse(result.containsKey("door_closed")); assertFalse(result.containsKey("card"));
    }
}
