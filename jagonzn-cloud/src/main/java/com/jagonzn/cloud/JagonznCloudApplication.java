package com.jagonzn.cloud;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 独立业务应用入口；事件接收与业务 API 按各自门禁启用。 */
@SpringBootApplication
@EnableScheduling
public class JagonznCloudApplication {

    /** 启动独立业务应用，不承担设备协议连接。 */
    public static void main(String[] args) {
        SpringApplication.run(JagonznCloudApplication.class, args);
    }

}
