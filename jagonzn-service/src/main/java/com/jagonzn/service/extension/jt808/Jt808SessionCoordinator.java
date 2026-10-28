package com.jagonzn.service.extension.jt808;

/** 单进程单设备的连接代次；整次业务处理持有同一监视器，旧连接不能在接管后继续写入。 */
public final class Jt808SessionCoordinator {
    private long generation;
    synchronized long establish() { return ++generation; }
    synchronized boolean owns(long expected) { return expected>0 && expected==generation; }
}
