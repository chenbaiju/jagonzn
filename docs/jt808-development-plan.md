# JT808锁具开发与测试计划

本计划依据负责人2026-10-28指令：JT808在独立`jagonzn`仓库开发，由`jagonzn-service`继承ThingsLink完整业务运行时后承载专用扩展，测试产物存外设。平台名称为ThingsLink，历史ThingsCloud工程标识与thingscloud.xyz参考产品区分；本计划不改变平台源码、数据库表或原有标准TCP/TLS协议。

## 当前基线与首台设备

service当前对接`com.things.link:things-link-runtime:0.0.1-SNAPSHOT`，固定来源`260fa694876fce1b728ba87a4b91466765942aac`。18个运行时模块、14域548条SQL和1份迁移附属配置、25个Kafka主题已有包级一致性回执，见[继承清单](service-upstream.json)与[同步记录](console-reuse-and-evolution.md#2026-10-28%20ThingsLink运行时同步与JT808扩展迁入)。包级继承后，已用同一固定JAR在外置独立数据库、Kafka等真实中间件上完成正常配置启动与JT808模拟终端联调，详见文末真实运行时回执；全部业务、历史库升级和真机不据此通过。发行方issuer仅供测试，不混入service生产依赖。

首台型号为`ZN-DM08-Ⅴ(A)`，按厂家文档的DM08-VA解释；罗马数字五不能误作IV(A/B)。真实IMEI、蓝牙MAC和八字节BCD终端标识已保存到外盘私有`device-input.json`，不进入源码仓库。已确认是SM4国密版，设备保护方式为`SM4_CBC`。TCP章节两套密钥/IV逐字节核对均为16字节；当前采用“简工专用”一套建立外盘0600私有配置，不使用后续蓝牙章节参数，不自动尝试供应商另一套。固件和文档参数的实机匹配仍未验，扩展开关仍关闭。

协议原件在配套ThingsLink仓库`things-link-device-sdk/jt808/jt808.md`及`assets/`，本轮绑定摘要见外盘`baseline.json`，不复制厂家密钥。第一张图片为授时流程，第二张为蓝牙升级包；不把蓝牙包作为TCP升级包。

## 承载与数据边界

专用Java包为`com.jagonzn.service.extension.jt808`，随service构建并在同一进程中按独立开关启用。它不是外置MQTT桥接程序，也不加入ThingsLink的标准TCP编解码器。源码、测试、型号配置及后续实现集中在此扩展；通过当前运行时受支持的应用端口完成身份、接入资格、上行、会话、命令及回执。

继承的是代码能力，不自动继承公网ThingsLink账号或数据库内容。service使用独立`jagonzn`库，测试租户、项目、设备及物模型须在该环境建立；用户登录密码不作为锁具鉴权码。IMEI只定位预绑定关系，不能单凭IMEI生成可信平台身份。认证必须复用正式凭据、接入平面、项目可写资格和预算校验，不能直接构造身份或写平台业务表。

当前已组合`DeviceAccessDeviceAuthenticator`、`DeviceAccessAuthBudget`、`DeviceAccessUplinkIngressService`、`DeviceCommandAccessReplyPort`、`DeviceAccessPushPort`及`DownlinkPreprocessor`。会话代次保存在扩展本地，单进程独占外盘状态；不调用仅适用于标准TC AUTH_RESPONSE及空03的心跳端口，也不伪造平台原生TCP在线行。软件会话接管已有测试；本轮真实运行时另验证实际TCP接入配置、凭据撤销、跨租户命令读取404及应用角色无范围读0行/正确范围读1行，不外推为全部越权写矩阵；确证接口缺口回到[JPF-004](PLATFORM_CAPABILITY_FEEDBACK.md#6.%20JPF-004：厂商协议适配与公共扩展边界)。

## 阶段与完成条件

| 切片 | 工作与完成条件 | 当前结果 |
| --- | --- | --- |
| J1-1 接入基线 | 复用已冻结内核，独立空库完成迁移、应用装配及租户/RLS；旧库另有备份和隔离兼容验证 | 包级继承、正常应用启动、独立空库548迁移及本次RLS读取通过；历史库升级仍NOTRUN |
| J2-1a 帧与国密编解码 | 十四字节基础头、八字节BCD、双校验范围、转义、分包元数据、有限拆帧、型号拒绝及SM4上下行有正反例 | 有限软件完成，40项JT808测试与2项迁移资源测试通过。业务分包重组未实现，SM4实机互通未验 |
| J2-1b 注册/鉴权与会话 | 预绑定设备完成0100/8100、0102/8001、心跳；代次接管、撤权、预算、错误设备与连接退出闭环 | 正常service与真实数据库/Kafka上的模拟终端注册、鉴权及凭据撤销通过；固件互通未验 |
| J2-1c 状态与位置 | 解0200/0201及E1/E2/E3/E7等，字段与物模型一致；受理后真实属性当前值/历史可读，非法或重复数据不伪造 | 真实Kafka处理、属性历史/影子读取、重复及重启重放不新增历史通过；真实锁具未验 |
| J2-2 设备事件 | 开锁、关锁及选定安全报警按真实来源保存、去重、查询，并区分设备时间与平台接收时间 | 待实现；不把属性更新或模拟消息冒充设备事件 |
| J2-3 下行与结果 | 平台命令ID关联JT808流水号；8201查询、8500控制及0001应答、状态上报和实际动作分别核对；超时/未知不得重复开锁 | 真实Kafka及原消费者下发查询后SUCCEEDED；控制ACK最终TIMED_OUT且仅发一帧，UNKNOWN保留；物理完成未验 |
| J3-1 恢复与真机 | 掉线、重连、重复帧、晚到回执、断电后状态与原命令一致；真实4G连接、实物开锁和人工合锁闭环 | 真实进程重启、旧帧去重和凭据撤销通过；4G/断电/实物动作NOTRUN，部署按当次授权执行 |

协议软件与公开端口组合可先独立开发；真实依赖及单场通过后再进行真机组合，不重跑无差额全平台矩阵。软件通过、service实际启动、真机和正式交付分别登记。原阶段1正式接收及其他债务不因本计划自动关闭。

## 厂家协议处理规则

- 线上帧为`7E + 消息头 + 消息体 + 校验 + 7E`，大端；基础头14字节，终端标识为BCD[8]，可选分包头4字节。十五位IMEI前补零，不裁剪收到的十六位协议标识。
- DM08-VA校验从消息头开始；IV(A/B)包含起始7E。范围须显式指定，错误校验不能自动尝试另一种模式放行。
- 编码先算校验再转义；解码先还原转义。拒绝未知转义、悬空7D、非法BCD、精确长度不符、保留位和超长帧。
- 文档“最大1024”与低十位长度可表达范围不一致；当前有效消息体上限1023，1024明确拒绝，不能截断回零；SM4补齐后的密文可为1024字节。分包只读元数据，不冒称已做业务重组。
- DM08-VA锁状态E2的bit0：0开锁、1关锁。不同型号定义不同；不能套用IV门磁反向定义，也不能仅由平台命令应答推断实物开关状态。
- SM4由已确认设备配置选择，不能依靠上行加密位为零判断普通版。`UNCONFIRMED`和`SM4_CBC`都拒绝进入明文入口；国密专用入口要求已确认的SM4配置和外部提供的十六字节密钥/IV。下行设置bit10，按头及有效明文校验后加密；上行加密位保持零，按头及有效长度的密文校验后解密；校验均不包含补齐尾部。SM4/CBC/NoPadding以零补齐至十六字节整数倍，解密拒绝非零尾部；空体暂不增加填充块，须实机确认。校验与加密不能代替设备鉴权。
- 普通位置报告按厂家BCD时间和位置字段解析；授时章节的GMT/北京时间、BYTE/BCD以及加密标识旧文字有矛盾，须结合固件、厂家确认及真实抓包解决。DM08-IV专属30秒心跳描述不直接作为VA的实测周期。
- 配置修改前保存锁具原主备地址和恢复方式；文档记载鉴权失败可能清除历史并重新注册，不能在适配未准备好时反复试错。首轮不混入升级、改密或恢复出厂动作。

## 外设存储与运行入口

当前macOS资料根为`/Volumes/Samsung/Jagonzn/data`。复用ThingsLink存储分离工具建立独立项目身份与四个映射：

| 源码内忽略入口 | 外设用途 |
| --- | --- |
| `.private/workspaces` | service构建、class、迁移生成物、JUnit报告、测试临时目录及测试日志 |
| `.private/ci-tools` | 本项目专属Maven缓存 |
| `.private/deployment-session` | 本轮基线、私有设备输入、原始日志和机器回执 |
| `logs/ci` | 后续CI/测试运行日志 |

本机配置在忽略的`.private/storage-management/storage.json`，外设身份原件为`.thingslink-storage-owner.json`；沿用工具格式，绑定的是jagonzn根目录，不是共用ThingsLink数据。不得跨机复制本机映射文件。service默认构建目录改为映射内的`service-build`，Surefire日志和临时目录随构建目录外置；本机根目录及service目录的`.mvn/maven.config`只保存本机外置Maven仓库路径并忽略。

`scripts/check-storage.py`只读核对挂载、身份、四个映射及输出路径，service在Maven validate执行该检查。缺外设或输出位于本机目录时拒绝；不自动重建映射或把缓存回写源码。本轮已实际证明本机`/tmp`输出被拒绝。其他jagonzn应用后续运行测试前也须按同一规则指定外置产物；本轮未运行cloud或Console测试。

在jagonzn仓库根执行：

```bash
python3 scripts/check-storage.py
./jagonzn-service/mvnw -B -f jagonzn-service/pom.xml \
  '-Dtest=Jt808*Tests,JagonznMigrationNamespaceTests' test
```

首次设置映射需使用配套ThingsLink的`scripts/storage-workspace.py --root <jagonzn根>`，Python须满足该工具要求；当前本机已完成设置。Windows等其他环境须建立各自的外设身份，并用`-Djagonzn.python=python`等选取有效解释器，不能继承本机通过结论。

此前软件测试确认`desktop-linux`的Docker.raw位于本机系统Data卷，故当时没有新建测试容器。后继已单独建立外置Lima/VZ实例及其Docker守护进程，解决本轮数据外置前置；原Docker Desktop的数据盘及上下文没有迁移或切换。具体物理落点与资源归属见文末。

## 首片实施回执

已实现`protocol`子包的明文帧对象、双校验范围、编解码、有界拆帧、DM08-V(A)型号与保护方式门禁。独立十六进制向量、转义后的校验、全部字节值、1023/1024边界、非法头/BCD、超长/不完整流、任意拆分、粘包/共用标识位、罗马数字V与IV区分、未知/SM4拒绝及VA门磁解释均有实际结果。

首轮21项、加迁移资源23项的原始成功记录保留；设备资料加入后新轮27项全部通过，0失败/错误/跳过。新轮范围为25项JT808和2项迁移资源测试，主源码及测试源码编译通过。报告物理位置为`/Volumes/Samsung/Jagonzn/data/.private/workspaces/jt808-frame-phase1-profile/surefire-reports/`；基线、设备私有资料、日志与`phase1-receipt.json`统一在`.private/deployment-session/jt808-development-20261028/`，不提交到Git。

确认国密版本后，新增`Jt808Sm4Cipher`和`Jt808Sm4FrameCodec`，复用平台依赖链现有Bouncy Castle 1.84，局部使用密码提供者，不注册全局提供者。测试使用公开合成密钥，包含[官方SM4向量](https://github.com/bcgit/bc-java/blob/r1rv84/core/src/test/java/org/bouncycastle/crypto/test/SM4Test.java)及独立OpenSSL生成的上下行帧，不使用厂家实机密钥。新增代码、测试和原有四组测试同轮运行42项，0失败/错误/跳过（40项JT808、2项迁移资源）；报告在`/Volumes/Samsung/Jagonzn/data/.private/workspaces/jt808-sm4-phase1/surefire-reports/`。首个缺依赖版本的POM失败日志保留，不冒充成功；修正后的结果见`sm4-tests-versioned.log`与`sm4-receipt.json`。

该首片回执仅覆盖帧编解码，当时尚无注册、会话、业务上报、命令执行或网络监听实现；其27/42项原始记录保留。后继实现与新候选见下节，不继承为真机通过。

## 注册鉴权、状态与命令实现回执

2026-10-28按后继授权继续开发，本轮仍不提交、推送或部署。新候选同轮88项通过，0失败/错误/跳过，其中86项JT808与2项迁移资源检查；此前71/79/83/86/87项过程记录各自保留，不相加。报告目录为`/Volumes/Samsung/Jagonzn/data/.private/workspaces/jt808-session-development/surefire-reports/`；参数来源、候选摘要、日志与回执在`.private/deployment-session/jt808-session-development-20261028/`。测试只创建127.0.0.1随机端口，均已关闭，没有监听或开放6808。

### 身份、会话与属性

- 0100严格读取厂家59字节注册结构，核对私有预绑定MAC和管理员显式首绑截止时刻。缺首绑窗口默认拒绝，不允许仅凭IMEI注册平台设备或取用户登录密码替代凭据。六字节随机可打印鉴权码先外盘持久化再返回8100，重复注册不轮换已发码；六字节是厂家协议限制，仍受共享认证预算和失败退避保护。
- 0102校验原鉴权码，再调用正式TCP设备认证端口；后续心跳、上报及实际下行逐次复核同一权威身份和凭据版本。项目归档、接入平面关闭、凭据撤销和业务预算由平台端口判定。新连接接管本地代次，旧连接不能继续处理；重连和进程重开不清除鉴权码、历史消息或命令关联。
- 0200/0201按GMT+8严格解析BCD日期、经纬度符号/范围、方向及TLV边界；E1为计数，E2按VA解释门磁和原因码，E3为电量/电压，E7为固件主次版本。重复TLV及已知项非法长度拒绝；未知项只校验边界，不暴露卡号、人脸或猜测事件语义。零经纬度/未定位明确无效，不上报伪造零坐标；文档坐标来源为高德，不能直接宣称WGS84。
- 仅将管理员显式映射的字段转换为已绑定物模型版本的属性JSON，调用原标准化、时间边界和可靠受理用例。完整厂家帧不含UUID，扩展为同一消息ID、流水号和原体摘要持久分配自己的UUIDv7，冻结首次载荷、接收时间和原凭据版本；这个标识来自适配层，不声称设备原生具备UUID或跨历史无限去重保证。转译JSON的字节数沿用平台受理计量口径，不冒称原TCP线字节数。
- 总线未确认、状态落盘失败或未来时间超限时不回成功8001。同一报文重发保留首次标识；凭据代际变化不补造旧消息认证。该软件测试回执当时未覆盖真实属性库；后继运行时已补属性历史与影子读取，规则业务效果及独立设备事件仍未验。

### 下行与结果边界

使用公开`DeviceAccessPushPort`组合路由和`DownlinkPreprocessor`直连保护，不使用HTTP/CoAP领取端口套TCP语义，不替换原Kafka命令消费者。原消费者继续执行计费、命令准入、规则链和派发状态推进；已预绑定JT808设备离线时也不退回TC编码器，其余设备委托原公开推送实现。原信封必须确认目标设备等于连接设备；网关子设备和缺少当前预处理见证的调用不能触发锁具。软件回环实际调用原`TcpCommandDownlinkKafkaConsumer`，数据库、Kafka和计费依赖为测试替身，未认领真实中间件闭环。

| 已支持物模型命令键 | 输入 | 厂家消息与结果 |
| --- | --- | --- |
| `jt808_query` | `{}` | 8201空体；0001成功只转ACK；匹配原流水的0201受理后转SUCCESS，输出为该次显式映射的属性对象 |
| `jt808_unlock` | `{}` | 8500体`01 00`；0001成功只转ACK，不能由普通0200或门磁快照补造SUCCESS |
| `jt808_lock` | `{}` | 8500体`01 01`；同样区分ACK、设备拒绝和结果未知 |

命令键、空输入及查询输出必须在实际物模型中配置并通过平台Schema校验；扩展不自动建模或建租户。后继独立测试脚本通过真实HTTPS API建立专用测试租户、已发布物模型及设备。未知命令、额外参数、过期、跨归属或非法JSON不发送，也不伪造设备业务回复。厂家非零0001转FAILED。0001没有设备时间，命令回复明确采用首次平台接收时刻；属性采集时间仍保留厂家BCD时间。

每条命令先落`PREPARED`和稳定流水再写socket；写入异常、重启遗留或截止超时保留`UNKNOWN`。同一平台命令ID的后继尝试不会再次写出；存在未核对的控制UNKNOWN时拒绝新的开关锁控制，查询仍可用。普通状态不能解除该限制；需保留原件并人工核对实物和平台状态后另行评估恢复，不直接编辑或删除状态文件来“解锁”。平台原状态机仍拥有超时终态，扩展的UNKNOWN是本地执行证据，不新增平台状态枚举。

回复先保存完整原身份、版本、摘要、输出、首次时间和回复UUID，再调用`applyAuthenticated`。结果不明只重交这份原回复，不重发控制；`NOT_FOUND/CONFLICT`不当成成功。进程重启不补查当前凭据为历史回复背书。

### 私有运行配置与移除

当前外盘`.private/ci-tools/jt808/document-crypto.properties`只含`sm4.key.hex`与`sm4.iv.hex`；源值来自本轮绑定的TCP文档，未写入Git、示例或测试。另须由管理员建立真实设备预绑定文件，包含`terminal.id`、`bluetooth.mac.hex`、`platform.project-key`、`platform.device-key`、`platform.secret`、`model.version`及至少一项`property.<协议字段>=<物模型属性>`；可选`enrollment.until`为短期首绑截止UTC时刻，缺省拒绝注册。真实锁具绑定仍未建立；本轮运行时联调另用合成终端和实际API签发的平台测试设备凭据建立专用绑定，不冒充真实锁具身份。

以下为扩展配置合同；后继已在独立外置测试环境启用，测试端口16808，结束后停止应用，缺省配置仍关闭：

| 配置 | 要求/缺省 |
| --- | --- |
| `jagonzn.jt808.enabled` | false；开启后缺必要配置即拒绝启动 |
| `jagonzn.jt808.external-root` | 本机已核验外设资料根 |
| `jagonzn.jt808.crypto-file`、`binding-file` | 外盘私有原件，文件0600、父目录0700，归当前用户所有，拒绝链接 |
| `jagonzn.jt808.state-directory` | 外盘已有0700专属目录；单进程文件锁，不自动退回本机 |
| `jagonzn.jt808.bind-address`、`port` | `127.0.0.1`、6808；这些缺省值不代表端口已开放 |
| `jagonzn.jt808.idle-timeout-seconds`、`maintenance-interval-seconds` | 120、5；属于本地策略，不是厂家已协商心跳 |
| 平台运行配置 | `device-access`角色和现行`things-link.access.tcp.enabled=true`，继承原消费者及其标准TCP/TLS/就绪保护；不能关闭安全守卫代替正常装配 |

状态原件保存鉴权码、消息标识、命令与回复关联；同文件系统临时写入、fsync后原子替换，失败保留首因并停止，拒绝与运行工作目录相同的文件系统（本机从源码目录运行）。状态上限10000项/4MiB，下行流水65535后拒绝回绕；不自动淘汰幂等或命令历史。这是当前测试实现的容量边界，后续持久化/归档须独立评估。当前私有权限实现仅验证macOS/POSIX，Windows不静默跳过检查。

移除时先关闭扩展并恢复设备服务器地址，再删除本包、同名测试、相关配置和专属Bouncy Castle直接依赖；关闭后公开路由/预处理Bean也消失，平台原实现继续使用。外盘原件、凭据及命令UNKNOWN证据的备份和清理须另行明确授权，不能通过删除文件伪造一次新设备接入。

外置复查曾失败：Surefire运行后设置`java.io.tmpdir`没有改变JDK已缓存的默认目录，JUnit实际目录仍在本机`/var/folders`。首因在`tempdir-first-cause.log`、保护拒绝在`session-tests-external-guard.log`保留；已改为fork JVM启动参数设置，并新增JUnit真实路径断言。只有修正后`session-tests-external-fixed.log`的88项结果认领本轮临时数据外置；先前报告外置不能替代这个物理检查。

上述88项是此前软件测试回执，当时未启动完整service或独立中间件。后继真实运行时结果见下节；两轮均未连接真实锁具、提交、推送或部署。


## 外置独立环境与真实运行时联调回执

2026-10-28按后继授权准备独立环境，使用同一个外盘固定service JAR：SHA-256 `09c6207bd6fc5f2103f7b3788429d4e898a67ac5d4a41e6b021fea7c75070850`，继承上游`260fa694`。这是正常应用进程，未使用测试Profile或数据库/Kafka替身；设备侧为Python/OpenSSL独立SM4模拟终端，使用合成终端标识与MAC，未连接负责人实物锁具。此前88项软件测试保留为独立基线，不与本轮情景相加或拼接为正式发布资格。

### 资源与物理落点

- 外设根`/Volumes/Samsung/Jagonzn/data`；Lima 2.2.1 VZ实例`jt808`为3核/4GiB，32GiB稀疏磁盘实际文件在`.private/workspaces/lima/jt808/disk`，与源码位于不同设备。Ubuntu 24.04 ARM镜像、Lima程序、Mailpit官方二进制及下载校验均外置。
- 独立守护进程`lima-jt808`，Docker根`/var/lib/docker`位于上述磁盘；五个命名数据卷均为`jagonzn-jt808-lab_*`。脚本逐次指定该VM的socket并检查实例、容器标签、挂载与回环端口，不执行`docker context use`。原`desktop-linux`及五个ThingsLink容器保留运行。
- PostgreSQL 17.4/TimescaleDB 2.18.2：独立`jagonzn`空库，owner与`jagonzn_app`不同随机凭据；应用角色`superuser=false/bypassrls=false`。原生迁移自然应用548条，没有手工改表、repair或关闭RLS。
- Redpanda 24.3.6：25个主题，分区和保留期逐个核对平台初始化脚本，关闭自动建主题。内存1GiB、容器限制1536MiB，未通过缩减分区或绕过预算守卫解决容量不足。
- Redis 7.4持久AOF；MinIO五个私桶、固件/OTA版本控制及受限应用身份；Mailpit 1.32.0只接收`.test`测试邮件，无外部SMTP转发。TLS私钥、JWT、数据库/S3凭据、注册验证令牌、请求原件、设备绑定及适配器状态均在0700外盘工作目录中，敏感文件0600。
- 正常商业/Free套餐和真实计量路径保持启用；注册、邮件验证、登录、创建项目/设备/物模型、开启TCP平面及命令均由正常HTTPS API完成。只读数据库取证采用明确租户/项目范围，不直接写业务表或借SQL绕过邮箱验证、配额和鉴权。

| 资源 | 仅本机回环端口 | 结束状态 |
| --- | --- | --- |
| PostgreSQL / Redis / Kafka | 25432 / 26379 / 39092 | 独立容器运行，数据保留 |
| MinIO API / Console | 29000 / 29001 | 独立容器运行，数据保留 |
| Mailpit SMTP / API | 21025 / 28025 | 独立容器运行，数据保留 |
| service HTTPS / 原生TCP TLS / JT808 | 18280 / 18884 / 16808 | 本轮应用已停止，无监听；6808没有开放 |

### 实际情景与结果

| 情景 | 真实运行时结果 |
| --- | --- |
| 空库启动与准备 | 548迁移成功；真实HTTPS注册→本机SMTP验证→登录，两租户/项目隔离，发布1.0.0物模型和专用测试设备 |
| 国密0100/0102 | 预绑定注册、持久六字节鉴权码及平台正式TCP鉴权通过；错误鉴权码拒绝 |
| 0200上行 | 两个映射属性经真实Kafka受理/处理，形成2个历史点及影子值；完全重复帧不新增历史 |
| 8201查询 | 正常命令API返回202，原Outbox/Kafka/原TCP消费者派发；0001仅ACK，匹配0201后平台`SUCCEEDED`，输出与本次属性一致 |
| 8500控制 | 仅发送一次控制帧；0001与普通0200不构成执行成功，平台最终`TIMED_OUT`；适配器`UNKNOWN`原件保留，不删除来解除控制限制 |
| 重启恢复 | 停止后重启同一固定JAR，原六字节码重鉴权；重放旧0200前后历史均为6点，影子未回退；新查询成功后为8点 |
| 隔离读取 | 另一租户读取原命令404；应用数据库角色无范围0行、有正确范围1行。未外推全部越权写场景 |
| 凭据撤销 | 正常API删除测试设备凭据204，权威重读为空；原连接下一次心跳关闭且无ACK，历史仍8点 |

真实锁具/固件互通、4G公网、物理开锁/合锁、逐次设备事件、跨实例与历史数据库升级均为`NOTRUN`。MinIO/Redis/SMTP只认领本轮实际初始化和调用范围，不据应用健康断言全部平台能力通过。没有操作公网账号、变更正式许可或执行部署。

### 工具、复现及恢复边界

资源入口为[独立Compose](../deploy/lab/jt808-compose.yml)、[资源管理](../scripts/jt808-runtime-lab.py)、[固定JAR应用管理](../scripts/jt808-runtime-app.py)和[HTTPS/SM4探针](../scripts/jt808-runtime-probe.py)。探针依赖本机OpenSSL 3动态库，当前仅验证macOS ARM；不是跨平台测试框架。资源脚本需要已准备的外置Lima实例、镜像及私有配置，不能单独复制源码即视为完成环境初始化。

在本机jagonzn根检查现有环境（回执必须另取外盘新文件名，保留旧原件）：

```bash
python3 -B scripts/check-storage.py
python3 -B scripts/jt808-runtime-lab.py status \
  --receipt .private/deployment-session/jt808-runtime-status-next.json
python3 -B scripts/jt808-runtime-app.py status \
  --receipt .private/deployment-session/jt808-runtime-app-status-next.json
```

若重启宿主后需要恢复已存在的VM，先核验同一外盘身份与实例目录，再使用外置`limactl`，显式设置`LIMA_HOME=/Volumes/Samsung/Jagonzn/data/.private/workspaces/lima`及外置`TMPDIR`，执行`start jt808`。随后资源脚本`up`只对该Compose项目恢复容器并核对主题/桶，不清卷。停止资源使用同脚本`stop`，停止本轮应用使用应用脚本`stop`，都需要独立外盘`--receipt`；不执行`down -v`或清理其他栈。

本次实际顺序为：资源`up`→应用`start --mode bootstrap --jar <固定外盘JAR>`→探针`prepare`→应用`stop`→应用`start --mode jt808`→探针`exercise`→应用`stop/start --mode jt808`→探针`restart`→探针`revoke`→应用`stop`。各步均带自己的外盘回执。`prepare`通过正常API建模、签发凭据并保存私有绑定；每次写请求持久保存原请求键、载荷和结果，未确认时拒绝盲重试。

当前测试凭据已撤销，控制UNKNOWN及请求日志保留；不能直接重跑以上全流程或修改/删除状态来制造一次新接入。后续复测应显式准备新的平台测试凭据及独立绑定/会话身份，并先核对原UNKNOWN；此记录不授权清理原件。真实锁具绑定仍待单独准备。

### 候选、首因与证据

机器总回执、各阶段原始回执与日志在`.private/deployment-session/jt808-runtime-integration-20261028/`，对应物理根`/Volumes/Samsung/Jagonzn/data/.private/deployment-session/jt808-runtime-integration-20261028/`。主要文件为`receipt.json`、`environment-final.json`、`physical-storage.json`、`topic-parity.json`、`database-facts.json`、`fixture-prepare.json`、`exercise.json`、`restart.json`、`revoke.json`及`final-app-stop.json`；运行配置、TLS与完整应用日志在外盘`.private/workspaces/jt808-runtime-lab/`。摘要只绑定实际固定JAR与实际阶段，工作树仍dirty，非正式不可变发行物。

首因未覆盖：VM磁盘布局曾误按旧版检查；Docker Hub拉Mailpit失败后改用摘要核验的官方静态二进制在独立VM本地构建；Redpanda不接受`--set`且初始768MiB不足，修正配置接口并恢复1GiB；原生TLS资源缺`file:`前缀导致首启失败；历史只读取证初次未设项目范围读0行，修正探针会话范围后得到正确结果，未修改平台RLS。保留`vm-start.log`、`environment-up*.log`、`redpanda-first-failure.log`、`bootstrap-start.log`、`exercise-first.log`及各次私有配置/console日志。辅助核对误写不存在主题的只读失败也保留在`topic-configs.log`，正确25主题逐项结果见`topic-parity.json`。首轮与重启阶段探针存在记录/限速调整，不把最终脚本摘要追认成此前同源码完整回归。


## 真机接入准备与现场联调

2026-10-28负责人授权依次推进公网TCP入口、真实绑定、固件互通准备，并确认：固件版本未知，使用蓝牙修改服务器地址，当前测试锁具的服务器配置允许覆盖。授权限于JT808测试接入准备，不提交/推送，不修改ThingsLink业务代码，也不上传或替换线上JAR、数据库及既有Nginx配置。

| 准备项 | 已完成事实 | 当前状态 |
| --- | --- | --- |
| 公网TCP入口 | SSH密钥登录成功；独立临时socket代理及SSH反向隧道的双向nonce回传通过 | 首轮公网超时，负责人确认创建限定云规则后，公网双向回传PASS；入口已就绪 |
| 真机预绑定 | 正常HTTPS API创建实物测试设备、单独凭据、TCP接入配置；复用已发布1.0.0物模型；真机模式正常启动通过 | PASS，首绑窗口已开启至北京时间21:09；真机凭据1份有效，旧模拟凭据仍为0份 |
| 固件互通 | 真机独立绑定/状态目录及受限首绑工具已准备；厂家SM4参数沿用已核对私有原件 | 待4G真实报文；固件版本、空体加密、授时及实物动作NOTRUN |

### 临时链路与云端操作范围

链路设计为：锁具→`34.80.56.185:6808`→服务器独立`jagonzn-jt808-relay.socket/service`→`127.0.0.1:26808` SSH反向隧道→本机`127.0.0.1:16808`专用适配器。代理使用服务器现成`systemd-socket-proxyd`，最多32连接，曾设置4小时自动停止定时器；未放开SSH全局GatewayPorts、未修改ThingsLink入口或部署应用。跨隧道后适配器看到回环地址，因此不能将该路径的来源IP视为真实4G源地址；真实身份仍由预绑定与平台设备凭据验证。

首轮公网探针超时、内部双向探针通过，有限抓包未收到外部SYN。Google Cloud CLI无已登录账号、实例无默认服务账号；初始Chrome账号受两步验证限制。负责人随后打开正确的Cloud管理账号，已可正常访问项目，未修改或绕过前一账号MFA。云规则清单确实没有6808；新增限定规则后，同一公网地址双向nonce回传通过。桌面RTF仅有SSH连接命令，不是云管理服务账号凭据。首轮失败证据保留。

最初云操作草案`firewall-request.json`原样保留，未按草案增加实例标签。最终经负责人动作时明确确认，通过Chrome创建`jagonzn-jt808-test-6808`：default网络、入站ALLOW、优先级1000、TCP6808、来源`0.0.0.0/0`，使用现有`https-server`标签并叠加目标`10.140.0.2/32`只命中本实例。不开放其他端口、不改变实例标签或既有规则。Google Cloud成功通知及列表重读均确认创建，公网双向回传PASS；最终配置见`firewall-created.json`。此事属于测试网络配置，不登记为ThingsLink业务缺陷。

首轮受阻时曾停止临时代理/隧道及应用，原停止回执保留；云规则创建后已再次启动并验证公网。当前临时代理及SSH隧道运行，对锁具提供`34.80.56.185:6808`，适配器仍仅绑定本机回环16808。代理由第二次启动的4小时到期定时器管理；云防火墙规则本身不会随定时器自动删除，后续按具体授权停用或移除。Mac和Samsung须在线，Mac休眠、断网或卸载外设会中断链路，这不是已部署在云端的Jagonzn应用。

### 真机绑定与首绑工具

[真机准备脚本](../scripts/jt808-real-device.py)只提供`prepare`、`arm`、`inspect`，不下发控制动作。`prepare`通过正常API创建实物测试设备及有效凭据，写入外盘`.private/workspaces/jt808-runtime-lab/real-device/binding.properties`与`platform-reference.json`，状态目录为同目录`state/`。不复用模拟终端鉴权码、原控制UNKNOWN或其状态目录，不复制真实IMEI、MAC和密钥到源码。真实绑定初始没有`enrollment.until`，明确拒绝首绑。

[应用管理](../scripts/jt808-runtime-app.py)新增`--mode real-device`，读取上述独立绑定与状态，使用同一固定JAR和正常中间件。待公网可达并且现场准备好后，先停止应用，执行`jt808-real-device.py arm --minutes 30 --receipt <新外盘回执>`开启有限首绑窗口，再以真机模式启动。`arm`保留开启前的绑定原件；已有窗口、已存在协议状态或应用仍运行时拒绝自动改写，不删除原件“重新注册”。首绑窗口超过需要重新评估现场状态，脚本不自动续期。

后续依次取得真实注册/鉴权、状态上报和查询结果；确认门磁与现场一致后，再按具体授权开展单次物理开锁及人工合锁。真实抓包要限定专用端口、数量/时长并直接写外盘私有文件，不保存到线上服务器业务目录或普通日志；不自动切换另一套SM4参数，也不自动重发未知开锁命令。

真机模式已启动，首绑窗口至北京时间21:09，负责人确认蓝牙已配置。专用端口抓包经SSH直接写外盘，限制1800秒/1000包，不在服务器保存报文。最后一次只读快照仅见本机公网探针的双向TCP握手，载荷0字节、JT808帧0条，尚无真实注册/鉴权报文；已请求现场回读IP/端口及联网状态，并按厂家正常方式唤醒或重新联网，不恢复出厂、不下发开锁。应用启动证明配置可装配，不代表实物已注册。真机状态目前只有绑定标记，没有注册鉴权码。只读API复核真机凭据1份且TCP启用，模拟凭据0份。一次停止脚本在进程退出的短暂僵尸状态误判PID归属；首败`bootstrap-stop.log`保留，已修正本项目Python进程检查并在实际真机模式停止时复验，不涉及平台业务代码。

[有界抓包工具](../scripts/jt808-capture.py)把专用端口pcap经SSH直接写外盘，当前上限1800秒/1000包；[只读报文核对](../scripts/jt808-wire-inspect.py)冻结外盘pcap快照，按TCP序号合并重复片段，遇缺口不推断完整帧，核对已选SM4上下行、终端匹配、校验和零补齐，只输出脱敏消息类型、通用结果及E7固件字段。合成向量核对与坏校验拒绝通过，不冒充真实硬件互通；握手、绑定文件和抓包进程存在都不能认领真机成功。原始报文和快照保持外置私有权限。

### 证据与接续

本次回执根为`.private/deployment-session/jt808-real-device-20261028/`，物理位置`/Volumes/Samsung/Jagonzn/data/.private/deployment-session/jt808-real-device-20261028/`。主要证据：`device-prepare.json`、`binding-verification.json`、`real-app-start.json`、`real-app-stop.json`、`internal-relay-probe.json`、`public-echo-probe.json`、`ingress-verification.json`、`public-link-start.json`、`public-link-stop.json`、`firewall-request.json`及总`receipt.json`。另有`firewall-created.json`、`public-echo-probe-after-rule.json`、`public-link-start-2.json`、`real-device-arm.json`、`real-app-start-armed.json`及`capture-start.json`。上轮模拟终端的通过与本轮真机未验分别保存，旧回执不覆盖。
