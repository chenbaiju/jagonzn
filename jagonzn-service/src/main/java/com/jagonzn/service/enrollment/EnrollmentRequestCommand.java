package com.jagonzn.service.enrollment;

import com.things.cloud.entitlement.application.EnrollmentRequestV1;
import com.things.cloud.shared.id.Uuid7;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.AclEntry;
import java.nio.file.attribute.AclEntryPermission;
import java.nio.file.attribute.AclEntryType;
import java.nio.file.attribute.AclFileAttributeView;
import java.nio.file.attribute.PosixFileAttributeView;
import java.nio.file.attribute.PosixFilePermission;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * jagonzn 现场离线申请工具。一个安全目录保存一份稳定部署身份；
 * 输出文件只含已签申请，仍需发行方核验租户归属后才能签发权益。
 */
public final class EnrollmentRequestCommand {
    private static final String MAGIC = "JAGONZN-ENROLLMENT-IDENTITY-1";
    private static final String IDENTITY_NAME = "deployment-identity.bin";
    private static final String REQUEST_NAME = "enrollment-request.tcshreq";
    private static final int MAX_IDENTITY_BYTES = 1024;
    private static final Set<PosixFilePermission> DIRECTORY_PERMISSIONS = Set.of(
            PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE,
            PosixFilePermission.OWNER_EXECUTE);
    private static final Set<PosixFilePermission> FILE_PERMISSIONS = Set.of(
            PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);

    private EnrollmentRequestCommand() { }

    /** 从可执行 JAR 调用，且只接受显式的目录与已知本地租户 ID。 */
    public static void run(String[] args) throws Exception {
        if (args.length != 3 || !"--prepare-enrollment".equals(args[0])) {
            throw new IllegalArgumentException("用法：--prepare-enrollment <身份目录> <本地业务租户UUID>");
        }
        Prepared prepared = prepare(Path.of(args[1]), UUID.fromString(args[2]));
        System.out.println("部署 ID：" + prepared.deploymentId());
        System.out.println("申请 ID：" + prepared.requestId());
        System.out.println("申请文件：" + prepared.requestFile());
        System.out.println("仅传递申请文件；身份目录含私钥，须单独安全备份。");
    }

    /** 重试使用相同申请 ID、密钥和字节；不同租户不得重用此部署身份。 */
    public static Prepared prepare(Path directory, UUID tenantId) throws Exception {
        if (tenantId == null || tenantId.equals(new UUID(0, 0))) {
            throw new IllegalArgumentException("本地业务租户 ID 无效");
        }
        Path root = directory.toAbsolutePath().normalize();
        ensurePrivateDirectory(root);
        Path identityFile = root.resolve(IDENTITY_NAME);
        Path requestFile = root.resolve(REQUEST_NAME);
        Path lockFile = root.resolve(".deployment-identity.lock");
        if (Files.isSymbolicLink(lockFile)) throw new IOException("身份锁文件不能是符号链接");
        try (FileChannel channel = FileChannel.open(lockFile,
                StandardOpenOption.CREATE, StandardOpenOption.WRITE);
             FileLock ignored = channel.lock()) {
            makeOwnerOnly(lockFile, false);
            Identity identity;
            if (Files.exists(identityFile, LinkOption.NOFOLLOW_LINKS)) {
                identity = readIdentity(identityFile);
            } else {
                if (Files.isSymbolicLink(identityFile)) throw new IOException("身份文件不能是符号链接");
                KeyPair keyPair = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
                identity = new Identity(Uuid7.generate(), Uuid7.generate(), tenantId,
                        keyPair.getPublic(), keyPair.getPrivate());
                atomicCreate(identityFile, encode(identity));
            }
            if (!identity.tenantId().equals(tenantId)) {
                throw new IllegalArgumentException("部署身份已绑定另一业务租户，不得改写");
            }
            byte[] envelope = EnrollmentRequestV1.create(identity.requestId(), identity.deploymentId(),
                    identity.tenantId(), identity.publicKey(), identity.privateKey());
            if (Files.exists(requestFile, LinkOption.NOFOLLOW_LINKS)) {
                requirePrivateRegularFile(requestFile);
                if (Files.size(requestFile) > EnrollmentRequestV1.MAX_ENVELOPE_BYTES) {
                    throw new IOException("现有申请文件过长，不得覆盖");
                }
                if (!Arrays.equals(Files.readAllBytes(requestFile), envelope)) {
                    throw new IOException("现有申请文件与部署身份不一致，不得覆盖");
                }
            } else {
                if (Files.isSymbolicLink(requestFile)) throw new IOException("申请文件不能是符号链接");
                atomicCreate(requestFile, envelope);
            }
            return new Prepared(identity.deploymentId(), identity.requestId(), root.resolve(REQUEST_NAME));
        }
    }

    /** 只公开可传递的申请路径与非秘密标识。 */
    public record Prepared(UUID deploymentId, UUID requestId, Path requestFile) { }

    /**
     * 现场导入前只读核验稳定身份与申请原字节；返回非秘密身份，不向平台 Bean 暴露私钥。
     * 身份目录必须已由 prepare 建立，缺文件、权限漂移或申请被替换均明确失败。
     */
    public static VerifiedIdentity inspect(Path directory) throws Exception {
        Path root = directory.toAbsolutePath().normalize();
        if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("身份目录不存在，不得在导入时创建新身份");
        }
        ensurePrivateDirectory(root);
        Path lockFile = root.resolve(".deployment-identity.lock");
        requirePrivateRegularFile(lockFile);
        try (FileChannel channel = FileChannel.open(lockFile,
                StandardOpenOption.READ, StandardOpenOption.WRITE);
             FileLock ignored = channel.lock()) {
            Identity identity = readIdentity(root.resolve(IDENTITY_NAME));
            Path requestFile = root.resolve(REQUEST_NAME);
            requirePrivateRegularFile(requestFile);
            if (Files.size(requestFile) > EnrollmentRequestV1.MAX_ENVELOPE_BYTES) {
                throw new IOException("申请文件过长");
            }
            byte[] expected = EnrollmentRequestV1.create(identity.requestId(), identity.deploymentId(),
                    identity.tenantId(), identity.publicKey(), identity.privateKey());
            byte[] actual = Files.readAllBytes(requestFile);
            if (!Arrays.equals(expected, actual)) {
                throw new IOException("申请文件与部署身份不一致");
            }
            EnrollmentRequestV1.Verified verified = EnrollmentRequestV1.verify(actual);
            return new VerifiedIdentity(verified.requestId(), verified.deploymentId(),
                    verified.tenantId(), verified.publicKeySha256(), verified.requestSha256());
        }
    }

    public record VerifiedIdentity(UUID requestId, UUID deploymentId, UUID tenantId,
                                   byte[] publicKeySha256, byte[] requestSha256) {
        public VerifiedIdentity {
            publicKeySha256 = publicKeySha256.clone();
            requestSha256 = requestSha256.clone();
        }
        @Override public byte[] publicKeySha256() { return publicKeySha256.clone(); }
        @Override public byte[] requestSha256() { return requestSha256.clone(); }
    }

    private record Identity(UUID deploymentId, UUID requestId, UUID tenantId,
                            PublicKey publicKey, PrivateKey privateKey) { }

    private static byte[] encode(Identity identity) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream output = new DataOutputStream(bytes)) {
            output.writeUTF(MAGIC);
            writeUuid(output, identity.deploymentId());
            writeUuid(output, identity.requestId());
            writeUuid(output, identity.tenantId());
            writeBytes(output, identity.publicKey().getEncoded());
            writeBytes(output, identity.privateKey().getEncoded());
        }
        return bytes.toByteArray();
    }

    private static Identity readIdentity(Path file) throws Exception {
        requirePrivateRegularFile(file);
        if (Files.size(file) > MAX_IDENTITY_BYTES) throw new IOException("部署身份文件过长");
        try (DataInputStream input = new DataInputStream(new ByteArrayInputStream(Files.readAllBytes(file)))) {
            if (!MAGIC.equals(input.readUTF())) throw new IOException("部署身份格式无效");
            UUID deployment = readUuid(input);
            UUID request = readUuid(input);
            UUID tenant = readUuid(input);
            KeyFactory keys = KeyFactory.getInstance("Ed25519");
            PublicKey publicKey = keys.generatePublic(new X509EncodedKeySpec(readBytes(input)));
            PrivateKey privateKey = keys.generatePrivate(new PKCS8EncodedKeySpec(readBytes(input)));
            if (input.available() != 0) throw new IOException("部署身份存在尾随字节");
            byte[] proof = EnrollmentRequestV1.create(request, deployment, tenant, publicKey, privateKey);
            EnrollmentRequestV1.verify(proof);
            return new Identity(deployment, request, tenant, publicKey, privateKey);
        }
    }

    private static void writeUuid(DataOutputStream output, UUID value) throws IOException {
        output.writeLong(value.getMostSignificantBits());
        output.writeLong(value.getLeastSignificantBits());
    }

    private static UUID readUuid(DataInputStream input) throws IOException {
        return new UUID(input.readLong(), input.readLong());
    }

    private static void writeBytes(DataOutputStream output, byte[] value) throws IOException {
        output.writeInt(value.length);
        output.write(value);
    }

    private static byte[] readBytes(DataInputStream input) throws IOException {
        int length = input.readInt();
        if (length < 1 || length > 128) throw new IOException("部署密钥长度无效");
        return input.readNBytes(length);
    }

    private static void atomicCreate(Path target, byte[] bytes) throws IOException {
        Path temporary = Files.createTempFile(target.getParent(), ".jagonzn-identity-", ".tmp");
        try {
            makeOwnerOnly(temporary, false);
            Files.write(temporary, bytes, StandardOpenOption.TRUNCATE_EXISTING);
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) {
                channel.force(true);
            }
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
            makeOwnerOnly(target, false);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private static void ensurePrivateDirectory(Path directory) throws IOException {
        if (Files.isSymbolicLink(directory)) throw new IOException("身份目录不能是符号链接");
        if (!Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) {
            Files.createDirectory(directory);
            makeOwnerOnly(directory, true);
        }
        if (!Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("身份路径不是目录");
        }
        requireOwnerOnly(directory, true);
    }

    private static void requirePrivateRegularFile(Path file) throws IOException {
        if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("身份或申请文件不是普通文件");
        }
        requireOwnerOnly(file, false);
    }

    private static void makeOwnerOnly(Path path, boolean directory) throws IOException {
        PosixFileAttributeView posix = Files.getFileAttributeView(path, PosixFileAttributeView.class);
        if (posix != null) {
            Files.setPosixFilePermissions(path, directory ? DIRECTORY_PERMISSIONS : FILE_PERMISSIONS);
            return;
        }
        AclFileAttributeView acl = Files.getFileAttributeView(path, AclFileAttributeView.class);
        if (acl == null) throw new IOException("文件系统不支持可验证的私有权限");
        acl.setAcl(List.of(AclEntry.newBuilder().setType(AclEntryType.ALLOW)
                .setPrincipal(acl.getOwner())
                .setPermissions(EnumSet.allOf(AclEntryPermission.class)).build()));
    }

    private static void requireOwnerOnly(Path path, boolean directory) throws IOException {
        PosixFileAttributeView posix = Files.getFileAttributeView(path, PosixFileAttributeView.class);
        if (posix != null) {
            Set<PosixFilePermission> actual = Files.getPosixFilePermissions(path);
            if (!actual.equals(directory ? DIRECTORY_PERMISSIONS : FILE_PERMISSIONS)) {
                throw new IOException("身份目录或文件权限不是仅所有者可用");
            }
            return;
        }
        AclFileAttributeView acl = Files.getFileAttributeView(path, AclFileAttributeView.class);
        if (acl == null) throw new IOException("文件系统不支持可验证的私有权限");
        var owner = acl.getOwner();
        if (acl.getAcl().stream().anyMatch(entry ->
                entry.type() == AclEntryType.ALLOW && !entry.principal().equals(owner))) {
            throw new IOException("身份目录或文件 ACL 未限制为所有者");
        }
    }
}
