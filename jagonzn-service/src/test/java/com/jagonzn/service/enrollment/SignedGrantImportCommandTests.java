package com.jagonzn.service.enrollment;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Arrays;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 离线介质只在有界读取后交给平台验签内核。 */
class SignedGrantImportCommandTests {
    @TempDir Path temporary;

    @Test
    void readsPrivateBoundedFileAndRejectsSymlinkPermissionsAndLength() throws Exception {
        Path file = temporary.resolve("customer.tcshgrant");
        byte[] validLength = new byte[76];
        Arrays.fill(validLength, (byte) 7);
        Files.write(file, validLength);
        Files.setPosixFilePermissions(file, Set.of(
                PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
        assertThat(SignedGrantImportCommand.readGrant(file)).containsExactly(validLength);

        Path link = temporary.resolve("link.tcshgrant");
        Files.createSymbolicLink(link, file);
        assertThatThrownBy(() -> SignedGrantImportCommand.readGrant(link))
                .hasMessageContaining("常规");
        Files.setPosixFilePermissions(file, Set.of(PosixFilePermission.OWNER_READ));
        assertThatThrownBy(() -> SignedGrantImportCommand.readGrant(file))
                .hasMessageContaining("受限");
        Files.setPosixFilePermissions(file, Set.of(
                PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE));
        Files.write(file, new byte[65612]);
        assertThatThrownBy(() -> SignedGrantImportCommand.readGrant(file))
                .hasMessageContaining("长度");
        Files.write(file, new byte[75]);
        assertThatThrownBy(() -> SignedGrantImportCommand.readGrant(file))
                .hasMessageContaining("长度");
    }
}
