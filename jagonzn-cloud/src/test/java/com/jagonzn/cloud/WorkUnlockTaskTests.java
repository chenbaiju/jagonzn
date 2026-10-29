package com.jagonzn.cloud;

import com.jagonzn.cloud.delivery.HttpDeliveryAudit;
import com.jagonzn.cloud.work.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.CleanupMode;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 接收端无鉴权开放、参数及真实外置日志持久化；不连接设备或调用开锁命令。 */
@ExtendWith(OutputCaptureExtension.class)
class WorkUnlockTaskTests {
    static final String PATH="/api/v1/partner/work-unlock-tasks";
    @TempDir(cleanup=CleanupMode.NEVER) Path external;
    final ObjectMapper json=new ObjectMapper();
    Path directory;WorkUnlockTaskJournal journal;WorkUnlockTaskController controller;MockMvc mvc;
    @BeforeEach void setup()throws Exception{
        directory=Files.createTempDirectory(external,"received-",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        journal=new WorkUnlockTaskJournal(directory.toString(),external.toString());controller=new WorkUnlockTaskController(journal,json,new HttpDeliveryAudit(json));mvc=MockMvcBuilders.standaloneSetup(controller).build();
    }
    @AfterEach void close(){journal.close();}
    tools.jackson.databind.node.ObjectNode request(){return json.createObjectNode().put("uuid","123e4567e89b12d3a456426655440000").put("planBeginTime","2025-12-04 08:00").put("planEndTime","2025-12-04 10:00").put("lockNum","860000000000000").put("phoneNum","13800000000").put("title","施工作业").put("lineName","京沪线").put("lineKm","K893+500");}
    List<Path> files()throws Exception{try(var paths=Files.list(directory)){return paths.filter(p->p.getFileName().toString().startsWith("task-")).toList();}}
    @Test void receivesValidJsonPrintsSafeBodyAndStoresExactOriginalBytesBeforeSuccess(CapturedOutput output)throws Exception{
        String body=json.writerWithDefaultPrettyPrinter().writeValueAsString(request());
        mvc.perform(post(PATH).contentType("application/json").content(body)).andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200)).andExpect(jsonPath("$.msg").value("成功"));
        assertThat(files()).hasSize(1);assertThat(Files.readAllBytes(files().getFirst())).isEqualTo(body.getBytes(StandardCharsets.UTF_8));assertThat(Files.getPosixFilePermissions(files().getFirst())).isEqualTo(PosixFilePermissions.fromString("rw-------"));
        assertThat(output.getOut()).contains("接收成功_作业任务JSON已持久保存","京沪线","K893+500","已脱敏").doesNotContain("13800000000");
    }
    @Test void repeatedUuidAndLaterSealFieldsAreLoggedSeparatelyWithoutOverwriting()throws Exception{
        var data=request();String first=data.toString();mvc.perform(post(PATH).contentType("application/json").content(first)).andExpect(status().isOk());
        data.put("sealOffBeginTime","2025-12-04 08:10").put("sealOffEndTime","2025-12-04 09:40").put("sealOffNum","67646");String second=data.toString();
        mvc.perform(post(PATH).contentType("application/json").content(second)).andExpect(status().isOk());
        assertThat(files()).hasSize(2);var bodies=new ArrayList<String>();for(Path p:files())bodies.add(Files.readString(p));assertThat(bodies).containsExactlyInAnyOrder(first,second);
    }
    @Test void agreedSafetyProductionSystemPathReceivesTheSameContract()throws Exception{
        mvc.perform(post("/azy/task/receiveSafetyProSystemTask").contentType("application/json").content(request().toString())).andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200)).andExpect(jsonPath("$.msg").value("成功"));assertThat(files()).hasSize(1);
    }
    @Test void noIdentityOrTenantIsRequiredAndAuthorizationHeaderIsIgnored()throws Exception{
        mvc.perform(post(PATH).contentType("application/json").content(request().toString())).andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200));
        mvc.perform(post(PATH).contentType("application/json").header("Authorization","Bearer unrelated").content(request().toString())).andExpect(status().isOk());assertThat(files()).hasSize(2);
    }
    @ParameterizedTest @ValueSource(strings={"missing-uuid","bad-time","bad-date","reverse-plan","bad-title","bad-phone","unknown-field","reverse-seal","oversize","not-json"})
    void invalidParametersHaveFailureResponseAndNoRawLog(String bad)throws Exception{
        var data=request();String raw=null;
        switch(bad){
            case "missing-uuid"->data.remove("uuid");case "bad-time"->data.put("planBeginTime","2025-12-0408: 00");case "bad-date"->data.put("planBeginTime","2025-02-30 08:00");
            case "reverse-plan"->data.put("planEndTime","2025-12-04 07:00");case "bad-title"->data.put("title","unknown");case "bad-phone"->data.put("phoneNum","unknown");case "unknown-field"->data.put("password","never-log-this");
            case "reverse-seal"->data.put("sealOffBeginTime","2025-12-04 09:40").put("sealOffEndTime","2025-12-04 08:10");case "oversize"->raw=" ".repeat(65537);case "not-json"->raw="{invalid";
        }
        mvc.perform(post(PATH).contentType("application/json").content(raw==null?data.toString():raw)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value(500)).andExpect(jsonPath("$.msg").value("失败"));assertThat(files()).isEmpty();
    }
    @Test void storageFailureCannotReturnSuccess()throws Exception{
        var failing=mock(WorkUnlockTaskJournal.class);when(failing.append(any())).thenThrow(new IllegalStateException("disk unavailable"));var endpoint=new WorkUnlockTaskController(failing,json,new HttpDeliveryAudit(json));var client=MockMvcBuilders.standaloneSetup(endpoint).build();
        client.perform(post(PATH).contentType("application/json").content(request().toString())).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value(500));
    }
    @Test void journalIsExclusiveAndNonPrivateDirectoryIsRejected()throws Exception{
        assertThatThrownBy(()->new WorkUnlockTaskJournal(directory.toString(),external.toString())).isInstanceOf(IllegalStateException.class);
        Path unsafe=Files.createTempDirectory(external,"unsafe-",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwxr-xr-x")));assertThatThrownBy(()->new WorkUnlockTaskJournal(unsafe.toString(),external.toString())).isInstanceOf(IllegalStateException.class);
    }
    @Test void interfaceHasNoIdentityConfigurationAndIsOnlyControlledByFeatureSwitch(){
        new ApplicationContextRunner().withUserConfiguration(WorkUnlockTaskController.class,WorkUnlockTaskJournal.class).run(context->assertThat(context).hasNotFailed().doesNotHaveBean(WorkUnlockTaskController.class).doesNotHaveBean(WorkUnlockTaskJournal.class));
        assertThat(new WorkUnlockTaskController(journal,json,new HttpDeliveryAudit(json))).isNotNull();
    }
}
