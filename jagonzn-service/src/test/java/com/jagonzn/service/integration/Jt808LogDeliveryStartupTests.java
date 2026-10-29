package com.jagonzn.service.integration;

import com.jagonzn.service.extension.jt808.Jt808LogJournal;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import tools.jackson.databind.ObjectMapper;
import static com.jagonzn.service.integration.Jt808LogDeliveryFixtures.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;

/** 用真实Spring环境变量优先级复现旧目录覆盖，验证上下文在发送组件启动前失败。 */
class Jt808LogDeliveryStartupTests {
    @TempDir Path external;
    final ObjectMapper json=new ObjectMapper();
    final UUID source=UUID.randomUUID();
    @Configuration(proxyBeanMethods=false)
    static class JournalConfiguration {
        @Bean ObjectMapper objectMapper(){return new ObjectMapper();}
        @Bean(destroyMethod="close") Jt808LogJournal journal(Environment environment,ObjectMapper json){
            return new Jt808LogJournal(Path.of(environment.getRequiredProperty("jagonzn.jt808.logs.directory")),Path.of(environment.getRequiredProperty("jagonzn.jt808.external-root")),json);
        }
    }
    ApplicationContextRunner runner(Path directory){
        return new ApplicationContextRunner().withUserConfiguration(JournalConfiguration.class,Jt808LogDeliveryScope.class,Jt808LogForwarder.class)
                .withPropertyValues("jagonzn.jt808.logs.delivery-enabled=true","jagonzn.jt808.external-root="+external,"jagonzn.jt808.logs.directory="+directory,
                    "jagonzn.cloud.private-delivery.url="+URL,"jagonzn.cloud.private-delivery.source-deployment-id="+source,"jagonzn.cloud.private-delivery.key-id=test","jagonzn.cloud.private-delivery.secret-base64="+SECRET);
    }
    @Test void enabledDeliveryWithoutAnExplicitScopeFailsStartup()throws Exception{
        Path path=directory(external);
        runner(path).run(context->{assertThat(context).hasFailed();assertThat(context.getStartupFailure()).hasStackTraceContaining("禁止启动自动交付");});
        try(var files=Files.list(path)){assertFalse(files.anyMatch(p->p.toString().endsWith(".accepted")));}
    }
    @Test void inheritedEnvironmentCannotOverrideThePinnedJournalAndBackfillFiftyEightEvents()throws Exception{
        Path approved=directory(external),old=directory(external);var identity=identity();
        try(var journal=new Jt808LogJournal(old,external,json)){for(int n=0;n<58;n++)append(journal,identity,"old-"+n,"UNLOCK_REPORTED",NOW);}
        var before=new HashMap<Path,byte[]>();try(var files=Files.list(old)){for(Path p:files.filter(p->p.toString().endsWith(".json")).toList())before.put(p,Files.readAllBytes(p));}
        Path file=write(external,configuration(approved,source,identity,0),json);
        runner(approved).withPropertyValues("jagonzn.jt808.logs.delivery-scope-file="+file)
            .withInitializer(context->{
                context.getEnvironment().getPropertySources().addFirst(new SystemEnvironmentPropertySource("inherited-environment",Map.of("JAGONZN_JT808_LOGS_DIRECTORY",old.toString())));
                assertEquals(old.toString(),context.getEnvironment().getProperty("jagonzn.jt808.logs.directory"));
            })
            .run(context->{
                assertThat(context).hasFailed();assertThat(context.getStartupFailure()).hasStackTraceContaining("禁止启动自动交付");
            });
        for(var entry:before.entrySet()){assertArrayEquals(entry.getValue(),Files.readAllBytes(entry.getKey()));assertFalse(Files.exists(entry.getKey().resolveSibling(entry.getKey().getFileName()+".accepted")));}
        try(var files=Files.list(old)){assertFalse(files.anyMatch(p->p.toString().endsWith(".sha256")));}
    }
    @Test void aValidExplicitScopeCreatesTheSenderWhileDisabledDeliveryNeedsNoScope()throws Exception{
        Path path=directory(external);Path file=write(external,configuration(path,source,identity(),0),json);
        runner(path).withPropertyValues("jagonzn.jt808.logs.delivery-scope-file="+file).run(context->{assertThat(context).hasNotFailed().hasSingleBean(Jt808LogForwarder.class).hasSingleBean(Jt808LogDeliveryScope.class);});
        runner(directory(external)).withPropertyValues("jagonzn.jt808.logs.delivery-enabled=false").run(context->{assertThat(context).hasNotFailed().doesNotHaveBean(Jt808LogForwarder.class).doesNotHaveBean(Jt808LogDeliveryScope.class);});
    }
    @Test void aDifferentSourceOrTargetCannotReuseAValidScope()throws Exception{
        Path path=directory(external);Path file=write(external,configuration(path,source,identity(),0),json);
        for(String override:List.of("jagonzn.cloud.private-delivery.source-deployment-id="+UUID.randomUUID(),"jagonzn.cloud.private-delivery.url=https://other/api/v1/internal/service-events")){
            runner(path).withPropertyValues("jagonzn.jt808.logs.delivery-scope-file="+file,override).run(context->{assertThat(context).hasFailed();assertThat(context.getStartupFailure()).hasStackTraceContaining("禁止启动自动交付");});
        }
    }
}
