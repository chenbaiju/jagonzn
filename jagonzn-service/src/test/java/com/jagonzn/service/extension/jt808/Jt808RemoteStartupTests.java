package com.jagonzn.service.extension.jt808;

import com.jagonzn.remote.Jt808RemoteApplication;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import static org.assertj.core.api.Assertions.assertThat;
import static com.jagonzn.service.extension.jt808.Jt808RemoteFixture.*;

class Jt808RemoteStartupTests {
    @TempDir Path external;
    @Test void completeRemoteApplicationStartsWithoutDatabaseRedisKafkaOrEmbeddedKernel()throws Exception{
        Path root=directory(external,"remote");Path scope;
        try(var f=new Jt808RemoteFixture(root,false)){scope=f.file;}
        Path crypto=write(root.resolve("crypto.properties"),"sm4.key.hex=0123456789abcdeffedcba9876543210\nsm4.iv.hex=00000000000000000000000000000000\n");
        Path binding=write(root.resolve("binding.properties"),"terminal.id="+Jt808TestLock.TERMINAL+"\nbluetooth.mac.hex=001122334455\nplatform.project-key=project\nplatform.device-key=lock\nplatform.secret=synthetic-secret\nmodel.version=1.0.0\nproperty.door_closed=door_closed\nproperty.battery_percent=battery_percent\n");
        Path logs=Path.of(new tools.jackson.databind.ObjectMapper().readTree(Files.readString(scope)).path("journalDirectory").asText());
        var runner=new ApplicationContextRunner().withUserConfiguration(Jt808RemoteApplication.class).withPropertyValues("things-link.runtime.embedded=false","jagonzn.jt808.remote.enabled=true","jagonzn.jt808.remote.scope-file="+scope,"jagonzn.jt808.external-root="+root,"jagonzn.jt808.crypto-file="+crypto,"jagonzn.jt808.binding-file="+binding,"jagonzn.jt808.logs.directory="+logs,"jagonzn.jt808.port=0","spring.main.web-application-type=none","springdoc.api-docs.enabled=false");
        runner.run(context->{assertThat(context).hasNotFailed().hasSingleBean(Jt808RemoteGateway.class).hasSingleBean(Jt808TcpServer.class);
            assertThat(context.getBean(Jt808TcpServer.class).boundPort()).isGreaterThan(0);
            assertThat(context).doesNotHaveBean(javax.sql.DataSource.class).doesNotHaveBean(com.things.link.ingestion.application.access.DeviceAccessDeviceAuthenticator.class).doesNotHaveBean(org.flywaydb.core.Flyway.class).doesNotHaveBean(org.springframework.data.redis.connection.RedisConnectionFactory.class).doesNotHaveBean(org.springframework.kafka.config.KafkaListenerEndpointRegistry.class);
        });
        runner.withPropertyValues("things-link.runtime.embedded=true").run(context->assertThat(context).hasFailed());
        runner.withPropertyValues("jagonzn.jt808.logs.delivery-enabled=true").run(context->assertThat(context).hasFailed());
        Path unapproved=directory(root,"unapproved-journal");
        runner.withInitializer(context->context.getEnvironment().getPropertySources().addFirst(new org.springframework.core.env.SystemEnvironmentPropertySource("inherited",Map.of("JAGONZN_JT808_LOGS_DIRECTORY",unapproved.toString())))).run(context->assertThat(context).hasFailed());
    }
    @Test void missingExplicitEnableOrInheritedKernelFlagFailsBeforeOpeningListener(){
        new ApplicationContextRunner().withUserConfiguration(com.jagonzn.remote.Jt808RemoteConfiguration.class).withPropertyValues("things-link.runtime.embedded=false").run(context->assertThat(context).hasFailed());
    }
}
