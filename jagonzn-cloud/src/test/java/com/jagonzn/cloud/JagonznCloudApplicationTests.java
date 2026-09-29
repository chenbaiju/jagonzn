package com.jagonzn.cloud;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 验证 cloud 骨架的 Spring 上下文可独立启动。 */
@SpringBootTest
@AutoConfigureMockMvc
class JagonznCloudApplicationTests extends CloudDatabaseTests {
    @Autowired MockMvc mvc;

    /** 检查独立数据库迁移；未启用事件入口时不将 SaaS 业务视为已交付。 */
    @Test
    void contextLoads() throws Exception {
        mvc.perform(post("/api/v1/internal/service-events"))
                .andExpect(status().isNotFound());
    }

}
