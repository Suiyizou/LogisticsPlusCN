import js from "@eslint/js";
import globals from "globals";

/**
 * 渐进式 Lint 配置。
 *
 * 这里只维护“规则”和“运行环境”，检查范围由 `scripts/quality.mjs` 决定：
 * 默认只检查相对基线变更过的文件（棘轮），因此历史大文件不会被一次性
 * 卷入格式化/Lint 海量报错。新增目录会随重构批次逐步纳入。
 */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "frontend/dist/**",
      "frontend/release/**",
      "backend/target/**",
      "output/**",
      "data/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.worker,
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }]
    }
  },
  {
    files: ["tracking-service/**/*.mjs", "scripts/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node }
    }
  }
];
