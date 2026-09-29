package com.jagonzn.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.things.cloud.iam.application.AuthRateLimiter;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.ObjectMapper;

/** 在 jagonzn 独立库上走真实注册/登录/项目 HTTP 授权，不借用原应用进程或测试身份。 */
@SpringBootTest
@AutoConfigureMockMvc
class JagonznAuthorizedProjectHttpTests extends JagonznServiceIntegrationTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String PASSWORD = "correct-horse-battery-staple";

    @Autowired private MockMvc http;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private AuthRateLimiter rateLimiter;

    /** 两个独立租户各自能读自己的项目，跨租户项目及设备列表均按权限拒绝。 */
    @Test
    void authorizedReadsStayInsideTenantAndProject() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String first = registerAndLogin("reuse-a-" + suffix + "@example.com");
        String second = registerAndLogin("reuse-b-" + suffix + "@example.com");
        UUID firstProject = createProject(first, "reuse-first-" + suffix);
        UUID secondProject = createProject(second, "reuse-second-" + suffix);

        MvcResult ownProjects = http.perform(get("/api/v1/projects")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + first)).andReturn();
        assertEquals(200, ownProjects.getResponse().getStatus());
        assertTrue(ownProjects.getResponse().getContentAsString().contains(firstProject.toString()));
        assertFalse(ownProjects.getResponse().getContentAsString().contains(secondProject.toString()));

        assertEquals(200, http.perform(get("/api/v1/projects/" + firstProject + "/devices")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + first)).andReturn().getResponse().getStatus());
        assertEquals(404, http.perform(get("/api/v1/projects/" + firstProject + "/devices")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + second)).andReturn().getResponse().getStatus());
    }

    /** 注册本身不签发令牌；测试只跳过邮件投递并走真实登录签名路径。 */
    private String registerAndLogin(String email) throws Exception {
        rateLimiter.clear();
        MvcResult registered = http.perform(post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
                .andReturn();
        assertEquals(204, registered.getResponse().getStatus());
        jdbc.update("UPDATE sys_account SET email_verified_at = now() WHERE email = ?", email);
        MvcResult loggedIn = http.perform(post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
                .andReturn();
        assertEquals(200, loggedIn.getResponse().getStatus());
        return JSON.readTree(loggedIn.getResponse().getContentAsString()).get("accessToken").asString();
    }

    /** 项目创建仍受正式配额合同约束，本测试每个租户只创建一个项目。 */
    private UUID createProject(String token, String name) throws Exception {
        MvcResult created = http.perform(post("/api/v1/projects")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"%s\",\"region\":\"sh-1\"}".formatted(name)))
                .andReturn();
        assertEquals(200, created.getResponse().getStatus());
        return UUID.fromString(JSON.readTree(created.getResponse().getContentAsString()).get("id").asString());
    }
}
