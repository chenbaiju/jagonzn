package com.jagonzn.service.extension.jt808;

import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import com.things.link.ingestion.application.access.*;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import tools.jackson.databind.ObjectMapper;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class Jt808PrivateConfigurationTests {
    @TempDir Path external;
    Path write(String name,String text) throws Exception {
        Path file=external.resolve(name); Files.writeString(file,text,StandardOpenOption.CREATE_NEW);
        Files.setPosixFilePermissions(external,PosixFilePermissions.fromString("rwx------"));
        Files.setPosixFilePermissions(file,PosixFilePermissions.fromString("rw-------")); return file;
    }
    String binding() { return "terminal.id=0000000000000001\nbluetooth.mac.hex=001122334455\nplatform.project-key=project\nplatform.device-key=lock\nplatform.secret=synthetic-platform-secret\nmodel.version=1.0.0\nproperty.door_closed=door_closed\n"; }
    String crypto() { return "sm4.key.hex=0123456789abcdeffedcba9876543210\nsm4.iv.hex=00000000000000000000000000000000\n"; }
    @Test void explicitPrivateConfigLoadsWithoutDefaultEnrollmentAndRedactsDiagnosticString() throws Exception {
        Path crypto=write("crypto",crypto()),binding=write("binding",binding());
        try(var config=new Jt808PrivateConfiguration(external,crypto,binding)) {
            assertFalse(config.binding().enrollmentAllowed(java.time.Instant.now()));
            assertFalse(config.toString().contains("012345")); assertFalse(config.binding().toString().contains("secret"));
        }
    }
    @Test void shortIvIsRejectedWithoutPaddingOrFallback() throws Exception {
        Path crypto=write("crypto",crypto().replace("00000000000000000000000000000000","000000000000000000000000000000")),binding=write("binding",binding());
        assertThrows(IllegalArgumentException.class,()->new Jt808PrivateConfiguration(external,crypto,binding));
    }
    @Test void insecurePermissionAndUnrecognizedKeysCannotEnableAdapter() throws Exception {
        Path crypto=write("crypto",crypto()),binding=write("binding",binding()+"unexpected.secret=private\n");
        assertThrows(IllegalArgumentException.class,()->new Jt808PrivateConfiguration(external,crypto,binding));
        Files.writeString(binding,binding()); Files.setPosixFilePermissions(crypto,PosixFilePermissions.fromString("rw-r--r--"));
        assertThrows(IllegalArgumentException.class,()->new Jt808PrivateConfiguration(external,crypto,binding));
    }
    @Test void disabledConfigurationDoesNotReadFilesOrStartListener() {
        new ApplicationContextRunner().withUserConfiguration(Jt808ExtensionConfiguration.class).run(context->{
            assertNull(context.getStartupFailure()); assertEquals(0,context.getBeansOfType(Jt808TcpServer.class).size());
        });
    }
    @Test void enabledConfigurationWithMissingRealBindingFailsClosed() {
        new ApplicationContextRunner().withUserConfiguration(Jt808ExtensionConfiguration.class)
                .withPropertyValues("jagonzn.jt808.enabled=true").run(context->assertNotNull(context.getStartupFailure()));
    }
    @Test void enabledSoftwareContextSelectsPrimaryRouterAndClosesEphemeralListener() throws Exception {
        Path crypto=write("crypto",crypto()),binding=write("binding",binding());
        Path state=Files.createDirectory(external.resolve("state"),PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        var nativePort=mock(DeviceAccessPushPort.class); var servers=new java.util.ArrayList<Jt808TcpServer>();
        new ApplicationContextRunner().withUserConfiguration(Jt808ExtensionConfiguration.class)
                .withBean(ObjectMapper.class,ObjectMapper::new)
                .withBean(DeviceAccessAuthBudget.class,()->mock(DeviceAccessAuthBudget.class))
                .withBean(DeviceAccessDeviceAuthenticator.class,()->mock(DeviceAccessDeviceAuthenticator.class))
                .withBean(DeviceAccessUplinkIngressService.class,()->mock(DeviceAccessUplinkIngressService.class))
                .withBean(DeviceCommandAccessReplyPort.class,()->mock(DeviceCommandAccessReplyPort.class))
                .withBean("nativePush",DeviceAccessPushPort.class,()->nativePort)
                .withPropertyValues("jagonzn.jt808.enabled=true","things-link.access.tcp.enabled=true","jagonzn.jt808.port=0",
                        "jagonzn.jt808.external-root="+external,"jagonzn.jt808.crypto-file="+crypto,
                        "jagonzn.jt808.binding-file="+binding,"jagonzn.jt808.state-directory="+state)
                .run(context->{
                    assertNull(context.getStartupFailure()); assertInstanceOf(Jt808PushRouter.class,context.getBean(DeviceAccessPushPort.class));
                    var server=context.getBean(Jt808TcpServer.class); servers.add(server); assertTrue(server.isRunning());
                    assertNotEquals(6808,server.boundPort());
                });
        assertEquals(1,servers.size()); assertFalse(servers.getFirst().isRunning());
    }
}
