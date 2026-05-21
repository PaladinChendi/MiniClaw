# ebsclaw TODOS

## v1 Blockers (Phase 0 必须产出)
- [ ] Plugin API .d.ts 类型定义（生命周期+Channel+Memory+Skill+RAG接口）
- [ ] Plugin API 性能契约（单次callPlugin <10ms Embedded模式）
- [ ] 6层错误分类法（user-recoverable/user-unrecoverable/internal/compression-failure/data-corruption/fatal）+14步骤完整映射
- [ ] CircuitBreaker半开状态设计（10分钟探测间隔，2次成功恢复）
- [ ] 跨子系统错误传播规则（Agent Runtime→Gateway→TUI，Plugin Error Boundary）
- [ ] Memory插件disabled后Agent Runtime fallback行为定义
- [ ] SessionSnapshot 序列化格式定义（含大小上限+原子写入策略）
- [ ] 结构化日志格式规范（JSON，含pluginId/traceId/level/ts/msg，禁止日志输出API key）
- [ ] 插件manifest权限白名单schema + 运行时Proxy拦截require('fs'/'net')
- [ ] ebsclaw add --ignore-scripts + manifest.buildCommand 安装流程  [已删除ebsclaw add命令，但--ignore-scripts逻辑作为bun install默认参数保留]
- [ ] API key 环境变量引用语法（${VAR}）+ process.env Proxy 限制
- [ ] 通道manifest统一格式（含displayName+status:stub|implemented，供向导列出）
- [ ] RAG插件接口设计（DocumentSource类型+RAGQuery/RAGResult，按需加载机制：skill调用时才初始化indexer/retriever）
- [ ] writeFileAtomic 统一工具函数（temp+rename原子替换，fsync可选）
- [ ] 5项持久化操作原子写入改造（Session/Memory/Compaction/ToolResult/ONNX）
- [ ] 崩溃恢复：临时文件清理 + 文件锁策略（Memory并发写）
- [ ] Plugin API 契约测试套件（向后兼容+可选属性+权限校验+API边界隔离）
- [ ] monorepo workspace配置（bun workspace）
- [ ] test infra骨架（bun test配置+mock helpers）
- [ ] Bun+ONNX兼容性PoC验证
- [ ] Bun Proxy require拦截兼容性PoC验证（B1 BLOCKER依赖项）
- [ ] callLLM() options bag设计（预留v2多租户参数位）
- [ ] WS RPC协议草案（确保SessionSnapshot向前兼容）
- [ ] IMemoryStore抽象接口定义
- [ ] bun compile跨平台PoC验证（Linux/macOS/Windows）
- [ ] TECH-DEBT.md初始版本

## v1.x Expansion Candidates
- [ ] Gateway WS RPC模式
- [ ] Git Webhook通道（CI/CD场景）
- [ ] 监控系统通道（Prometheus/Grafana告警接入）
- [ ] Signal通道
- [ ] 插件热加载（需重启→无需重启）
- [ ] Compaction级别6 API层Microcompact（服务端context_management config，由Provider SDK支持）

## v2 Deferred
- [ ] Agent市场
- [ ] 多租户
- [ ] 可视化技能编辑器
- [ ] 屏幕阅读器完整兼容
- [ ] WCAG 2.1 AA终端合规

## UX Detail TODOs (Phase 4 前)
- [ ] Compaction进行中TUI指示器设计（neon cyan闪烁"◈ COMPACTING..."）
- [ ] Streaming打字机效果+代码块刷新策略
- [ ] 首次启动向导完整scope（LLM必选+QQbot可选+Memory异步）

## Performance Verification
- [ ] Phase 1: QQbot端到端热路径延迟验证（首token<2s, memory search<500ms）
- [ ] Phase 2: Compaction 1-3延迟验证（<100ms）
- [ ] Phase 3: Session persistence延迟验证（<50ms）
- [ ] Phase 3: 并发10+session压力测试
