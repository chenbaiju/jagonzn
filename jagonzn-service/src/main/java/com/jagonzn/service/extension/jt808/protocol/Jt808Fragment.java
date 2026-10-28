package com.jagonzn.service.extension.jt808.protocol;

/**
 * 分包头元数据；当前只保留报文边界，不执行业务分包重组。
 * @param total 消息包总数
 * @param index 从一开始的当前包序号
 */
public record Jt808Fragment(int total, int index) {
    public Jt808Fragment {
        if (total < 1 || total > 0xffff || index < 1 || index > total) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.HEADER);
        }
    }
}
