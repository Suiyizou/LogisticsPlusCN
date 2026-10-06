# CI 接入说明（T11）

## 1. 目标

提交后由 Gitee 流水线真实触发：质量门 → 类型检查 → 后端测试 → 追踪测试 → 装箱回归
→ 前端生产构建 → 镜像构建。CI 不在仓库里保存任何密钥；需要镜像推送时，凭据放在
Gitee 控制台的“变量/凭据”。

## 2. 配置位置

- 流水线文件：`.workflow/ci.yml`（Gitee Go 自定义流水线）。
- 执行命令与本地一致：`node scripts/verify.mjs` 及其子命令，避免 CI 与本地两套逻辑。

## 3. 开通步骤（需要仓库管理员权限）

1. 打开 Gitee 仓库 → `流水线` → 开通 **Gitee Go**。
2. 选择“自定义流水线”，把 `.workflow/ci.yml` 的内容粘贴/覆盖进去并保存。
3. 确认已绑定可用的 **Runner**（公共 Runner 或自有主机）。
4. 首次运行前在 `变量/凭据` 配置（仅镜像推送阶段需要）：
   - `DOCKER_REGISTRY`、`DOCKER_USERNAME`、`DOCKER_PASSWORD`
     这些名称只作为占位；`ci.yml` 当前只构建镜像、不推送，因此可以暂不配置。
5. 提交一次 `push` 或发起 PR，确认流水线被真实触发并跑绿。

## 4. 必须缺少的信息 / 当前阻塞

- 本机没有 Gitee 仓库的“流水线/变量/Runner”管理权限，**无法在此环境触发远端流水线**。
- 需要仓库管理员提供：
  1. 是否已开通 Gitee Go 与可用 Runner；
  2. Runner 是否具备 Docker（用于 `images` 阶段）；
  3. 如需推送镜像，提供镜像仓库地址（凭据只在控制台配置，不要发到聊天或提交到仓库）。

在拿到上述权限前，本地等价的检查已可运行并通过：

```sh
npm install --include=dev
node scripts/verify.mjs            # quality + typecheck + backend + tracking + packing + frontend
```

`images` 阶段在 Runner 无 Docker 时可删除，不影响测试阶段。

## 5. 与“只交付 YAML”的区别

- CI 命令就是本地验证通过的同一套命令（见 `docs/ENGINEERING.md`）。
- 流水线文件基于 Gitee Go 实际语法编写（`build@nodejs` / `build@maven` / `build@docker`），
  但“远端是否真实跑绿”必须在获得仓库权限后确认。在此之前，本文件的状态是
  **已就绪、待远端触发验证**，不作为“已接通 CI”的结论。
