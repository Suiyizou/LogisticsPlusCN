import ts from "typescript";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(root, ".tmp/api-contract-types");
mkdirSync(directory, { recursive: true });
const probe = resolve(directory, "probe.ts");
writeFileSync(
  probe,
  `
import createClient from "openapi-fetch";
import type {paths,components} from "../../src/generated/platform-api";
import {updateCustomerProfile} from "../../src/services/customerDirectoryContract";
const client=createClient<paths>();
client.POST("/business/service-catalog",{body:{code:"INS",name:"Insurance",enabled:true}});
client.PATCH("/business/service-catalog/{id}",{params:{path:{id:"test"}},body:{version:0,values:{description:null}}});
// @ts-expect-error internal credentials are not public DTO fields
const exposed:components["schemas"]["ServiceCatalogResponse"]["password"]="x";
// @ts-expect-error creation requires the declared public fields
client.POST("/business/service-catalog",{body:{name:"Incomplete"}});
// @ts-expect-error concurrent writes require a version
client.PATCH("/business/service-catalog/{id}",{params:{path:{id:"test"}},body:{values:{name:"Changed"}}});
// @ts-expect-error required field cannot be explicitly cleared
client.PATCH("/business/service-catalog/{id}",{params:{path:{id:"test"}},body:{version:0,values:{name:null}}});
// @ts-expect-error no generic destructive delete endpoint
client.DELETE("/business/service-catalog/{id}",{params:{path:{id:"test"}}});
// @ts-expect-error the legacy directory has its own response contract
const wrong:components["schemas"]["CustomerDirectoryResponse"]={items:[],totalPages:0};
client.POST("/business/customers",{body:{username:"client",password:"Secure123",contactEmail:"ops@example.com"}});
client.PATCH("/business/customers/{customerId}",{params:{path:{customerId:"client-id"}},body:{contactEmail:""}});
// @ts-expect-error password resets are a separate operation
updateCustomerProfile("client-id",{password:"Secure123"});
// @ts-expect-error a new customer requires an initial password
client.POST("/business/customers",{body:{username:"incomplete"}});
void exposed;void wrong;
`
);
const config = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram([probe, resolve(root, "src/types/vite-env.d.ts")], parsed.options);
const errors = ts.getPreEmitDiagnostics(program);
if (errors.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(errors, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (file) => file,
      getNewLine: () => "\n"
    })
  );
  process.exitCode = 1;
} else
  console.log(
    "[api-contract-types] Valid clients compile; eight invalid public-contract usages are rejected."
  );
