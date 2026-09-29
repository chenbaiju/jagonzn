package com.jagonzn.service.enrollment;

import com.things.cloud.entitlement.application.EnrollmentRequestV1;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.Assumptions;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFileAttributeView;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 现场申请生成的重试、单租户绑定和文件篡改边界。 */
class EnrollmentRequestCommandTests {
    @TempDir Path temporary;

    @Test
    void createsOneStableSignedRequestAndKeepsPrivateIdentityLocal() throws Exception {
        Path directory = temporary.resolve("deployment");
        UUID tenant = UUID.randomUUID();
        var first = EnrollmentRequestCommand.prepare(directory, tenant);
        byte[] original = Files.readAllBytes(first.requestFile());
        var verified = EnrollmentRequestV1.verify(original);
        assertThat(verified.deploymentId()).isEqualTo(first.deploymentId());
        assertThat(verified.requestId()).isEqualTo(first.requestId());
        assertThat(verified.tenantId()).isEqualTo(tenant);
        assertThat(first.requestId().version()).isEqualTo(7);
        var inspected = EnrollmentRequestCommand.inspect(directory);
        assertThat(inspected.deploymentId()).isEqualTo(first.deploymentId());
        assertThat(inspected.requestId()).isEqualTo(first.requestId());
        assertThat(inspected.tenantId()).isEqualTo(tenant);
        assertThat(inspected.publicKeySha256()).isEqualTo(verified.publicKeySha256());
        assertThat(inspected.requestSha256()).isEqualTo(verified.requestSha256());

        var second = EnrollmentRequestCommand.prepare(directory, tenant);
        assertThat(second).isEqualTo(first);
        assertThat(Files.readAllBytes(second.requestFile())).isEqualTo(original);
        if (Files.getFileAttributeView(directory, PosixFileAttributeView.class) != null) {
            assertThat(Files.getPosixFilePermissions(directory)).containsExactlyInAnyOrder(
                    PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE,
                    PosixFilePermission.OWNER_EXECUTE);
            assertThat(Files.getPosixFilePermissions(directory.resolve("deployment-identity.bin")))
                    .isEqualTo(Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
        }
    }

    @Test
    void tenantChangeAndTamperedRequestFailWithoutRotatingIdentity() throws Exception {
        Path directory = temporary.resolve("deployment");
        UUID tenant = UUID.randomUUID();
        var first = EnrollmentRequestCommand.prepare(directory, tenant);
        byte[] identity = Files.readAllBytes(directory.resolve("deployment-identity.bin"));
        assertThatThrownBy(() -> EnrollmentRequestCommand.prepare(directory, UUID.randomUUID()))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("另一业务租户");
        byte[] corrupt = Files.readAllBytes(first.requestFile());
        corrupt[corrupt.length - 1] ^= 1;
        Files.write(first.requestFile(), corrupt);
        assertThatThrownBy(() -> EnrollmentRequestCommand.prepare(directory, tenant))
                .isInstanceOf(java.io.IOException.class).hasMessageContaining("不一致");
        assertThatThrownBy(() -> EnrollmentRequestCommand.inspect(directory))
                .isInstanceOf(java.io.IOException.class).hasMessageContaining("不一致");
        assertThat(Files.readAllBytes(directory.resolve("deployment-identity.bin"))).isEqualTo(identity);
    }

    @Test
    void unsafeExistingDirectoryOrSymbolicLinkIsRejected() throws Exception {
        Assumptions.assumeTrue(Files.getFileAttributeView(temporary, PosixFileAttributeView.class) != null);
        Path absent = temporary.resolve("absent");
        assertThatThrownBy(() -> EnrollmentRequestCommand.inspect(absent))
                .isInstanceOf(java.io.IOException.class).hasMessageContaining("不存在");
        assertThat(Files.exists(absent)).isFalse();
        Path open = temporary.resolve("open");
        Files.createDirectory(open);
        Files.setPosixFilePermissions(open, Set.of(PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE, PosixFilePermission.OWNER_EXECUTE,
                PosixFilePermission.GROUP_READ));
        assertThatThrownBy(() -> EnrollmentRequestCommand.prepare(open, UUID.randomUUID()))
                .isInstanceOf(java.io.IOException.class).hasMessageContaining("权限");
        Path link = temporary.resolve("link");
        Files.createSymbolicLink(link, open);
        assertThatThrownBy(() -> EnrollmentRequestCommand.prepare(link, UUID.randomUUID()))
                .isInstanceOf(java.io.IOException.class).hasMessageContaining("符号链接");
        assertThatThrownBy(() -> EnrollmentRequestCommand.inspect(link))
                .isInstanceOf(java.io.IOException.class).hasMessageContaining("符号链接");

        Path privateDirectory = temporary.resolve("private");
        EnrollmentRequestCommand.prepare(privateDirectory, UUID.randomUUID());
        Files.setPosixFilePermissions(privateDirectory.resolve("deployment-identity.bin"),
                Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE,
                        PosixFilePermission.GROUP_READ));
        assertThatThrownBy(() -> EnrollmentRequestCommand.inspect(privateDirectory))
                .isInstanceOf(java.io.IOException.class).hasMessageContaining("权限");
    }
}
