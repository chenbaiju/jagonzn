# 官方Mailpit发布二进制由外盘脚本校验摘要；基础镜像使用专用VM已核验的本地缓存。
FROM redis:7.4-alpine
COPY mailpit /usr/local/bin/mailpit
ENTRYPOINT ["/usr/local/bin/mailpit"]
CMD []
