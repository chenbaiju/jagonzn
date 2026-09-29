package com.jagonzn.service.enrollment;

import com.things.cloud.project.application.SelfHostedGrantImportService;
import com.things.cloud.project.infrastructure.persistence.JdbcSelfHostedGrantRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.io.Console;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Set;

/** 不启动 Web 服务的现场离线文件导入入口；只用客户发行物内固定公钥验签。 */
public final class SignedGrantImportCommand {
    private static final int MAX_FILE_BYTES = 65611;
    private static final Set<PosixFilePermission> PRIVATE_FILE = Set.of(
            PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);

    private SignedGrantImportCommand() { }

    public static void run(String[] args) throws Exception {
        if (args.length != 5 || !"--import-grant".equals(args[0])) {
            throw new IllegalArgumentException("用法：--import-grant <本机JDBC URL> "
                    + "<应用数据库账号> <部署身份目录> <签名授权文件.tcshgrant>");
        }
        String url = args[1];
        if (!url.matches("jdbc:postgresql://(?:127\\.0\\.0\\.1|localhost):[0-9]{1,5}/[A-Za-z_][A-Za-z0-9_-]{0,62}")) {
            throw new IllegalArgumentException("离线导入仅允许不带额外参数的本机回环 PostgreSQL URL");
        }
        String user = args[2];
        if (!user.matches("[A-Za-z_][A-Za-z0-9_]{0,62}")) {
            throw new IllegalArgumentException("应用数据库账号无效");
        }
        // 在询问数据库口令之前先验证非秘密的文件、发行物公钥及部署身份。
        byte[] envelope = readGrant(Path.of(args[4]));
        var trusted = PackagedIssuerTrust.load();
        var identity = EnrollmentRequestCommand.inspect(Path.of(args[3]));
        var installation = new SelfHostedGrantImportService.Installation(
                identity.deploymentId(), identity.tenantId(), identity.publicKeySha256());
        Console console = System.console();
        if (console == null) throw new IllegalStateException("离线导入必须使用交互式终端");
        char[] password = console.readPassword("现场应用数据库口令：");
        try {
            if (password == null || password.length == 0) {
                throw new IllegalArgumentException("数据库口令不能为空");
            }
            // PostgreSQL JDBC 接口要求 String；本命令一次导入后即结束进程，不写配置和日志。
            var dataSource = new DriverManagerDataSource(url, user, new String(password));
            var repository = new JdbcSelfHostedGrantRepository(new JdbcTemplate(dataSource));
            var importer = new SelfHostedGrantImportService(
                    repository, new DataSourceTransactionManager(dataSource), trusted);
            var result = importer.importGrant(envelope, installation);
            System.out.println("result=" + result.outcome());
            System.out.println("grantId=" + result.grantId());
            System.out.println("sequence=" + result.sequence());
            System.out.println("deploymentId=" + installation.deploymentId());
            System.out.println("businessTenantId=" + installation.tenantId());
            System.out.println("envelopeSha256=" + HexFormat.of().formatHex(
                    java.security.MessageDigest.getInstance("SHA-256").digest(envelope)));
        } finally {
            if (password != null) Arrays.fill(password, '\0');
        }
    }

    static byte[] readGrant(Path path) throws Exception {
        Path file = path.toAbsolutePath().normalize();
        if (!file.getFileName().toString().endsWith(".tcshgrant")
                || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)
                || !Files.getPosixFilePermissions(file).equals(PRIVATE_FILE)) {
            throw new IllegalArgumentException("授权文件必须是受限的常规 .tcshgrant 文件");
        }
        for (Path at = file.toRealPath().getParent(); at != null; at = at.getParent()) {
            if (Files.exists(at.resolve(".git"), LinkOption.NOFOLLOW_LINKS)) {
                throw new IllegalArgumentException("授权文件不得放在 Git 工作区");
            }
        }
        try (InputStream input = Files.newInputStream(file)) {
            byte[] bytes = input.readNBytes(MAX_FILE_BYTES + 1);
            if (bytes.length < 76 || bytes.length > MAX_FILE_BYTES || input.read() != -1) {
                throw new IllegalArgumentException("授权文件长度无效");
            }
            return bytes;
        }
    }
}
