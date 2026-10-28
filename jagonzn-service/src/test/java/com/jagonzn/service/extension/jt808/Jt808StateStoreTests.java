package com.jagonzn.service.extension.jt808;

import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class Jt808StateStoreTests {
    @TempDir Path external;
    Path directory(String name) throws Exception { return Files.createDirectory(external.resolve(name),PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------"))); }
    @Test void junitTemporaryDirectoryMustPhysicallyUseConfiguredExternalJvmRoot() throws Exception {
        Path expected=Path.of(System.getProperty("java.io.tmpdir")).toRealPath();
        assertTrue(external.toRealPath().startsWith(expected),()->"JUnit temporary directory: "+external+"; configured root: "+expected);
    }
    @Test void atomicStateAndSerialSurviveProcessReopenWithoutReset() throws Exception {
        Path state=directory("state");
        try(var store=new Jt808StateStore(state,external)) {
            store.update(map->map.put("token","private")); assertEquals(1,store.nextSerial());
            assertThrows(UnsupportedOperationException.class,()->store.snapshot().put("x","y"));
        }
        try(var reopened=new Jt808StateStore(state,external)) { assertEquals("private",reopened.snapshot().get("token")); assertEquals(2,reopened.nextSerial()); }
        assertEquals(PosixFilePermissions.fromString("rw-------"),Files.getPosixFilePermissions(state.resolve("adapter-state.properties")));
    }
    @Test void rejectsSecondProcessSharedDirectoryAndNonPrivateState() throws Exception {
        Path state=directory("state");
        try(var store=new Jt808StateStore(state,external)) { assertThrows(IllegalStateException.class,()->new Jt808StateStore(state,external)); store.update(map->map.put("x","y")); }
        Files.setPosixFilePermissions(state.resolve("adapter-state.properties"),PosixFilePermissions.fromString("rw-r--r--"));
        assertThrows(IllegalStateException.class,()->new Jt808StateStore(state,external));
    }
    @Test void rejectsOutsideRootLinksAndPublicDirectory() throws Exception {
        Path state=directory("state"),other=directory("other");
        assertThrows(IllegalStateException.class,()->new Jt808StateStore(state,other));
        Path link=external.resolve("link"); Files.createSymbolicLink(link,state);
        assertThrows(IllegalStateException.class,()->new Jt808StateStore(link,external));
        // 配置目录本身不能借链接绕过原件检查。
        Files.setPosixFilePermissions(state,PosixFilePermissions.fromString("rwxr-xr-x"));
        assertThrows(IllegalStateException.class,()->new Jt808StateStore(state,external));
    }
    @Test void serialExhaustionAndCapacityNeverWrapOrEvictHistory() throws Exception {
        try(var store=new Jt808StateStore(directory("state"),external)) {
            store.update(map->map.put("serial","65534")); assertEquals(65535,store.nextSerial());
            assertThrows(IllegalStateException.class,store::nextSerial); assertEquals("65535",store.snapshot().get("serial"));
            assertThrows(IllegalStateException.class,()->store.update(map->{for(int i=0;i<10001;i++)map.put("k"+i,"x");}));
            assertEquals(1,store.snapshot().size());
            store.update(map->map.put("serial","2147483647")); assertThrows(IllegalStateException.class,store::nextSerial);
            store.update(map->map.put("serial","-1")); assertThrows(IllegalStateException.class,store::nextSerial);
        }
    }
    @Test void unavailableStateDoesNotFallBackToEmptyOrRecreateHistory() throws Exception {
        Path state=directory("state"); Files.writeString(state.resolve("adapter-state.properties"),"x=\\uZZZZ",StandardOpenOption.CREATE_NEW);
        Files.setPosixFilePermissions(state.resolve("adapter-state.properties"),PosixFilePermissions.fromString("rw-------"));
        assertThrows(IllegalStateException.class,()->new Jt808StateStore(state,external));
        assertEquals("x=\\uZZZZ",Files.readString(state.resolve("adapter-state.properties")));
    }
}
