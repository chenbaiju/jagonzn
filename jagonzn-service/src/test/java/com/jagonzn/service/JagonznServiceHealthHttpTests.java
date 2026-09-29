package com.jagonzn.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/** 通过真实 HTTP 请求验证进程健康入口及敏感管理端点的暴露边界。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class JagonznServiceHealthHttpTests extends JagonznServiceIntegrationTest {

    @LocalServerPort
    int port;

    /** 测试端口由框架随机分配，避免与其他本地应用争用固定端口。 */
    @Test
    void exposesOnlyMinimalHealthInformation() throws Exception {
        Response health = get("/actuator/health");
        assertEquals(200, health.statusCode());
        assertTrue(health.body().contains("\"status\":\"UP\""));
        assertFalse(health.body().contains("components"));

        // 装配完整平台安全链后，未认证请求先被统一拒绝；不得返回敏感内容。
        assertEquals(401, get("/actuator/env").statusCode());
        assertEquals(401, get("/actuator/metrics").statusCode());
        assertEquals(401, get("/api/v1/projects").statusCode());
        assertEquals(401, get("/api/v1/projects/00000000-0000-0000-0000-000000000001/devices").statusCode());
    }

    /** 使用 JDK HTTP 客户端发送真实请求，避开当前环境的 selector 初始化问题。 */
    private Response get(String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) URI.create("http://127.0.0.1:" + port + path)
                .toURL().openConnection();
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(5000);
        try {
            int status = connection.getResponseCode();
            String body = status == 200
                    ? new String(connection.getInputStream().readAllBytes(), StandardCharsets.UTF_8)
                    : "";
            return new Response(status, body);
        } finally {
            connection.disconnect();
        }
    }

    /** 只保留断言所需的响应状态和正文。 */
    private record Response(int statusCode, String body) {}
}
