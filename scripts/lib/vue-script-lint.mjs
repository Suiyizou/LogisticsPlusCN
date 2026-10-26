import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ESLint, Linter } from "eslint";
import globals from "globals";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const frontendRequire = createRequire(new URL("../../frontend/package.json", import.meta.url));

/** JS SFC binding guard, including unresolved setup-template bindings; not Vue type checking. */
export async function lintVueScriptSources(sources) {
  if (!sources.length) return { results: [], checked: 0, skipped: [] };
  const { parse, compileScript, compileTemplate } = frontendRequire("vue/compiler-sfc");
  const eslint = new ESLint({
    cwd: workspaceRoot,
    overrideConfigFile: true,
    ignore: false,
    overrideConfig: {
      files: ["**/*.js"],
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
        globals: { ...globals.browser, ...globals.worker, ...globals.node, ...globals.es2021 }
      },
      rules: { "no-undef": "error" }
    }
  });
  const results = [],
    skipped = [];
  let checked = 0;
  for (const { file, source } of sources) {
    // Compiler output is explicitly labelled; reported lines belong to this generated script.
    const filePath = `${file}.compiled-script.js`;
    try {
      const { descriptor, errors } = parse(source, { filename: file });
      if (errors.length) throw errors[0];
      const blocks = [descriptor.script, descriptor.scriptSetup].filter(Boolean);
      if (!blocks.length) continue;
      if (blocks.some((block) => block.src || (block.lang && block.lang !== "js"))) {
        skipped.push(file);
        continue;
      }
      const script = compileScript(descriptor, { id: file });
      checked++;
      results.push(...(await eslint.lintText(script.content, { filePath })));
      if (
        descriptor.scriptSetup &&
        descriptor.template &&
        !descriptor.template.src &&
        (!descriptor.template.lang || descriptor.template.lang === "html")
      ) {
        const template = compileTemplate({
          source: descriptor.template.content,
          filename: file,
          id: file,
          compilerOptions: { bindingMetadata: script.bindings }
        });
        if (template.errors.length) throw template.errors[0];
        // Setup imports/refs/props and slot/loop variables compile to explicit bindings.
        // Remaining context lookups are missing declarations, except Vue's public $ APIs.
        const messages = new Linter().verify(template.code, [
          {
            languageOptions: { ecmaVersion: 2023, sourceType: "module" },
            plugins: {
              "vue-bindings": {
                rules: {
                  setup: {
                    create(context) {
                      return {
                        MemberExpression(node) {
                          if (node.object.type !== "Identifier" || node.object.name !== "_ctx")
                            return;
                          const name = !node.computed ? node.property.name : node.property.value;
                          if (
                            typeof name === "string" &&
                            !name.startsWith("$") &&
                            !script.bindings[name]
                          )
                            context.report({
                              node,
                              message: `Template binding '${name}' is not declared in script setup.`
                            });
                        }
                      };
                    }
                  }
                }
              }
            },
            rules: { "vue-bindings/setup": "error" }
          }
        ]);
        if (messages.length)
          results.push({
            filePath: `${file}.compiled-template.js`,
            errorCount: messages.length,
            warningCount: 0,
            fatalErrorCount: 0,
            suppressedMessages: [],
            fixableErrorCount: 0,
            fixableWarningCount: 0,
            messages
          });
      }
    } catch (error) {
      results.push({
        filePath,
        errorCount: 1,
        warningCount: 0,
        fatalErrorCount: 1,
        suppressedMessages: [],
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        messages: [
          {
            ruleId: null,
            severity: 2,
            fatal: true,
            message: error?.message || String(error),
            line: 1,
            column: 1
          }
        ]
      });
    }
  }
  return { results: ESLint.getErrorResults(results), checked, skipped };
}
