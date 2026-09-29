#!/bin/sh
# 仅本机技术命令实验使用；入口由 Compose 限定在宿主回环。
exec nc emqx 1883
