package com.jagonzn.cloud;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/** 每轮 cloud 验证只使用独立临时数据库，不连接 service 或 ThingsLink 库。 */
abstract class CloudDatabaseTests {
    // 本机可显式提供外置隔离测试库；未提供时沿用一次性容器，不回退到业务库。
    static final String EXTERNAL_URL=System.getenv("JAGONZN_CLOUD_TEST_DATABASE_URL");
    static final PostgreSQLContainer<?> POSTGRES;
    static {
        if(EXTERNAL_URL==null){
            POSTGRES=new PostgreSQLContainer<>(DockerImageName.parse("timescale/timescaledb-ha:pg17.4-ts2.18.2").asCompatibleSubstituteFor("postgres"))
                    .withDatabaseName("jagonzn_cloud").withUsername("jagonzn_cloud").withPassword("jagonzn_cloud_test");
            POSTGRES.start();
        }else{
            if(!EXTERNAL_URL.matches("jdbc:postgresql://127\\.0\\.0\\.1:25432/jagonzn_cloud_http_[a-z0-9_]+")
                    ||System.getenv("JAGONZN_CLOUD_TEST_DATABASE_USER")==null||System.getenv("JAGONZN_CLOUD_TEST_DATABASE_PASSWORD")==null)
                throw new IllegalStateException("只接受显式命名的外盘隔离cloud测试库");
            POSTGRES=null;
        }
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", ()->EXTERNAL_URL==null?POSTGRES.getJdbcUrl():EXTERNAL_URL);
        registry.add("spring.datasource.username", ()->EXTERNAL_URL==null?POSTGRES.getUsername():System.getenv("JAGONZN_CLOUD_TEST_DATABASE_USER"));
        registry.add("spring.datasource.password", ()->EXTERNAL_URL==null?POSTGRES.getPassword():System.getenv("JAGONZN_CLOUD_TEST_DATABASE_PASSWORD"));
    }
}
