package com.jagonzn.service.extension.jt808.protocol;

import static org.junit.jupiter.api.Assertions.*;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class Jt808DeviceProfileTests {
    private static final byte[] WIRE = HexFormat.of().parseHex("7e0002000000000000000000010000037e");

    @Test void recognizesRomanFiveWithoutAcceptingRomanFour() {
        assertEquals(Jt808DeviceProfile.Model.DM08_V_A, Jt808DeviceProfile.modelForVendorName("ZN-DM08-Ⅴ(A)"));
        assertEquals(Jt808DeviceProfile.Model.DM08_V_A, Jt808DeviceProfile.modelForVendorName("DM08-VA"));
        assertThrows(Jt808ProtocolException.class, () -> Jt808DeviceProfile.modelForVendorName("ZN-DM08-Ⅳ(A)"));
        assertThrows(Jt808ProtocolException.class, () -> Jt808DeviceProfile.modelForVendorName("ZN-DM08-IV(A)"));
    }

    @Test void confirmedPlainVaUsesHeaderChecksum() {
        var profile = new Jt808DeviceProfile(Jt808DeviceProfile.Model.DM08_V_A, Jt808DeviceProfile.BodyProtection.PLAIN);
        var message = profile.decodeUplink(WIRE);
        assertEquals(2, message.messageId());
        assertArrayEquals(WIRE, profile.encodeDownlink(message));
    }

    @Test void zeroWireEncryptionBitsDoNotOverrideUnconfirmedOrSm4Profile() {
        for (var protection : new Jt808DeviceProfile.BodyProtection[]{Jt808DeviceProfile.BodyProtection.UNCONFIRMED,
                Jt808DeviceProfile.BodyProtection.SM4_CBC}) {
            var profile = new Jt808DeviceProfile(Jt808DeviceProfile.Model.DM08_V_A, protection);
            var error = assertThrows(Jt808ProtocolException.class, () -> profile.decodeUplink(WIRE));
            assertEquals(Jt808ProtocolException.Reason.ENCRYPTION, error.reason());
            var plain = Jt808FrameCodec.decode(WIRE, Jt808ChecksumMode.HEADER_AND_BODY);
            assertThrows(Jt808ProtocolException.class, () -> profile.encodeDownlink(plain));
        }
    }

    @Test void vaDoorMagnetBitIsNotTheIvInterpretation() {
        var profile = new Jt808DeviceProfile(Jt808DeviceProfile.Model.DM08_V_A, Jt808DeviceProfile.BodyProtection.UNCONFIRMED);
        assertEquals(Jt808DeviceProfile.DoorState.OPEN, profile.doorState(0));
        assertEquals(Jt808DeviceProfile.DoorState.CLOSED, profile.doorState(1));
        assertEquals(Jt808DeviceProfile.DoorState.CLOSED, profile.doorState(0xffff));
        assertThrows(Jt808ProtocolException.class, () -> profile.doorState(65536));
    }
}
