package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.*;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.time.Instant;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class Jt808MessagesTests {
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
