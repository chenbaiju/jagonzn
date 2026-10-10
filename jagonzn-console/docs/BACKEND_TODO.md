# Console 后端依赖待办

本文件只维护**必须先新增或完善后端能力才能实施的Console需求**；后端已具备的页面任务和完成回执见[Console开发任务](TODO.md)。
范围受[V1-R4](../../docs/PRODUCT_SCOPE_V1_R4.md)约束；设计候选不等于实施授权。供应商、运行环境和外部验收缺条件与后端缺接口分开判断。

## 统一负责与本轮执行边界

后端与Console均由当前执行者负责；分类表示依赖顺序，不表示等待另一名开发者。
规划及文档扫描已结束；2026-10-06负责人已授权按统一顺序连续实施、逐片验证记录并本地提交，不推送。后端依赖包到序后由同一执行者完成设计裁决与必要实现。
后续获准执行后，范围内后端缺陷、合同、生成类型、前端与验证连续推进，不能只留下“等后端”说明。
新增难逆设计仍按文档规则记录ADR；当前R4暂停范围不恢复。
统一顺序、每包后端责任与验证见[前后端统一工作包](TODO.md#前后端统一接手与执行顺序)。

开发者工作台已获6包7片连续实施授权；菜单后端与Console导航合同已完成并验证本地范围，旧包与新UI的验收结果分开登记。统一设计与顺序见[工作台重构计划](TODO.md#开发者工作台重构计划)，已确认菜单前置记为下方BE-003。

本轮未接入接口补齐复用既有业务能力；TODO-025-A发现原始属性历史运行端已有成功返回，但OpenAPI只声明503，已同片补齐200、精确结构矩阵及双端生成类型，73项合同测试和真实六类型查询通过。该契约修复归[未接入接口工作包](TODO.md#未接入管理接口补齐)，不新增重复的后端业务接口或等待项。

## 当前后端依赖队列

2026-10-06复核平台`d5e24018`的[OpenAPI](../../docs/openapi.json)、Controller和Console消费者。
TODO-001至TODO-010原来要求的公共接口/菜单/返回字段均已提供，页面均有消费，**没有继续等待这些原接口的开发项**；
001、002及004至009保留原限定范围完成回执；003后端聚合已具备，但独立数量卡片已由WP-10 / 003-C收尾并验证，010-C补证同归WP-10，010-D保留外部资格差额，详细结果只维护在[复核总表](TODO.md#TODO-001至TODO-010复核结论)。
不复制这些已完成任务到本文件，不将缺少真实模型准入误记为Analysis接口未开发。

| 编号 | 来源与需求 | 当前缺口及优先级 | 后端前置工作包 | Console移入条件 | 状态 |
| --- | --- | --- | --- | --- | --- |
| ~~WP-08 / BE-001~~ | 原TODO-004单独边界：设备事件发生历史 | 独立MQTT事件事实链与管理历史查询/Console已完成本地软件验证；不阻塞已完成六类关联查询 | BE-001-A冻结摄取/持久事实/读取合同；BE-001-B交付所选事件标准化与持久化；BE-001-C交付查询、生成类型、Console及真实依赖验证 | BE-001-A接受、B取得真实摄取事实后，BE-001-C同片实现查询与Console事件历史；不能拿告警事件时间线代替 | ~~BE-001-A~~/~~BE-001-B~~/~~BE-001-C~~已完成并验证各自限定范围；WP-08关闭本地软件范围 |
| ~~WP-09 / BE-002~~ | 原TODO-004单独边界：设备类型按ID读取 | 015-A已提供单条GET用于产品凭据前核对；现有设备详情目录查找仍可优化 | BE-002-A复用015-A的GET与权限/DTO/错误合同，评估设备详情目录查找的剩余替换收益 | BE-002-A不重复新增GET，按评估替换剩余Console查找，验证类型消失、跨项目及身份变化；若评估无收益则记录退出裁决 | ~~BE-002-A~~已完成并验证Console优化与后端真实权限回归；WP-09关闭本地软件范围 |
| ~~BE-003~~ | TODO-018-A/019-A：新增工作台入口与导航兼容 | backend模式已新增Workbench节点；导航投影保持原叶子权限和深链 | 同片更新必要的MenuCatalog、菜单筛选/合同与前端兜底；分组优先仅改变展示，避免无谓修改业务路由 | 双端菜单与权限、无项目/平台身份、登录落点及旧链接回归通过后，018-A/019-A才可认领完整交付 | 已完成并验证后端与导航本地范围，回执见本节；023最终UI矩阵独立登记，不重复增加切片 |

## BE-001 设备事件发生历史

- **来源**：[TODO-004单独边界](TODO.md#单独边界)。当前事件定义路径为`/api/v1/projects/{projectId}/device-types/{deviceTypeId}/events`，它表示模型定义，不是设备发生记录；现有消息日志也不能自动推导为正式事件历史合同。
- **开片全文审查事实（摄取差额现由B关闭）**：[设备接入指南](../../docs/device-integration/DEVICE_INTEGRATION_GUIDE.md)明确`up/event/{eventKey}`尚无通用标准化器；[RawUplinkMessageNormalizer](../../things-cloud/things-cloud-ingestion/src/main/java/com/things/cloud/ingestion/application/RawUplinkMessageNormalizer.java)仅接受`property/report`，现有`RawUplinkMessageNormalizerTests`与`EmqxCallbackTests`验证事件类型进入DLQ。架构提及`ts_device_event`是设计，不能作为已有持久化实现证据。
- **范围裁决**：[ADR0235](../../docs/adr/0235-device-event-history-and-mqtt-ingestion.md)与[事件合同](../../docs/contracts/DEVICE_EVENT_HISTORY.md)冻结MQTT直接连接（含网关本机）、独立EventUplink/Topic/consumer、显式版本与实际直接替换10分钟窗口、四标量/空参数/脱敏、完整scope Inbox分类与EVENT独立rawBytes计量、整条额度拒绝、可信receivedAt90天物理保留及套餐交集、RLS/清理/键集查询。HTTP/TCP/CoAP、子设备代理、规则/告警/自动化/影子及旧死信自动重放不扩展；历史名称未知不猜补。
- **拆片理由**：实际发现摄取缺失，不能把BE-001-B简化为查询。摄取到持久事实与只读管理查询具有独立完成边界，新增BE-001-C，B/C仍各自包含必要测试和记录，不按工序拆片。
- **后端验收**：接受的接口应覆盖无事件/多页、稳定排序、事件模型变更、时间范围、删除/撤权、跨项目及敏感信息；生成类型与源码一致，并有真实数据库/HTTP证据。
- **Console后续**：BE-001-A先输出可审查契约及数据源结论，B完成真实摄取事实，C由同一执行者完成后端查询与设备历史页签/筛选/详情及实际验证；主体回执保留本项，TODO总队列只引用，不复制流水。
- **回执**：~~BE-001-A~~ — 已完成并验证设计片，候选`master / 930b66b6`加本片文档差异；当时B/C业务实现及验证NOTRUN；当前B/C详见下方摄取及查询回执。

### BE-001-A 设计片回执

负责人已授权范围内连续实施及执行者内部裁决；本片只接受契约，不等待另一名后端。当前源码与docs/openapi核实事件定义CRUD、属性唯一标准消息/规则processed链、模型快照缺历史名称、四标量DB与DTO/发布校验差额、全局Inbox/自部署计量触发器、90天保留及八天/500条TELEMETRY清理。没有现成发生表/查询，不能把架构表名当实现。

独立复核进一步确认模型“直接转换窗口”不等于唯一最后前驱，协议层eventKey不能以`_`/`-`开头，套餐最长12个月不等于事件90天物理事实、键集水位不等于提交快照；合同明确限制，不扩大共享绑定算法或猜补历史。选择新事件HARD_LIMIT/DEGRADED整条拒绝、权威额度异常重试，不采用参数半存；属性降级与旧PG摘要不改。独立复核发现既有日志Timescale按occurredAt保留，允许古老迟到事件时不能依赖日志原字节；裁决事件事实持久rawBytes、EVENT字节统计取事件receivedAt且排除EVENT日志，保原属性/日志策略。新增难逆决策ADR0235、独立合同与契约/ADR索引、架构/接入指南/错误码先行登记同步，已接受ADR历史及Flyway不改。

- 验证：源码/生产消费者及独立交叉审查完成；完整`pwsh scripts/docs-verify.ps1`PASS（821文档、Java文档一致性16项、28.945秒），`logs/be-001-a-docs.log`；最终回执/合同校准后的`-SkipMaven`与`git diff --check`PASS（821文档/23语法案例），`be-001-a-docs-receipt.log`；本片一次本地提交，不推送，提交号由Git定位回执。无Java/SQL/HTTP/生成类型改动，未执行业务测试或生成器，不借A认领B/C。
- 后续：B须交付设备定义/模型发布校验及可信端口、Kafka可靠分流、事件事实/Inbox kind兼容（标准信封与旧单属性两入口）、EVENT原字节计量、额度/脱敏/保留/项目清理与真实TLS Broker/Kafka/PG、属性/绑定回归（含旧单属性分类拒绝、TELEMETRY先事件/后Inbox、DEVICE残留RESTRICT阻塞）；事件不加入现行留存导出白名单，保ADR0075范围；C再做HTTP/生成双端类型及Console读取B真实事实。B/C未实施，不划线，WP-08父包开放。新错码先登记30070/30071/30072，复用30059与绑定拒绝，不虚构已开放管理GET。
- 环境限制：本片文档/设计，业务、Windows/CI/公司服务器/实物与正式交付NOTRUN，R4暂停项保持。

### BE-001-B 摄取片回执

候选`master / d8131909`开片清洁，按已接受ADR0235与事件合同执行。设备模型/可信端口、telemetry原事务与新增迁移、ingestion可靠Kafka分流由子agent分域实现，根负责真实PG反例、迁移升级、源码/错误码门禁及真实TLS Broker→Kafka→PG；所有Maven/生成/构建/运行栈操作由根串行控制。新迁移顺序0910设备完整范围唯一键、0920遥测事件事实及Inbox分类，不改旧Flyway、已接受ADR或共享模型绑定窗口。

实现包括独立严格事件信封、七层Topic分流与精确数字两跳、原快照/真实绑定窗口、全scope Inbox仲裁和同事务事件/脱敏日志、EVENT日字节、完整FK/RLS及受控清理。交叉审查修复U+0000与非RFC3339扩展年份：确定不可存储输入在数据库前固定拒绝，不吞基础设施异常。30070仅device/telemetry两个同义定义，错误守卫限定所有者与message/status。

原失败及修复证据：首轮scoped运行29.209s在NormalizerTests的QoS0夹具构造先于断言失败，按既有Raw信封边界修正测试；PG前两轮编译发现新测试绑定参数次序、void回调和泛型断言问题，修正测试后第三轮39.382s真实PG20项PASS（含纳秒重放/自部署额度）。完整受影响15模块首轮2:57 BUILD SUCCESS，3484项中3483通过、1项跳过；最终冻结源码完整复验2:43 BUILD SUCCESS，3497项中3496通过/0失败/0错误/1跳过。跳过的是RegisteredHostRealArtifactTests所需独立1.1.0/1.1.1真实制品未提供，不代称该专项资格；当前1.0.0本人宿主沿既有单独回执，不继承此专项。后续组合1:35有116项中115通过、旧候选清理1项失败：误将新表加到固定20260906.0110观察集，恢复历史观察范围后独立26.329s PASS；新增当前候选事件/迁移/清理26项PASS，其中501条均由实际EventIngestionService摄取。八天清理时间推进是独占PG owner受控夹具（已摄取后仅调整acceptedAt/日志处理时刻并立即恢复不可变trigger），非自然等待或SQL新造事件。源码架构13/错误码1/命名注释4/Flyway11与旧属性37、绑定23均通过，原失败日志保留。

最终输入`8ccaa95748b998b74ba4c8acb5c389f0cd245109f321b8ae7453d667ebc69c4a`经唯一根`python3 scripts/generate-openapi-contracts.py`重新生成，OpenApiSpecTests71项/47.394s及双端类型检查PASS；HTTP合同`b113948c489deeb14c88f012779b069cd4a0439ce6a152553f20106351d5f4bb`、双端TS`71a4a83bb589048f5bfab233e6d90b7da7d9ceb825aac7c514c8731e289c6627`保持（B不新增管理HTTP），双端`pnpm api:check`PASS。`./mvnw -pl things-cloud-bootstrap -am -DskipTests package`25.726s PASS，测试资格取上述实际运行，不取skip；冻结JAR`798ce2799ffa8e0dee29df7367dee2b22e7d11754b0af4c9e87a8382ce7e438e`。

实际严格TLS本人MQTT栈：8088/PID42022、PG17.4/Timescale2.18.2端口5547/独占库`tc_console_012a_1791302473025009000`/Redis14、EMQX6.2.3 TLS58883/自有CA与主机名校验、Redpanda24.3.6/59092；只在标记`thingscloud.owner=console-016-c`的Kafka新增事件主题，实测25主题/228分区、事件12分区/七天。按PID+原JAR摘要+8088监听三重核对仅停止017-B本人进程；开发8080/3006、共享Broker/缓存/旧数据未重置。

`python3 things-cloud-console/logs/be-001-b-mqtt-prepare.py`首跑因SDK Wire辅助模块导入路径缺失在创建夹具后失败，实际未发送事件；保原HTTP DONE记录和0600凭据，修导入并显式`--resume`只读核真实原类型/模型/设备且事件0后接续，不重复HTTP创建/轮换。脚本SHA`862f386fd7c05dabf94663a338a7b21638cf941f75cf0904d458d224609e1ae8`，`logs/be-001-b-mqtt-second.log`全场PASS：真实HTTP事件定义/发布/凭据→TLS QoS1→raw可靠分流→event正常提交位置→数据库事件/Inbox/日志各1；原secret字段脱敏，规则/属性点/影子零副作用；相同原message两跳重放等待消费提交后全事实摘要/数量不变；改变参数实际DLQ `EVENT_REJECTED_30059`；空params事件实际`{}`；缺required实际30070、缺model/NUL/扩展年实际`EVENT_PAYLOAD_INVALID`、错误model实际30052，每例均核DLQ异常头及数据库零增量。额度/回滚恢复/八天清理/邻居隔离/绑定切换取真实PG测试回执，不冒称Broker强杀或自然等待八天；旧属性/Kafka恢复由完整模块与bootstrap回归覆盖。

公开检查点`logs/be-001-b-mqtt-checkpoint-b8af6a6cf9224970b78c4b518fcedd05.json` SHA`4bbc7114c5f4bfa1a13d9a88e460ec761b04cd13c18c927e2e8b5ed4a6968f1a`；真实类型`01a11344-5697-712b-ac00-6f87a65a1085`、设备`01a11344-5dde-7c3b-b4da-e784edd3ef51`、原模型`43e6c19b-04ec-46be-940d-e69cccaf8f76`/1.0.0；alarm消息`01a11345-8eea-74fe-bda0-7adf3cc65ad4`、empty消息`01a11345-926c-771b-b524-57311741f634`供C真实读取，不插表造历史，不记录凭据。

完整`pwsh scripts/docs-verify.ps1`28.922s PASS（821份Markdown及模块文档、23项链接回归、Java文档16项，日志`logs/be-001-b-docs.log`）；默认未找到reachable base，commit-range策略未运行，不代称该资格；最终记录更新后再作静态收据核验。`python3 scripts/check-flyway-migrations.py --base-ref HEAD`及离线acceptance init5项、shell语法/差异空白检查已通过。Node22、Windows、远端CI、公司服务器、硬件/正式交付、实际Broker强杀恢复及旧宿主专项NOTRUN；C查询/Console未实施，WP-08父包仍开放，WP-03默认矩阵/G3不继承本片。历史事件不SQL回填、旧DLQ不自动重放，真实Agent出站/R4暂停范围不恢复。


### BE-001-C 查询与Console片执行记录

候选`master / 8897e433`，B已本地提交且提交后`pwsh scripts/docs-verify.ps1 -SkipMaven -BaseRef d8131909`通过（821文档、23语法案例、实际commit-range策略与差异）。C依照已接受合同实现列表/详情、每页成员与owner权益/数据库时刻/RLS、封闭过滤和微秒键集、只读脱敏及精确数字，Console独立事件历史页签与身份/详情代次清理。子agent分担后端、真实PG/HTTP与Console/浏览器测试，根负责串行运行门禁和冻结本人栈。

首轮后端50.149s通过：新真实PG/HTTP21项、查询/游标/服务11项、缓存路径62项及退出fixture2项，共96项零失败。完整遥测及依赖首轮1:07因合法`0000-01-01T00:00:00+23:59`被JDK Instant偏移上限拒绝出现1项error，保原有效测试并补严格较大偏移解析后第二轮1:03完整1359项通过、零失败/零跳过；同现场发现MQTT Reader同类合同缺陷，C关联最小补齐并增加精度/年界/闰秒反例，完整ingestion及15个受影响模块2:46通过，3522项中3521通过/0失败/0错误/1跳过，另两个退出fixture执行通过；跳过仍是缺1.1.0/1.1.1独立宿主制品的RegisteredHostRealArtifactTests，不继承旧1.0.0资格。Console专项最终13项通过；首轮组件测试辅助转译括号失败已修，原失败保留。样式首轮属性顺序1error；修路径命令曾未找到文件且未改源，再明确修正样式后全Stylelint通过。首次bootstrap组合1:02在架构Instant/OffsetDateTime守卫发现两处LocalDateTime引用，77项中1fail；最终改用显式UTC OffsetDateTime严校日历再减偏移，原反例和架构守卫均保留，最终组合1:09复验通过：后端主用例187项加退出fixture2项，共189次执行零失败/零跳过；包括Reader35、telemetry13、缓存62、bootstrap77，后续首败后的旧PASS不作为组合通过。唯一生成器首轮47.773s失败：72项中3fail，缺新路径独立矩阵和中文tag登记；新增事件专属合同守卫当轮通过。补既有矩阵两GET/read和事件页、Controller中文tag说明后重新生成48.009s，72项全通过并原子发布，双端类型检查及`pnpm api:check`通过。输入`e5707a13b3744f3d4d150370b6f6ce928d1d33302f8b867a0845758156c8b2b6`、OpenAPI`fc9fc92414182ba83847b761581f03d63a00c3a3ad0532db13e3e6ae6bf618ea`、双端TS`f0157516c624a88ed00ba7620e5ccc28c651eda15811385690ea03993723efd8`。根补API根路径配置验证首轮夹具只有code字段被严格ApiError解码拒绝，修为原四字段ApiError，未放宽生产decoder；专项此前13通过，修正后Console全量160文件1977项/26.25s全通过。随后typecheck与build实际失败：int retentionDays输出90，但Springdoc allowableValues形成字符串枚举"90"，前端严格数值投影与生成类型不兼容。按真实数值合同修OpenAPI登记，不用unknown强转压错误；首次JAR`9e0b78b8272ee413d3cd16815600da3a1be58b35013358067d887aca69120f78`已启动PID49176/健康200，此JAR仅初始运行材料、浏览器NOTRUN，须合同修复后重新冻结并仅停本人PID。以上不代称浏览器资格。

整数枚举修正后最终生成47.740s/72项通过，输入`c6e574756ddeba2ad1b5089aee1a268c77fd2ca41f5b143253e8e1675dd8c5aa`，OpenAPI`33bb167285ca6e7809c024861d8090b3d75a20debf91cd4513d44d748a633bfb`，双端TS`1c6cd5ad5b2f4c02a2b04f55c1b13ca84daa61041c643ce477b3929e171903ee`；双端api:check及Console build（包含vue-tsc，Vite18.10s）通过。完整文档29.766s通过：821文档/23语法及模块覆盖/16Java文档；默认无reachable base，未认领commit-range。首次复制JAR命令误用1.0.0文件名失败，未停进程未改冻结材料；核实际0.0.1-SNAPSHOT后仅停止已核SHA/PID/lsof的本人49176，最终候选JAR`4cf7cc3537ac93e32c08fd4313c95c586732ae568bf9387004410a1742c2b1b3`健康200。Broker因本人后台切换造成HTTP认证connector短暂连接拒绝，既有有界重连于15:49:54取得CONNACK/SUBACK，未改配置/凭据或重启共享服务。

首轮浏览器4.6s失败于stream/no-store响应正文缓存，200接口已返回但Playwright延后text无法取得；响应头时立即开始读取后第二轮到真实数字断言，发现38位小数在B事件写入脱敏时被默认JsonNode舍入为`0.12345678901234568`。仅只读PG核对确认，不把问题归前端显示；旧27条追加及B两条共29条真实MQTT事实保留，公开checkpoint`be-001-c-mqtt-seed.json` SHA`421409ad182f7d715fb1053806f2e3b3a47ae17f30867c39dbe4a075c5e5c28a`，原失败保留，不能写精度通过或SQL修补。C同片补事件专属精确写入脱敏器（不改共享属性mapper），新增38位/1e-308/1.0的实际PG/HTTP读写回归；复核还补普通偏移的UTC闰秒判断，拒绝仅本地23:59:60的假闰秒、接受UTC有效偏移，不削弱合同。最终精度/时间/架构专项45.304s通过：EventIngestion22、Query6、Reader39、真实PG/HTTP25、架构13，加退出fixture2，共107项零失败/零跳过。完整15个受影响模块最终2:44通过：主用例3530项（3529通过/1独立宿主制品不足跳过），另退出fixture2项，共3532次执行零失败/零错误；telemetry116、ingestion420。日志`logs/be-001-c-affected-frozen-final.log`。精度修复后最终唯一生成48.091s/72项通过，输入`9f4df99e838ab49d50d0944d378eb6ff3756b1e1729723eccac6f2b9d58d7798`；OpenAPI与双端TS摘要保持上述数值枚举版本。Console最终build含vue-tsc（Vite19.02s）及双端api:check均通过，最终打包34.881s。冻结JAR`22213fe96f17f1a332837d4b401257421a1906573b43a7b749f206ecf933a91a`，仅经旧JAR/PID/lsof三核停止本人50377；新本人8088/PID53202健康200且16:00:17取得实际MQTT连接/订阅成功。新本人设备`01a11372-5ecc-723c-ae6b-49c9464dcafc`通过真实公开HTTP创建及一次凭据，29条新事件由最终C JAR经严格TLS MQTT进入可靠Kafka，逐条核正常主题提交位置、事件/Inbox/日志1/1/1、精确数值原文、脱敏与规则/属性点/影子零副作用，全部PASS；不是修旧B事实。发生时刻`2026-10-06T23:00:25Z`，公开`logs/be-001-c-mqtt-seed-v2.json` SHA`d494aa6c0e97b90674d25f43ebda2c2fbde7fa80a5d03c4f8573fc98f6118432`，全事实摘要`e4954ded3aa059a7ec93c5c0d2445004afcb55c1079e567a385c837a90d70c02`；0600凭据/原报文只留忽略目录不提交不打印。首两条为新C锚点，同发生时刻的告警26条，所以最终浏览器须按实际20+6筛选而非旧B分时的20+5；原29条历史仍在。v2浏览器3分钟首败定位在ElSelect原生combobox被自身suffix及固定header拦截（此轮已执行分页29/精确数字/锚点详情）；改为实际可交互wrapper并滚动至中心，局部15秒超时，不force、不改响应或生产页面。最终完整浏览器7.8s通过（总8.3s，`logs/be-001-c-browser-v2-final.log`及同名目录Playwright报告）：正常UI登录/项目/设备详情，真实列表20+9且29唯一，38位整数/小数详情、原模型与脱敏、五过滤组合26告警20+6、真实旧时间空页/逆时间400/清筛选恢复；CDP暂停真实200空参数筛选响应，关闭后实际释放成功，再进详情20条且筛选/详情不复活，浏览器业务写入0。trace/video/screenshot关闭，不留JWT/秘密正文。最终专项ESLint与既有完整Stylelint通过；Console全量160文件1977项、最终构建/双端API检查及后端回归均见上文。~~BE-001-C~~已完成并验证本地软件功能范围；WP-08仅关闭该范围，WP-03默认矩阵、G3/正式交付不继承。完整文档及最终回执门禁见后续同节记录。Windows/CI/公司服务器/硬件/真实模型及R4外部暂停范围保持。

完整`pwsh scripts/docs-verify.ps1 -BaseRef HEAD`29.515s通过（821Markdown/模块覆盖、23链接语法、16Java文档与当前范围策略），日志`logs/be-001-c-docs-final.log`；最终回执后再作静态检查与`git diff --check`，中文commitlint零问题。每片一次本地提交，不推送；Node26.7.0/pnpm11.22.0/JDK21.0.12/Python3.14.7为本机证据，Node22/Windows/远端CI/公司服务器/硬件、自然八天/真实模型及独立宿主缺证仍未验证。按统一顺序接续BE-002-A及010-C。

## BE-002 设备类型单条读取

- **来源**：[设备类型API](../src/api/device.ts)、[设备详情](../src/views/device/index/index.vue)的`fetchDeviceTypePage`游标查询；[DeviceTypeController](../../things-cloud/things-cloud-device/src/main/java/com/things/cloud/device/api/controller/DeviceTypeController.java)已由[015-A](TODO.md#TODO-015%20一型一密产品凭据)提供单条GET，详细实现和验证只在该回执维护。
- **当前可用路径**：单条`GET /api/v1/projects/{projectId}/device-types/{deviceTypeId}`已由015-A提供。设备详情已改为每次单条新读取；目录选择器本身保留原合同。
- **验收**：复用015-A现有成员读取/11字段DTO及404/30001，不新增后端接口。每次详情独立GET当前类型，核范围与身份代次；不存在/撤权清能力并明确不可用，可手动重试。目录缺失的N页查询降为一次，已有缓存时0次变一次是防旧协议/类型状态的正确性取舍；不宣称所有路径请求减少。
- **回执**：~~BE-002-A~~已完成并验证本地软件范围。候选`master / 7a7b7e8e`开片清洁，C提交后`pwsh scripts/docs-verify.ps1 -SkipMaven -BaseRef 8897e433`已通过821文档/23链接语法及实际提交范围策略。源码确认详情缓存未命中时循环50项目录，可能多页；缓存命中则不复核当前设备类型。选择每次详情单条新读取，不用旧缓存作能力依据，不重复认领015-A后端交付。Console已迁移fresh单GET、项目/type匹配、detail/type请求与身份代次、独立不可用/手动重试，不清其他设备事实；专项3文件22单元与源/测试ESLint首轮通过，日志`logs/be-002-a-unit-first.log`。后端生产代码/DTO不改，在既有DeviceTypeApiTests补真实DELETE后单读404/30001、撤员后原JWT401/20020与真实项目删除恢复后旧代次拒绝、新正常登录恢复读取；真实PG/HTTP及Service46.723s通过，22接口+12服务+退出fixture2，共36次执行零失败/零跳过，日志`logs/be-002-a-backend.log`；最终Console专项3文件24项/1.35s通过、5文件ESLint通过（`logs/be-002-a-unit-final.log`/`logs/be-002-a-scoped-lint-final.log`）。类型读取还从整卡Promise等待移为独立读取，实际迟响应不应挡返回或其他已完成事实；真实gatewayId保留，不把它误说成类型缓存能力。共用事件运行guard抽取后，同候选C真实浏览器重新通过7.608s（总8.203s），20+9/26告警20+6、精确数字、原模型/脱敏、空页/400/重置及真实200迟响应关闭保持，日志`logs/be-002-a-event-regression.log`及该目录Playwright报告。BE002首轮25.104s因测试误监听搜索POST（实际GET）失败；第二轮4.405s因测试误要求设备DTO携带projectId失败（实际设备合同不含该字段），修为设备ID/key和类型DTO项目范围，保留两轮首败，不扩大生产DTO。最终真实浏览器6.808s（总7.319s）通过，日志`logs/be-002-a-browser-dto-final.log`及该目录报告：正常UI登录/实际设备，三次进入均类型GET1/search0；缓存再进时CDP暂停真实200类型正文，其他详情完成且返回可点，关闭后实际释放不恢复摘要/协议能力，再进单GET取当前事实；浏览器业务写入0，关闭trace/video/screenshot。后端生产代码不变，明确复用C冻结JAR`22213fe96f17f1a332837d4b401257421a1906573b43a7b749f206ecf933a91a`，本人8088/PID53202与3017/独占PG/Redis14/Broker/Kafka身份及新C精确seed全部实核；公开`logs/be-002-a-runtime.json`不含凭据。Console全量160文件1992项/20.59s通过，build含vue-tsc通过（Vite14.24s），双端api:check、完整Stylelint及专项ESLint/E2E独立类型检查通过，日志均`logs/be-002-a-*`。唯一OpenAPI生成48.692s/72项通过，输入`6541b48bdf3e9824af56fea74ae4c8af893b65b0ba38ddfb8762eb795bff1ce6`，OpenAPI及双端TS摘要与C完全相同，未新增契约。文档最终门禁见下文；Node22/Windows/远端CI/公司服务器/硬件/真实模型NOTRUN，不继承WP-03默认矩阵或正式资格。

完整`pwsh scripts/docs-verify.ps1 -BaseRef HEAD`30.362s通过，821份根/模块Markdown、23链接语法、16Java文档一致性及当前变更范围策略均通过（`logs/be-002-a-docs-final.log`）。最终回执后再作静态门禁、中文commitlint及`git diff --check`；本片一次本地提交、不推送。WP-09仅关闭本地软件范围，接续010-C合成受审交互和WP-03当前默认矩阵；真实模型010-D与R4外部暂停事项不恢复。

## 后端先行包完成定义

| 切片 | 必须交付 | 必须验证 | 当前状态 |
| --- | --- | --- | --- |
| ~~BE-001-A~~ | 事实存储/来源与缺口清单、V1适用性、字段与版本/时间/保留/额度/权限/游标合同、页面范围；涉及新存储/不可逆选择时形成ADR | 对照生产摄取与历史查询消费者，明确旧未知数据处理；文档、索引及合同一致性验证；不能将设计通过写为事件历史交付 | 已完成并验证设计/文档；B/C业务另见各自回执 |
| ~~BE-001-B~~ | 接受合同后的所选协议事件标准化、不可变模型绑定、持久事实、必要迁移、计量/保留/死信与接入资料 | 受影响模块完整、真实Broker/Kafka/PG从上报到事实、重复/越权/错误模型/恢复与额度、迁移新旧库；旧属性链不得回归，旧死信不自动重放 | 已完成并验证本地软件摄取；C查询详见回执 |
| ~~BE-001-C~~ | 事件历史查询API、OpenAPI和双端类型、Console页签/筛选/详情及回执 | 真实PG/HTTP跨项目/撤权/分页/历史模型、读取窗口与额度；浏览器显示B真实摄取事件，不以插表或mock代摄取证据 | 已完成并验证本地软件查询/页面；真实MQTT及浏览器详见C回执 |
| ~~BE-002-A~~ | 核目录翻页/缓存取舍，复用015-A单GET，交付剩余页面替换与身份/错误处理及记录，不重复新增合同 | 模块与真实HTTP隔离/删除/权限、页面响应与请求次数、跨身份旧响应清理；不新增旁路权限或扩大DTO | 已完成并验证本地软件功能；后端复用015-A，权限回归与Console同片闭合 |

实际修改超出原包时先更新依赖及验收表；接口/领域/页面/测试只是同片步骤，不分别认领完整交付。
BE-001涉及未接受范围时先记录设计结论。后续获得包的实施授权后，内部技术裁决沿单人方案由执行者完成并记录取舍/必要ADR，无需逐次等待另一人；外部输入或实际范围扩张仍单独说明，不恢复暂停事项。


## 已有接口工作包中的后端闭环预检

以下是全文审查与源码对照后新增的决策点，嵌入既有功能片，不另拆仅写接口的工序片，也不先断言必须新增接口。

| 归属 | 已核实事实 | 片前决策与必要修复 | 关闭证据 |
| --- | --- | --- | --- |
| ~~WP-02 / 012-A~~ | 原导出只有申请、按ID查询与下载签发；`ProjectExportService.request`仅回读同代QUEUED/RUNNING，已完成任务不能靠重新POST找回 | 012-A已裁决新增当前代次/本人请求的有界最新任务GET（终态也可找回，无任务204），不在浏览器持久保存ID/URL；同片补SQL函数、权限与生成合同，不把重复POST当只读查询 | 已完成并验证本地软件；latest GET/迁移/权限/生成契约及真实PG/MinIO、浏览器刷新找回已通过，详见[012-A回执](TODO.md#TODO-012%20删除项目留存导出)；存储额度50019限制保留 |
| ~~WP-03 / 013-A~~ | `EndUserQueryService.list`按项目角色赋值查询；预置账号不自动分配角色，因此未分配账号不在该目录 | 明确“创建成功但角色分配失败/刷新”的恢复方案，比较项目管理者受限账号查找与既有ID继续分配；若缺必要合同则同片实现，不暴露整个租户目录给所有项目成员 | 已完成并验证本地：受限lookup GET找回无角色身份及本项目停用角色，生成契约、真实HTTP/RLS及浏览器刷新后继续分配通过，详见[013-A回执](TODO.md#TODO-013%20项目终端用户管理)；目录仍只列本项目赋值，不宣称全租户列表 |

013-C现场又核实EndUserResponse在显示名未设置、项目角色未分配时返回合法null，但生成合同未声明可空；本片修正四字段Schema可空并新增OpenAPI守卫，详情与最终验证统一在[013-C回执](TODO.md#TODO-013%20项目终端用户管理)登记。既有授权目录的管理者权限、CAS/幂等和归档只读不改变。

前两项责任分别由012-A、013-A承担；只有现场契约核对或验证确认为缺陷才修改后端，避免凭规划虚构已修复。

## 跨域资格边界

此节仅导航，不属于“必须补后端接口”的开发队列。

- TODO-010的分析状态、单次POST、原键GET与可空结果合同已提供；受审交互的本地浏览器差额归[Console TODO-010](TODO.md#TODO-010%20Agent%20模型状态与固定问题)。真实模型调用仍依赖[Agent开发计划](../../things-cloud-agent/docs/DEVELOPMENT_PLAN.md)中的供应商处理材料、计数合同或上界、有效授权和质量证据；不因本次复核开启出站。
- WP-02当前套餐配置存储上限时新导出50019是[ADR0075](../../docs/adr/0075-project-export-snapshot-and-private-object-delivery.md)既有统一对象账本缺席的失败关闭边界，正常套餐导出资格未交付；不以历史兼容夹具的ZIP成功或新增latest GET关闭此债务，也不修改套餐来放行。跨域对象账本/计量仍归既有平台专项，非本片有界页面补齐。
- TODO-001实际外部邮件送达、WP-02私有对象存储环境、WP-06受控签名材料/精确类型配置属于对应功能验证前置。接口已存在，不能因此把全部页面开发移入后端缺口队列。
- 公司服务器、Windows、远端CI、真实signer/硬件及公开部署分别取证；暂停与NOTRUN不划完成线。

## 流转与完成规则

1. 新后端依赖必须写明缺少的具体合同/字段/权限或行为、消费者、产品范围和验收要求；仅缺测试环境不建“缺接口”任务。
2. 后端交付后核对Controller、OpenAPI、生成类型及测试回执：只标后端子项完成并划线；Console尚未接入则迁入TODO的活动队列，保留稳定编号与本页完成回链，不复制整份流水。
3. 页面实现后按TODO的切片完成定义验证；完成记录用“~~编号或任务名~~ — 已完成并验证〔实际范围〕”，附候选、命令、结果和剩余限制。父任务不能继承子片通过，设计通过不能标业务完成。
4. 本轮保留原TODO标题、第四轮证据和现有入链；只将两项独立后端候选正文迁到本页。可恢复来源为`d5e24018:things-cloud-console/docs/TODO.md`的“单独边界”，本轮未提交工作包仍保留原文件。

## BE-003 开发者工作台菜单与兼容迁移

来源为[开发者工作台重构](TODO.md#开发者工作台重构计划)，不是原TODO-002个人中心菜单的回归缺陷。候选`1181c93c`的`MenuCatalog`与OpenAPI已有`GET /api/v1/system/menus`，缺少拟新增的工作台菜单节点；业务统计/设备/模型/应用接口继续复用。

- 018-A：新增首页组件与后端目录必须同片可用，明确有项目/无项目的落点；不让首页依赖某项写权限，不扩大子模块读取权限。保留原概要URL与功能，固定标签与登录默认落点同步调整。
- 019-A：先冻结全部叶子路由与权限映射，再选择展示分组与实际路由树的实现。优先保持叶子URL/名称和接口授权；如需修改MenuCatalog树结构，双端同步，不能依赖前端隐藏来替代后端鉴权。
- 必须覆盖：无当前项目、OWNER/ADMIN/OPERATOR/VIEWER、原平台运营/审核等独立身份；无权叶子不得因新父目录而获权，有权叶子也不得因父目录继承另一业务权限而消失。
- 后端验证：现有`MenuCatalogContractTests`及受影响MenuService/API权限用例；Console验证：`menuCatalogContract.test.ts`、MenuProcessor/注册器/权限守卫、首页/标签/项目切换及旧书签真实浏览器。需改DTO时才通过唯一生成器同步OpenAPI与双端类型，并验证受影响消费者；单纯目录值变化不假装新增领域API。
- 分类流转：后端与Console由同一执行者按018-A/019-A交付，后端实现/验证通过时在此原位标记完成子范围并回链；两片及必要兼容都通过才关闭BE-003。实施回执见本节末尾；父整合资格独立。

本次不新增跨端最近访问、全量待处理聚合或开发进度存储；以后确需这些能力时另审输入输出、隔离与保留，不把它们作为本次基础页面改版的前置条件。

018-A菜单子范围已完成并验证：新增首项Workbench/固定标签，旧Overview取消系统固定；菜单105项及IAM完整reactor1045次执行通过，真实8090菜单核验通过。详细回执见[018-A](TODO.md#TODO-018-A%20开发首页实施回执)。019-A导航兼容已完成，后端实现子范围与最终UI整合资格分别登记。

~~BE-003 菜单开发与迁移合同~~ — 已完成并验证本地专项：018后端目录及IAM完整reactor通过；019使用授权后菜单投影，不改后端树，Console20个身份组合逐叶保持名称/对象/路径，实际导航及旧URL刷新通过。详见[019回执](TODO.md#TODO-019-A%20导航与外壳实施回执)。023同源码默认矩阵49 PASS / 25条件SKIP及严格TLS组合5 PASS已登记于[最终整合回执](TODO.md#TODO-023-A%20项目资源与最终整合回执)，条件门禁没有继承旧资格。
